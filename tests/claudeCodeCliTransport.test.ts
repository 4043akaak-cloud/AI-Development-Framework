import { EventEmitter } from 'node:events'
import { access } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'
import { ClaudeCodeCliTransport, defaultClaudeCodeCliCommand, defaultCredentialVariable, type SpawnLike, type SpawnedProcessLike } from '../src/main/jobLoop/claudeCodeCliTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'

const thread = { taskId: 'ADF-CLAUDE-CODE-CLI-ADAPTER-001', threadId: 'th1', jobId: 'job1', turns: [] } as never
const packet: SyntheticPacket = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-13T00:00:00.000Z')
const options = { timeoutMs: 1000 }

/** Real process semantics: kill() leads to a 'close' event, asynchronously — never synchronously. */
class FakeChildProcess extends EventEmitter implements SpawnedProcessLike {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  killed = false
  killSignal?: NodeJS.Signals
  kill(signal?: NodeJS.Signals): boolean {
    this.killed = true
    this.killSignal = signal
    setImmediate(() => this.emit('close', null))
    return true
  }
}

interface SpawnCall {
  command: string
  args: readonly string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/** Never spawns a real process: the handler drives a `FakeChildProcess` on the next tick, after `send()` has already attached its listeners — matching real async process timing. */
function stub(handler: (child: FakeChildProcess, call: SpawnCall) => void): { calls: SpawnCall[]; children: FakeChildProcess[]; spawnImpl: SpawnLike } {
  const calls: SpawnCall[] = []
  const children: FakeChildProcess[] = []
  const spawnImpl: SpawnLike = (command, args, opts) => {
    const call: SpawnCall = { command, args, cwd: opts.cwd, env: opts.env }
    calls.push(call)
    const child = new FakeChildProcess()
    children.push(child)
    setImmediate(() => handler(child, call))
    return child
  }
  return { calls, children, spawnImpl }
}

describe('ADF-CLAUDE-CODE-CLI-ADAPTER-001 Claude Code CLI transport (spawnImpl injected, never a real process)', () => {
  it('declares connection cli and reports credential presence only, never the value', () => {
    const previous = process.env[defaultCredentialVariable]
    process.env[defaultCredentialVariable] = 'sk-ant-should-never-appear'
    try {
      const transport = new ClaudeCodeCliTransport({})
      expect(transport.connection).toBe('cli')
      const status = transport.credentialStatus()
      // environment-secret, not cli-session: this Transport always spawns with --bare, under which
      // Claude Code CLI's own docs say auth is strictly ANTHROPIC_API_KEY (OAuth/keychain never
      // read) — so that is the complete, accurate description of what this check actually covers.
      expect(status).toMatchObject({ required: true, present: true, authMode: 'environment-secret' })
      expect(JSON.stringify(status)).not.toContain('sk-ant-should-never-appear')
    } finally {
      if (previous === undefined) delete process.env[defaultCredentialVariable]
      else process.env[defaultCredentialVariable] = previous
    }
  })

  it('reports credential absent when the environment variable is unset (--bare mode would not use a login session even if one exists)', () => {
    const previous = process.env[defaultCredentialVariable]
    delete process.env[defaultCredentialVariable]
    try {
      expect(new ClaudeCodeCliTransport({}).credentialStatus().present).toBe(false)
    } finally {
      if (previous !== undefined) process.env[defaultCredentialVariable] = previous
    }
  })

  it('spawns --bare --print --output-format json --tools "" with the packet instruction as the prompt, in a fresh isolated cwd', async () => {
    const { calls, spawnImpl } = stub((child) => {
      child.stdout.emit('data', JSON.stringify({ result: '受信しました。役割: proposal。' }))
      child.emit('close', 0)
    })
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)

    expect(outcome).toMatchObject({ status: 'success', terminationReason: 'completed', content: '受信しました。役割: proposal。' })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe(defaultClaudeCodeCliCommand)
    expect(calls[0].args).toEqual(['--bare', '--print', '--output-format', 'json', '--tools', '', expect.stringContaining('合成パケット')])
    expect(calls[0].cwd).not.toBe(process.cwd())
    expect(calls[0].cwd).toContain('adf-claude-cli-')
  })

  it('never forwards process.env wholesale: only PATH, HOME, and the credential variable reach the spawned process', async () => {
    const previousKey = process.env[defaultCredentialVariable]
    const previousUnrelated = process.env.ADF_TEST_UNRELATED_SECRET
    process.env[defaultCredentialVariable] = 'sk-ant-the-real-credential'
    process.env.ADF_TEST_UNRELATED_SECRET = 'some-other-apps-token-should-never-leak'
    try {
      let capturedEnv: NodeJS.ProcessEnv = {}
      const { spawnImpl } = stub((child, call) => {
        capturedEnv = call.env
        child.stdout.emit('data', JSON.stringify({ result: 'ok' }))
        child.emit('close', 0)
      })
      await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)

      expect(capturedEnv).not.toBe(process.env)
      expect(capturedEnv.ADF_TEST_UNRELATED_SECRET).toBeUndefined()
      expect(capturedEnv[defaultCredentialVariable]).toBe('sk-ant-the-real-credential')
      if (process.env.PATH !== undefined) expect(capturedEnv.PATH).toBe(process.env.PATH)
      if (process.env.HOME !== undefined) expect(capturedEnv.HOME).toBe(process.env.HOME)
      // Nothing beyond the allowlist + credential variable is present.
      expect(Object.keys(capturedEnv).sort()).toEqual([...new Set(['PATH', 'HOME', defaultCredentialVariable])].sort())
    } finally {
      if (previousKey === undefined) delete process.env[defaultCredentialVariable]
      else process.env[defaultCredentialVariable] = previousKey
      if (previousUnrelated === undefined) delete process.env.ADF_TEST_UNRELATED_SECRET
      else process.env.ADF_TEST_UNRELATED_SECRET = previousUnrelated
    }
  })

