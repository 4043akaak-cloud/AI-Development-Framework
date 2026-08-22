import type {
  AggregateResult,
  DecompositionPlan,
  FrontdoorRequest,
  GoalAlignmentReport,
  GoalAlignmentSignal,
  GoalAlignmentStatus,
  NorthStarStep,
  OwnerDecisionEnvelope,
  OwnerGate,
  OrchestrationRun
} from '../../shared/frontdoorTypes'

export interface GoalAlignmentInput {
  run: OrchestrationRun
  request: FrontdoorRequest
  plan: DecompositionPlan
  decisions: readonly OwnerDecisionEnvelope[]
  aggregate?: AggregateResult
  evidenceRefs: readonly string[]
}

const northStar = 'Owner入力 → 窓口AI → ADF → 複数AI → 統合Result → 次の指示'
const ownerGates: readonly OwnerGate[] = ['intake', 'completion-shape', 'decomposition', 'dispatch', 'node-review', 'question', 'result-review', 'completion', 'artifact-export', 'candidate-review']

function hasDecision(decisions: readonly OwnerDecisionEnvelope[], gate: OwnerGate, values: readonly string[]): boolean {
  return decisions.some((decision) => decision.gate === gate && values.includes(decision.decision))
}

function actualGate(ownerGate: OrchestrationRun['ownerGate']): string | undefined {
  return ownerGate?.startsWith('awaiting-owner:') ? ownerGate.slice('awaiting-owner:'.length) : ownerGate
}

function signal(code: string, severity: GoalAlignmentSignal['severity'], message: string): GoalAlignmentSignal {
  return { code, severity, message }
}

function deriveStep(input: GoalAlignmentInput): { currentStep: NorthStarStep; expectedOwnerGate?: OwnerGate; completedSteps: NorthStarStep[]; nextAction: string; nextUnlockedStep?: NorthStarStep | 'next-request' } {
  const { run, decisions, aggregate } = input
  const intakeApproved = hasDecision(decisions, 'intake', ['proceed'])
  const shapeApproved = hasDecision(decisions, 'completion-shape', ['approve'])
  const decompositionApproved = hasDecision(decisions, 'decomposition', ['approve-selected'])
  const dispatchApproved = hasDecision(decisions, 'dispatch', ['dispatch', 'approve-selected'])
  const resultAccepted = hasDecision(decisions, 'result-review', ['accept'])
  const completed = run.state === 'complete' || hasDecision(decisions, 'completion', ['complete'])

  const completedSteps: NorthStarStep[] = []
  if (intakeApproved) completedSteps.push('intake')
  if (shapeApproved && decompositionApproved) completedSteps.push('plan')
  if (dispatchApproved) completedSteps.push('dispatch')
  if (run.nodes.some((node) => node.state === 'running' || node.state === 'completed' || node.state === 'failed' || node.state === 'awaiting-question')) completedSteps.push('ai-execution')
  if (run.nodeReview) completedSteps.push('node-review')
  if (aggregate) completedSteps.push('result-review')
  if (resultAccepted) completedSteps.push('completion')
  if (completed) completedSteps.push('completed')

  if (completed) return { currentStep: 'completed', completedSteps, nextUnlockedStep: 'next-request', nextAction: '次のRequestを窓口AIから投入できます。' }
  if (aggregate && !resultAccepted) return { currentStep: 'result-review', expectedOwnerGate: 'result-review', completedSteps, nextAction: 'OwnerがAggregate ResultとEvidenceを確認します。' }
  if (resultAccepted) return { currentStep: 'completion', expectedOwnerGate: 'completion', completedSteps, nextAction: 'OwnerがこのRunのCompletionを確認します。' }
  if (run.nodeReview) return { currentStep: 'node-review', expectedOwnerGate: 'node-review', completedSteps, nextAction: 'OwnerがNode Resultを確認し、継続または停止を判断します。' }
  if (run.nodes.some((node) => node.state === 'running')) return { currentStep: 'ai-execution', completedSteps, nextAction: '複数AI Nodeの実行とResult受領を待ちます。' }
  if (!intakeApproved) return { currentStep: 'intake', expectedOwnerGate: 'intake', completedSteps, nextAction: 'OwnerがIntakeを確認します。' }
  if (!shapeApproved) return { currentStep: 'plan', expectedOwnerGate: 'completion-shape', completedSteps, nextAction: 'OwnerがCompletion Shapeを確認します。' }
  if (!decompositionApproved) return { currentStep: 'plan', expectedOwnerGate: 'decomposition', completedSteps, nextAction: 'Ownerが2Node分解と依存関係を確認します。' }
  if (!dispatchApproved) return { currentStep: 'dispatch', expectedOwnerGate: 'dispatch', completedSteps, nextAction: 'Owner-approved PacketとDispatch境界を確認します。' }
  if (run.state === 'ready-for-approval') return { currentStep: 'dispatch', expectedOwnerGate: 'dispatch', completedSteps, nextAction: '承認済みPacketの実Dispatchを開始できます。' }
  return { currentStep: 'ai-execution', completedSteps, nextAction: '複数AI Nodeの実行とResult受領を待ちます。' }
}

