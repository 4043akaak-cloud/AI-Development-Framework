import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, readlink, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'
import { CodexCliTransport, codexAuthFileName, defaultCodexCommand, interpretLoginStatus, terminationGraceMs, type SpawnLike, type SpawnedProcessLike } from '../src/main/jobLoop/codexCliTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'
import { AdapterRegistryError, buildExplicitAdapterPlan, getAdapterProfile, supports } from '../src/main/jobLoop/adapterRegistry'

const thread = { taskId: 'ADF-CODEX-CLI-ADAPTER-001', threadId: 'th1', jobId: 'job1', turns: [] } as never
const packet: SyntheticPacket = buildSyntheticPacket(thread, 'proposal', 0, '2026-09-08T00:00:00.000Z')
const options = { timeoutMs: 1000 }

/** Real process semantics: kill() leads to a 'close' event, asynchronously — never synchronously. `ignoresSignals` models a child that does not exit when signalled. */
class FakeChildProcess extends EventEmitter implements SpawnedProcessLike {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly signals: NodeJS.Signals[] = []
  constructor(private readonly ignoresSignals = false) { super() }
  kill(signal?: NodeJS.Signals): boolean {
    if (signal) this.signals.push(signal)
    if (!this.ignoresSignals) setImmediate(() => this.emit('close', null))
    return true
  }
}

interface SpawnCall {
  command: string
  args: readonly string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

const isLoginCall = (call: SpawnCall): boolean => call.args[0] === 'login'

interface StubOptions {
  /** What `codex login status` answers. `send()` now gates on this, so every send test passes through it. */
  loginStatus?: string
  /** Children that ignore SIGTERM/SIGKILL, for the termination-escalation path. */
  ignoresSignals?: boolean
}

/**
 * Never spawns a real process. Readiness calls are answered automatically so each test only has to
 * describe the `codex exec` behaviour it cares about.
 */
function stub(handler: (child: FakeChildProcess, call: SpawnCall) => void | Promise<void>, stubOptions: StubOptions = {}): { calls: SpawnCall[]; execCalls: SpawnCall[]; children: FakeChildProcess[]; spawnImpl: SpawnLike } {
  const calls: SpawnCall[] = []
  const children: FakeChildProcess[] = []
  const spawnImpl: SpawnLike = (command, args, opts) => {
    const call: SpawnCall = { command, args, cwd: opts.cwd, env: opts.env }
    calls.push(call)
    const child = new FakeChildProcess(stubOptions.ignoresSignals && !isLoginCall(call))
    children.push(child)
    setImmediate(() => {
      if (isLoginCall(call)) {
        child.stdout.emit('data', stubOptions.loginStatus ?? 'Logged in using ChatGPT')
        child.emit('close', 0)
        return
      }
      void handler(child, call)
    })
    return child
  }
  return { calls, get execCalls() { return calls.filter((call) => !isLoginCall(call)) }, children, spawnImpl }
}

/** The value of a flag in the spawned argv, e.g. `-o` → the output file path the Transport chose. */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

/** Stands in for the Owner's real `~/.codex`: holds an `auth.json` whose contents ADF must never read. */
let fakeCodexHome: string

beforeEach(async () => {
  fakeCodexHome = await mkdtemp(path.join(tmpdir(), 'adf-codex-home-fixture-'))
  await writeFile(path.join(fakeCodexHome, codexAuthFileName), '{"token":"never-read-by-adf"}')
})

afterEach(async () => {
  await rm(fakeCodexHome, { recursive: true, force: true }).catch(() => undefined)
})

describe('ADF-CODEX-CLI-ADAPTER-001 Codex CLI transport (spawnImpl injected, never a real process)', () => {
  it('declares connection cli and a cli-session credential, reporting presence only and never the value', () => {
    const transport = new CodexCliTransport({ codexHome: fakeCodexHome })
    expect(transport.connection).toBe('cli')
    const status = transport.credentialStatus()
    expect(status).toMatchObject({ required: true, present: true, authMode: 'cli-session' })
    expect(JSON.stringify(status)).not.toContain('never-read-by-adf')
    expect(status.source).not.toContain(fakeCodexHome)
  })

  it('reports the credential absent when no Codex CLI session file exists', () => {
    expect(new CodexCliTransport({ codexHome: path.join(fakeCodexHome, 'nope') }).credentialStatus().present).toBe(false)
  })

  it('spawns codex exec under a read-only sandbox, in a fresh empty working directory', async () => {
    const s = stub(async (child, call) => {
      await writeFile(flagValue(call.args, '-o')!, '受信しました。役割: proposal。')
      child.emit('close', 0)
    })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)

    expect(outcome).toMatchObject({ status: 'success', terminationReason: 'completed', content: '受信しました。役割: proposal。' })
    expect(s.execCalls).toHaveLength(1)
    expect(s.execCalls[0].command).toBe(defaultCodexCommand)
    expect(s.execCalls[0].args.slice(0, 6)).toEqual(['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never'])
    expect(s.execCalls[0].args.at(-1)).toContain('合成パケット')
    expect(s.execCalls[0].cwd).not.toBe(process.cwd())
    expect(s.execCalls[0].cwd).toContain('adf-codex-cli-')
  })

  it('never passes the sandbox-bypass flag', async () => {
    const s = stub(async (child, call) => {
      await writeFile(flagValue(call.args, '-o')!, 'ok')
      child.emit('close', 0)
    })
    await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)
    expect(s.execCalls[0].args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(s.execCalls[0].args.join(' ')).not.toContain('danger-full-access')
  })

  /**
   * Verifies only what it can: the directory ADF hands the child. It does **not** prove that a real
   * Codex resolves no MCP servers from it — that needs the real CLI, and is recorded as an open item
   * in ADF-CODEX-CLI-ADAPTER-001 §12 rather than claimed here.
   */
  it('hands the child a CODEX_HOME directory containing nothing but a symlink to auth.json', async () => {
    let capturedHome = ''
    let entries: string[] = []
    let linkTarget = ''
    const s = stub(async (child, call) => {
      capturedHome = call.env.CODEX_HOME ?? ''
      entries = await readdir(capturedHome)
      linkTarget = await readlink(path.join(capturedHome, codexAuthFileName))
      await writeFile(flagValue(call.args, '-o')!, 'ok')
      child.emit('close', 0)
    })
    await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)

    expect(capturedHome).not.toBe(fakeCodexHome)
    expect(capturedHome).toContain('adf-codex-cli-')
    expect(entries).toEqual([codexAuthFileName])
    expect(linkTarget).toBe(path.join(fakeCodexHome, codexAuthFileName))
  })

