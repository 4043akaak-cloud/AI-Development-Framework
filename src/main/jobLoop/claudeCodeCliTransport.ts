import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AdapterConnection } from '../../shared/jobLoopTypes'
import type { ExternalSendOutcome, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { CredentialStatus, ExternalTransport, TransportOptions } from './externalTransport'
import { truncateAnswer } from './externalTransport'

/**
 * Local CLI transport for Claude Code, over `node:child_process` instead of `fetch`. One
 * implementation of `ExternalTransport` among others (Anthropic Messages API, Ollama Local HTTP) —
 * `connection: 'cli'` is not a special case anywhere in Thread, Relay, or Recovery.
 *
 * `ADF-CLAUDE-CODE-CLI-ADAPTER-001`: registered in the Registry as `status: 'planned'` only (see
 * `adapterRegistry.ts`). Not registered in `index.ts`'s Relay, so the live Electron app cannot reach
 * it — only a future, separately-approved Task wires it up, mirroring how `ollama-local` started.
 *
 * Unlike Anthropic/Ollama, Claude Code CLI is an agentic tool that can read/write files and run
 * commands by default. The safety boundary here is therefore enforced by *how this Transport spawns
 * the process*, not by ADF's `Capability` grant (which stays descriptive-only for this provider):
 * every invocation runs with `--bare --tools ''` (every built-in tool disabled, hooks/plugins/
 * keychain/CLAUDE.md discovery all skipped) inside a freshly created, empty temporary directory that
 * is removed again once the process exits, with an explicit environment-variable allowlist (never
 * `process.env` verbatim — see `inheritedEnvVariables`). Nothing beyond the Synthetic Packet's fixed
 * instruction text is ever passed to the process.
 */
export const defaultClaudeCodeCliCommand = 'claude'
export const defaultCredentialVariable = 'ANTHROPIC_API_KEY'

/**
 * The only environment variables ever forwarded to the spawned process, besides the credential
 * variable itself. `process.env` is never passed through wholesale: the parent process (the whole
 * Electron app) may hold unrelated secrets that have no business reaching this child process.
 * `PATH` lets the OS resolve `command` when it is a bare name; `HOME` lets the CLI find its own
 * installation/config directory. Neither is itself a secret.
 */
const inheritedEnvVariables = ['PATH', 'HOME'] as const

/**
 * The exact subset of `child_process.ChildProcess` this Transport uses. A real `spawn()` call
 * satisfies this structurally; tests inject a lightweight fake instead so `send()` never launches a
 * real process.
 */
export interface SpawnedProcessLike {
  readonly stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null
  readonly stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null
  on(event: 'close', listener: (code: number | null) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  kill(signal?: NodeJS.Signals): boolean
}

export type SpawnLike = (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => SpawnedProcessLike

export interface ClaudeCodeCliTransportOptions {
  providerId?: string
  /** The CLI command to invoke. Never a path ADF writes to — an existing installation only. */
  command?: string
  /** Name of the environment variable checked for presence. The value is never read or stored. */
  credentialVariable?: string
  /** Injected for verification so tests never spawn a real process. */
  spawnImpl?: SpawnLike
}

/** Best-effort parse of `--output-format json` output. Never throws: an unexpected shape falls back to the raw text so a schema difference degrades gracefully instead of losing the answer. */
function parseCliOutput(stdout: string): { content: string } | { failed: string } | { invalid: true } {
  const trimmed = stdout.trim()
  if (!trimmed) return { invalid: true }
  try {
    const parsed = JSON.parse(trimmed) as { result?: unknown; is_error?: unknown }
    if (parsed.is_error === true) {
      return { failed: typeof parsed.result === 'string' && parsed.result.trim() ? parsed.result : 'is_error: true' }
    }
    if (typeof parsed.result === 'string' && parsed.result.trim().length > 0) {
      return { content: parsed.result }
    }
  } catch {
    // Not JSON (or the CLI printed plain text) — fall through to the raw stdout below.
  }
  return { content: trimmed }
}

export class ClaudeCodeCliTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'cli'
  private readonly command: string
  private readonly credentialVariable: string
  private readonly spawnImpl: SpawnLike

  constructor({ providerId = 'claude-code-cli', command = defaultClaudeCodeCliCommand, credentialVariable = defaultCredentialVariable, spawnImpl }: ClaudeCodeCliTransportOptions = {}) {
    this.providerId = providerId
    this.command = command
    this.credentialVariable = credentialVariable
    this.spawnImpl = spawnImpl ?? ((cmd, args, options) => spawn(cmd, args as string[], options) as unknown as SpawnedProcessLike)
  }

  /**
   * `--bare` is always passed to the spawned process (see `runProcess`), and Claude Code CLI's own
   * documented behaviour in `--bare` mode is that "Anthropic auth is strictly ANTHROPIC_API_KEY or
   * apiKeyHelper... OAuth and keychain are never read." That makes this env-var presence check the
   * *complete* answer for what this specific invocation can authenticate with — not a simplification
   * of a richer `cli-session` model this Transport cannot actually observe. A CLI login session may
   * exist on this machine, but `--bare` never consults it, so `authMode` is `environment-secret`
   * here, matching what is actually checked and actually used. Presence-only, mirroring
   * `AnthropicMessagesTransport`: never reads or reports the credential value itself. An unconfirmed
   * session is never reported as `present: true`.
   */
  credentialStatus(): CredentialStatus {
    return {
      required: true,
      present: Boolean(process.env[this.credentialVariable]?.trim()),
      source: `environment variable ${this.credentialVariable}`,
      authMode: 'environment-secret'
    }
  }

  /** Builds the child's entire environment from the allowlist plus the credential variable — never `process.env` verbatim. Neither value is ever logged, recorded to the Ledger, or included in a Result. */
  private buildChildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const name of inheritedEnvVariables) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }
    const credential = process.env[this.credentialVariable]
    if (credential !== undefined) env[this.credentialVariable] = credential
    return env
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    if (options.signal?.aborted) {
      return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: 0 }
    }
    const startedAt = Date.now()
    // A fresh, empty directory per send: even with --tools '' disabling all tool use, this keeps
    // the process's own cwd away from the real repo/Vault for anything that inspects its surroundings.
    const isolatedCwd = await mkdtemp(path.join(tmpdir(), 'adf-claude-cli-'))
    try {
      return await this.runProcess(packet, options, isolatedCwd, startedAt)
    } finally {
      await rm(isolatedCwd, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private runProcess(packet: SyntheticPacket, options: TransportOptions, cwd: string, startedAt: number): Promise<ExternalSendOutcome> {
    const prompt = `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}`
    // --bare: skips hooks/LSP/plugin sync/keychain reads/CLAUDE.md auto-discovery and fixes auth to
    // ANTHROPIC_API_KEY only (see credentialStatus()) — the same isolation principle as the empty cwd
    // and --tools '', applied to configuration and auth instead of the filesystem.
    const args = ['--bare', '--print', '--output-format', 'json', '--tools', '', prompt]
    const child = this.spawnImpl(this.command, args, { cwd, env: this.buildChildEnv() })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

    return new Promise<ExternalSendOutcome>((resolve) => {
      let timedOut = false
      let cancelled = false

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, options.timeoutMs)

      const onAbort = (): void => {
        cancelled = true
        child.kill('SIGTERM')
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      const settle = (outcome: ExternalSendOutcome): void => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        resolve(outcome)
      }

      child.on('error', (error) => {
        settle({ status: 'failed', terminationReason: 'spawn-error', durationMs: Date.now() - startedAt, errorText: String(error?.message ?? error).slice(0, 200) })
      })

      child.on('close', (code) => {
        const durationMs = Date.now() - startedAt
        if (cancelled) {
          settle({ status: 'cancelled', terminationReason: 'cancelled before the adapter answered', durationMs })
          return
        }
        if (timedOut) {
          settle({ status: 'timeout', terminationReason: `no answer within ${options.timeoutMs}ms`, durationMs })
          return
        }
        if (code !== 0) {
          settle({ status: 'failed', terminationReason: `exit-${code ?? 'null'}`, durationMs, errorText: (stderr || stdout).slice(0, 200) })
          return
        }
        const parsed = parseCliOutput(stdout)
        if ('invalid' in parsed) {
          settle({ status: 'invalid', terminationReason: 'no-response-text', durationMs })
        } else if ('failed' in parsed) {
          settle({ status: 'failed', terminationReason: 'cli-reported-error', durationMs, errorText: parsed.failed.slice(0, 200) })
        } else {
          settle({ status: 'success', content: truncateAnswer(parsed.content), terminationReason: 'completed', durationMs })
        }
      })
    })
  }
}
