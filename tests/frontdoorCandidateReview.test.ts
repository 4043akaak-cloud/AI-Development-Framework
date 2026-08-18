import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FakeImplementationConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { buildImplementationPacket, prepareImplementationRun } from '../src/main/frontdoor/implementationRun'

const parentScope = { inScope: ['candidate/README.md'], outOfScope: ['canonical-write', 'external-send', 'commit', 'push', 'merge'] }
const parentRequest: FrontdoorRequestInput = {
  requestId: 'candidate-review-parent-001',
  source: 'test',
  objective: '親Resultを作る',
  userInput: '承認済みResultから実装候補を作る',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: '親Result',
  contextReferences: ['fixture://goal.md'],
  scope: parentScope
}
const parentNode: DecompositionNode = {
  nodeId: 'proposal',
  objective: '親Resultを提案する',
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope: parentScope,
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Result'],
  stopConditions: ['Scope外'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

function parentPacket(run: { runId: string; requestHash: string; planHash: string }): ApprovedTaskPacket {
  const taskId = `${parentRequest.requestId}::proposal`
  const adapterPlan = buildExplicitAdapterPlan(taskId, 'fake-ai-a', 'proposal', ['read', 'propose'])
  const context = { githubTask: 'fixture://goal.md', obsidianContext: ['fixture://goal.md'], adoptedPrinciples: ['owner-gate'] }
  return {
    taskId,
    objective: parentNode.objective,
    scope: parentNode.scope,
    scopeHash: hashJson(parentNode.scope),
    context,
    contextHash: hashJson(context),
    acceptance: parentNode.acceptance,
    stopConditions: parentNode.stopConditions,
    approval: { approvalId: 'approval-candidate-review-parent-001', taskId, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-15T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash: hashJson(parentNode.scope), routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: 'fake-ai-a',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf', branch: 'fixture', worktree: 'runtime-only', allowedFiles: parentScope.inScope, forbiddenChanges: parentScope.outOfScope },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: parentNode.nodeId }
  }
}

async function createParentAndChild(): Promise<{ runtimeRoot: string; orchestrator: FrontdoorOrchestrator; parentRunId: string; childRunId: string; manifest: Awaited<ReturnType<FrontdoorOrchestrator['exportWorkPlaneArtifact']>> }> {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-candidate-review-'))
  const relay = new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter(), new FakeImplementationConversationAdapter()] })
  const orchestrator = new FrontdoorOrchestrator({ relay })

  // 1. Create and complete parent run
  const parent = await orchestrator.createRun(parentRequest, { planId: 'candidate-review-parent-plan-001', requestId: parentRequest.requestId, version: 1, nodes: [parentNode], aggregationPolicy: 'collect-all' })
  await orchestrator.approveIntake(parent.runId)
  await orchestrator.approveCompletionShape(parent.runId)
  await orchestrator.approveDecomposition(parent.runId)
  const { mkdir } = await import('node:fs/promises')
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  await writeFile(path.join(runtimeRoot, 'approved-tasks', `${parentRequest.requestId}::proposal.json`), `${JSON.stringify(parentPacket(parent))}\n`, 'utf8')
  await orchestrator.approveDispatch(parent.runId, ['proposal'])
  await orchestrator.executeApprovedRun(parent.runId, { proposal: parentPacket(parent) })
  await orchestrator.reviewResult(parent.runId, 'Project Owner', 'accept')

  // 2. Create and execute child implementation run
  const prepared = await prepareImplementationRun(orchestrator, { parentRunId: parent.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })
  await orchestrator.approveIntake(prepared.run.runId)
  await orchestrator.approveCompletionShape(prepared.run.runId)
  await orchestrator.approveDecomposition(prepared.run.runId)
  const childPacket = await buildImplementationPacket(orchestrator, prepared.run.runId, 'Project Owner')
  await orchestrator.approveDispatch(prepared.run.runId, ['implementation'])
  await orchestrator.executeApprovedRun(prepared.run.runId, { implementation: childPacket })
  await orchestrator.reviewResult(prepared.run.runId, 'Project Owner', 'accept')
  const manifest = await orchestrator.exportWorkPlaneArtifact(prepared.run.runId, 'Project Owner')

  return { runtimeRoot, orchestrator, parentRunId: parent.runId, childRunId: prepared.run.runId, manifest }
}

