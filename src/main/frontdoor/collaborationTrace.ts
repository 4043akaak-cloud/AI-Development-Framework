import type { AdapterResultEnvelope } from '../jobLoop/resultEnvelope'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import { safeRuntimePath } from './pathIntegrity'
import type { CollaborationMessage, CollaborationMessageKind, CollaborationMessageStatus, FrontdoorRequest, OrchestrationRun } from '../../shared/frontdoorTypes'

const maxContentChars = 1600
const maxSummaryChars = 240

function bounded(value: unknown, limit: number): string {
  if (typeof value !== 'string') return ''
  return value.slice(0, limit).replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=<redacted>')
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

function participantId(node: OrchestrationRun['nodes'][number]['node']): string {
  return node.participantAssignment?.participantId ?? node.adapterId
}

function message(input: Omit<CollaborationMessage, 'messageId' | 'context'> & { referenceCount?: number }): CollaborationMessage {
  const content = bounded(input.content, maxContentChars)
  const body = { ...input, content, context: { mode: 'bounded' as const, chars: content.length, estimatedTokens: estimateTokens(content), referenceCount: input.referenceCount ?? 0 } }
  return { ...body, messageId: `collab-${hashJson(body).slice(0, 20)}` }
}

function resultKind(role: string): CollaborationMessageKind {
  if (role === 'proposal') return 'proposal'
  if (role === 'critic' || role === 'review') return 'review'
  return 'result'
}

function resultStatus(status: AdapterResultEnvelope['status']): CollaborationMessageStatus {
  if (status === 'failed' || status === 'invalid' || status === 'timeout' || status === 'cancelled') return 'blocked'
  if (status === 'partial') return 'waiting'
  return 'completed'
}

export async function buildCollaborationTrace(runtimeRoot: string, run: OrchestrationRun, request: FrontdoorRequest): Promise<CollaborationMessage[]> {
  const conversationId = `collaboration-${run.runId}`
  const recipients = run.nodes.map((record) => participantId(record.node)).sort()
  const messages: CollaborationMessage[] = [message({
    projectRef: request.projectRef,
    conversationId,
    runId: run.runId,
    senderParticipantId: 'frontdoor-ai',
    senderRole: 'frontdoor',
    recipientParticipantIds: recipients,
    kind: 'request',
    status: 'posted',
    summary: bounded(request.objective, maxSummaryChars),
    content: request.userInput,
    referenceCount: request.contextReferences.length,
    createdAt: request.receivedAt
  })]

  const resultMessages = await Promise.all(run.nodes
    .filter((record) => record.resultRef && record.resultHash)
    .map(async (record) => {
      const result = await readJson<AdapterResultEnvelope>(await safeRuntimePath(runtimeRoot, record.resultRef!))
      const currentParticipant = participantId(record.node)
      const dependencies = result.dependencyResults ?? []
      const handoffs = dependencies.map((dependency) => message({
        projectRef: request.projectRef,
        conversationId,
        runId: run.runId,
        senderParticipantId: run.nodes.find((candidate) => candidate.node.nodeId === dependency.nodeId)?.node ? participantId(run.nodes.find((candidate) => candidate.node.nodeId === dependency.nodeId)!.node) : dependency.nodeId,
        senderRole: run.nodes.find((candidate) => candidate.node.nodeId === dependency.nodeId)?.node.role ?? 'participant',
        recipientParticipantIds: [currentParticipant],
        kind: 'handoff',
        status: 'posted',
        summary: `${dependency.nodeId}のbounded Resultを${record.node.nodeId}へ引き渡し`,
        content: dependency.content ?? '',
        nodeId: dependency.nodeId,
        parentMessageId: undefined,
        executionThreadId: record.threadId,
        resultRef: dependency.resultRef,
        resultHash: dependency.resultHash,
        referenceCount: 1,
        createdAt: new Date(Date.parse(result.createdAt) - 1).toISOString()
      }))
      const current = message({
        projectRef: request.projectRef,
        conversationId,
        runId: run.runId,
        senderParticipantId: currentParticipant,
        senderRole: record.node.role,
        recipientParticipantIds: ['frontdoor-ai'],
        kind: resultKind(record.node.role),
        status: resultStatus(result.status),
        summary: bounded(result.summary, maxSummaryChars),
        content: result.content ?? result.summary,
        nodeId: record.node.nodeId,
        executionThreadId: record.threadId,
        resultRef: record.resultRef,
        resultHash: record.resultHash,
        referenceCount: dependencies.length + request.contextReferences.length,
        createdAt: result.createdAt
      })
      return [...handoffs, current]
    }))

  return [...messages, ...resultMessages.flat()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.messageId.localeCompare(right.messageId))
}
