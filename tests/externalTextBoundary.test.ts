import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { AggregateResult, DecompositionNode, FrontdoorLedgerEvent, FrontdoorRequestInput, OrchestrationRun } from '../src/shared/frontdoorTypes'
import type { RelayTurnPayload } from '../src/shared/threadTypes'
import type { ParticipantSubmission } from '../src/shared/participantTypes'
import { ParticipantMcpServer } from '../src/cli/participantMcpServer'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { readJson, writeJsonAtomic } from '../src/main/jobLoop/ledger'
import { hashJson } from '../src/main/jobLoop/hash'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { participantAssignmentId } from '../src/main/frontdoor/participantRegistry'
import { listParticipantEvidence } from '../src/main/frontdoor/participantEvidence'
import { buildDecisionEnvelope, nodeTargetHash, resultReviewTargetHash } from '../src/main/frontdoor/ownerGates'
import { recordRunEvent, writeRun } from '../src/main/frontdoor/ledger'
import { rebuildFrontdoorEventChain } from './support/frontdoorLedgerSurgery'
import { CredentialShapedTextError, assertNoCredentialShapedText } from '../src/shared/secretSentinel'
import { ResultEnvelopeRejectedError, type AdapterResultEnvelope } from '../src/main/jobLoop/resultEnvelope'
import { validateImplementationCandidate } from '../src/main/frontdoor/candidateArtifact'

// Synthetic sentinel only. No real Provider, credential, or user Runtime is used.
const CREDENTIAL = 'sk-abcdefghijklmnop'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function runtimeDirectory() {
  const root = await mkdtemp(path.join(tmpdir(), 'adf-text-boundary-'))
  roots.push(root)
  return root
}

// Snapshot every persisted file, including events, so a rejection cannot silently write elsewhere.
async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else files[path.relative(root, file)] = await readFile(file, 'utf8')
    }
  }
  await walk(root)
  return files
}

/**
 * Deliberately bypasses the production write path to recreate an Envelope saved before the
 * Result guard existed. This is fixture surgery only; the entrance coverage below still calls
 * the real Owner Gate methods. Every persisted binding is rewritten so the test proves that
 * matching hashes and a valid Frontdoor Ledger chain do not make stale text adoptable/exportable.
 */
