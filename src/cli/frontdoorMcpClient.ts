import { spawn, type SpawnOptions } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

export interface McpClientJsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpStdioChild {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'error' | 'close', listener: (...args: unknown[]) => void): this
  on(event: 'error' | 'close', listener: (...args: unknown[]) => void): this
}

export type McpSpawn = (command: string, args: readonly string[], options: SpawnOptions) => McpStdioChild

export interface McpStdioClientOptions {
  command: string
  args: readonly string[]
  env?: NodeJS.ProcessEnv
  cwd?: string
  timeoutMs?: number
  spawnImpl?: McpSpawn
}

export class McpClientRpcError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(error: { code: number; message: string; data?: unknown }) {
    super(error.message)
    this.name = 'McpClientRpcError'
    this.code = error.code
    this.data = error.data
  }
}

interface PendingRequest {
  resolve: (response: McpClientJsonRpcResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// A Frontdoor dispatch may wait for a local model inference. Five seconds is
// sufficient for read-only MCP calls but can terminate a valid Ollama run.
const defaultTimeoutMs = 120_000
const maxStderrChars = 4_000
const childEnvironmentKeys = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'ELECTRON_RUN_AS_NODE'] as const

export function buildMcpChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const safeEnvironment: NodeJS.ProcessEnv = {}
  for (const key of childEnvironmentKeys) {
    if (source[key] !== undefined) safeEnvironment[key] = source[key]
  }
  return safeEnvironment
}

function asResponse(value: unknown): McpClientJsonRpcResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const response = value as Record<string, unknown>
  if (response.jsonrpc !== '2.0') return null
  if (!(typeof response.id === 'string' || typeof response.id === 'number' || response.id === null)) return null
  if (response.error !== undefined) {
    if (!response.error || typeof response.error !== 'object' || Array.isArray(response.error)) return null
    const error = response.error as Record<string, unknown>
    if (typeof error.code !== 'number' || typeof error.message !== 'string') return null
  }
  return response as unknown as McpClientJsonRpcResponse
}

function errorMessage(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(/\s+/g, ' ').slice(0, 500)
}

export class McpStdioClient {
  private readonly command: string
  private readonly args: readonly string[]
  private readonly env: NodeJS.ProcessEnv | undefined
  private readonly cwd: string | undefined
  private readonly timeoutMs: number
  private readonly spawnImpl: McpSpawn
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private child: McpStdioChild | undefined
  private stdoutBuffer = ''
  private closing = false
  private closed = false
  private fatalError: Error | undefined
  private stderr = ''

  constructor(options: McpStdioClientOptions) {
    this.command = options.command
    this.args = options.args
    this.env = options.env
    this.cwd = options.cwd
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs
    this.spawnImpl = options.spawnImpl ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions) as unknown as McpStdioChild)
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('MCP client timeout must be a positive integer')
  }

  get stderrText(): string {
    return this.stderr
  }

  get isClosed(): boolean {
    return this.closed
  }

  private fail(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(errorMessage(error))
    if (!this.fatalError) this.fatalError = failure
    for (const [id, request] of this.pending) {
      clearTimeout(request.timer)
      request.reject(failure)
      this.pending.delete(id)
    }
  }

  private handleStdout(chunk: Buffer | string): void {
    this.stdoutBuffer += chunk.toString()
    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n')
      if (newline < 0) return
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (!line) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        this.fail(new Error('MCP server emitted non-JSON stdout'))
        return
      }
      const response = asResponse(parsed)
      if (!response) {
        this.fail(new Error('MCP server emitted an invalid JSON-RPC response'))
        return
      }
      if (typeof response.id !== 'number') {
        this.fail(new Error('MCP server emitted a response with an unexpected id'))
        return
      }
      const request = this.pending.get(response.id)
      if (!request) {
        this.fail(new Error(`MCP server emitted an unknown response id: ${response.id}`))
        return
      }
      clearTimeout(request.timer)
      this.pending.delete(response.id)
      request.resolve(response)
    }
  }

  private attachChild(child: McpStdioChild): void {
    this.child = child
    child.stdout.on('data', (chunk: Buffer | string) => this.handleStdout(chunk))
    child.stderr.on('data', (chunk: Buffer | string) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-maxStderrChars)
    })
    child.once('error', (error: unknown) => this.fail(error))
    child.once('close', (code: unknown, signal: unknown) => {
      this.closed = true
      if (!this.closing && !this.fatalError) this.fail(new Error(`MCP server exited before response (code=${String(code)}, signal=${String(signal)})`))
    })
  }

  private ensureStarted(): McpStdioChild {
    if (this.child) return this.child
    if (this.closed) throw new Error('MCP client is closed')
    const child = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.attachChild(child)
    return child
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!method || method.includes('\n')) throw new Error('MCP method is invalid')
    const child = this.ensureStarted()
    if (this.fatalError) throw this.fatalError
    const id = this.nextId++
    const request = new Promise<McpClientJsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timed out: ${method}`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })
    try {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`)
    } catch (error) {
      const pending = this.pending.get(id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(id)
        pending.reject(new Error(`MCP request write failed: ${errorMessage(error)}`))
      }
    }
    const response = await request
    if (response.error) throw new McpClientRpcError(response.error)
    return response.result
  }

  async close(): Promise<void> {
    if (!this.child || this.closed) return
    this.closing = true
    const child = this.child
    child.stdin.end()
    await new Promise<void>((resolve) => {
      if (this.closed) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        if (!this.closed) child.kill('SIGTERM')
        resolve()
      }, this.timeoutMs)
      child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    this.fail(new Error('MCP client closed'))
  }
}
