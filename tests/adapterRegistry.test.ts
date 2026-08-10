import { describe, expect, it } from 'vitest'
import { routeAdapters } from '../src/main/jobLoop/adapterRegistry'
import { ResultEnvelopeRejectedError, validateResultEnvelope, type AdapterResultEnvelope } from '../src/main/jobLoop/resultEnvelope'

describe('multi-AI adapter foundation', () => {
  it('uses the lowest-cost local adapter registered for each role', () => {
    const plan = routeAdapters('ADF-CLAUDE-ADAPTER-001', ['proposal', 'critic'], ['read', 'propose'])
    expect(plan.selections.map((selection) => selection.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    expect(plan.externalSend).toBe(false)
  })

  it('does not auto-select a planned external adapter', () => {
    expect(() => routeAdapters('ADF-CLAUDE-ADAPTER-001', ['implementation'], ['read', 'propose'])).toThrow(/no local available adapter/i)
  })

  it('validates structured adapter results against the approved Job input', () => {
    const envelope: AdapterResultEnvelope = {
      resultId: 'result-fake-ai-a-1',
      jobId: 'job-1',
      taskId: 'ADF-CLAUDE-ADAPTER-001',
      adapterId: 'fake-ai-a',
      role: 'proposal',
      inputHash: 'input-hash',
      scopeHash: 'scope-hash',
      contextHash: 'context-hash',
      status: 'success',
      summary: 'Fake proposal returned',
      artifact: { artifactId: 'artifact-1' },
      verification: [{ name: 'shape', status: 'pass' }],
      risks: [],
      ownerDecisionRequired: true,
      nextOwnerDecision: 'Review proposal',
      createdAt: '2026-08-10T00:00:00.000Z',
      durationMs: 10,
      terminationReason: 'completed'
    }
    expect(() => validateResultEnvelope(envelope, { taskId: envelope.taskId, jobId: envelope.jobId, inputHash: envelope.inputHash })).not.toThrow()
    expect(() => validateResultEnvelope(envelope, { taskId: 'wrong-task', jobId: envelope.jobId, inputHash: envelope.inputHash })).toThrow(ResultEnvelopeRejectedError)
  })
})
