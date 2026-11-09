import { BrowserWindow, session, type Session, type WebContents } from 'electron'
import type { TeslaAuthStatus } from '../../shared/types'
import { TESLA_DASHCAM_ORIGIN } from './teslaKeyApi'

/**
 * Tesla publishes no API for third-party apps, so the app borrows the session of the
 * official viewer: the user signs in to dashcam.tesla.com in a window we own, and we read
 * the bearer token from that page's own requests to /api/1/. The token is kept in memory
 * only; the sign-in cookies live in a dedicated persistent partition so the next connect
 * does not ask for the password again.
 */
const PARTITION = 'persist:tesla-dashcam'
const DASHCAM_HOST = new URL(TESLA_DASHCAM_ORIGIN).host
const SAMPLE_RETRY_MS = 2_000
const SAMPLE_MAX_ATTEMPTS = 20
const CLOSE_AFTER_CONNECT_MS = 1_200

let token: string | null = null
let tokenSource: TeslaAuthStatus['source'] = null
let connectedAt: string | null = null
let loginWindow: BrowserWindow | null = null
let sampleFilePath: string | null = null
let sampleState: TeslaAuthStatus['sampleState'] = 'idle'
let interceptorInstalled = false
const listeners = new Set<(status: TeslaAuthStatus) => void>()

function getTeslaSession(): Session {
  return session.fromPartition(PARTITION)
}

export function getAuthStatus(): TeslaAuthStatus {
  return {
    connected: token !== null,
    source: tokenSource,
    connectedAt,
    loginWindowOpen: !!loginWindow && !loginWindow.isDestroyed(),
    sampleState,
  }
}

function emit() {
  const status = getAuthStatus()
  for (const listener of listeners) {
    listener(status)
  }
}

export function onAuthStatusChange(listener: (status: TeslaAuthStatus) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToken(): string | null {
  return token
}

function normalizeToken(raw: string): string {
  return raw.trim().replace(/^authorization:\s*/i, '').replace(/^bearer\s+/i, '').trim()
}

function acceptToken(raw: string, source: NonNullable<TeslaAuthStatus['source']>) {
  const next = normalizeToken(raw)
  if (!next || next === token) {
    return
  }
  token = next
  tokenSource = source
  connectedAt = new Date().toISOString()
  emit()

  if (source === 'browser' && loginWindow && !loginWindow.isDestroyed()) {
    const windowToClose = loginWindow
    setTimeout(() => {
      if (!windowToClose.isDestroyed()) {
        windowToClose.close()
      }
    }, CLOSE_AFTER_CONNECT_MS)
  }
}

export function setManualToken(raw: string): TeslaAuthStatus {
  const next = normalizeToken(raw)
  if (!next) {
    throw new Error('Token is empty')
  }
  token = null
  acceptToken(next, 'manual')
  return getAuthStatus()
}

/** Called when Tesla answers 401: the token is gone, but the sign-in cookies may still work. */
export function invalidateToken() {
  if (token === null) {
    return
  }
  token = null
  tokenSource = null
  connectedAt = null
  emit()
}

export async function signOut(): Promise<TeslaAuthStatus> {
  invalidateToken()
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close()
  }
  const teslaSession = getTeslaSession()
  await teslaSession.clearStorageData()
  await teslaSession.clearCache()
  emit()
  return getAuthStatus()
}

function installInterceptor() {
  if (interceptorInstalled) {
    return
  }
  interceptorInstalled = true
  getTeslaSession().webRequest.onBeforeSendHeaders(
    { urls: [`${TESLA_DASHCAM_ORIGIN}/api/*`] },
    (details, callback) => {
      const header = Object.entries(details.requestHeaders).find(
        ([name]) => name.toLowerCase() === 'authorization',
      )?.[1]
      if (header && /^bearer\s+\S+/i.test(header)) {
        acceptToken(header, 'browser')
      }
      callback({ requestHeaders: details.requestHeaders })
    },
  )
}

function isDashcamPage(contents: WebContents): boolean {
  try {
    return new URL(contents.getURL()).host === DASHCAM_HOST
  } catch {
    return false
  }
}

/**
 * The viewer only calls /api/1/ once a clip is opened. Instead of making the user drag a
 * file, hand the page's file input one of their encrypted clips via the DevTools protocol -
 * exactly what choosing the file in the page's own picker would do.
 */
async function trySetSampleFile(contents: WebContents, filePath: string): Promise<boolean> {
  const debuggerApi = contents.debugger
  let attachedHere = false
  try {
    if (!debuggerApi.isAttached()) {
      debuggerApi.attach('1.3')
      attachedHere = true
    }
    const { root } = (await debuggerApi.sendCommand('DOM.getDocument', { depth: -1, pierce: true })) as {
      root: { nodeId: number }
    }
    const { nodeId } = (await debuggerApi.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    })) as { nodeId: number }
    if (!nodeId) {
      return false
    }
    await debuggerApi.sendCommand('DOM.setFileInputFiles', { nodeId, files: [filePath] })
    return true
  } catch {
    return false
  } finally {
    if (attachedHere && debuggerApi.isAttached()) {
      debuggerApi.detach()
    }
  }
}

function scheduleSampleHandOff(window: BrowserWindow) {
  let attempts = 0
  let timer: NodeJS.Timeout | null = null

  const stop = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const tick = async () => {
    timer = null
    if (window.isDestroyed() || token !== null || !sampleFilePath) {
      return
    }
    const contents = window.webContents
    if (!isDashcamPage(contents) || contents.isLoading()) {
      timer = setTimeout(tick, SAMPLE_RETRY_MS)
      return
    }
    attempts += 1
    if (await trySetSampleFile(contents, sampleFilePath)) {
      sampleState = 'sent'
      emit()
      return
    }
    if (attempts >= SAMPLE_MAX_ATTEMPTS) {
      sampleState = 'manual'
      emit()
      return
    }
    timer = setTimeout(tick, SAMPLE_RETRY_MS)
  }

  const restart = () => {
    if (token !== null || !sampleFilePath) {
      return
    }
    stop()
    attempts = 0
    sampleState = 'waiting'
    emit()
    timer = setTimeout(tick, SAMPLE_RETRY_MS)
  }

  window.webContents.on('did-navigate', restart)
  window.webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
    if (isMainFrame && sampleState !== 'sent') {
      restart()
    }
  })
  window.on('closed', stop)
}

export function openLoginWindow(parent: BrowserWindow | null, samplePath: string | null): TeslaAuthStatus {
  installInterceptor()
  sampleFilePath = samplePath
  sampleState = samplePath ? 'waiting' : 'manual'

  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus()
    emit()
    return getAuthStatus()
  }

  loginWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    title: 'Sign in to Tesla - Dashcam',
    parent: parent ?? undefined,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  loginWindow.removeMenu()

  // Tesla SSO may open its own pop-ups; keep them in the same signed-in partition.
  loginWindow.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
    },
  }))

  scheduleSampleHandOff(loginWindow)

  loginWindow.on('closed', () => {
    loginWindow = null
    if (token === null) {
      sampleState = 'idle'
    }
    emit()
    parent?.focus()
  })

  void loginWindow.loadURL(TESLA_DASHCAM_ORIGIN)
  emit()
  return getAuthStatus()
}