  it('never forwards process.env wholesale, and an ambient CODEX_HOME cannot re-attach the real one', async () => {
    const previousAmbient = process.env.CODEX_HOME
    const previousUnrelated = process.env.ADF_TEST_UNRELATED_SECRET
    process.env.CODEX_HOME = fakeCodexHome
    process.env.ADF_TEST_UNRELATED_SECRET = 'some-other-apps-token-should-never-leak'
    try {
      let capturedEnv: NodeJS.ProcessEnv = {}
      const s = stub(async (child, call) => {
        capturedEnv = call.env
        await writeFile(flagValue(call.args, '-o')!, 'ok')
        child.emit('close', 0)
      })
      await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)

      expect(capturedEnv).not.toBe(process.env)
      expect(capturedEnv.ADF_TEST_UNRELATED_SECRET).toBeUndefined()
      expect(capturedEnv.CODEX_HOME).not.toBe(fakeCodexHome)
      expect(Object.keys(capturedEnv).sort()).toEqual(['PATH', 'HOME', 'CODEX_HOME'].filter((name) => name === 'CODEX_HOME' || process.env[name] !== undefined).sort())
    } finally {
      if (previousAmbient === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = previousAmbient
      if (previousUnrelated === undefined) delete process.env.ADF_TEST_UNRELATED_SECRET
      else process.env.ADF_TEST_UNRELATED_SECRET = previousUnrelated
    }
  })

  it('removes the whole isolation directory after the send, success or failure', async () => {
    let isolationRoot = ''
    const ok = stub(async (child, call) => {
      isolationRoot = path.dirname(call.cwd)
      await writeFile(flagValue(call.args, '-o')!, 'ok')
      child.emit('close', 0)
    })
    await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: ok.spawnImpl }).send(packet, options)
    expect(isolationRoot).toContain('adf-codex-cli-')
    expect(existsSync(isolationRoot)).toBe(false)

