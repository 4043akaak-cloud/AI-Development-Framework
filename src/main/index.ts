import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import { canonicalSources, rootFor } from '../shared/canonicalLinkPolicy'
import { openResolvedCanonicalSource, type CanonicalSourceDefinition } from './canonicalSourceService'
import { safeDevelopmentRendererUrl } from '../shared/rendererUrlPolicy'
import { ConversationRelay } from './jobLoop/relay'
import { continueThread, decideThread, getThread, listApprovedTaskIds, listThreads, sendFirstTurn, startApprovedThread } from './relayService'

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

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  ipcMain.handle('board:open-canonical-source', (_event, sourceId: unknown) => openResolvedCanonicalSource(sourceId, allowedSources, shell.openPath))

  const relay = new ConversationRelay({ runtimeRoot: path.join(app.getPath('userData'), 'adf-runtime') })
  ipcMain.handle('relay:list', () => listThreads(relay))
  ipcMain.handle('relay:get', (_event, threadId: unknown) => getThread(relay, threadId))
  ipcMain.handle('relay:approved-tasks', () => listApprovedTaskIds(relay))
  ipcMain.handle('relay:start', (_event, taskId: unknown) => startApprovedThread(relay, taskId))
  ipcMain.handle('relay:send-first', (_event, threadId: unknown) => sendFirstTurn(relay, threadId))
  ipcMain.handle('relay:continue', (_event, threadId: unknown, note: unknown) => continueThread(relay, threadId, note))
  ipcMain.handle('relay:decide', (_event, threadId: unknown, action: unknown, note: unknown) => decideThread(relay, threadId, action, note))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
