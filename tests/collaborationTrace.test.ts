import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FrontdoorRequest, OrchestrationRun } from '../src/shared/frontdoorTypes'
import { buildCollaborationTrace } from '../src/main/frontdoor/collaborationTrace'
import { hashJson } from '../src/main/jobLoop/hash'

function request(): FrontdoorRequest {
  return {
    requestId: 'collaboration-request-001',
    source: 'codex',
    objective: '協業ログのbounded引継ぎを検証する',
    userInput: 'Proposalを作成し、Criticへ必要な文脈だけを渡す',
    projectRef: 'project://adf',
    constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 2, maxDepth: 2, externalSend: false },
    requestedOutput: '検証Result',
    contextReferences: ['github://task', 'obsidian://principles'],
    scope: { inScope: ['collaboration'], outOfScope: ['external-send'] },
    state: 'ready-for-decomposition',
    receivedAt: '2026-08-25T00:00:00.000Z',
    inputHash: 'a'.repeat(64)
  }
}

describe('Project Collaboration Room projection', () => {
  it('shows directed Proposal to Critic bounded handoff without creating a second source of truth', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-collaboration-trace-'))
    const proposalRef = 'threads/thread-proposal/results/turn-proposal.json'
    const criticRef = 'threads/thread-critic/results/turn-critic.json'
    const proposal = {
      resultId: 'result-proposal', jobId: 'job-proposal', taskId: 'task-proposal', adapterId: 'fake-ai-a', role: 'proposal', inputHash: 'b'.repeat(64), scopeHash: 'c'.repeat(64), contextHash: 'd'.repeat(64), status: 'success', content: 'Proposalの必要最小限の内容', summary: 'Proposalを作成しました', artifact: {}, verification: [{ name: 'local', status: 'pass' }], risks: [], orchestrationRunId: 'run-collaboration-001', ownerDecisionRequired: true, nextOwnerDecision: 'review', createdAt: '2026-08-25T00:01:00.000Z', durationMs: 10, terminationReason: 'completed'
    }
    const critic = {
      resultId: 'result-critic', jobId: 'job-critic', taskId: 'task-critic', adapterId: 'fake-ai-b', role: 'critic', inputHash: 'e'.repeat(64), scopeHash: 'f'.repeat(64), contextHash: '0'.repeat(64), status: 'success', content: 'Proposalを確認し、追加質問はありません', summary: 'Criticレビュー完了', artifact: {}, verification: [{ name: 'local', status: 'pass' }], risks: [], dependencyResults: [{ runId: 'run-collaboration-001', nodeId: 'proposal', resultRef: proposalRef, resultHash: hashJson(proposal), status: 'success', content: proposal.content }], orchestrationRunId: 'run-collaboration-001', ownerDecisionRequired: true, nextOwnerDecision: 'accept', createdAt: '2026-08-25T00:02:00.000Z', durationMs: 10, terminationReason: 'completed'
    }
    await mkdir(path.join(runtimeRoot, 'threads/thread-proposal/results'), { recursive: true })
    await mkdir(path.join(runtimeRoot, 'threads/thread-critic/results'), { recursive: true })
    await writeFile(path.join(runtimeRoot, proposalRef), `${JSON.stringify(proposal)}\n`, 'utf8')
    await writeFile(path.join(runtimeRoot, criticRef), `${JSON.stringify(critic)}\n`, 'utf8')

    const run = {
      runId: 'run-collaboration-001', requestId: 'collaboration-request-001', requestHash: 'a'.repeat(64), planHash: '1'.repeat(64), state: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review', nodes: [
        { node: { nodeId: 'proposal', objective: 'Proposal', role: 'proposal', adapterId: 'fake-ai-a', scope: { inScope: [], outOfScope: [] }, contextReferences: [], acceptance: [], stopConditions: [], capabilities: ['read'], dependsOn: [], depth: 1 }, state: 'completed', childTaskId: 'task-proposal', childJobId: 'job-proposal', threadId: 'thread-proposal', resultStatus: 'success', resultRef: proposalRef, resultHash: hashJson(proposal), childInputHash: 'b'.repeat(64), questionIds: [], attempt: 1 },
        { node: { nodeId: 'critic', objective: 'Critic', role: 'critic', adapterId: 'fake-ai-b', scope: { inScope: [], outOfScope: [] }, contextReferences: [], acceptance: [], stopConditions: [], capabilities: ['read'], dependsOn: ['proposal'], depth: 2 }, state: 'completed', childTaskId: 'task-critic', childJobId: 'job-critic', threadId: 'thread-critic', resultStatus: 'success', resultRef: criticRef, resultHash: hashJson(critic), childInputHash: 'e'.repeat(64), questionIds: [], attempt: 1 }
      ], approvalIds: [], openQuestionIds: [], createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:02:00.000Z'
    } as OrchestrationRun

    const messages = await buildCollaborationTrace(runtimeRoot, run, request())
    expect(messages.map((item) => item.kind)).toEqual(['request', 'proposal', 'handoff', 'review'])
    expect(messages.find((item) => item.kind === 'handoff')).toMatchObject({ senderParticipantId: 'fake-ai-a', recipientParticipantIds: ['fake-ai-b'], nodeId: 'proposal', content: proposal.content })
    expect(messages.find((item) => item.kind === 'handoff')?.context.mode).toBe('bounded')
    expect(messages.find((item) => item.kind === 'handoff')?.context.estimatedTokens).toBeGreaterThan(0)
    expect(messages.every((item) => item.conversationId === 'collaboration-run-collaboration-001')).toBe(true)
  })

  it('bounds long participant content and redacts credential-shaped text', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-collaboration-bounded-'))
    const resultRef = 'threads/thread-proposal/results/turn-proposal.json'
    const result = {
      resultId: 'result-long', jobId: 'job-long', taskId: 'task-long', adapterId: 'fake-ai-a', role: 'proposal', inputHash: 'b'.repeat(64), scopeHash: 'c'.repeat(64), contextHash: 'd'.repeat(64), status: 'success', content: `api_key=secret-value ${'x'.repeat(2200)}`, summary: '長いResult', artifact: {}, verification: [], risks: [], ownerDecisionRequired: true, nextOwnerDecision: 'review', createdAt: '2026-08-25T00:01:00.000Z', durationMs: 10, terminationReason: 'completed'
    }
    await mkdir(path.join(runtimeRoot, 'threads/thread-proposal/results'), { recursive: true })
    await writeFile(path.join(runtimeRoot, resultRef), `${JSON.stringify(result)}\n`, 'utf8')
    const run = {
      runId: 'run-bounded-001', requestId: 'collaboration-request-001', requestHash: 'a'.repeat(64), planHash: '1'.repeat(64), state: 'awaiting-owner', nodes: [{ node: { nodeId: 'proposal', objective: 'Proposal', role: 'proposal', adapterId: 'fake-ai-a', scope: { inScope: [], outOfScope: [] }, contextReferences: [], acceptance: [], stopConditions: [], capabilities: ['read'], dependsOn: [], depth: 1 }, state: 'completed', childTaskId: 'task-long', childJobId: 'job-long', threadId: 'thread-proposal', resultStatus: 'success', resultRef, resultHash: hashJson(result), childInputHash: 'b'.repeat(64), questionIds: [], attempt: 1 }], approvalIds: [], openQuestionIds: [], createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:01:00.000Z'
    } as OrchestrationRun

    const resultMessage = (await buildCollaborationTrace(runtimeRoot, run, request())).find((item) => item.kind === 'proposal')
    expect(resultMessage).toBeDefined()
    expect(resultMessage!.content.length).toBeLessThanOrEqual(1600)
    expect(resultMessage!.content).toContain('api_key=<redacted>')
    expect(resultMessage!.context.estimatedTokens).toBe(Math.ceil(resultMessage!.content.length / 4))
  })
})
