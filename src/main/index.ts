import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import { canonicalSources, rootFor } from '../shared/canonicalLinkPolicy'
import { openResolvedCanonicalSource, type CanonicalSourceDefinition } from './canonicalSourceService'
import { safeDevelopmentRendererUrl } from '../shared/rendererUrlPolicy'
import { ConversationRelay } from './jobLoop/relay'
import { cancelExternal, continueThread, decideThread, externalSendState, getThread, listApprovedTaskIds, listExternalAdapters, listThreads, ollamaReadiness, preflightExternal, recoverThread, scanForRecovery, sendExternal, sendFirstTurn, startApprovedThread } from './relayService'
import { AnthropicMessagesTransport } from './jobLoop/anthropicTransport'
import { OllamaLocalHttpTransport } from './jobLoop/ollamaTransport'
import { ExternalConversationAdapter } from './jobLoop/externalAdapter'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from './jobLoop/conversationAdapters'
import { approveFrontdoorRun, answerFrontdoorQuestion, completeFrontdoorRun, dispatchFrontdoorRun, inspectFrontdoorRun, listFrontdoorRuns, prepareFrontdoorRun, proposeFrontdoorPlan, recoverFrontdoorRun, reviewFrontdoorResult, stopFrontdoorRun } from './frontdoor/frontdoorService'
import { FrontdoorOrchestrator } from './frontdoor/orchestrator'
import { DeterministicFakePlanner } from './frontdoor/planner'

let mainWindow: BrowserWindow | undefined

const allowedSources: Record<string, CanonicalSourceDefinition> = Object.fromEntries(
  Object.entries(canonicalSources).map(([sourceId, source]) => [sourceId, { rootPath: rootFor(sourceId as keyof typeof canonicalSources), relativePath: source.relativePath }])
)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  const rendererUrl = safeDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged)
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  ipcMain.handle('board:open-canonical-source', (_event, sourceId: unknown) => openResolvedCanonicalSource(sourceId, allowedSources, shell.openPath))

  // Constructed, not connected. Nothing here opens a socket or reads a credential — the transports
  // only touch the network inside `send` (Anthropic) or an explicit readiness check (Ollama), both
  // gated behind an Owner action. Neither is contacted just by building this Relay.
  const externalAdapterId = 'claude-external'
  const externalTransport = new AnthropicMessagesTransport()
  const ollamaAdapterId = 'ollama-local'
  const ollamaTransport = new OllamaLocalHttpTransport()
  const runtimeRoot = path.join(app.getPath('userData'), 'adf-runtime')

  const relay: ConversationRelay = new ConversationRelay({
    runtimeRoot,
    externalTransports: { [externalAdapterId]: externalTransport, [ollamaAdapterId]: ollamaTransport },
    adapters: [
      new FakeProposalConversationAdapter(),
      new FakeCriticConversationAdapter(),
      new ExternalConversationAdapter(externalAdapterId, 'proposal', externalTransport, {
        authorise: (request) => relay.externalHooks(externalAdapterId, externalTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(externalAdapterId, externalTransport).recordCall(record),
        now: () => new Date()
      }),
      new ExternalConversationAdapter(ollamaAdapterId, 'proposal', ollamaTransport, {
        authorise: (request) => relay.externalHooks(ollamaAdapterId, ollamaTransport).authorise(request),
        recordCall: (record) => relay.externalHooks(ollamaAdapterId, ollamaTransport).recordCall(record),
        now: () => new Date()
      })
    ]
  })
  const frontdoor = new FrontdoorOrchestrator({ relay })
  const planner = new DeterministicFakePlanner()
  ipcMain.handle('relay:list', () => listThreads(relay))
  ipcMain.handle('relay:get', (_event, threadId: unknown) => getThread(relay, threadId))
  ipcMain.handle('relay:approved-tasks', () => listApprovedTaskIds(relay))
  ipcMain.handle('relay:start', (_event, taskId: unknown) => startApprovedThread(relay, taskId))
  ipcMain.handle('relay:send-first', (_event, threadId: unknown) => sendFirstTurn(relay, threadId))
  ipcMain.handle('relay:continue', (_event, threadId: unknown, note: unknown) => continueThread(relay, threadId, note))
  ipcMain.handle('relay:decide', (_event, threadId: unknown, action: unknown, note: unknown) => decideThread(relay, threadId, action, note))
  ipcMain.handle('relay:recover', (_event, threadId: unknown, action: unknown, note: unknown) => recoverThread(relay, threadId, action, note))
  ipcMain.handle('relay:preflight-external', (_event, threadId: unknown, adapterId: unknown) => preflightExternal(relay, threadId, adapterId))
  ipcMain.handle('relay:send-external', (_event, threadId: unknown, adapterId: unknown) => sendExternal(relay, threadId, adapterId))
  ipcMain.handle('relay:cancel-external', (_event, threadId: unknown, note: unknown) => cancelExternal(relay, threadId, note))
  ipcMain.handle('relay:external-state', (_event, threadId: unknown) => externalSendState(relay, threadId))
  ipcMain.handle('relay:external-adapters', () => listExternalAdapters(relay))
  // Owner-explicit only: never invoked from startup, Thread selection, or any polling loop.
  ipcMain.handle('relay:ollama-readiness', () => ollamaReadiness())
  ipcMain.handle('frontdoor:list', () => listFrontdoorRuns(frontdoor))
  ipcMain.handle('frontdoor:propose-plan', (_event, input: unknown) => proposeFrontdoorPlan(planner, input))
  ipcMain.handle('frontdoor:prepare', (_event, input: unknown) => prepareFrontdoorRun(frontdoor, input))
  ipcMain.handle('frontdoor:inspect', (_event, runId: unknown) => inspectFrontdoorRun(frontdoor, runId))
  ipcMain.handle('frontdoor:approve', (_event, input: unknown) => approveFrontdoorRun(frontdoor, input as Parameters<typeof approveFrontdoorRun>[1]))
  ipcMain.handle('frontdoor:dispatch', (_event, runId: unknown) => dispatchFrontdoorRun(frontdoor, runId))
  ipcMain.handle('frontdoor:answer', (_event, input: unknown) => answerFrontdoorQuestion(frontdoor, input as Parameters<typeof answerFrontdoorQuestion>[1]))
  ipcMain.handle('frontdoor:review-result', (_event, input: unknown) => reviewFrontdoorResult(frontdoor, input as Parameters<typeof reviewFrontdoorResult>[1]))
  ipcMain.handle('frontdoor:complete', (_event, input: unknown) => completeFrontdoorRun(frontdoor, input as Parameters<typeof completeFrontdoorRun>[1]))
  ipcMain.handle('frontdoor:stop', (_event, input: unknown) => stopFrontdoorRun(frontdoor, input as Parameters<typeof stopFrontdoorRun>[1]))
  ipcMain.handle('frontdoor:recover', (_event, runId: unknown) => recoverFrontdoorRun(frontdoor, runId))

  // One pass, before the window exists, so the renderer cannot act on a Thread mid-scan.
  await scanForRecovery(relay)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
