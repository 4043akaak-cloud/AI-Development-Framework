import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import { canonicalSources, rootFor } from '../shared/canonicalLinkPolicy'
import { openResolvedCanonicalSource, type CanonicalSourceDefinition } from './canonicalSourceService'
import { safeDevelopmentRendererUrl } from '../shared/rendererUrlPolicy'
import { createLiveRelay } from './liveRelay'
import type { ConversationRelay } from './jobLoop/relay'
import { cancelExternal, continueThread, decideThread, externalSendState, getThread, inspectLiveArtifacts, listApprovedTaskIds, listExternalAdapters, listThreads, localReadiness, ollamaReadiness, preflightExternal, recoverThread, scanForRecovery, sendExternal, sendFirstTurn, startApprovedThread } from './relayService'
import { approveFrontdoorRun, answerFrontdoorQuestion, completeFrontdoorRun, deriveFrontdoorChildPackets, dispatchFrontdoorRun, exportFrontdoorArtifact, inspectCandidate, inspectFrontdoorArtifact, inspectFrontdoorReviews, inspectFrontdoorRun, listFrontdoorRuns, listReviewableCandidates, materializeImplementationPacket, prepareFrontdoorRun, prepareImplementationRun, proposeFrontdoorPlan, recordFrontdoorReview, recoverFrontdoorRun, reviewCandidate, reviewFrontdoorNode, reviewFrontdoorResult, startCandidateReview, stopFrontdoorRun } from './frontdoor/frontdoorService'

import { FrontdoorOrchestrator } from './frontdoor/orchestrator'
import { DeterministicFakePlanner } from './frontdoor/planner'

let mainWindow: BrowserWindow | undefined

/** The app's name. Cosmetic only — see `runtimeRootPath` for why it cannot move the data. */
const productName = 'ADF'

/**
 * Where the Ledger, Runs, and Evidence live.
 *
 * Pinned to a literal directory name instead of being derived from the app's name. It used to be
 * `app.getPath('userData')`, which happened to resolve to the package name rather than the display
 * name only because `app.setName` runs after Electron has already fixed the path. That made the
 * data location depend on Electron's start-up ordering, so renaming the app could silently orphan
 * every Run — and the MCP server, which is handed `--runtime-root` explicitly, would still be
 * reading the old directory. Pinning it keeps both entrances pointed at the same place.
 *
 * `ADF_RUNTIME_ROOT` overrides it for tests and for running against an isolated runtime.
 */
function runtimeRootPath(): string {
  const override = process.env.ADF_RUNTIME_ROOT?.trim()
  if (override) return path.resolve(override)
  return path.join(app.getPath('appData'), 'adf-task-board', 'adf-runtime')
}

/** Marks the development window so it can never be mistaken for the packaged app again. */
function windowTitle(): string {
  return app.isPackaged ? productName : `${productName}（開発版）`
}

