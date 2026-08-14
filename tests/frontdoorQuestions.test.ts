import { describe, expect, it } from 'vitest'
import type { ConversationThread } from '../src/shared/threadTypes'
import type { OrchestrationNodeRecord } from '../src/shared/frontdoorTypes'
import { questionsFromThread, openBlockingQuestions } from '../src/main/frontdoor/questionAggregator'

describe('Frontdoor question aggregation', () => {
  it('promotes Adapter question drafts to independent blocking questions', () => {
    const node = { node: { nodeId: 'proposal' }, state: 'completed', childTaskId: 'r::proposal', questionIds: [], attempt: 1 } as unknown as OrchestrationNodeRecord
    const thread = {
      threadId: 'thread-1',
      turns: [{ turnId: 'turn-1', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', questions: [{ kind: 'approval-required', text: '採用しますか？', blocking: true } ] }]
    } as unknown as ConversationThread
    const questions = questionsFromThread('run-1', node, thread)
    expect(questions).toHaveLength(1)
    expect(questions[0].kind).toBe('approval-required')
    expect(openBlockingQuestions(questions)).toHaveLength(1)
  })
})
