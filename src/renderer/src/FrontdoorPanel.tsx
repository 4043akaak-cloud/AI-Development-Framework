import { useCallback, useEffect, useState, type JSX } from 'react'
import type { FrontdoorInspection, FrontdoorRunSummary, OwnerGate, OwnerGateState } from '../../shared/frontdoorTypes'

const gateLabels: Record<OwnerGate, string> = {
  intake: 'Intake',
  'completion-shape': 'Completion Shape',
  decomposition: 'Decomposition',
  dispatch: 'Dispatch',
  question: 'Question',
  'result-review': 'Result Review',
  completion: 'Completion'
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

function gateFromState(state?: OwnerGateState): OwnerGate | null {
  if (!state || !state.startsWith('awaiting-owner:')) return null
  const gate = state.slice('awaiting-owner:'.length)
  return gate in gateLabels ? gate as OwnerGate : null
}

function formatValue(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export default function FrontdoorPanel(): JSX.Element {
  const [runs, setRuns] = useState<FrontdoorRunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [inspection, setInspection] = useState<FrontdoorInspection | null>(null)
  const [approvedBy, setApprovedBy] = useState('')
  const [note, setNote] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const inspect = useCallback(async (runId: string): Promise<void> => {
    const result = await window.adfFrontdoor.inspect(runId)
    if (result.ok) {
      setSelectedRunId(runId)
      setInspection(result.value)
      setMessage(null)
    } else setMessage(result.error)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.adfFrontdoor.list()
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setRuns(result.value)
    const nextId = selectedRunId && result.value.some((run) => run.runId === selectedRunId) ? selectedRunId : result.value[0]?.runId
    if (nextId) await inspect(nextId)
    else {
      setSelectedRunId(null)
      setInspection(null)
    }
  }, [inspect, selectedRunId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runAction = async (action: () => Promise<Result<unknown>>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const result = await action()
    if (!result.ok) setMessage(result.error)
    if (selectedRunId) await refresh()
    setBusy(false)
  }

  const run = inspection?.run
  const currentGate = gateFromState(run?.ownerGate)
  const dispatchApproved = Boolean(inspection?.decisions.some((decision) => decision.gate === 'dispatch' && decision.decision === 'dispatch'))
  const completionAccepted = Boolean(inspection?.decisions.some((decision) => decision.gate === 'result-review' && decision.decision === 'accept'))
  const canOwnerAct = approvedBy.trim().length > 0 && !busy
  const packetsReady = runs.find((entry) => entry.runId === selectedRunId)?.packetsReady ?? false
  const openQuestions = inspection?.openQuestions.filter((question) => question.status === 'open') ?? []
  const terminal = run ? ['complete', 'partial', 'failed', 'cancelled'].includes(run.state) : false

  const approveCurrentGate = async (): Promise<void> => {
    if (!run || !currentGate || !approvedBy.trim()) return
    const nodeIds = currentGate === 'dispatch' ? run.nodes.map((record) => record.node.nodeId) : undefined
    await runAction(() => window.adfFrontdoor.approve({ runId: run.runId, gate: currentGate, approvedBy: approvedBy.trim(), note: note || undefined, nodeIds }))
  }

  return (
    <section className="frontdoor-panel" aria-label="Frontdoor Owner Loop">
      <div className="thread-heading">
        <div>
          <p className="eyebrow">FRONTDOOR · OWNER CONTROL PLANE</p>
          <h2>窓口AIのOwner Loop</h2>
          <p>RunのProposal、Plan、Decision、Result、Evidenceを確認し、Gateを一段ずつ進めます。Rendererは承認ファイル・正本・repoへ書き込みません。</p>
        </div>
        <button type="button" className="text-button" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      </div>

      {message && <p className="failure" role="alert">Frontdoor操作に失敗しました: {message}</p>}

      <div className="frontdoor-layout">
        <aside className="frontdoor-run-list" aria-label="Frontdoor Run一覧">
          <h3>Run一覧</h3>
          {runs.length === 0 && <p className="lane-empty">Frontdoor Runがありません。CLIのprepareまたは後続の窓口入力Taskで作成します。</p>}
          {runs.map((entry) => (
            <button key={entry.runId} type="button" className={`task-card ${entry.runId === selectedRunId ? 'selected' : ''}`} disabled={busy} onClick={() => void inspect(entry.runId)}>
              <span className="card-id">{entry.runId}</span>
              <span className="card-objective">{entry.objective}</span>
              <span className="card-status">{entry.state} · {entry.ownerGate ?? 'gateなし'}</span>
              <span className="card-status">Node {entry.nodeCount} · Question {entry.openQuestionCount}</span>
              <span className={`freshness ${entry.packetsReady ? 'current' : 'stale'}`}>{entry.packetsReady ? 'Packet準備済み' : 'Packet待ち'}</span>
            </button>
          ))}
        </aside>

        {!inspection && <p className="lane-empty">Runを選択するとInspect Projectionを表示します。</p>}

        {inspection && run && (
          <div className="frontdoor-detail">
            <div className="frontdoor-summary">
              <div>
                <p className="eyebrow">INSPECT PROJECTION</p>
                <h3>{inspection.request.objective}</h3>
                <p className="turn-refs">{run.runId} · {run.state} · {run.ownerGate ?? 'gateなし'} · 更新 {run.updatedAt}</p>
              </div>
              <span className={`freshness ${terminal ? 'current' : 'stale'}`}>{terminal ? '終端' : 'Owner操作待ち'}</span>
            </div>

            <section className="frontdoor-card" aria-label="RequestとPlan">
              <h3>Proposal / Plan</h3>
              <dl className="detail-grid">
                <div><dt>Request hash</dt><dd>{inspection.request.inputHash}</dd></div>
                <div><dt>Plan hash</dt><dd>{inspection.plan.planHash}</dd></div>
                <div><dt>Aggregate hash</dt><dd>{inspection.aggregateHash ?? '未生成'}</dd></div>
                <div><dt>次のAction</dt><dd>{inspection.nextAction}</dd></div>
                <div><dt>Evidence</dt><dd>{inspection.evidenceRefs.length}件</dd></div>
                <div><dt>Event</dt><dd>{inspection.eventCount}件</dd></div>
              </dl>
              <ul className="frontdoor-node-list">
                {inspection.plan.nodes.map((node) => <li key={node.nodeId}><strong>{node.nodeId}</strong> · {node.role} / {node.adapterId} · {node.dependsOn.length ? `依存: ${node.dependsOn.join(', ')}` : '依存なし'}<br /><small>target hash: {inspection.nodeTargetHashes[node.nodeId]}</small></li>)}
              </ul>
            </section>

            <section className="frontdoor-card" aria-label="Owner Decision">
              <h3>Owner Decision</h3>
              <label className="frontdoor-field">Owner identity（必須）<input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} placeholder="例: Project Owner" disabled={busy} /></label>
              <label className="frontdoor-field">Note（任意）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} rows={2} disabled={busy} /></label>
              <p className="turn-refs">現在Gate: {currentGate ? gateLabels[currentGate] : run.ownerGate ?? 'なし'}</p>
              <div className="owner-actions">
                {currentGate && currentGate !== 'question' && currentGate !== 'result-review' && currentGate !== 'completion' && (
                  <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void approveCurrentGate()}>{gateLabels[currentGate]}を承認</button>
                )}
                {currentGate === 'dispatch' && (
                  <button type="button" className="text-button" disabled={!canOwnerAct || !dispatchApproved || !packetsReady} title={!packetsReady ? 'Owner-approved child Packetをapproved-tasksへ配置してください' : undefined} onClick={() => void runAction(() => window.adfFrontdoor.dispatch(run.runId))}>承認済みNodeをDispatch</button>
                )}
                {currentGate === 'result-review' && !terminal && (
                  <>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewResult({ runId: run.runId, approvedBy: approvedBy.trim(), decision: 'accept', note: note || undefined }))}>Resultを受入</button>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewResult({ runId: run.runId, approvedBy: approvedBy.trim(), decision: 'follow-up', note: note || undefined }))}>Follow-up</button>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewResult({ runId: run.runId, approvedBy: approvedBy.trim(), decision: 'reject', note: note || undefined }))}>Resultを拒否</button>
                  </>
                )}
                {currentGate === 'completion' && completionAccepted && (
                  <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.complete({ runId: run.runId, approvedBy: approvedBy.trim(), note: note || undefined }))}>Completionを承認</button>
                )}
                {!terminal && <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.stop({ runId: run.runId, approvedBy: approvedBy.trim(), note: note || undefined }))}>Runを停止</button>}
                {run.state === 'running' && <button type="button" className="text-button" disabled={busy} onClick={() => void runAction(() => window.adfFrontdoor.recover(run.runId))}>Recovery状態を確認</button>}
              </div>
            </section>

            {openQuestions.length > 0 && (
              <section className="frontdoor-card" aria-label="AI Question">
                <h3>AI Question</h3>
                {openQuestions.map((question) => (
                  <div key={question.questionId} className="frontdoor-question">
                    <p><strong>{question.questionId}</strong> · {question.kind} · {question.blocking ? 'Block' : 'Non-blocking'}</p>
                    <p className="turn-content">{question.text}</p>
                    <label className="frontdoor-field">Owner answer（必須）<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} disabled={busy} /></label>
                    <button type="button" className="text-button" disabled={!canOwnerAct || !answer.trim()} onClick={() => void runAction(async () => { const result = await window.adfFrontdoor.answer({ runId: run.runId, questionId: question.questionId, approvedBy: approvedBy.trim(), note: answer.trim() }); if (result.ok) setAnswer(''); return result })}>回答を記録</button>
                  </div>
                ))}
              </section>
            )}

            <section className="frontdoor-card" aria-label="Result Evidence">
              <h3>Result / Evidence / Decisions</h3>
              {inspection.aggregate ? <pre className="frontdoor-json">{formatValue(inspection.aggregate)}</pre> : <p className="lane-empty">Aggregateはまだありません。</p>}
              <ul className="frontdoor-decision-list">
                {inspection.decisions.map((decision) => <li key={decision.decisionId}><strong>{decision.gate}</strong> · {decision.decision} · {decision.approvedBy}<br /><small>target: {decision.targetHash}</small></li>)}
              </ul>
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
