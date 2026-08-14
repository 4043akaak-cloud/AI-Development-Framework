import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import { approvedTaskPacketPath, defaultIO, runCli, type CliIO } from '../src/cli/buildApprovedTaskPacket'
import { validateApprovedTask } from '../src/main/jobLoop/contracts'
import { hashJson } from '../src/main/jobLoop/hash'

const taskId = 'ADF-EXAMPLE-001'

function validExecutionSummaryJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      adfExecutionSummary: 'v1',
      taskId,
      objective: 'Example objective for CLI tests.',
      scope: { inScope: ['do the thing'], outOfScope: ['do the other thing'] },
      context: { githubTask: `docs/tasks/${taskId}.md`, obsidianContext: [], adoptedPrinciples: ['owner-approval'] },
      acceptance: ['it works'],
      stopConditions: ['owner says stop'],
      ...overrides
    },
    null,
    2
  )
}

function markdownWith(json: string): string {
  return `# ${taskId}\n\nNarrative prose that the CLI must never read.\n\n## ADF Execution Summary\n\n\`\`\`json adf-execution-summary\n${json}\n\`\`\`\n`
}

const baseArgs = (): string[] => [
  '--task', taskId,
  '--roles', 'proposal,critic',
  '--approval-id', 'approval-cli-001',
  '--approved-by', 'Project Owner',
  '--approved-at', '2026-08-11T00:00:00.000Z',
  '--expires-at', '2099-12-31T23:59:59.000Z',
  '--capabilities', 'read,propose'
]

function memoryIO(markdownByTask: Record<string, string>, existingByTask: Record<string, ApprovedTaskPacket> = {}) {
  const stdout: string[] = []
  const stderr: string[] = []
  const written: Record<string, ApprovedTaskPacket> = {}
  const io: CliIO = {
    readTaskMarkdown: async (_dir, id) => {
      const markdown = markdownByTask[id]
      if (markdown === undefined) {
        const error = new Error(`ENOENT: no such task ${id}`) as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
      return markdown
    },
    readExistingPacket: async (_root, id) => existingByTask[id] ?? null,
    writePacket: async (_root, id, packet) => {
      if (written[id] || existingByTask[id]) {
        const error = new Error('EEXIST') as NodeJS.ErrnoException
        error.code = 'EEXIST'
        throw error
      }
      written[id] = packet
    },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text)
  }
  return { io, stdout, stderr, written }
}

describe('runCli — happy path', () => {
  it('builds a Packet that passes validateApprovedTask and prints it to stdout', async () => {
    const { io, stdout, written } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const code = await runCli(baseArgs(), io)

    expect(code).toBe(0)
    expect(Object.keys(written)).toHaveLength(0) // no --write: nothing persisted
    const packet = JSON.parse(stdout.join('')) as ApprovedTaskPacket
    expect(packet.taskId).toBe(taskId)
    expect(packet.scope).toEqual({ inScope: ['do the thing'], outOfScope: ['do the other thing'] })
    expect(() => validateApprovedTask(packet)).not.toThrow()
    expect(packet.adapterPlan.selections.map((s) => s.role).sort()).toEqual(['critic', 'proposal'])
  })

  it('never invents approval metadata: the packet carries exactly what was passed on the command line', async () => {
    const { io, stdout } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    await runCli(baseArgs(), io)
    const packet = JSON.parse(stdout.join('')) as ApprovedTaskPacket
    expect(packet.approval).toMatchObject({
      approvalId: 'approval-cli-001',
      approvedBy: 'Project Owner',
      approvedAt: '2026-08-11T00:00:00.000Z',
      expiresAt: '2099-12-31T23:59:59.000Z',
      capabilities: ['read', 'propose']
    })
  })

  it('computes scopeHash/contextHash from the Execution Summary content, not by copying stored hashes', async () => {
    const { io, stdout } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    await runCli(baseArgs(), io)
    const packet = JSON.parse(stdout.join('')) as ApprovedTaskPacket
    expect(packet.scopeHash).toBe(hashJson(packet.scope))
    expect(packet.contextHash).toBe(hashJson(packet.context))
  })
})

