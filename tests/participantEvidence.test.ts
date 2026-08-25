import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FrontdoorMcpServer } from '../src/cli/frontdoorMcpServer'
import { writeJsonAtomic, writeJsonExclusive } from '../src/main/jobLoop/ledger'
import { hashJson } from '../src/main/jobLoop/hash'
import { participantAssignmentId } from '../src/main/frontdoor/participantRegistry'
import { listParticipantEvidence } from '../src/main/frontdoor/participantEvidence'
import { nodeTargetHash } from '../src/main/frontdoor/ownerGates'
import { replayRunFromEvents, readRun, readRunEvents, writeRun } from '../src/main/frontdoor/ledger'
import { appendFrontdoorEvent } from '../src/main/frontdoor/eventLedger'

function input(requestId: string) {
  const scope = { inScope: ['participant-evidence-test'], outOfScope: ['external-send', 'write-canonical'] }
  return {
    request: {
      requestId,
      source: 'participant' as const,
      sourceParticipantId: 'cursor',
      sourceParticipantRole: 'specialist' as const,
      objective: '参加者Evidenceの取り込みを検証する',
      userInput: '専門参加者の提出ResultをEvidence候補として読む',
      projectRef: 'fixture://participant-evidence',
      constraints: { allowedCapabilities: ['read', 'propose'] as const, maxNodes: 1, maxDepth: 1, externalSend: false as const },
      requestedOutput: 'Evidence candidate',
      contextReferences: ['fixture://participant-evidence'],
      scope
    },
    plan: {
      planId: `${requestId}-plan`,
      requestId,
      version: 1,
      nodes: [{
        nodeId: 'specialist', objective: 'Evidence候補を返す', role: 'proposal' as const, adapterId: 'fake-ai-a', scope,
        contextReferences: ['fixture://participant-evidence'], acceptance: ['Evidence'], stopConditions: ['scope外'],
        capabilities: ['read', 'propose'] as const, dependsOn: [], depth: 1,
        participantAssignment: { participantId: 'cursor', role: 'specialist' as const, capabilities: ['read', 'propose'] as const }
      }],
      aggregationPolicy: 'collect-all' as const
    }
  }
}

async function createEvidenceFixture() {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-participant-evidence-'))
  const server = new FrontdoorMcpServer({ runtimeRoot })
  const prepared = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'adf_frontdoor_prepare', arguments: input('participant-evidence-001') } })
  const runId = JSON.parse((prepared?.result as { content: Array<{ text: string }> }).content[0].text).runId as string
  const run = await readRun(runtimeRoot, runId)
  const record = run.nodes[0]
  const targetHash = nodeTargetHash(run, record)
  await appendFrontdoorEvent(runtimeRoot, runId, 'frontdoor.approval-bound', { approvalIds: [], targetHash: hashJson('dispatch'), nodeIds: [record.node.nodeId], packetHashes: { [record.node.nodeId]: 'a'.repeat(64) } })
  await writeRun(runtimeRoot, await replayRunFromEvents(runtimeRoot, runId))
  const assignmentId = participantAssignmentId(runId, record.node)
  const submission = {
    submissionId: `submission-${hashJson(['cursor', assignmentId, targetHash]).slice(0, 24)}`,
    assignmentId, participantId: 'cursor', participantRole: 'specialist' as const, runId, requestId: run.requestId, nodeId: record.node.nodeId,
    requestHash: run.requestHash, planHash: run.planHash, targetHash, assignmentHash: hashJson(record.node.participantAssignment), status: 'submitted' as const,
    summary: '検証済みEvidence候補', content: '専門参加者からのbounded content', verification: [{ name: 'local-check', status: 'pass' as const }], risks: [], createdAt: '2026-08-23T00:00:00.000Z'
  }
  await writeJsonExclusive(path.join(runtimeRoot, 'participant-submissions', 'cursor', `${assignmentId}.json`), submission)
  return { runtimeRoot, runId, submission }
}

describe('Participant Evidence projection', () => {
  it('projects a hash-bound dispatched submission as awaiting-owner-review', async () => {
    const fixture = await createEvidenceFixture()
    const evidence = await listParticipantEvidence(fixture.runtimeRoot, fixture.runId)
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ status: 'awaiting-owner-review', runId: fixture.runId, nodeId: 'specialist', participantId: 'cursor', participantRole: 'specialist', ownerPacketDispatchApproved: true, summary: fixture.submission.summary })
    expect(evidence[0].evidenceHash).toBe(hashJson(fixture.submission))
  })

  it('fails closed when a submission target hash is tampered', async () => {
    const fixture = await createEvidenceFixture()
    await writeJsonAtomic(path.join(fixture.runtimeRoot, 'participant-submissions', 'cursor', `${fixture.submission.assignmentId}.json`), { ...fixture.submission, targetHash: 'b'.repeat(64) })
    await expect(listParticipantEvidence(fixture.runtimeRoot, fixture.runId)).rejects.toThrow(/binding mismatch/)
  })

  it('does not expose evidence from another Run when a Run filter is supplied', async () => {
    const fixture = await createEvidenceFixture()
    expect(await listParticipantEvidence(fixture.runtimeRoot, 'run-not-this-one')).toEqual([])
  })
})
