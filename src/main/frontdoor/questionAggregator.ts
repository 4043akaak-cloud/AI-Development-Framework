import type { ConversationThread } from '../../shared/threadTypes'
import type { FrontdoorQuestion, OrchestrationNodeRecord } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'

export function questionsFromThread(runId: string, node: OrchestrationNodeRecord, thread: ConversationThread): FrontdoorQuestion[] {
  const turn = thread.turns[thread.turns.length - 1]
  if (!turn?.questions?.length) return []
  return turn.questions.map((draft, index) => ({
    questionId: `question-${hashJson([runId, node.node.nodeId, turn.turnId, index, draft]).slice(0, 20)}`,
    runId,
    nodeId: node.node.nodeId,
    sourceResultId: turn.resultEnvelopeRef,
    kind: draft.kind,
    text: draft.text,
    required: draft.required ?? true,
    blocking: draft.blocking ?? false,
    options: draft.options ?? [],
    status: 'open' as const
  }))
}

export function openBlockingQuestions(questions: readonly FrontdoorQuestion[]): FrontdoorQuestion[] {
  return questions.filter((question) => question.status === 'open' && question.blocking)
}
