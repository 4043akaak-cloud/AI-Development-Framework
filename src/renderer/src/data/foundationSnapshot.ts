import type { AdapterSnapshot, ArtifactSnapshot, CapabilityGrantSnapshot, IntegrationGateSnapshot, JobSnapshot } from '../../../shared/controlPlaneTypes'

export const adapterSnapshot: readonly AdapterSnapshot[] = [{
  id: 'codex-manual', name: 'Codex（手動作業面）', connection: 'manual', dataClassification: 'project-limited', status: '接続なし・表示用Registry'
}]

export const grantSnapshot: readonly CapabilityGrantSnapshot[] = [{
  id: 'grant-display-only-mvp1', taskId: 'ADF-MVP1-001', scopeHash: 'manual-snapshot-2026-08-04', capabilities: ['read', 'propose'], expiresAt: '2026-08-04', state: 'expired', note: '表示用・権限を付与しない'
}]

export const jobSnapshot: readonly JobSnapshot[] = [{
  id: 'job-mvp1-evidence', taskId: 'ADF-MVP1-001', adapterId: 'codex-manual', state: 'completed-evidence-only', stopReason: '実行履歴ではなく、完了済みTaskのEvidence表示', capabilityCeiling: ['read', 'propose']
}, {
  id: 'job-review-design', parentId: 'job-mvp1-evidence', taskId: 'ADF-REVIEW-001', adapterId: 'codex-manual', state: 'paused', stopReason: '外部送信は実行直前の別承認まで不可', capabilityCeiling: ['read', 'propose']
}]

export const artifactSnapshot: readonly ArtifactSnapshot[] = [{
  id: 'artifact-mvp1-verification', taskId: 'ADF-MVP1-001', inputHash: 'manual-snapshot-2026-08-04', type: 'implementation-evidence', verification: 'typecheck / 7 unit tests / build / package表示を記録', sourceId: 'task-mvp1'
}, {
  id: 'artifact-review-protocol', taskId: 'ADF-REVIEW-001', inputHash: 'manual-snapshot-2026-08-04', type: 'review-plan', verification: '外部送信なしのレビュー実験設計・Owner review完了', sourceId: 'task-review'
}]

export const integrationGateSnapshot: readonly IntegrationGateSnapshot[] = [{
  taskId: 'ADF-REVIEW-001', state: 'awaiting-owner', ownerDecision: '外部Reviewerの実行は未承認', stopCondition: 'Packet hash・送信先・費用・期限が未承認なら停止', checks: [
    { label: 'Task / Scope / input hash', complete: true }, { label: 'Verification evidence', complete: true }, { label: '独立レビュー実行結果', complete: false }, { label: '実行直前Owner承認', complete: false }
  ]
}]
