import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { runFrontdoorCli, type FrontdoorCliIO } from '../src/cli/frontdoorOwnerLoop'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const scope = { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit', 'push'] }
const request: FrontdoorRequestInput = {
  requestId: 'owner-loop-closure-001',
  source: 'test',
  objective: 'Ownerが手作業のPacketなしで一周する',
  userInput: 'Plan承認からDispatchまでADFの中で完結すること',
  projectRef: 'fixture://adf-closure',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: 'Result',
  contextReferences: ['fixture://goal.md'],
  scope
}
const node: DecompositionNode = {
  nodeId: 'proposal',
  objective: request.objective,
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope,
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Result EnvelopeとEvidenceを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

function io(): { adapter: FrontdoorCliIO; stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    adapter: {
      readJsonFile: async (filePath) => JSON.parse(await readFile(filePath, 'utf8')) as unknown,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text)
    }
  }
}

async function run(args: string[]): Promise<{ code: number; json: Record<string, unknown>; stderr: string }> {
  const capture = io()
  const code = await runFrontdoorCli([...args, '--json'], capture.adapter)
  return { code, json: capture.stdout.length ? (JSON.parse(capture.stdout[0]) as Record<string, unknown>) : {}, stderr: capture.stderr.join('') }
}

async function preparedRun() {
  const root = await mkdtemp(path.join(tmpdir(), 'adf-closure-'))
  roots.push(root)
  const runtimeRoot = path.join(root, 'runtime')
  const inputPath = path.join(root, 'input.json')
  await writeFile(inputPath, `${JSON.stringify({ request, plan: { planId: 'owner-loop-closure-plan-001', requestId: request.requestId, version: 1, nodes: [node], aggregationPolicy: 'collect-all' } })}\n`, 'utf8')
  const prepared = await run(['prepare', '--runtime-root', runtimeRoot, '--input', inputPath])
  expect(prepared.code).toBe(0)
  return { root, runtimeRoot, runId: prepared.json.runId as string }
}

async function approveThrough(runtimeRoot: string, runId: string): Promise<void> {
  for (const [gate, decision] of [['intake', 'proceed'], ['completion-shape', 'approve'], ['decomposition', 'approve-selected']] as const) {
    const result = await run(['approve', '--runtime-root', runtimeRoot, '--run-id', runId, '--gate', gate, '--decision', decision, '--approved-by', 'Project Owner'])
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  }
}