describe('runCli — structural / schema failures (no partial output)', () => {
  it('exits non-zero and prints nothing to stdout when the Execution Summary is missing', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: '# Title\n\nNo summary here.\n' })
    const code = await runCli(baseArgs(), io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/heading not found/)
  })

  it('exits non-zero when the Execution Summary JSON is broken', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith('{ "taskId": ') })
    const code = await runCli(baseArgs(), io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/not valid JSON/)
  })

  it('exits non-zero on an unknown key without guessing at intent', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson({ notes: 'should not be here' })) })
    const code = await runCli(baseArgs(), io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/unknown top-level keys: notes/)
  })
})

describe('runCli — CLI argument handling', () => {
  it('refuses to run when a required approval argument is missing', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const argsWithoutApprover = baseArgs().filter((_, index, all) => all[index - 1] !== '--approved-by' && all[index] !== '--approved-by')
    const code = await runCli(argsWithoutApprover, io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/missing required arguments: --approved-by/)
  })

  it('rejects an unknown flag rather than silently ignoring it', async () => {
    const { io, stdout } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const code = await runCli([...baseArgs(), '--typo-flag', 'x'], io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
  })

  it('fails when the requested roles have no local-only available adapter, without printing a packet', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const args = baseArgs().map((value) => (value === 'proposal,critic' ? 'implementation' : value))
    const code = await runCli(args, io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/no local available adapter for role implementation/)
  })
})

describe('runCli — --explicit-adapter (ADF-OLLAMA-LIVE-CONNECTION-001 Packet/Dispatch boundary fix)', () => {
  it('binds the Packet adapterPlan to the named adapter, not the auto-routed one', async () => {
    const { io, stdout } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const args = baseArgs().map((value) => (value === 'proposal,critic' ? 'proposal' : value))
    const code = await runCli([...args, '--explicit-adapter', 'ollama-local'], io)

    expect(code).toBe(0)
    const packet = JSON.parse(stdout.join('')) as ApprovedTaskPacket
    expect(packet.adapterPlan.selections).toEqual([
      { adapterId: 'ollama-local', role: 'proposal', rationale: expect.stringContaining('Explicit adapterId') }
    ])
    expect(packet.approval.routingPlanHash).toBe(hashJson(packet.adapterPlan))
    expect(() => validateApprovedTask(packet)).not.toThrow()
  })

  it('refuses --explicit-adapter with more than one --roles value (one adapter, one role, no auto-routing)', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const code = await runCli([...baseArgs(), '--explicit-adapter', 'ollama-local'], io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/--explicit-adapter requires exactly one --roles value/)
  })

  it('refuses an explicit adapter that is not available, without printing a packet', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const args = baseArgs().map((value) => (value === 'proposal,critic' ? 'implementation' : value))
    const code = await runCli([...args, '--explicit-adapter', 'claude-code-first-real'], io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/is not available/)
  })

  it('refuses an explicit external-send adapter (claude-external): AdapterPlan stays local-only-only', async () => {
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const args = baseArgs().map((value) => (value === 'proposal,critic' ? 'proposal' : value))
    const code = await runCli([...args, '--explicit-adapter', 'claude-external'], io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
    expect(stderr.join('')).toMatch(/outside local-only MVP boundary/)
  })
})

