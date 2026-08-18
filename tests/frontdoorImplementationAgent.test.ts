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
import { validateImplementationCandidate } from '../src/main/frontdoor/candidateArtifact'

const parentScope = { inScope: ['candidate/README.md'], outOfScope: ['canonical-write', 'external-send', 'commit', 'push', 'merge'] }
const parentRequest: FrontdoorRequestInput = {
  requestId: 'implementation-parent-001',
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
    approval: { approvalId: 'approval-implementation-parent-001', taskId, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-15T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash: hashJson(parentNode.scope), routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: 'fake-ai-a',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf', branch: 'fixture', worktree: 'runtime-only', allowedFiles: parentScope.inScope, forbiddenChanges: parentScope.outOfScope },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: parentNode.nodeId }
  }
}

async function createParent(): Promise<{ runtimeRoot: string; orchestrator: FrontdoorOrchestrator; run: Awaited<ReturnType<FrontdoorOrchestrator['createRun']>> }> {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-implementation-agent-'))
  const relay = new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter(), new FakeImplementationConversationAdapter()] })
  const orchestrator = new FrontdoorOrchestrator({ relay })
  const run = await orchestrator.createRun(parentRequest, { planId: 'implementation-parent-plan-001', requestId: parentRequest.requestId, version: 1, nodes: [parentNode], aggregationPolicy: 'collect-all' })
  await orchestrator.approveIntake(run.runId)
  await orchestrator.approveCompletionShape(run.runId)
  await orchestrator.approveDecomposition(run.runId)
  await writeFile(path.join(runtimeRoot, 'approved-tasks', `${parentRequest.requestId}::proposal.json`), `${JSON.stringify(parentPacket(run))}\n`, 'utf8').catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const { mkdir } = await import('node:fs/promises')
    await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
    await writeFile(path.join(runtimeRoot, 'approved-tasks', `${parentRequest.requestId}::proposal.json`), `${JSON.stringify(parentPacket(run))}\n`, 'utf8')
  })
  await orchestrator.approveDispatch(run.runId, ['proposal'])
  await orchestrator.executeApprovedRun(run.runId, { proposal: parentPacket(run) })
  await orchestrator.reviewResult(run.runId, 'Project Owner', 'accept')
  return { runtimeRoot, orchestrator, run }
}

async function approveChild(orchestrator: FrontdoorOrchestrator, runId: string): Promise<ApprovedTaskPacket> {
  await orchestrator.approveIntake(runId)
  await orchestrator.approveCompletionShape(runId)
  await orchestrator.approveDecomposition(runId)
  const packet = await buildImplementationPacket(orchestrator, runId, 'Project Owner')
  await orchestrator.approveDispatch(runId, ['implementation'])
  return packet
}

