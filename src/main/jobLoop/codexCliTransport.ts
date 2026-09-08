import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import type { AdapterConnection } from '../../shared/jobLoopTypes'
import type { ExternalSendOutcome, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { CredentialStatus, ExternalTransport, TransportOptions, TransportReadiness } from './externalTransport'
import { truncateAnswer } from './externalTransport'

/**
 * Local CLI transport for Codex, over `node:child_process` — the second Agent-型 CLI provider after
 * `ClaudeCodeCliTransport`, and built to the same shape. `connection: 'cli'` is not a special case
 * anywhere in Thread, Relay, or Recovery, and nothing here branches on the provider being Codex.
 *
 * `ADF-CODEX-CLI-ADAPTER-001`: registered in the Registry as `status: 'planned'` only (see
 * `adapterRegistry.ts`). Not registered in `index.ts`'s Relay, so the live Electron app cannot reach
 * it — only a future, separately-approved Task wires it up, mirroring how `ollama-local` and
 * `claude-code-cli` each spent their first Task as `planned`.
 *
 * Like Claude Code CLI, Codex is agentic: it can read/write files and run commands by default. The
 * safety boundary is therefore enforced by *how this Transport spawns the process*, not by ADF's
 * `Capability` grant. Three isolations apply to every invocation:
 *
 *  1. `--sandbox read-only`, so model-generated shell commands cannot write.
 *  2. A freshly created, empty working directory, removed again once the process exits.
 *  3. A freshly created, empty `CODEX_HOME` containing nothing but a symlink to the Owner's
 *     `auth.json` (see `prepareIsolatedRun`).
 *
 * **What these do NOT do, stated plainly because an earlier draft of this file claimed otherwise:**
 * this is *not* equivalent to `ClaudeCodeCliTransport`'s `--tools ''`. That flag disables every tool,
 * so that child cannot read anything. Here, `--sandbox read-only` restricts *writes*, not reads, and
 * `-C` only sets the working directory — it is not a chroot or a read allowlist. A Codex child can
 * still read this repository, the Owner's Vault, or any other readable path by naming it absolutely,
 * and can put what it read into its answer. `HOME` is forwarded as well, so the path to those files
 * is discoverable. The read boundary is therefore **not established** by this Transport, which is
 * why `codex-external` stays `planned` and unreachable: closing it needs an OS-level sandbox around
 * the child, tracked as a blocker on `ADF-CODEX-CLI-ADAPTER-001` rather than assumed away here.
 * (Independent adversarial review, 2026-09-08 — verdict `needs-attention`.)
 *
 * (3) is the part with no equivalent in `ClaudeCodeCliTransport`, and it is the reason this
 * Transport exists in this shape rather than as a two-line variation. Codex reads its MCP servers,
 * `config.toml`, `AGENTS.md`, bundled plugins and session history from `CODEX_HOME`. On a machine
 * where ADF's own `adf_frontdoor` MCP server is registered with Codex — which is exactly the machine
 * this Task was written on — a naively spawned child could call back into ADF's own Frontdoor: a
 * child participant reaching ADF's intake plane. Overriding `mcp_servers` through `-c` does **not**
 * prevent this (verified 2026-09-08: the list is unchanged, because bundled plugins are loaded from
 * `CODEX_HOME/plugins` regardless), so an isolated `CODEX_HOME` is the mechanism, not a preference.
 */
export const defaultCodexCommand = 'codex'

/** Where the Owner's real Codex configuration and session live. Only `auth.json` is ever linked from it, and its contents are never read by ADF. */
export function defaultCodexHome(): string {
  return path.join(homedir(), '.codex')
}

/** The credential file inside `CODEX_HOME`. Checked for presence and symlinked — never opened, parsed, logged, or copied. */
export const codexAuthFileName = 'auth.json'

/**
 * The only environment variables ever forwarded to the spawned process. `process.env` is never
 * passed through wholesale: the parent process (the whole Electron app) may hold unrelated secrets
 * that have no business reaching this child. `PATH` lets the OS resolve `command` when it is a bare
 * name; `HOME` lets the CLI find per-user OS locations. Neither is itself a secret. `CODEX_HOME` is
 * deliberately *not* inherited — this Transport always sets it to the isolated directory it just
 * created, so an ambient `CODEX_HOME` in the parent environment cannot re-attach the real one.
 */
const inheritedEnvVariables = ['PATH', 'HOME'] as const

/** How long a terminated child gets to exit before SIGKILL, and again before the send stops waiting for it at all. */
export const terminationGraceMs = 2_000

/** The exact subset of `child_process.ChildProcess` this Transport uses. A real `spawn()` satisfies this structurally; tests inject a lightweight fake so `send()` never launches a real process. */
export interface SpawnedProcessLike {
  readonly stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null
  readonly stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null
  on(event: 'close', listener: (code: number | null) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  kill(signal?: NodeJS.Signals): boolean
}

export type SpawnLike = (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => SpawnedProcessLike

export interface CodexCliTransportOptions {
  providerId?: string
  /** The CLI command to invoke. Never a path ADF writes to — an existing installation only. */
  command?: string
  /** The Owner's real Codex home. Overridable for verification; only `auth.json` is read from it, and only as a symlink target. */
  codexHome?: string
  /** Injected for verification so tests never spawn a real process. */
  spawnImpl?: SpawnLike
}

/** Isolation directories for one invocation. `root` is removed in full afterwards. */
interface IsolatedRun {
  root: string
  home: string
  work: string
  outputFile: string
}

export class CodexIsolationError extends Error {
  readonly code = 'CODEX_ISOLATION_FAILED'
  constructor(message: string) {
    super(message)
  }
}

/** Words that make an answer non-affirmative regardless of the rest of the line: `Logged in: false`, `Session expired; last logged in ...`, `status unknown; user was logged in ...`. */
const sessionDisqualifiers = /\b(?:not|no|none|false|expired|invalid|unknown|missing|error|failed|required)\b/i

/**
 * Fail-closed reading of `codex login status`. An affirmative is recognised only as a single line
 * that *begins* with the affirmation and carries no disqualifying word; everything else — a denial,
 * a contradiction, multiple lines, an unrecognised format, an empty answer — is not ready.
 *
 * Substring matching is not enough here and the reason is worth stating: `Not logged in`,
 * `Logged in: false` and `Session expired; last logged in ...` all *contain* "logged in", so any
 * check that merely looks for the affirmative phrase reads an explicit denial as an approval.
 */
export function interpretLoginStatus(rawOutput: string): TransportReadiness {
  const reported = rawOutput.trim()
  const detail = reported.slice(0, 120)
  if (!reported) return { ready: false, detail: 'codex login status returned no output' }
  const lines = reported.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length !== 1) return { ready: false, detail: `unrecognised multi-line login status: ${detail}` }
  if (sessionDisqualifiers.test(lines[0])) return { ready: false, detail: `codex reports no usable session: ${detail}` }
  if (!/^(?:logged|signed)\s+in\b/i.test(lines[0])) return { ready: false, detail: `unrecognised login status: ${detail}` }
  return { ready: true, detail }
}

export class CodexCliTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'cli'
  private readonly command: string
  private readonly codexHome: string
  private readonly spawnImpl: SpawnLike

  constructor({ providerId = 'codex-external', command = defaultCodexCommand, codexHome, spawnImpl }: CodexCliTransportOptions = {}) {
    this.providerId = providerId
    this.command = command
    this.codexHome = codexHome ?? defaultCodexHome()
    this.spawnImpl = spawnImpl ?? ((cmd, args, options) => spawn(cmd, args as string[], options) as unknown as SpawnedProcessLike)
  }

  private get authFilePath(): string {
    return path.join(this.codexHome, codexAuthFileName)
  }

  /**
   * `authMode` is `cli-session`, not `environment-secret` — the opposite of the choice
   * `ClaudeCodeCliTransport` documents. That is not an inconsistency: Claude Code is always spawned
   * with `--bare`, under which its own docs state auth is strictly `ANTHROPIC_API_KEY`. Codex has no
   * such mode here; the isolated `CODEX_HOME` keeps exactly one thing from the Owner's real home,
   * and that one thing *is* the CLI session file. So `cli-session` is what this Adapter actually
   * checks and actually uses.
   *
   * Presence only, mirroring the other transports: the file is stat-ed, never opened. A session that
   * exists but has expired still reports `present: true` here — `checkReadiness()` is the check that
   * can tell the difference, and it is the one a dispatch must pass.
   */
  credentialStatus(): CredentialStatus {
    return {
      required: true,
      present: existsSync(this.authFilePath),
      source: `Codex CLI session file (${path.join('<CODEX_HOME>', codexAuthFileName)})`,
      authMode: 'cli-session'
    }
  }

  /**
   * Runs `codex login status` inside a fully isolated home, so it verifies the *same* auth path a
   * real `send()` would use rather than the ambient one. Makes no model call and sends no packet
   * content. Invoked only by an explicit Owner action, per the `ExternalTransport` contract.
   */
  async checkReadiness(): Promise<TransportReadiness> {
    if (!existsSync(this.authFilePath)) {
      return { ready: false, detail: `no Codex CLI session: ${this.authFilePath} is absent` }
    }
    let run: IsolatedRun | undefined
    try {
      run = await this.prepareIsolatedRun()
      const outcome = await this.runProcess(['login', 'status'], run, { timeoutMs: 20_000 }, Date.now())
      if (outcome.status !== 'success') {
        return { ready: false, detail: `codex login status did not succeed: ${outcome.terminationReason}` }
      }
      return interpretLoginStatus(outcome.content ?? '')
    } catch (error) {
      return { ready: false, detail: `readiness check failed: ${String((error as Error)?.message ?? error).slice(0, 160)}` }
    } finally {
      if (run) await rm(run.root, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /**
   * Creates the per-invocation isolation: an empty `CODEX_HOME` holding only a symlink to the
   * Owner's `auth.json`, plus an empty working directory. A symlink rather than a copy so the
   * credential is never duplicated onto disk by ADF and never passes through this process's memory.
   * Throws rather than degrading: a run that cannot be isolated must not start.
   */
  private async prepareIsolatedRun(): Promise<IsolatedRun> {
    // Checked before the symlink, not by it: `symlink()` succeeds against a missing target on
    // POSIX, leaving a dangling link that looks like a configured session until the child fails.
    // An unauthenticated run must be refused here, not discovered later.
    if (!existsSync(this.authFilePath)) {
      throw new CodexIsolationError(`no Codex CLI session file to link: ${codexAuthFileName} is absent from the configured CODEX_HOME`)
    }
    const root = await mkdtemp(path.join(tmpdir(), 'adf-codex-cli-'))
    const home = path.join(root, 'home')
    const work = path.join(root, 'work')
    try {
      await mkdir(home)
      await mkdir(work)
      await symlink(this.authFilePath, path.join(home, codexAuthFileName))
    } catch (error) {
      await rm(root, { recursive: true, force: true }).catch(() => undefined)
      throw new CodexIsolationError(`could not isolate CODEX_HOME: ${String((error as Error)?.message ?? error)}`)
    }
    return { root, home, work, outputFile: path.join(root, 'last-message.txt') }
  }

  /** Builds the child's entire environment from the allowlist plus the isolated `CODEX_HOME` — never `process.env` verbatim, and never the ambient `CODEX_HOME`. */
  private buildChildEnv(home: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const name of inheritedEnvVariables) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }
    env.CODEX_HOME = home
    return env
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    if (options.signal?.aborted) {
      return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: 0 }
    }
    const startedAt = Date.now()
    // Readiness is a precondition of the send, not a separate advisory check an Owner might run
    // first. `auth.json` existing says only that a session file is on disk; it does not say the
    // session is still valid, so without this gate an expired login would reach `codex exec`.
    const readiness = await this.checkReadiness()
    if (!readiness.ready) {
      return { status: 'failed', terminationReason: 'not-authenticated', durationMs: Date.now() - startedAt, errorText: readiness.detail.slice(0, 200) }
    }
    if (options.signal?.aborted) {
      return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: Date.now() - startedAt }
    }
    let run: IsolatedRun
    try {
      run = await this.prepareIsolatedRun()
    } catch (error) {
      // Isolation is the safety boundary itself: failing to build it is a failed send, never a send
      // that proceeds without it.
      return { status: 'failed', terminationReason: 'isolation-failed', durationMs: Date.now() - startedAt, errorText: String((error as Error)?.message ?? error).slice(0, 200) }
    }
    try {
      const prompt = `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}`
      // `--sandbox read-only` bounds what model-generated commands may do; `-C` and `--skip-git-repo-check`
      // keep the process in the empty working directory (Codex otherwise refuses a non-repo cwd);
      // `-o` writes the final message to a known file so the answer is read from a defined output
      // rather than by guessing at the shape of streamed stdout.
      const args = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-C', run.work, '-o', run.outputFile, prompt]
      const outcome = await this.runProcess(args, run, options, startedAt)
      if (outcome.status !== 'success') return outcome
      const answer = await readFile(run.outputFile, 'utf8').catch(() => '')
      const trimmed = answer.trim()
      if (!trimmed) return { status: 'invalid', terminationReason: 'no-response-text', durationMs: Date.now() - startedAt }
      return { ...outcome, content: truncateAnswer(trimmed) }
    } finally {
      await rm(run.root, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /** Shared process runner for `send()` and `checkReadiness()`, so both go through the identical isolation and termination handling. `content` here is raw stdout; `send()` prefers the `-o` file. */
  private runProcess(args: readonly string[], run: IsolatedRun, options: TransportOptions, startedAt: number): Promise<ExternalSendOutcome> {
    const child = this.spawnImpl(this.command, args, { cwd: run.work, env: this.buildChildEnv(run.home) })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

    return new Promise<ExternalSendOutcome>((resolve) => {
      let timedOut = false
      let cancelled = false
      let timer: ReturnType<typeof setTimeout>
      let escalation: ReturnType<typeof setTimeout> | undefined
      let abandon: ReturnType<typeof setTimeout> | undefined

      const settle = (outcome: ExternalSendOutcome): void => {
        clearTimeout(timer)
        if (escalation) clearTimeout(escalation)
        if (abandon) clearTimeout(abandon)
        options.signal?.removeEventListener('abort', onAbort)
        resolve(outcome)
      }

      /**
       * SIGTERM, then SIGKILL, then settle regardless. Resolving only on `close` would leave a child
       * that ignores signals — or that exits while a grandchild holds its stdio open — blocking this
       * Promise forever, and with it the `finally` that deletes the isolation directory. That
       * directory contains the symlink to the Owner's `auth.json`, so it must not be able to outlive
       * the send.
       */
      const terminate = (): void => {
        child.kill('SIGTERM')
        escalation = setTimeout(() => child.kill('SIGKILL'), terminationGraceMs)
        abandon = setTimeout(() => settle({ status: 'timeout', terminationReason: 'process-did-not-exit-after-sigkill', durationMs: Date.now() - startedAt }), terminationGraceMs * 2)
      }

      timer = setTimeout(() => {
        timedOut = true
        terminate()
      }, options.timeoutMs)

      const onAbort = (): void => {
        cancelled = true
        terminate()
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

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
        settle({ status: 'success', content: stdout.trim(), terminationReason: 'completed', durationMs })
      })
    })
  }
}