async function rewritePersistedEnvelope(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  transform: (envelope: AdapterResultEnvelope) => AdapterResultEnvelope
) {
  const { runtimeRoot, run } = fixture
  const runPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json')
  const persistedRun = await readJson<OrchestrationRun>(runPath)
  const record = persistedRun.nodes[0]
  if (!record.resultRef || !record.threadId || !record.resultHash || !record.evidenceHash || !record.childInputHash) throw new Error('fixture Result bindings are incomplete')

  const resultPath = path.join(runtimeRoot, record.resultRef)
  const result = transform(await readJson<AdapterResultEnvelope>(resultPath))
  const resultHash = hashJson(result)
  await writeJsonAtomic(resultPath, result)

  const threadPath = path.join(runtimeRoot, 'threads', record.threadId, 'thread.json')
  const thread = await readJson<{ turns: Array<Record<string, unknown>> }>(threadPath)
  const updatedTurns = thread.turns.map((turn) => turn.resultEnvelopeRef === record.resultRef ? { ...turn, resultEnvelopeHash: resultHash } : turn)
  const updatedTurn = updatedTurns.find((turn) => turn.resultEnvelopeRef === record.resultRef)
  if (!updatedTurn) throw new Error('fixture Thread turn binding is missing')
  const updatedThread = { ...thread, turns: updatedTurns }
  await writeJsonAtomic(threadPath, updatedThread)

  const evidencePath = path.join(runtimeRoot, 'threads', record.threadId, 'evidence-links.json')
  const evidence = await readJson<{ turns: Array<Record<string, unknown>> }>(evidencePath)
  const updatedEvidence = { ...evidence, turns: evidence.turns.map((turn) => turn.resultEnvelopeRef === record.resultRef ? { ...turn, resultEnvelopeHash: resultHash } : turn) }
  const evidenceHash = hashJson(updatedEvidence)
  await writeJsonAtomic(evidencePath, updatedEvidence)

  const updatedRecord = { ...record, resultHash, evidenceHash }
  const updatedRun = { ...persistedRun, nodes: [updatedRecord] }
  await writeRun(runtimeRoot, updatedRun)

  const aggregatePath = path.join(runtimeRoot, persistedRun.aggregateResultRef!)
  const aggregate = await readJson<AggregateResult>(aggregatePath)
  const updatedAggregate = { ...aggregate, childResults: aggregate.childResults.map((child) => child.nodeId === record.node.nodeId ? { ...child, resultHash } : child) }
  await writeJsonAtomic(aggregatePath, updatedAggregate)

  const frontdoorEventsPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'events.jsonl')
  const frontdoorEvents = (await readFile(frontdoorEventsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as FrontdoorLedgerEvent)
  const reboundEvents = frontdoorEvents.map((event) => {
    if (event.type === 'frontdoor.node-completed' && Array.isArray(event.payload.nodeRecords)) {
      return {
        ...event,
        payload: {
          ...event.payload,
          nodeRecords: event.payload.nodeRecords.map((candidate) => {
            if (!candidate || typeof candidate !== 'object' || !('node' in candidate) || typeof candidate.node !== 'object' || !candidate.node || !('nodeId' in candidate.node) || candidate.node.nodeId !== record.node.nodeId) return candidate
            return { ...candidate, resultHash, evidenceHash }
          })
        }
      }
    }
    if (event.type === 'frontdoor.completion-proposed') return { ...event, payload: { ...event.payload, aggregateHash: hashJson(updatedAggregate) } }
    return event
  })
  await writeFile(frontdoorEventsPath, `${rebuildFrontdoorEventChain(reboundEvents).map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')

  const threadEventsPath = path.join(runtimeRoot, 'threads', record.threadId, 'thread-events.jsonl')
  const threadEvents = (await readFile(threadEventsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
  const reboundThreadEvents = threadEvents.map((event) => event.type === 'relay.received' && event.turnId === updatedTurn.turnId
    ? { ...event, turnHash: hashJson(updatedTurn), resultHash }
    : event)
  await writeFile(threadEventsPath, `${reboundThreadEvents.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')

  return { ...fixture, run: updatedRun, result, resultHash, aggregate: updatedAggregate }
}

/**
 * The export gate requires an accepted Result Review before its own Result read loop runs. Seed
 * that prerequisite directly only for the legacy-envelope fixture; this is another explicit test
 * setup bypass, not the review entrance under test. The actual export method must still reject.
 */
async function seedAcceptedResultReview(fixture: Awaited<ReturnType<typeof rewritePersistedEnvelope>>): Promise<void> {
  const { runtimeRoot, run, aggregate } = fixture
  const targetHash = resultReviewTargetHash(run.runId, run.aggregateResultRef!, aggregate)
  const decision = buildDecisionEnvelope(run, 'result-review', 'accept', targetHash, 'Project Owner', '2026-09-09T00:00:00.000Z', { expiresAt: '2099-12-31T23:59:59.000Z' })
  await recordRunEvent(runtimeRoot, run.runId, 'frontdoor.owner-decision-recorded', { decision })
  await recordRunEvent(runtimeRoot, run.runId, 'frontdoor.result-reviewed', { decision, aggregateRef: run.aggregateResultRef, aggregateHash: hashJson(aggregate) })
  await writeRun(runtimeRoot, { ...run, ownerGate: 'awaiting-owner:completion' })
}

const requestInput: FrontdoorRequestInput = {
  requestId: 'owner-gate-request-001',
  source: 'test',
  objective: 'Owner Gateを検証する',
  userInput: '承認前DispatchとResult採用を拒否する',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: '検証結果',
  contextReferences: ['fixture://goal.md'],
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] }
}