  it('omits the credential variable from the child environment entirely when it is not set, rather than forwarding an empty value', async () => {
    const previousKey = process.env[defaultCredentialVariable]
    delete process.env[defaultCredentialVariable]
    try {
      let capturedEnv: NodeJS.ProcessEnv = {}
      const { spawnImpl } = stub((child, call) => {
        capturedEnv = call.env
        child.stdout.emit('data', JSON.stringify({ result: 'ok' }))
        child.emit('close', 0)
      })
      await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
      expect(Object.prototype.hasOwnProperty.call(capturedEnv, defaultCredentialVariable)).toBe(false)
    } finally {
      if (previousKey !== undefined) process.env[defaultCredentialVariable] = previousKey
    }
  })

  it('removes the isolated temp cwd once the process finishes', async () => {
    let capturedCwd = ''
    const { spawnImpl } = stub((child, call) => {
      capturedCwd = call.cwd
      child.stdout.emit('data', JSON.stringify({ result: 'ok' }))
      child.emit('close', 0)
    })
    await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
    await expect(access(capturedCwd)).rejects.toThrow()
  })

  it('falls back to raw stdout as content when the output is not the expected JSON shape', async () => {
    const { spawnImpl } = stub((child) => {
      child.stdout.emit('data', 'plain text answer, not the documented JSON shape')
      child.emit('close', 0)
    })
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'success', content: 'plain text answer, not the documented JSON shape' })
  })

  it('reports is_error: true in the JSON output as failed', async () => {
    const { spawnImpl } = stub((child) => {
      child.stdout.emit('data', JSON.stringify({ is_error: true, result: 'permission denied' }))
      child.emit('close', 0)
    })
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed', terminationReason: 'cli-reported-error', errorText: 'permission denied' })
  })

  it('reports empty stdout as invalid', async () => {
    const { spawnImpl } = stub((child) => child.emit('close', 0))
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'invalid', terminationReason: 'no-response-text' })
  })

  it('maps a non-zero exit code to failed, using stderr as the (truncated) error text', async () => {
    const { spawnImpl } = stub((child) => {
      child.stderr.emit('data', 'x'.repeat(1000))
      child.emit('close', 1)
    })
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed', terminationReason: 'exit-1' })
    expect(outcome.errorText?.length).toBeLessThanOrEqual(200)
  })

  it('reports a spawn-level error (e.g. command not found) as failed without throwing', async () => {
    const { spawnImpl } = stub((child) => {
      child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))
    })
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed', terminationReason: 'spawn-error' })
    expect(outcome.errorText).toContain('ENOENT')
  })

  it('reports an elapsed deadline as a timeout and kills the process', async () => {
    const { spawnImpl, children } = stub(() => { /* never closes on its own */ })
    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, { timeoutMs: 10 })
    expect(outcome).toMatchObject({ status: 'timeout', terminationReason: 'no answer within 10ms' })
    expect(children[0]?.killed).toBe(true)
  })

  it('reports an Owner cancel as cancelled, distinct from a timeout', async () => {
    const { spawnImpl, children } = stub(() => { /* never closes on its own */ })
    const controller = new AbortController()
    const pending = new ClaudeCodeCliTransport({ spawnImpl }).send(packet, { timeoutMs: 60_000, signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(children[0]?.killed).toBeFalsy()
    controller.abort(new Error('cancelled by Owner'))

    expect(await pending).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the adapter answered' })
    expect(children[0]?.killed).toBe(true)
  })

  it('never spawns when the caller signal is already aborted', async () => {
    const { calls, spawnImpl } = stub(() => undefined)
    const controller = new AbortController()
    controller.abort(new Error('cancelled before dispatch'))

    const outcome = await new ClaudeCodeCliTransport({ spawnImpl }).send(packet, { timeoutMs: 60_000, signal: controller.signal })
    expect(outcome).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the request was sent' })
    expect(calls).toHaveLength(0)
  })
})
