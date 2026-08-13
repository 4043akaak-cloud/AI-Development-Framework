import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultIO, runCli } from '../src/cli/buildApprovedTaskPacket'

/**
 * Runs the real, compiled-from-the-same-source CLI logic (via `defaultIO`, real filesystem)
 * against the actual Task documents in `docs/tasks/`, read-only, after Execution Summary blocks
 * were appended to them. This is the regression that "existing Task docs can pass the CLI" claims.
 * Writes only ever land in a temp runtimeRoot — `docs/tasks/` and the real app's `approved-tasks/`
 * are never touched.
 */
const repoRoot = path.join(__dirname, '..')
const tasksDir = path.join(repoRoot, 'docs', 'tasks')

const cases: Array<{ taskId: string; roles: string }> = [
  { taskId: 'ADF-EXTERNAL-ADAPTER-001', roles: 'proposal,critic' },
  { taskId: 'ADF-RELAY-RECOVERY-001', roles: 'proposal,critic' },
  { taskId: 'ADF-CONVERSATION-RELAY-001', roles: 'proposal,critic' }
]

describe('runCli against the real Task documents in docs/tasks/', () => {
  it.each(cases)('extracts, builds, and validates a Packet for $taskId', async ({ taskId, roles }) => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-packet-cli-realdocs-'))
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    const io = {
      ...defaultIO,
      stdout: (text: string) => stdoutChunks.push(text),
      stderr: (text: string) => stderrChunks.push(text)
    }

    const code = await runCli(
      [
        '--task', taskId,
        '--roles', roles,
        '--approval-id', `approval-realdocs-${taskId}`,
        '--approved-by', 'Project Owner',
        '--approved-at', '2026-08-11T00:00:00.000Z',
        '--expires-at', '2099-12-31T23:59:59.000Z',
        '--capabilities', 'read,propose',
        '--tasks-dir', tasksDir,
        '--runtime-root', runtimeRoot
      ],
      io
    )

    expect(stderrChunks.join(''), 'CLI stderr').toBe('')
    expect(code, 'CLI exit code').toBe(0)
    const packet = JSON.parse(stdoutChunks.join(''))
    expect(packet.taskId).toBe(taskId)
    expect(packet.scope.inScope.length).toBeGreaterThan(0)
    expect(packet.context.githubTask).toBe(`docs/tasks/${taskId}.md`)
  })
})