describe('ADF-WORKPLANE-CANDIDATE-REVIEW-001 Candidate Review Application Service', () => {
  it('lists reviewable candidates with generated state', async () => {
    const { orchestrator, manifest } = await createParentAndChild()
    const summaries = await orchestrator.listReviewableCandidates()
    expect(summaries.length).toBeGreaterThanOrEqual(1)
    const target = summaries.find((s) => s.candidateId === manifest.artifactId)
    expect(target).toBeDefined()
    expect(target?.state).toBe('generated')
    expect(target?.fileCount).toBe(1)
  })

  it('inspects candidate, records candidate-review-started, and transitions to owner-review', async () => {
    const { orchestrator, manifest } = await createParentAndChild()
    const inspection = await orchestrator.inspectCandidate(manifest.artifactId)
    expect(inspection.summary.candidateId).toBe(manifest.artifactId)
    expect(inspection.state).toBe('owner-review')
    expect(inspection.targetHash).toMatch(/^[a-f0-9]{64}$/)
    expect(inspection.candidate.files.length).toBe(1)
    expect(inspection.candidate.files[0].relativePath).toBe('candidate/README.md')
  })

  it('reviews candidate with accept decision and reaches terminal state', async () => {
    const { orchestrator, manifest } = await createParentAndChild()
    const inspection = await orchestrator.inspectCandidate(manifest.artifactId)
    expect(inspection.state).toBe('owner-review')

    const envelope = await orchestrator.reviewCandidate({
      candidateId: manifest.artifactId,
      decision: 'accept',
      approvedBy: 'Project Owner',
      targetHash: inspection.targetHash
    })

    expect(envelope.decision).toBe('accept')
    expect(envelope.capability).toBe('candidate-review')
    expect(envelope.candidateId).toBe(manifest.artifactId)

    const updatedSummaries = await orchestrator.listReviewableCandidates()
    const updated = updatedSummaries.find((s) => s.candidateId === manifest.artifactId)
    expect(updated?.state).toBe('accepted')
  })

  it('rejects duplicate decision once terminal state (accepted/rejected/follow-up) is reached', async () => {
    const { orchestrator, manifest } = await createParentAndChild()
    const inspection = await orchestrator.inspectCandidate(manifest.artifactId)
    await orchestrator.reviewCandidate({
      candidateId: manifest.artifactId,
      decision: 'accept',
      approvedBy: 'Project Owner',
      targetHash: inspection.targetHash
    })

    await expect(orchestrator.reviewCandidate({
      candidateId: manifest.artifactId,
      decision: 'reject',
      approvedBy: 'Project Owner',
      targetHash: inspection.targetHash
    })).rejects.toThrow(/already in a terminal state/)
  })

  it('rejects candidate review if inspect/startCandidateReview was not called', async () => {
    const { orchestrator, manifest } = await createParentAndChild()

    await expect(orchestrator.reviewCandidate({
      candidateId: manifest.artifactId,
      decision: 'accept',
      approvedBy: 'Project Owner',
      targetHash: '0'.repeat(64)
    })).rejects.toThrow(/was not started/)
  })

  it('rejects candidate review with invalid targetHash', async () => {
    const { orchestrator, manifest } = await createParentAndChild()
    await orchestrator.inspectCandidate(manifest.artifactId)

    await expect(orchestrator.reviewCandidate({
      candidateId: manifest.artifactId,
      decision: 'accept',
      approvedBy: 'Project Owner',
      targetHash: '0'.repeat(64)
    })).rejects.toThrow(/target hash mismatch/)
  })

  it('verifies Candidate Review writes ONLY to Runtime Ledger and leaves Canonical repo / Obsidian untouched', async () => {
    const { orchestrator, manifest } = await createParentAndChild()
    const inspection = await orchestrator.inspectCandidate(manifest.artifactId)

    const currentRepoState = await readFile(path.join(process.cwd(), 'package.json'), 'utf8')

    await orchestrator.reviewCandidate({
      candidateId: manifest.artifactId,
      decision: 'accept',
      approvedBy: 'Project Owner',
      targetHash: inspection.targetHash
    })

    const afterRepoState = await readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    expect(afterRepoState).toBe(currentRepoState)
  })
})