const proposal: DecompositionNode = {
  nodeId: 'proposal',
  objective: 'Owner Gateを検証する',
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] },
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Resultを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

function packet(run: Pick<OrchestrationRun, 'runId' | 'requestHash' | 'planHash'>): ApprovedTaskPacket {
  const adapterPlan = buildExplicitAdapterPlan(`${requestInput.requestId}::proposal`, 'fake-ai-a', 'proposal', ['read', 'propose'])
  const context = { githubTask: 'fixture://goal.md', obsidianContext: ['fixture://goal.md'], adoptedPrinciples: ['owner-approval'] }
  return {
    taskId: `${requestInput.requestId}::proposal`,
    objective: proposal.objective,
    scope: proposal.scope,
    scopeHash: hashJson(proposal.scope),
    context,
    contextHash: hashJson(context),
    acceptance: proposal.acceptance,
    stopConditions: proposal.stopConditions,
    approval: { approvalId: 'approval-owner-gate-001', taskId: `${requestInput.requestId}::proposal`, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash: hashJson(proposal.scope), routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf', branch: 'fixture/frontdoor', worktree: 'fixture://frontdoor', allowedFiles: ['docs/tasks/fixture.md'], forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push'] },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: proposal.nodeId }
  }
}


async function createFixture(participant = false) {
  const runtimeRoot = await runtimeDirectory()
  const relay = new ConversationRelay({ runtimeRoot })
  const orchestrator = new FrontdoorOrchestrator({ relay })
  const node: DecompositionNode = { ...proposal, ...(participant ? { participantAssignment: { participantId: 'cursor', role: 'specialist' as const, capabilities: ['read', 'propose'] as const } } : {}) }
  const run = await orchestrator.createRun(requestInput, { planId: 'boundary-plan', requestId: requestInput.requestId, version: 1, nodes: [node], aggregationPolicy: 'collect-all' })
  await orchestrator.approveIntake(run.runId)
  await orchestrator.approveCompletionShape(run.runId)
  await orchestrator.approveDecomposition(run.runId)
  const childPacket = packet(run)
  await writeJsonAtomic(path.join(runtimeRoot, 'approved-tasks', `${childPacket.taskId}.json`), childPacket)
  await orchestrator.approveDispatch(run.runId, [node.nodeId], 'Project Owner')
  // The participant submit tool requires a Packet-bound Dispatch, and `frontdoor.approval-bound` is
  // recorded by the dispatch itself rather than by approving it. Going through executeApprovedRun
  // is also the point: these tests are supposed to travel the real path, not assemble its result.
  await orchestrator.executeApprovedRun(run.runId, { [node.nodeId]: childPacket })
  return { runtimeRoot, relay, orchestrator, run, childPacket, node }
}

const ordinary: RelayTurnPayload = { status: 'success', summary: 'ordinary summary', content: 'ordinary answer', verification: [{ name: 'scope-check', status: 'pass' }], risks: [] }
const participantFields: Array<[string, Partial<ParticipantSubmission>]> = [
  ['summary', { summary: CREDENTIAL }], ['content', { content: CREDENTIAL }],
  ['risks', { risks: [CREDENTIAL] }],
  ['verification.name', { verification: [{ name: CREDENTIAL, status: 'pass' }] }],
  ['verification.reason', { verification: [{ name: 'scope-check', status: 'pass', reason: CREDENTIAL }] }]
]

async function participantFixture() {
  const fixture = await createFixture(true)
  const { runtimeRoot, run, node } = fixture
  const assignmentId = participantAssignmentId(run.runId, node)
  const targetHash = nodeTargetHash(run, { node })
  const submission: ParticipantSubmission = {
    submissionId: `submission-${hashJson(['cursor', assignmentId, targetHash]).slice(0, 24)}`,
    assignmentId, participantId: 'cursor', participantRole: 'specialist', runId: run.runId,
    requestId: run.requestId, nodeId: node.nodeId, requestHash: run.requestHash, planHash: run.planHash,
    targetHash, assignmentHash: hashJson(node.participantAssignment), status: 'submitted',
    summary: 'ordinary summary', content: 'ordinary answer', verification: [{ name: 'scope-check', status: 'pass' }], risks: [], createdAt: '2026-09-09T00:00:00.000Z'
  }
  const server = new ParticipantMcpServer({ runtimeRoot, participantId: 'cursor', participantRole: 'specialist' })
  const submit = (override: Partial<ParticipantSubmission> = {}) => server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'adf_participant_submit_result', arguments: {
      assignmentId, requestHash: submission.requestHash, planHash: submission.planHash, targetHash, assignmentHash: submission.assignmentHash,
      summary: submission.summary, content: submission.content, verification: submission.verification, risks: submission.risks, ...override
    }
  } })
  return { ...fixture, submission, submit, submissionPath: path.join(runtimeRoot, 'participant-submissions', 'cursor', `${assignmentId}.json`) }
}

