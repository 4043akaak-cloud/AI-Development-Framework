import { describe, expect, it } from 'vitest'
import type { AggregateResult, DecompositionPlan, FrontdoorRequest, OwnerDecisionEnvelope, OrchestrationRun } from '../src/shared/frontdoorTypes'
import { assessGoalAlignment } from '../src/main/frontdoor/goalAlignment'

const request = { requestId: 'goal-monitor-request', source: 'test', objective: 'Goal monitor fixture', userInput: 'fixture', projectRef: 'fixture://project', constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 2, maxDepth: 2, externalSend: false }, requestedOutput: 'next instruction', contextReferences: ['fixture://goal'], scope: { inScope: ['next-request'], outOfScope: ['external-send'] }, state: 'ready-for-decomposition', receivedAt: '2026-08-21T00:00:00.000Z', inputHash: 'request-hash' } as FrontdoorRequest
const plan = { planId: 'goal-monitor-plan', requestId: request.requestId, version: 1, nodes: [], aggregationPolicy: 'collect-all', planHash: 'plan-hash' } as DecompositionPlan

function run(ownerGate: OrchestrationRun['ownerGate'] = 'awaiting-owner:intake', state: OrchestrationRun['state'] = 'ready-for-approval'): OrchestrationRun {
  return { runId: 'goal-monitor-run', requestId: request.requestId, requestHash: request.inputHash, planHash: plan.planHash, state, nodes: [], approvalIds: [], openQuestionIds: [], createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z', ownerGate }
}

function decision(gate: OwnerDecisionEnvelope['gate'], value: OwnerDecisionEnvelope['decision']): OwnerDecisionEnvelope {
  return { decisionId: `${gate}-${value}`, runId: run().runId, requestId: request.requestId, gate, decision: value, targetHash: `${gate}-hash`, approvedBy: 'Project Owner', decidedAt: '2026-08-21T00:00:00.000Z' }
}

describe('Goal Alignment Monitor', () => {
  it('reports a fresh Run as awaiting Intake without drift', () => {
    const report = assessGoalAlignment({ run: run(), request, plan, decisions: [], evidenceRefs: [] })
    expect(report.status).toBe('awaiting-owner')
    expect(report.currentStep).toBe('intake')
    expect(report.signals).toEqual([])
  })

  it('detects a stale Owner Gate projection after Ledger Decisions', () => {
    const decisions = [decision('intake', 'proceed'), decision('decomposition', 'approve-selected')]
    const report = assessGoalAlignment({ run: run('awaiting-owner:intake'), request, plan, decisions, evidenceRefs: [] })
    expect(report.status).toBe('drift')
    expect(report.expectedOwnerGate).toBe('completion-shape')
    expect(report.signals.map((item) => item.code)).toContain('owner-gate-projection-stale')
  })

  it('reports an accepted Result as awaiting Completion', () => {
    const aggregate: AggregateResult = { aggregateId: 'aggregate-1', runId: run().runId, status: 'complete', completedNodes: [], failedNodes: [], partialNodes: [], childResults: [], openQuestions: [], conflicts: [], evidenceRefs: ['evidence.json'], ownerDecisionRequired: true, nextAction: 'review', createdAt: '2026-08-21T00:00:00.000Z' }
    const decisions = [decision('intake', 'proceed'), decision('completion-shape', 'approve'), decision('decomposition', 'approve-selected'), decision('result-review', 'accept')]
    const report = assessGoalAlignment({ run: run('awaiting-owner:completion'), request, plan, decisions, aggregate, evidenceRefs: aggregate.evidenceRefs })
    expect(report.status).toBe('awaiting-owner')
    expect(report.currentStep).toBe('completion')
    expect(report.expectedOwnerGate).toBe('completion')
  })

  it('detects a stale waiting Gate after Packet-bound Dispatch approval', () => {
    const decisions = [decision('intake', 'proceed'), decision('completion-shape', 'approve'), decision('decomposition', 'approve-selected'), decision('dispatch', 'dispatch')]
    const report = assessGoalAlignment({ run: run('awaiting-owner:intake'), request, plan, decisions, evidenceRefs: [] })
    expect(report.currentStep).toBe('dispatch')
    expect(report.status).toBe('drift')
    expect(report.signals.map((item) => item.code)).toContain('owner-gate-projection-stale')
  })

  it('reports a completed Run as aligned and unlocks the next Request', () => {
    const decisions = [decision('intake', 'proceed'), decision('completion-shape', 'approve'), decision('decomposition', 'approve-selected'), decision('dispatch', 'dispatch'), decision('result-review', 'accept'), decision('completion', 'complete')]
    const report = assessGoalAlignment({ run: run('completed', 'complete'), request, plan, decisions, evidenceRefs: ['evidence.json'] })
    expect(report.status).toBe('aligned')
    expect(report.currentStep).toBe('completed')
    expect(report.nextUnlockedStep).toBe('next-request')
  })
})