    const failing = stub((child) => { child.emit('close', 3) })
    await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: failing.spawnImpl }).send(packet, options)
    expect(existsSync(path.dirname(failing.execCalls[0].cwd))).toBe(false)
  })

  it('fails the send rather than proceeding when the isolation cannot be built', async () => {
    const s = stub((child) => { child.emit('close', 0) })
    const outcome = await new CodexCliTransport({ codexHome: path.join(fakeCodexHome, 'absent'), spawnImpl: s.spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed' })
    // No process at all: not even the readiness probe, because the session file is absent.
    expect(s.calls).toHaveLength(0)
  })

  it('reads the answer from the -o output file, not from streamed stdout', async () => {
    const s = stub(async (child, call) => {
      child.stdout.emit('data', 'progress noise that is not the answer')
      await writeFile(flagValue(call.args, '-o')!, 'これが最終メッセージです。')
      child.emit('close', 0)
    })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)
    expect(outcome.content).toBe('これが最終メッセージです。')
  })

  it('reports invalid when the process succeeds but writes no final message', async () => {
    const s = stub((child) => { child.emit('close', 0) })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'invalid', terminationReason: 'no-response-text' })
  })

  it('reports a non-zero exit as failed, carrying stderr as the error text', async () => {
    const s = stub((child) => {
      child.stderr.emit('data', 'codex: something went wrong')
      child.emit('close', 7)
    })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed', terminationReason: 'exit-7', errorText: 'codex: something went wrong' })
  })

  it('times out by terminating the process rather than waiting indefinitely', async () => {
    const s = stub(() => { /* never closes on its own */ })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, { timeoutMs: 20 })
    expect(outcome.status).toBe('timeout')
  })

  it('cancels before spawning anything when the signal is already aborted', async () => {
    const s = stub((child) => { child.emit('close', 0) })
    const controller = new AbortController()
    controller.abort()
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, { timeoutMs: 1000, signal: controller.signal })
    expect(outcome.status).toBe('cancelled')
    expect(s.execCalls).toHaveLength(0)
  })

  /** Adversarial review finding: `send()` must not treat "a session file exists" as "the session works". */
  it('refuses to spawn codex exec when the login session is not usable', async () => {
    const s = stub((child) => { child.emit('close', 0) }, { loginStatus: 'Not logged in. Run `codex login`.' })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed', terminationReason: 'not-authenticated' })
    expect(s.execCalls).toHaveLength(0)
  })

  /** Adversarial review finding: a child that ignores SIGTERM must not hold the auth.json symlink open forever. */
  it('escalates SIGTERM to SIGKILL and stops waiting, so the isolation directory is always removed', async () => {
    const s = stub(() => { /* never closes, and ignores signals */ }, { ignoresSignals: true })
    const outcome = await new CodexCliTransport({ codexHome: fakeCodexHome, spawnImpl: s.spawnImpl }).send(packet, { timeoutMs: 10 })

    expect(outcome).toMatchObject({ status: 'timeout', terminationReason: 'process-did-not-exit-after-sigkill' })
    const execChild = s.children[s.children.length - 1]
    expect(execChild.signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(existsSync(path.dirname(s.execCalls[0].cwd))).toBe(false)
  }, terminationGraceMs * 4)

  it('runs the readiness check through the same isolation', async () => {
    let readinessHome = ''
    const s = stub(() => undefined)
    // The stub answers `login status` itself; capture the home it was given.
    const transport = new CodexCliTransport({
      codexHome: fakeCodexHome,
      spawnImpl: (command, args, opts) => { readinessHome = opts.env.CODEX_HOME ?? ''; return s.spawnImpl(command, args, opts) }
    })
    const readiness = await transport.checkReadiness()
    expect(readiness).toMatchObject({ ready: true })
    expect(s.calls[0].args).toEqual(['login', 'status'])
    expect(readinessHome).toContain('adf-codex-cli-')

    const absent = stub(() => undefined)
    const missing = await new CodexCliTransport({ codexHome: path.join(fakeCodexHome, 'absent'), spawnImpl: absent.spawnImpl }).checkReadiness()
    expect(missing.ready).toBe(false)
    expect(absent.calls).toHaveLength(0)
  })
})

/**
 * Adversarial review finding: substring matching made contradictory answers look affirmative.
 * Every case here contains the phrase "logged in".
 */
describe('ADF-CODEX-CLI-ADAPTER-001 login status is read fail-closed', () => {
  it.each([
    ['Logged in using ChatGPT', true],
    ['Signed in as owner', true],
    ['Not logged in. Run `codex login`.', false],
    ['Logged in: false', false],
    ['Session expired; last logged in 2026-08-01', false],
    ['status unknown; user was logged in', false],
    ['Logged in, but credentials are invalid', false],
    ['Logged in\nwarning: token refresh failed', false],
    ['', false],
    ['???', false]
  ])('reads %j as ready=%s', (output, expected) => {
    expect(interpretLoginStatus(output as string).ready).toBe(expected)
  })
})

describe('ADF-CODEX-CLI-ADAPTER-001 registry boundary', () => {
  it('declares codex-external as a planned cli/cli-session external-send adapter', () => {
    expect(getAdapterProfile('codex-external')).toMatchObject({
      connection: 'cli',
      authMode: 'cli-session',
      status: 'planned',
      dataPolicy: 'external-send'
    })
  })

  it('cannot be auto-routed while it is planned', () => {
    expect(supports(getAdapterProfile('codex-external'), 'proposal', ['read', 'propose'], 'unknown')).toBe(false)
  })

  /**
   * Regression lock for the boundary recorded in ADF-CODEX-CLI-ADAPTER-001 §4.3: an `external-send`
   * adapter cannot enter a Frontdoor AdapterPlan at all. Widening that is an Owner decision about
   * the local-only MVP boundary, never a side effect of registering a Transport.
   */
  it('is refused by buildExplicitAdapterPlan as outside the local-only MVP boundary', () => {
    expect(() => buildExplicitAdapterPlan('ADF-CODEX-CLI-ADAPTER-001', 'codex-external', 'proposal', ['read', 'propose'], 'unknown')).toThrow(AdapterRegistryError)
  })
})
