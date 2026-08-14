import type { AggregateResult, FrontdoorQuestion, FrontdoorRequest, FrontdoorReturn, OrchestrationNodeRecord } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { openBlockingQuestions } from './questionAggregator'

export function aggregateResults(runId: string, nodes: readonly OrchestrationNodeRecord[], questions: readonly FrontdoorQuestion[], evidenceRefs: readonly string[], createdAt: string): AggregateResult {
  const completedNodes = nodes.filter((node) => node.state === 'completed').map((node) => node.node.nodeId)
  const failedNodes = nodes.filter((node) => node.state === 'failed').map((node) => node.node.nodeId)
  const partialNodes = nodes.filter((node) => node.resultStatus === 'partial').map((node) => node.node.nodeId)
  const childResults = nodes.filter((node) => node.resultStatus).map((node) => ({ nodeId: node.node.nodeId, status: node.resultStatus!, resultRef: node.resultRef }))
  const blocking = openBlockingQuestions(questions)
  const hasCancelled = nodes.some((node) => node.state === 'cancelled')
  const status = blocking.length > 0
    ? 'blocked-by-question'
    : failedNodes.length > 0 && completedNodes.length === 0
        ? 'failed'
        : failedNodes.length > 0 || partialNodes.length > 0
          ? 'partial'
          : hasCancelled
            ? 'cancelled'
            : 'complete'
  const nextAction = blocking.length > 0
    ? 'Ownerが質問へ回答してから、該当Nodeの再開可否を判断する'
    : status === 'complete'
      ? 'OwnerがEvidenceを確認し、採用・継続・停止を判断する'
      : status === 'partial'
        ? 'Ownerが部分Resultと失敗Nodeを確認し、継続・再設計・停止を判断する'
        : 'Ownerが失敗・停止理由を確認し、次のTaskを判断する'
  return {
    aggregateId: `aggregate-${hashJson([runId, nodes.map((node) => [node.node.nodeId, node.resultStatus, node.resultRef]), questions]).slice(0, 20)}`,
    runId,
    status,
    completedNodes,
    failedNodes,
    partialNodes,
    childResults,
    openQuestions: questions.filter((question) => question.status === 'open'),
    conflicts: [],
    evidenceRefs: [...evidenceRefs],
    ownerDecisionRequired: true,
    nextAction,
    createdAt
  }
}

export function buildFrontdoorReturn(request: FrontdoorRequest, aggregate: AggregateResult): FrontdoorReturn {
  const blocking = openBlockingQuestions(aggregate.openQuestions)
  const answer = blocking.length > 0
    ? '子AIからの質問があり、回答またはOwner判断が必要です。'
    : aggregate.status === 'complete'
      ? `${aggregate.completedNodes.length}件の子Taskが完了し、Evidenceを集約しました。`
      : `${aggregate.completedNodes.length}件完了、${aggregate.failedNodes.length}件失敗、${aggregate.partialNodes.length}件部分結果です。`
  return {
    requestId: request.requestId,
    runId: aggregate.runId,
    status: aggregate.status,
    summary: answer,
    answer,
    childResultRefs: aggregate.childResults.flatMap((result) => result.resultRef ? [result.resultRef] : []),
    openQuestions: aggregate.openQuestions,
    unresolvedRisks: aggregate.status === 'complete' ? [] : ['Owner判断または追加検証が必要'],
    evidenceRefs: aggregate.evidenceRefs,
    ownerDecisionRequired: aggregate.ownerDecisionRequired,
    nextAction: aggregate.nextAction
  }
}