describe('runCli — --compare-existing is informational and never blocks', () => {
  it('reports a mismatch against an existing packet but still succeeds', async () => {
    const existing: ApprovedTaskPacket = JSON.parse(
      JSON.stringify({
        taskId,
        objective: 'a hand-written summary fixture, not a literal extract',
        scope: { inScope: ['short paraphrase'], outOfScope: [] },
        scopeHash: 'stale-hash',
        context: { githubTask: 'manual-fixture://x', obsidianContext: [], adoptedPrinciples: [] },
        contextHash: 'stale-hash',
        acceptance: ['short paraphrase'],
        stopConditions: [],
        approval: { approvalId: 'old', taskId, status: 'active', approvedBy: 'x', approvedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', scopeHash: 'stale-hash', routingPlanHash: 'stale-hash', capabilities: ['read'] },
        adapter: 'multi-ai-routing-v1',
        fixtureMode: 'success',
        target: { repository: 'fixture://x', branch: 'x', worktree: 'fixture://x', allowedFiles: [], forbiddenChanges: [] },
        adapterPlan: { version: 'v1', selections: [], externalSend: false, maxCostTier: 'free' }
      })
    )
    const { io, stdout, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) }, { [taskId]: existing })
    const code = await runCli([...baseArgs(), '--compare-existing'], io)
    expect(code).toBe(0)
    expect(stdout).toHaveLength(1)
    expect(stderr.join('')).toMatch(/≠ scopeHash/)
    expect(stderr.join('')).toMatch(/this comparison never blocks execution/)
  })

  it('reports that there is nothing to compare when no existing packet is present', async () => {
    const { io, stderr } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const code = await runCli([...baseArgs(), '--compare-existing'], io)
    expect(code).toBe(0)
    expect(stderr.join('')).toMatch(/no existing packet found/)
  })
})

describe('runCli — file writing (real filesystem, temp directories only)', () => {
  it('writes nothing under approved-tasks/ without --write', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-'))
    const tasksDir = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-docs-'))
    await writeFile(path.join(tasksDir, `${taskId}.md`), markdownWith(validExecutionSummaryJson()), 'utf8')

    const code = await runCli([...baseArgs(), '--tasks-dir', tasksDir, '--runtime-root', runtimeRoot], defaultIO)
    expect(code).toBe(0)
    await expect(readdir(path.join(runtimeRoot, 'approved-tasks'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes a validated packet to approved-tasks/<taskId>.json with --write', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-'))
    const tasksDir = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-docs-'))
    await writeFile(path.join(tasksDir, `${taskId}.md`), markdownWith(validExecutionSummaryJson()), 'utf8')

    const code = await runCli([...baseArgs(), '--tasks-dir', tasksDir, '--runtime-root', runtimeRoot, '--write'], defaultIO)
    expect(code).toBe(0)
    const written = JSON.parse(await readFile(approvedTaskPacketPath(runtimeRoot, taskId), 'utf8')) as ApprovedTaskPacket
    expect(written.taskId).toBe(taskId)
    expect(() => validateApprovedTask(written)).not.toThrow()
  })

  it('refuses to overwrite an existing packet and leaves it untouched', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-'))
    const tasksDir = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-docs-'))
    await writeFile(path.join(tasksDir, `${taskId}.md`), markdownWith(validExecutionSummaryJson()), 'utf8')

    const first = await runCli([...baseArgs(), '--tasks-dir', tasksDir, '--runtime-root', runtimeRoot, '--write'], defaultIO)
    expect(first).toBe(0)
    const originalContent = await readFile(approvedTaskPacketPath(runtimeRoot, taskId), 'utf8')

    // Change the Execution Summary so a silent overwrite would be detectable, then try again.
    await writeFile(path.join(tasksDir, `${taskId}.md`), markdownWith(validExecutionSummaryJson({ objective: 'a different objective' })), 'utf8')
    const second = await runCli([...baseArgs(), '--tasks-dir', tasksDir, '--runtime-root', runtimeRoot, '--write'], defaultIO)
    expect(second).toBe(1)

    const afterContent = await readFile(approvedTaskPacketPath(runtimeRoot, taskId), 'utf8')
    expect(afterContent).toBe(originalContent)
  })

  it('has no --force option at all', async () => {
    const { io, stdout } = memoryIO({ [taskId]: markdownWith(validExecutionSummaryJson()) })
    const code = await runCli([...baseArgs(), '--force'], io)
    expect(code).toBe(1)
    expect(stdout).toHaveLength(0)
  })
})
