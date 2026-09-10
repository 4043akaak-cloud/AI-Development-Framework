import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { readPlan, readRequest, readProjectedRun } from '../src/main/frontdoor/ledger'
import { ChildPacketDerivationError, childPacketTaskId, deriveChildPackets, type ChildPacketApproval } from '../src/main/frontdoor/childPacket'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const requestInput: FrontdoorRequestInput = {
  requestId: 'child-packet-request-001',
  source: 'test',
  objective: 'Plan から子Packetを導出する',
  userInput: 'Ownerが手でJSONを書かずにDispatchできること',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 2, maxDepth: 2, externalSend: false },
  requestedOutput: '導出されたPacket',
  contextReferences: ['fixture://goal.md', 'fixture://design.md'],
  scope: { inScope: ['proposal', 'critic'], outOfScope: ['external-send', 'write-canonical', 'commit'] }
}

const proposal: DecompositionNode = {
  nodeId: 'proposal',
  objective: '案を出す',
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] },
  contextReferences: ['fixture://goal.md', 'fixture://design.md'],
  acceptance: ['Resultを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

const critic: DecompositionNode = { ...proposal, nodeId: 'critic', role: 'critic', adapterId: 'fake-ai-b', objective: '案を点検する', dependsOn: ['proposal'], depth: 2 }

const approval: ChildPacketApproval = {
  approvalId: 'approval-child-packet-001',
  approvedBy: 'Project Owner',
  approvedAt: '2026-09-09T00:00:00.000Z',
  expiresAt: '2099-12-31T00:00:00.000Z'
}

async function createFixture(nodes: DecompositionNode[] = [proposal, critic]) {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-child-packet-'))
  roots.push(runtimeRoot)
  const orchestrator = new FrontdoorOrchestrator({ relay: new ConversationRelay({ runtimeRoot }) })
  const run = await orchestrator.createRun(requestInput, { planId: 'child-packet-plan-001', requestId: requestInput.requestId, version: 1, nodes, aggregationPolicy: 'collect-all' })
  return { runtimeRoot, orchestrator, run }
}

async function deriveFor(runtimeRoot: string, runId: string, override: Partial<ChildPacketApproval> = {}) {
  const run = await readProjectedRun(runtimeRoot, runId)
  return deriveChildPackets(await readRequest(runtimeRoot, runId), run, await readPlan(runtimeRoot, runId), { ...approval, ...override })
}

describe('deriveChildPackets', () => {
  it('derives a Packet the real dispatch path accepts, end to end', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture()
    const packets = await deriveFor(runtimeRoot, run.runId)

    // The contract that matters is not this function's own opinion of the Packet — it is whether
    // the Owner Gate and the orchestrator accept it. So the derived Packets are driven through the
    // real approval and dispatch, with no hand editing anywhere.
    await orchestrator.approveIntake(run.runId)
    await orchestrator.approveCompletionShape(run.runId)
    await orchestrator.approveDecomposition(run.runId)
    await writePackets(runtimeRoot, packets)
    await orchestrator.approveDispatch(run.runId, ['proposal', 'critic'])
    const executed = await orchestrator.executeApprovedRun(run.runId, packets, { requirePacketBinding: true })

    expect(executed.status).not.toBe('blocked-by-question')
    const finished = await orchestrator.getRun(run.runId)
    expect(finished.nodes.map((record) => record.state)).toEqual(['completed', 'completed'])
  })

  it('binds every Packet to the Run, the Request and its own Node', async () => {
    const { runtimeRoot, run } = await createFixture()
    const packets = await deriveFor(runtimeRoot, run.runId)

    expect(Object.keys(packets).sort()).toEqual(['critic', 'proposal'])
    expect(packets.proposal.taskId).toBe(childPacketTaskId(requestInput.requestId, 'proposal'))
    expect(packets.proposal.frontdoorBinding).toEqual({ runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: 'proposal' })
    expect(packets.critic.frontdoorBinding?.nodeId).toBe('critic')
    // One selection, matching the Node — a Packet naming a different adapter would route the
    // Owner's approval to an AI they did not approve.
    expect(packets.critic.adapterPlan.selections).toEqual([expect.objectContaining({ adapterId: 'fake-ai-b', role: 'critic' })])
  })

  it('grants exactly the Node capabilities, never the Request-wide set', async () => {
    const readOnly: DecompositionNode = { ...proposal, nodeId: 'read-only', capabilities: ['read'] }
    const { runtimeRoot, run } = await createFixture([readOnly])
    const packets = await deriveFor(runtimeRoot, run.runId)
    expect(packets['read-only'].approval.capabilities).toEqual(['read'])
  })

  it('writes a Packet that carries no file-write authority', async () => {
    const { runtimeRoot, run } = await createFixture()
    const packets = await deriveFor(runtimeRoot, run.runId)
    expect(packets.proposal.target.allowedFiles).toEqual([])
    // The Request's own out-of-scope list is stated in the Packet, not only ADF's fixed boundary.
    expect(packets.proposal.target.forbiddenChanges).toEqual(expect.arrayContaining(['external-send', 'write-canonical', 'commit', 'push', 'merge']))
  })

  it('refuses an approval window that has no duration', async () => {
    const { runtimeRoot, run } = await createFixture()
    await expect(deriveFor(runtimeRoot, run.runId, { expiresAt: approval.approvedAt })).rejects.toBeInstanceOf(ChildPacketDerivationError)
  })

  it('refuses to derive anything when one Node is underivable', async () => {
    const unavailable: DecompositionNode = { ...critic, adapterId: 'claude-code-cli' }
    const { runtimeRoot, run } = await createFixture([proposal, unavailable])
    // All-or-nothing: a half-derived Node set would leave the Owner approving a Dispatch that
    // cannot complete, which is the failure this whole path exists to remove.
    await expect(deriveFor(runtimeRoot, run.runId)).rejects.toThrow(ChildPacketDerivationError)
  })

  it('refuses a Node whose context references exceed the parent Request', async () => {
    // The Decomposition Gate already rejects such a Plan, so this cannot be reached through
    // createRun. The check is kept as defence in depth and tested directly: derivation must not
    // become the one path that widens a Node's context beyond what the Owner approved.
    const { runtimeRoot, run } = await createFixture([proposal])
    const request = await readRequest(runtimeRoot, run.runId)
    const plan = await readPlan(runtimeRoot, run.runId)
    const widened = { ...plan, nodes: [{ ...plan.nodes[0], contextReferences: ['fixture://goal.md', 'fixture://elsewhere.md'] }] }
    expect(() => deriveChildPackets(request, run, widened, approval)).toThrow(/exceed the parent Request/)
  })
})