const allowedSources: Record<string, CanonicalSourceDefinition> = Object.fromEntries(
  Object.entries(canonicalSources).map(([sourceId, source]) => [sourceId, { rootPath: rootFor(sourceId as keyof typeof canonicalSources), relativePath: source.relativePath }])
)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: windowTitle(),
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
  mainWindow.setTitle(windowTitle())

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
  app.setName(productName)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  const isDevelopmentRenderer = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const contentSecurityPolicy = isDevelopmentRenderer
      ? "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [contentSecurityPolicy] } })
  })
  ipcMain.handle('board:open-canonical-source', (_event, sourceId: unknown) => openResolvedCanonicalSource(sourceId, allowedSources, shell.openPath))

  // Constructed, not connected. Nothing here opens a socket or reads a credential — the transports
  // only touch the network inside `send` (external) or an explicit local readiness check, both
  // gated behind an Owner action. Neither is contacted just by building this Relay.
  const runtimeRoot = runtimeRootPath()
  const relay: ConversationRelay = createLiveRelay(runtimeRoot)
  const frontdoor = new FrontdoorOrchestrator({ relay })
  const planner = new DeterministicFakePlanner()
  ipcMain.handle('relay:list', () => listThreads(relay))
  ipcMain.handle('relay:get', (_event, threadId: unknown) => getThread(relay, threadId))
  ipcMain.handle('relay:inspect-artifacts', (_event, threadId: unknown) => inspectLiveArtifacts(relay, threadId))
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
  ipcMain.handle('relay:local-readiness', (_event, adapterId: unknown) => localReadiness(relay, adapterId))
  ipcMain.handle('frontdoor:list', () => listFrontdoorRuns(frontdoor))
  ipcMain.handle('frontdoor:propose-plan', (_event, input: unknown) => proposeFrontdoorPlan(planner, input))
  ipcMain.handle('frontdoor:prepare', (_event, input: unknown) => prepareFrontdoorRun(frontdoor, input))
  ipcMain.handle('frontdoor:inspect', (_event, runId: unknown) => inspectFrontdoorRun(frontdoor, runId))
  ipcMain.handle('frontdoor:inspect-artifact', (_event, runId: unknown) => inspectFrontdoorArtifact(frontdoor, runId))
  ipcMain.handle('frontdoor:approve', (_event, input: unknown) => approveFrontdoorRun(frontdoor, input as Parameters<typeof approveFrontdoorRun>[1]))
  ipcMain.handle('frontdoor:dispatch', (_event, runId: unknown) => dispatchFrontdoorRun(frontdoor, runId, { requirePacketBinding: true }))
  ipcMain.handle('frontdoor:review-node', (_event, input: unknown) => reviewFrontdoorNode(frontdoor, input as Parameters<typeof reviewFrontdoorNode>[1]))
  ipcMain.handle('frontdoor:answer', (_event, input: unknown) => answerFrontdoorQuestion(frontdoor, input as Parameters<typeof answerFrontdoorQuestion>[1]))
  ipcMain.handle('frontdoor:review-result', (_event, input: unknown) => reviewFrontdoorResult(frontdoor, input as Parameters<typeof reviewFrontdoorResult>[1]))
  ipcMain.handle('frontdoor:complete', (_event, input: unknown) => completeFrontdoorRun(frontdoor, input as Parameters<typeof completeFrontdoorRun>[1]))
  ipcMain.handle('frontdoor:export-artifact', (_event, input: unknown) => exportFrontdoorArtifact(frontdoor, input as Parameters<typeof exportFrontdoorArtifact>[1]))
  ipcMain.handle('frontdoor:stop', (_event, input: unknown) => stopFrontdoorRun(frontdoor, input as Parameters<typeof stopFrontdoorRun>[1]))
  ipcMain.handle('frontdoor:recover', (_event, runId: unknown) => recoverFrontdoorRun(frontdoor, runId))
  ipcMain.handle('frontdoor:list-candidates', () => listReviewableCandidates(frontdoor))
  ipcMain.handle('frontdoor:inspect-candidate', (_event, candidateId: unknown) => inspectCandidate(frontdoor, candidateId))
  ipcMain.handle('frontdoor:start-candidate-review', (_event, candidateId: unknown) => startCandidateReview(frontdoor, candidateId))
  ipcMain.handle('frontdoor:review-candidate', (_event, input: unknown) => reviewCandidate(frontdoor, input))
  ipcMain.handle('frontdoor:derive-packets', (_event, input: unknown) => deriveFrontdoorChildPackets(frontdoor, input as Parameters<typeof deriveFrontdoorChildPackets>[1]))
  ipcMain.handle('frontdoor:record-review', (_event, input: unknown) => recordFrontdoorReview(frontdoor, input as Parameters<typeof recordFrontdoorReview>[1]))
  ipcMain.handle('frontdoor:inspect-reviews', (_event, runId: unknown) => inspectFrontdoorReviews(frontdoor, runId))
  ipcMain.handle('frontdoor:prepare-implementation', (_event, input: unknown) => prepareImplementationRun(frontdoor, input as Record<string, unknown>))
  ipcMain.handle('frontdoor:materialize-implementation-packet', (_event, input: unknown) => materializeImplementationPacket(frontdoor, (input as { runId?: unknown })?.runId, (input as { approvedBy?: unknown })?.approvedBy))


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