describe('the Owner loop closes without leaving ADF', () => {
  it('derives the child Packet, approves the Dispatch bound to it, and executes', async () => {
    const { runtimeRoot, runId } = await preparedRun()
    await approveThrough(runtimeRoot, runId)

    // Before this command existed the Owner had to leave here, hand-author approved-tasks/*.json
    // with four computed hashes, and come back. Nothing below writes a Packet by hand.
    const derived = await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-001', '--approved-by', 'Project Owner'])
    expect(derived.stderr).toBe('')
    expect(derived.code).toBe(0)
    const packets = derived.json.packets as Array<{ nodeId: string; taskId: string; packetHash: string; path: string }>
    expect(packets).toHaveLength(1)
    expect(packets[0]).toMatchObject({ nodeId: 'proposal', taskId: `${request.requestId}::proposal`, path: `approved-tasks/${request.requestId}::proposal.json` })

    const dispatchApproval = await run(['approve', '--runtime-root', runtimeRoot, '--run-id', runId, '--gate', 'dispatch', '--decision', 'dispatch', '--nodes', 'proposal', '--approved-by', 'Project Owner'])
    expect(dispatchApproval.code).toBe(0)
    const dispatched = await run(['dispatch', '--runtime-root', runtimeRoot, '--run-id', runId])
    expect(dispatched.stderr).toBe('')
    expect(dispatched.code).toBe(0)

    const inspected = await run(['inspect', '--runtime-root', runtimeRoot, '--run-id', runId])
    expect((inspected.json.run as { nodes: Array<{ state: string }> }).nodes[0].state).toBe('completed')
  })

  it('re-derives a Packet whose approval window has lapsed', async () => {
    const { runtimeRoot, runId } = await preparedRun()
    await approveThrough(runtimeRoot, runId)
    expect((await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-001', '--approved-by', 'Project Owner', '--valid-for-hours', '1'])).code).toBe(0)

    // An approval that lapses before the Owner acts must not become a state with no way out: the
    // Packet cannot be dispatched, so protecting it from replacement would protect nothing. This is
    // the Cycle 1 expiry failure, and it is not being repeated here.
    const packetPath = path.join(runtimeRoot, 'approved-tasks', `${request.requestId}::proposal.json`)
    const lapsed = JSON.parse(await readFile(packetPath, 'utf8'))
    lapsed.approval.expiresAt = '2020-01-01T00:00:00.000Z'
    await writeFile(packetPath, `${JSON.stringify(lapsed, null, 2)}\n`, 'utf8')

    const again = await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-002', '--approved-by', 'Project Owner'])
    expect(again.stderr).toBe('')
    expect(again.code).toBe(0)
    await run(['approve', '--runtime-root', runtimeRoot, '--run-id', runId, '--gate', 'dispatch', '--decision', 'dispatch', '--nodes', 'proposal', '--approved-by', 'Project Owner'])
    expect((await run(['dispatch', '--runtime-root', runtimeRoot, '--run-id', runId])).code).toBe(0)
  })

  it('refuses to replace a Packet that is still usable', async () => {
    const { runtimeRoot, runId } = await preparedRun()
    await approveThrough(runtimeRoot, runId)
    expect((await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-001', '--approved-by', 'Project Owner'])).code).toBe(0)

    // A second derivation would mint a new approval window and new bytes. If a Dispatch Decision
    // already binds the first Packet, replacing it silently moves the ground under that approval.
    const second = await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-002', '--approved-by', 'Project Owner'])
    expect(second.code).toBe(1)
    expect(second.stderr).toContain('usable child Packet already exists and was not replaced')
  })

  it('refuses to derive outside the Dispatch Gate', async () => {
    const { runtimeRoot, runId } = await preparedRun()
    const early = await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-001', '--approved-by', 'Project Owner'])
    expect(early.code).toBe(1)
    expect(early.stderr).toContain('requires the current Dispatch Gate')
  })

  it('rejects an approval window outside the permitted range', async () => {
    const { runtimeRoot, runId } = await preparedRun()
    await approveThrough(runtimeRoot, runId)
    const tooLong = await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-001', '--approved-by', 'Project Owner', '--valid-for-hours', '10000'])
    expect(tooLong.code).toBe(1)
    expect(tooLong.stderr).toContain('validForHours must be between 1 and 336')
  })
})

describe('an independent review is recorded against the Run', () => {
  async function executedRun() {
    const { root, runtimeRoot, runId } = await preparedRun()
    await approveThrough(runtimeRoot, runId)
    await run(['derive-packets', '--runtime-root', runtimeRoot, '--run-id', runId, '--approval-id', 'approval-closure-001', '--approved-by', 'Project Owner'])
    await run(['approve', '--runtime-root', runtimeRoot, '--run-id', runId, '--gate', 'dispatch', '--decision', 'dispatch', '--nodes', 'proposal', '--approved-by', 'Project Owner'])
    await run(['dispatch', '--runtime-root', runtimeRoot, '--run-id', runId])
    return { root, runtimeRoot, runId }
  }

  function reviewDocument(overrides: Record<string, unknown> = {}) {
    return {
      reviewId: 'review-closure-001',
      packet: { packetId: 'review-packet-001', targetTaskId: 'ADF-EXAMPLE-001', revisionRange: 'abc..def', files: ['src/example.ts'], claims: ['the guard is wired'], questions: [], createdAt: '2026-09-09T00:00:00.000Z' },
      reviewer: 'Codex',
      implementer: 'Claude Code',
      completion: 'complete',
      findings: [{ findingId: 'F1', severity: 'P2', summary: 'naming', evidence: 'src/example.ts:10', reproduction: 'reproduced', disposition: 'accepted' }],
      ...overrides
    }
  }

  it('reports the Run as uncleared until a review covering it is recorded', async () => {
    const { root, runtimeRoot, runId } = await executedRun()

    const before = await run(['inspect-reviews', '--runtime-root', runtimeRoot, '--run-id', runId])
    expect(before.json.cleared).toBe(false)
    expect((before.json.blockers as string[]).join()).toContain('no independent review has been recorded')

    const reviewPath = path.join(root, 'review.json')
    await writeFile(reviewPath, `${JSON.stringify(reviewDocument())}\n`, 'utf8')
    const recorded = await run(['record-review', '--runtime-root', runtimeRoot, '--run-id', runId, '--review-file', reviewPath, '--approved-by', 'Project Owner'])
    expect(recorded.stderr).toBe('')
    expect(recorded.code).toBe(0)

    const after = await run(['inspect-reviews', '--runtime-root', runtimeRoot, '--run-id', runId])
    expect(after.json.cleared).toBe(true)
  })

  it('exits non-zero for a review that does not clear the Run, and still records it', async () => {
    const { root, runtimeRoot, runId } = await executedRun()
    const reviewPath = path.join(root, 'self-review.json')
    // The failure the review model was built from: the implementer reviewing their own work.
    await writeFile(reviewPath, `${JSON.stringify(reviewDocument({ reviewer: 'Claude Code' }))}\n`, 'utf8')

    const recorded = await run(['record-review', '--runtime-root', runtimeRoot, '--run-id', runId, '--review-file', reviewPath, '--approved-by', 'Project Owner'])
    // Non-zero so a script cannot treat "a review happened" as "the review passed" — but recorded
    // all the same, because losing the evidence is how review became prose in a Task header.
    expect(recorded.code).toBe(1)
    const after = await run(['inspect-reviews', '--runtime-root', runtimeRoot, '--run-id', runId])
    expect(after.json.cleared).toBe(false)
    expect((after.json.reviews as unknown[])).toHaveLength(1)
  })
})