async function writePackets(runtimeRoot: string, packets: Record<string, import('../src/shared/jobLoopTypes').ApprovedTaskPacket>): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  await Promise.all(Object.values(packets).map((packet) => writeFile(path.join(runtimeRoot, 'approved-tasks', `${packet.taskId}.json`), `${JSON.stringify(packet, null, 2)}\n`, 'utf8')))
}

describe('derived Packets on disk', () => {
  it('are the exact bytes the Dispatch Decision binds', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture()
    const packets = await deriveFor(runtimeRoot, run.runId)
    await orchestrator.approveIntake(run.runId)
    await orchestrator.approveCompletionShape(run.runId)
    await orchestrator.approveDecomposition(run.runId)
    await writePackets(runtimeRoot, packets)
    await orchestrator.approveDispatch(run.runId, ['proposal', 'critic'])

    // Re-reading from disk and tampering must invalidate the Owner's Dispatch Decision: the point
    // of deriving Packets is to remove transcription, not to remove the binding.
    const packetPath = path.join(runtimeRoot, 'approved-tasks', `${packets.proposal.taskId}.json`)
    const stored = JSON.parse(await readFile(packetPath, 'utf8')) as typeof packets.proposal
    expect(stored).toEqual(packets.proposal)
    await writePackets(runtimeRoot, { ...packets, proposal: { ...packets.proposal, objective: 'tampered after approval' } })
    await expect(orchestrator.executeApprovedRun(run.runId, await deriveTampered(runtimeRoot), { requirePacketBinding: true })).rejects.toThrow()
  })
})

async function deriveTampered(runtimeRoot: string): Promise<Record<string, import('../src/shared/jobLoopTypes').ApprovedTaskPacket>> {
  const { readdir } = await import('node:fs/promises')
  const directory = path.join(runtimeRoot, 'approved-tasks')
  const packets: Record<string, import('../src/shared/jobLoopTypes').ApprovedTaskPacket> = {}
  for (const entry of await readdir(directory)) {
    const packet = JSON.parse(await readFile(path.join(directory, entry), 'utf8')) as import('../src/shared/jobLoopTypes').ApprovedTaskPacket
    packets[packet.frontdoorBinding!.nodeId] = packet
  }
  return packets
}