describe('ADF-WORKPLANE-IMPLEMENTATION-AGENT-001', () => {
  it('creates one parent-bound child Run and stops after candidate Result', async () => {
    const { orchestrator, run } = await createParent()
    const prepared = await prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })
    expect(prepared.run.runKind).toBe('implementation')
    expect(prepared.binding.parentRunId).toBe(run.runId)
    const packet = await approveChild(orchestrator, prepared.run.runId)
    const result = await orchestrator.executeApprovedRun(prepared.run.runId, { implementation: packet })
    expect(result.status).toBe('complete')
    const child = await orchestrator.inspectRun(prepared.run.runId)
    expect(child.run.ownerGate).toBe('awaiting-owner:result-review')
    const resultRef = child.run.nodes[0].resultRef
    if (!resultRef) throw new Error('candidate Result reference missing')
    const envelope = JSON.parse(await readFile(path.join(orchestrator.runtimeRoot, resultRef), 'utf8')) as { artifact: { kind: string; candidateHash: string } }
    expect(envelope.artifact).toMatchObject({ kind: 'candidate-file-set' })
    expect(envelope.artifact.candidateHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects candidate export after the persisted candidate hash is tampered', async () => {
    const { orchestrator, run } = await createParent()
    const prepared = await prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })
    const packet = await approveChild(orchestrator, prepared.run.runId)
    await orchestrator.executeApprovedRun(prepared.run.runId, { implementation: packet })
    await orchestrator.reviewResult(prepared.run.runId, 'Project Owner', 'accept')
    const child = await orchestrator.inspectRun(prepared.run.runId)
    const resultRef = child.run.nodes[0].resultRef
    if (!resultRef) throw new Error('candidate Result reference missing')
    const resultPath = path.join(orchestrator.runtimeRoot, resultRef)
    const envelope = JSON.parse(await readFile(resultPath, 'utf8')) as { artifact: { candidateHash: string } }
    await writeFile(resultPath, `${JSON.stringify({ ...envelope, artifact: { ...envelope.artifact, candidateHash: '0'.repeat(64) } })}\n`, 'utf8')
    await expect(orchestrator.exportWorkPlaneArtifact(prepared.run.runId, 'Project Owner')).rejects.toThrow(/Result hash mismatch/)
  })

  it('rejects an invalid candidate before accepting the child Result Review', async () => {
    const { orchestrator, run } = await createParent()
    const prepared = await prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })
    const packet = await approveChild(orchestrator, prepared.run.runId)
    await orchestrator.executeApprovedRun(prepared.run.runId, { implementation: packet })
    const child = await orchestrator.inspectRun(prepared.run.runId)
    const resultRef = child.run.nodes[0].resultRef
    if (!resultRef) throw new Error('candidate Result reference missing')
    const resultPath = path.join(orchestrator.runtimeRoot, resultRef)
    const envelope = JSON.parse(await readFile(resultPath, 'utf8')) as { artifact: { candidateHash: string } }
    await writeFile(resultPath, `${JSON.stringify({ ...envelope, artifact: { ...envelope.artifact, candidateHash: '0'.repeat(64) } })}\n`, 'utf8')
    await expect(orchestrator.reviewResult(prepared.run.runId, 'Project Owner', 'accept')).rejects.toThrow(/candidate hash mismatch/)
  })

  it('rechecks the parent source artifacts before child dispatch', async () => {
    const { orchestrator, run } = await createParent()
    const prepared = await prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })
    await orchestrator.approveIntake(prepared.run.runId)
    await orchestrator.approveCompletionShape(prepared.run.runId)
    await orchestrator.approveDecomposition(prepared.run.runId)
    const parent = await orchestrator.inspectRun(run.runId)
    const resultRef = parent.run.nodes[0].resultRef
    if (!resultRef) throw new Error('parent Result reference missing')
    const resultPath = path.join(orchestrator.runtimeRoot, resultRef)
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>
    await writeFile(resultPath, `${JSON.stringify({ ...result, summary: 'tampered after child preparation' })}\n`, 'utf8')
    await expect(buildImplementationPacket(orchestrator, prepared.run.runId, 'Project Owner')).rejects.toThrow(/source Result binding changed/)
  })

  it('exports a validated candidate only after the child Result Review', async () => {
    const { orchestrator, run } = await createParent()
    const prepared = await prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })
    const packet = await approveChild(orchestrator, prepared.run.runId)
    await orchestrator.executeApprovedRun(prepared.run.runId, { implementation: packet })
    await expect(orchestrator.exportWorkPlaneArtifact(prepared.run.runId, 'Project Owner')).rejects.toThrow(/accepted Result Review/)
    await orchestrator.reviewResult(prepared.run.runId, 'Project Owner', 'accept')
    const manifest = await orchestrator.exportWorkPlaneArtifact(prepared.run.runId, 'Project Owner')
    expect(manifest.candidateKind).toBe('candidate-file-set')
    expect(manifest.parentRunId).toBe(run.runId)
    expect(manifest.candidateFiles).toEqual([{ relativePath: 'candidate/README.md', contentHash: expect.any(String) }])
  })

  it('rejects a source file outside the parent Scope', async () => {
    const { orchestrator, run } = await createParent()
    await expect(prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['src/not-approved.ts'] })).rejects.toThrow(/exceeds the parent Scope/)
  })

  it('rejects a source Evidence file that no longer points to the parent Result', async () => {
    const { orchestrator, run } = await createParent()
    const parent = await orchestrator.inspectRun(run.runId)
    const threadId = parent.run.nodes[0].threadId
    if (!threadId) throw new Error('parent Thread reference missing')
    await writeFile(path.join(orchestrator.runtimeRoot, `threads/${threadId}/evidence-links.json`), `${JSON.stringify({ threadId, taskId: parent.run.nodes[0].childTaskId, jobId: parent.run.nodes[0].childJobId, turns: [] })}\n`, 'utf8')
    await expect(prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })).rejects.toThrow(/source Evidence binding mismatch/)
  })

  it('rejects a parent Result after a later follow-up decision', async () => {
    const { orchestrator, run } = await createParent()
    await orchestrator.reviewResult(run.runId, 'Project Owner', 'follow-up')
    await expect(prepareImplementationRun(orchestrator, { parentRunId: run.runId, sourceNodeId: 'proposal', allowedFiles: ['candidate/README.md'] })).rejects.toThrow(/latest accepted parent Result Review/)
  })

  it('rejects candidate hash, duplicate path, and secret sentinel violations', () => {
    const valid = { kind: 'candidate-file-set' as const, baseSnapshotHash: 'base', files: [{ relativePath: 'candidate/README.md', content: 'safe', contentHash: hashJson('safe') }] }
    const candidate = { ...valid, candidateHash: hashJson(valid) }
    expect(validateImplementationCandidate(candidate, ['candidate/README.md'])).toEqual(candidate)
    expect(() => validateImplementationCandidate({ ...candidate, candidateHash: '0'.repeat(64) }, ['candidate/README.md'])).toThrow(/hash mismatch/)
    expect(() => validateImplementationCandidate({ ...candidate, files: [...candidate.files, ...candidate.files], candidateHash: hashJson({ ...valid, files: [...valid.files, ...valid.files] }) }, ['candidate/README.md'])).toThrow(/duplicate path/)
    const secret = { ...candidate, files: [{ relativePath: 'candidate/README.md', content: 'ANTHROPIC_API_KEY=secret', contentHash: hashJson('ANTHROPIC_API_KEY=secret') }], candidateHash: hashJson({ ...valid, files: [{ relativePath: 'candidate/README.md', content: 'ANTHROPIC_API_KEY=secret', contentHash: hashJson('ANTHROPIC_API_KEY=secret') }] }) }
    expect(() => validateImplementationCandidate(secret, ['candidate/README.md'])).toThrow(/secret sentinel/)
  })
})