describe('external text boundaries — real entry points', () => {
  describe('Adapter answer → receiveFromAdapter → Result Envelope', () => {
    it('stores an ordinary Adapter answer as a Turn and Envelope', async () => {
      const runtimeRoot = await runtimeDirectory()
      const relay = new ConversationRelay({ runtimeRoot })
      const thread = await relay.startThread(packet({ runId: 'fixture-run', requestHash: 'a', planHash: 'b' }))
      const handle = await relay.sendToAdapter(thread.threadId, 'fake-ai-a')
      const received = await relay.receiveFromAdapter(handle)
      expect(received.turns).toHaveLength(1)
      expect(await readJson(path.join(runtimeRoot, received.turns[0].resultEnvelopeRef!))).toMatchObject({ status: 'success' })
    })

    it.each([
      ...participantFields,
      ['terminationReason', { terminationReason: CREDENTIAL }],
      ['artifact', { artifact: { note: CREDENTIAL } }],
      ['questions', { questions: [{ text: CREDENTIAL }] }]
    ] as Array<[string, Partial<RelayTurnPayload>]>)('rejects Adapter %s before Result, Turn, Evidence or events are saved', async (_field, override) => {
      const runtimeRoot = await runtimeDirectory()
      class AnswerAdapter extends FakeProposalConversationAdapter {
        override async receive() { return { ...ordinary, ...override } }
      }
      const relay = new ConversationRelay({ runtimeRoot, adapters: [new AnswerAdapter()] })
      const thread = await relay.startThread(packet({ runId: 'fixture-run', requestHash: 'a', planHash: 'b' }))
      const handle = await relay.sendToAdapter(thread.threadId, 'fake-ai-a')
      const before = await snapshot(runtimeRoot)
      await expect(relay.receiveFromAdapter(handle)).rejects.toThrow(ResultEnvelopeRejectedError)
      expect(await snapshot(runtimeRoot)).toEqual(before)
      expect(JSON.stringify(await snapshot(runtimeRoot))).not.toContain(CREDENTIAL)
      expect((await relay.getConversationState(thread.threadId)).turns).toEqual([])
      await expect(readdir(path.join(relay.threadDirectory(thread.threadId), 'results'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  describe('Participant MCP generation → adf_participant_submit_result', () => {
    it('writes a valid dispatched submission', async () => {
      const f = await participantFixture()
      const response = await f.submit()
      expect(response?.result).not.toHaveProperty('isError', true)
      expect(await readJson(f.submissionPath)).toMatchObject({ content: f.submission.content })
    })
    it.each(participantFields)('rejects %s without creating a submission or appending events', async (_field, override) => {
      const f = await participantFixture()
      const before = await snapshot(f.runtimeRoot)
      const response = await f.submit(override)
      expect(response?.result).toMatchObject({ isError: true })
      expect(JSON.stringify(response)).toContain('credential-shaped')
      expect(JSON.stringify(response)).not.toContain(CREDENTIAL)
      await expect(readFile(f.submissionPath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await snapshot(f.runtimeRoot)).toEqual(before)
    })
  })

  describe('Participant adoption → listParticipantEvidence', () => {
    it('returns an ordinary submission as bound Owner-review Evidence', async () => {
      const f = await participantFixture()
      await writeJsonAtomic(f.submissionPath, f.submission)
      const before = await snapshot(f.runtimeRoot)
      expect(await listParticipantEvidence(f.runtimeRoot, f.run.runId)).toMatchObject([{ content: f.submission.content, status: 'awaiting-owner-review' }])
      expect(await snapshot(f.runtimeRoot)).toEqual(before)
    })
    it.each(participantFields)('refuses legacy %s without returning Evidence or copying it to events', async (_field, override) => {
      const f = await participantFixture()
      // Deliberately bypass creation: a pre-guard file is the input to the adoption boundary.
      await writeJsonAtomic(f.submissionPath, { ...f.submission, ...override })
      const before = await snapshot(f.runtimeRoot)
      await expect(listParticipantEvidence(f.runtimeRoot, f.run.runId)).rejects.toThrow(CredentialShapedTextError)
      expect(await snapshot(f.runtimeRoot)).toEqual(before)
      const otherFiles = { ...before }
      delete otherFiles[path.relative(f.runtimeRoot, f.submissionPath)]
      expect(JSON.stringify(otherFiles)).not.toContain(CREDENTIAL)
    })
  })

  describe('Recovery → scanForRecovery → safeErrorText → recordRecoveryFailure', () => {
    it('masks the Adapter probe exception while preserving Recovery events and error Evidence', async () => {
      const runtimeRoot = await runtimeDirectory()
      class ProbeErrorAdapter extends FakeProposalConversationAdapter {
        override async getState(): Promise<never> { throw new Error(`probe failed: ${CREDENTIAL}`) }
      }
      const relay = new ConversationRelay({ runtimeRoot, adapters: [new ProbeErrorAdapter()] })
      const thread = await relay.startThread(packet({ runId: 'fixture-run', requestHash: 'a', planHash: 'b' }))
      await relay.sendToAdapter(thread.threadId, 'fake-ai-a')
      expect(await relay.scanForRecovery()).toHaveLength(1)
      const recovery = await relay.getConversationState(thread.threadId)
      expect(recovery.state).toBe('recovery-needed')
      expect(recovery.recovery?.probeError).toBe('probe failed: <redacted>')
      const recovered = await relay.recordRecoveryFailure(thread.threadId)
      expect(recovered.state).toBe('awaiting-owner')
      expect(recovered.turns[0].status).toBe('failed')
      expect(await readJson(path.join(runtimeRoot, recovered.turns[0].errorRef!))).toMatchObject({ probeError: 'probe failed: <redacted>' })
      const files = await snapshot(runtimeRoot)
      expect(files[`threads/${thread.threadId}/thread-events.jsonl`]).toContain('recovery.detected')
      expect(files[`threads/${thread.threadId}/thread-events.jsonl`]).toContain('probe failed: <redacted>')
      expect(files[`threads/${thread.threadId}/thread-events.jsonl`]).toContain('recovery.failed-recorded')
      expect(JSON.stringify(files)).not.toContain(CREDENTIAL)
    })
  })

  describe('Frontdoor Result review/export → Result Envelope', () => {
    it('rejects a pre-guard Result during reviewResult without adding an Owner Decision or artifact', async () => {
      const fixture = await rewritePersistedEnvelope(await createFixture(), (envelope) => ({ ...envelope, risks: [CREDENTIAL] }))
      const before = await snapshot(fixture.runtimeRoot)

      await expect(fixture.orchestrator.reviewResult(fixture.run.runId, 'Project Owner', 'accept')).rejects.toBeInstanceOf(ResultEnvelopeRejectedError)

      expect(await snapshot(fixture.runtimeRoot)).toEqual(before)
      await expect(readdir(path.join(fixture.runtimeRoot, 'frontdoor-runs', fixture.run.runId, 'work-plane'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('rejects a pre-guard Result during exportWorkPlaneArtifact without creating an artifact', async () => {
      const fixture = await rewritePersistedEnvelope(await createFixture(), (envelope) => ({ ...envelope, risks: [CREDENTIAL] }))
      await seedAcceptedResultReview(fixture)
      const before = await snapshot(fixture.runtimeRoot)

      await expect(fixture.orchestrator.exportWorkPlaneArtifact(fixture.run.runId, 'Project Owner')).rejects.toBeInstanceOf(ResultEnvelopeRejectedError)

      expect(await snapshot(fixture.runtimeRoot)).toEqual(before)
      await expect(readdir(path.join(fixture.runtimeRoot, 'frontdoor-runs', fixture.run.runId, 'work-plane'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('exports an accepted Result through the real path and masks an unscanned verification property', async () => {
      const fixture = await rewritePersistedEnvelope(await createFixture(), (envelope) => ({
        ...envelope,
        // This extra property is intentionally outside validateResultEnvelope's name/reason scan.
        verification: envelope.verification.map((entry, index) => index === 0 ? { ...entry, unscannedMetadata: CREDENTIAL } : entry),
        risks: ['safe fixture risk']
      }))

      await fixture.orchestrator.reviewResult(fixture.run.runId, 'Project Owner', 'accept')
      const manifest = await fixture.orchestrator.exportWorkPlaneArtifact(fixture.run.runId, 'Project Owner')
      const stored = await readJson<{ content: { nodes: Array<{ result: { verification: Array<Record<string, unknown>>; risks: string[] } }> } }>(path.join(fixture.runtimeRoot, manifest.relativePath))
      const exportedVerification = stored.content.nodes[0].result.verification[0]

      expect(exportedVerification).toMatchObject({ name: 'scope-boundary', status: 'pass', unscannedMetadata: '<redacted>' })
      // validateResultEnvelope scans every risk entry, so credential-shaped risks cannot reach this
      // normal export branch. maskRisks is therefore only observed here copying a safe risk; this
      // reachability limit is recorded as a fact, not changed by this test.
      expect(stored.content.nodes[0].result.risks).toEqual(['safe fixture risk'])
      expect(JSON.stringify(stored)).not.toContain(CREDENTIAL)
    })
  })
})

describe('supporting guard unit contracts (not entrance coverage)', () => {
  describe('Work Plane candidate (candidateArtifact.ts)', () => {
    it('rejects a credential in candidate file content', () => {
      const files = [{ relativePath: 'a.txt', content: CREDENTIAL, contentHash: hashJson(CREDENTIAL) }]
      const candidate = { kind: 'candidate-file-set', baseSnapshotHash: 'base', files, candidateHash: '' }
      expect(() => validateImplementationCandidate(candidate, ['a.txt'])).toThrow(/secret sentinel/)
    })
  })

  describe('shared guard contract', () => {
    it('reports field and pattern names but never the matched value', () => {
      try {
        assertNoCredentialShapedText('source', { field: 'api_key: hunter2' })
        expect.unreachable('should have thrown')
      } catch (error) {
        const rejection = error as CredentialShapedTextError
        expect(rejection).toBeInstanceOf(CredentialShapedTextError)
        // Overlapping patterns both report; the contract is the shape of each entry, not its count.
        expect(rejection.fields).toContain('field (api-key-assignment)')
        expect(rejection.fields.every((entry) => /^field \([a-z-]+\)$/.test(entry))).toBe(true)
        expect(rejection.message).not.toContain('hunter2')
      }
    })

    it('treats a non-string as a caller bug rather than skipping it silently', () => {
      // The gap this closes: a value that is not a string used to fall out of the scan unnoticed.
      expect(() => assertNoCredentialShapedText('source', { field: { nested: CREDENTIAL } })).toThrow(CredentialShapedTextError)
    })

    it('ignores absent optional fields', () => {
      expect(() => assertNoCredentialShapedText('source', { a: undefined, b: null })).not.toThrow()
    })
  })
})