export function assessGoalAlignment(input: GoalAlignmentInput): GoalAlignmentReport {
  const derived = deriveStep(input)
  const signals: GoalAlignmentSignal[] = []
  const actual = actualGate(input.run.ownerGate)

  if (input.run.requestHash !== input.request.inputHash) {
    signals.push(signal('request-hash-mismatch', 'error', 'RunとRequestのhashが一致しません。'))
  }
  if (input.run.planHash !== input.plan.planHash) {
    signals.push(signal('plan-hash-mismatch', 'error', 'RunとPlanのhashが一致しません。'))
  }
  if (input.aggregate && input.aggregate.runId !== input.run.runId) {
    signals.push(signal('aggregate-run-mismatch', 'error', 'Aggregateが別Runに属しています。'))
  }
  for (const node of input.run.nodes) {
    if (node.state !== 'completed' && node.state !== 'failed') continue
    if (!node.childJobId || !node.threadId || !node.resultRef || !node.resultHash || !node.evidenceHash) {
      signals.push(signal('node-evidence-gap', 'error', `Node ${node.node.nodeId} のJob／Thread／Result／Evidence bindingが不足しています。`))
    }
  }
  if (input.aggregate && input.aggregate.completedNodes.length > 0 && input.evidenceRefs.length === 0) {
    signals.push(signal('aggregate-evidence-gap', 'error', 'Aggregateに完了NodeがあるのにEvidence参照がありません。'))
  }
  const actualIsOwnerGate = actual !== undefined && ownerGates.includes(actual as OwnerGate)
  if (actualIsOwnerGate && (!derived.expectedOwnerGate || actual !== derived.expectedOwnerGate)) {
    signals.push(signal('owner-gate-projection-stale', 'warning', `Ledgerから導出した次のGateは${derived.expectedOwnerGate}ですが、Run投影は${actual}です。`))
  }
  if (input.run.state === 'failed' || input.run.state === 'cancelled' || input.run.state === 'blocked-by-question') {
    signals.push(signal('run-blocked', 'error', `Runは${input.run.state}で停止しています。`))
  }

  const dispatchAlreadyApproved = hasDecision(input.decisions, 'dispatch', ['dispatch', 'approve-selected'])
  const waitingForOwner = Boolean(derived.expectedOwnerGate) && !(derived.expectedOwnerGate === 'dispatch' && dispatchAlreadyApproved)
  const hasError = signals.some((item) => item.severity === 'error')
  const hasDrift = signals.some((item) => item.code.endsWith('mismatch') || item.code === 'owner-gate-projection-stale')
  const status: GoalAlignmentStatus = hasError && signals.some((item) => item.code === 'node-evidence-gap' || item.code === 'aggregate-evidence-gap')
    ? 'evidence-gap'
    : hasError && signals.some((item) => item.code === 'run-blocked')
      ? 'blocked'
      : hasDrift
        ? 'drift'
        : waitingForOwner
          ? 'awaiting-owner'
          : 'aligned'

  return {
    status,
    currentStep: derived.currentStep,
    expectedOwnerGate: derived.expectedOwnerGate,
    actualOwnerGate: actual,
    completedSteps: derived.completedSteps,
    nextUnlockedStep: derived.nextUnlockedStep,
    nextAction: derived.nextAction,
    signals,
    goal: {
      northStar,
      finalFlowContribution: input.request.scope.inScope.includes('next-request')
        ? 'Cycle 1のEvidenceを根拠に、窓口AIが同じ入口から次のRequestへ進む'
        : '窓口AIのRequestをADF経由で複数AIのResultとEvidenceへ接続する',
      verticalSliceOutcome: input.request.requestedOutput
    }
  }
}
