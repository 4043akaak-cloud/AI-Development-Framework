import type { FrontdoorActivity, FrontdoorActivityKind, FrontdoorActivityStatus, FrontdoorEventType, FrontdoorLedgerEvent, OrchestrationRun } from '../../shared/frontdoorTypes'

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.slice(0, 240).replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=<redacted>')
    : fallback
}

function nodeContext(run: OrchestrationRun, payload: Record<string, unknown>): { nodeId?: string; adapterId?: string; role?: OrchestrationRun['nodes'][number]['node']['role']; skillId?: string } {
  const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : undefined
  const node = nodeId ? run.nodes.find((record) => record.node.nodeId === nodeId)?.node : undefined
  return {
    nodeId,
    adapterId: node?.adapterId,
    role: node?.role,
    skillId: node?.skillId ?? (typeof payload.skillId === 'string' ? payload.skillId : undefined)
  }
}

function definition(event: FrontdoorLedgerEvent, run: OrchestrationRun): Omit<FrontdoorActivity, 'activityId' | 'occurredAt' | 'eventType'> {
  const payload = event.payload
  const context = nodeContext(run, payload)
  let kind: FrontdoorActivityKind = 'system'
  let status: FrontdoorActivityStatus = 'complete'
  let label: string = event.type
  let detail = 'ADF Event Ledgerに記録されました。'

  switch (event.type as FrontdoorEventType) {
    case 'frontdoor.run-created':
      label = 'Request受領'
      detail = 'Frontdoor Runを作成しました。'
      break
    case 'frontdoor.candidate-request-created':
      kind = 'agent'
      label = '採用CandidateからRequest生成'
      detail = '窓口AIが明示したRequestにCandidateの来歴を束縛しました。'
      break
    case 'frontdoor.owner-gate-opened':
      kind = 'owner'
      status = 'waiting'
      label = `Owner Gate待ち: ${text(payload.gate, 'unknown')}`
      detail = 'Ownerの判断を待っています。'
      break
    case 'frontdoor.owner-decision-recorded': {
      kind = 'owner'
      const decision = payload.decision && typeof payload.decision === 'object' ? payload.decision as Record<string, unknown> : {}
      label = `Owner Decision: ${text(decision.gate, 'unknown')} / ${text(decision.decision, 'unknown')}`
      detail = `承認者: ${text(decision.approvedBy, '未記録')}`
      break
    }
    case 'frontdoor.approval-bound':
      label = 'Dispatch承認を束縛'
      detail = '承認済みPacketとRunの実行境界を固定しました。'
      break
    case 'frontdoor.node-approved':
      kind = 'owner'
      label = `Node承認: ${text(payload.nodeId, 'unknown')}`
      detail = 'OwnerがこのNodeのDispatchを承認しました。'
      break
    case 'frontdoor.node-started':
      kind = 'agent'
      status = 'running'
      label = `AI Node実行開始: ${text(context.nodeId, 'unknown')}`
      detail = `${context.adapterId ?? 'Adapter未記録'} / ${context.role ?? 'role未記録'}`
      break
    case 'frontdoor.node-completed':
      kind = 'agent'
      label = `AI Node Result受領: ${text(context.nodeId, 'unknown')}`
      detail = payload.autoContinued === true
        ? `${context.adapterId ?? 'Adapter未記録'} / 安全条件を満たしたため次のNodeへ自動継続しました。`
        : `${context.adapterId ?? 'Adapter未記録'} / ResultをEvidence検証へ渡しました。`
      break
    case 'frontdoor.node-failed':
      kind = 'agent'
      status = 'failed'
      label = `AI Node失敗: ${text(context.nodeId, 'unknown')}`
      detail = text(payload.error, 'Nodeの実行に失敗しました。')
      break
    case 'frontdoor.node-review-opened':
      kind = 'verification'
      status = 'waiting'
      label = `Node Result確認待ち: ${text(payload.nodeId, 'unknown')}`
      detail = 'Result、Evidence、リスクをOwnerが確認します。'
      break
    case 'frontdoor.node-review-continued':
      kind = 'owner'
      label = 'Node Review継続'
      detail = 'Ownerの継続判断を記録しました。'
      break
    case 'frontdoor.question-opened':
      kind = 'owner'
      status = 'waiting'
      label = 'AI Question待ち'
      detail = 'AIからの質問へのOwner回答が必要です。'
      break
    case 'frontdoor.question-answered':
      kind = 'owner'
      label = 'AI Question回答'
      detail = 'Owner回答を記録しました。'
      break
    case 'frontdoor.completion-proposed':
      kind = 'verification'
      status = 'waiting'
      label = 'Aggregate Result確認待ち'
      detail = '集約ResultをOwnerが確認します。'
      break
    case 'frontdoor.result-reviewed':
      kind = 'owner'
      label = `Result Review: ${text((payload.decision as Record<string, unknown> | undefined)?.decision, 'unknown')}`
      detail = 'OwnerのResult判断を記録しました。'
      break
    case 'frontdoor.completion-approved':
      kind = 'owner'
      label = 'Completion承認'
      detail = 'OwnerがCompletionを承認しました。'
      break
    case 'frontdoor.run-recovery-needed':
      status = 'waiting'
      label = 'Recovery確認待ち'
      detail = '中断状態を検出しました。OwnerのRecovery判断が必要です。'
      break
    case 'frontdoor.run-stopped':
      status = 'stopped'
      label = 'Run停止'
      detail = text(payload.reason, 'Ownerまたは停止条件により停止しました。')
      break
    case 'frontdoor.run-completed': {
      const resultStatus = text(payload.status, 'unknown')
      status = resultStatus === 'complete' ? 'complete' : resultStatus === 'failed' ? 'failed' : 'complete'
      label = `Run完了: ${resultStatus}`
      detail = 'Runの終端状態をLedgerへ記録しました。'
      break
    }
    case 'frontdoor.plan-revised':
      kind = 'owner'
      label = 'Plan改訂'
      detail = 'Plan改訂と旧Decisionの無効化を記録しました。'
      break
    default:
      label = event.type
  }

  return { kind, status, label, detail, ...context }
}

export function buildActivityTrace(events: readonly FrontdoorLedgerEvent[], run: OrchestrationRun, limit = 100): FrontdoorActivity[] {
  return events.slice(-limit).map((event) => ({
    activityId: event.eventId,
    occurredAt: event.occurredAt,
    eventType: event.type,
    ...definition(event, run)
  }))
}
