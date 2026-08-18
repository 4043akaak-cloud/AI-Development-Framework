import { useCallback, useEffect, useState, type JSX } from 'react'
import type { FrontdoorActivity, FrontdoorInspection, FrontdoorPlanProposal, FrontdoorPrepareInput, FrontdoorRequestInput, FrontdoorRunSummary, OwnerGate, OwnerGateState } from '../../shared/frontdoorTypes'

const gateLabels: Record<OwnerGate, string> = {
  intake: 'Intake',
  'completion-shape': 'Completion Shape',
  decomposition: 'Decomposition',
  dispatch: 'Dispatch',
  'node-review': 'Node Review',
  question: 'Question',
  'result-review': 'Result Review',
  completion: 'Completion',
  'artifact-export': 'Artifact Export',
  'candidate-review': 'Candidate Review'
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

function listValue(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

const activityKindLabels: Record<FrontdoorActivity['kind'], string> = {
  system: 'ADF',
  owner: 'Owner Gate',
  agent: 'AI Node',
  verification: 'Verification'
}

const activityStatusLabels: Record<FrontdoorActivity['status'], string> = {
  complete: '完了',
  running: '実行中',
  waiting: '待機中',
  failed: '失敗',
  stopped: '停止'
}

function activityTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const defaultPlanJson = JSON.stringify({
  planId: 'frontdoor-ui-plan',
  requestId: '__REQUEST_ID__',
  version: 1,
  aggregationPolicy: 'collect-all',
  nodes: [{
    nodeId: 'proposal',
    objective: 'RequestのProposalを作成する',
    role: 'proposal',
    adapterId: 'fake-ai-a',
    scope: { inScope: ['frontdoor-request'], outOfScope: ['external-send', 'write-canonical'] },
    contextReferences: ['fixture://owner-request'],
    acceptance: ['Proposalを返す'],
    stopConditions: ['Scope外要求'],
    capabilities: ['read', 'propose'],
    dependsOn: [],
    depth: 1
  }]
}, null, 2)

export default function FrontdoorPanel(): JSX.Element {
  const [runs, setRuns] = useState<FrontdoorRunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [inspection, setInspection] = useState<FrontdoorInspection | null>(null)
  const [approvedBy, setApprovedBy] = useState('')
  const [note, setNote] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [intakeObjective, setIntakeObjective] = useState('')
  const [intakeUserInput, setIntakeUserInput] = useState('')
  const [intakeProjectRef, setIntakeProjectRef] = useState('local://owner-request')
  const [intakeRequestedOutput, setIntakeRequestedOutput] = useState('Ownerが確認できるProposal')
  const [intakeContext, setIntakeContext] = useState('fixture://owner-request')
  const [intakeInScope, setIntakeInScope] = useState('frontdoor-request')
  const [intakeOutOfScope, setIntakeOutOfScope] = useState('external-send, write-canonical')
  const [intakePlanJson, setIntakePlanJson] = useState(defaultPlanJson)
  const [intakeRequestId, setIntakeRequestId] = useState<string | null>(null)
  const [plannerProposal, setPlannerProposal] = useState<FrontdoorPlanProposal | null>(null)
  const [activityVisible, setActivityVisible] = useState(() => {
    try {
      return window.localStorage.getItem('adf.activity-trace.visible') === 'true'
    } catch {
      return false
    }
  })

  const [candidates, setCandidates] = useState<import('../../shared/implementationTypes').CandidateSummary[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [candidateInspection, setCandidateInspection] = useState<import('../../shared/implementationTypes').CandidateInspectionResult | null>(null)

  const inspect = useCallback(async (runId: string): Promise<void> => {
    const result = await window.adfFrontdoor.inspect(runId)
    if (result.ok) {
      setSelectedRunId(runId)
      setInspection(result.value)
      setMessage(null)
    } else setMessage(result.error)
  }, [])

  const refreshCandidates = useCallback(async (): Promise<void> => {
    const result = await window.adfFrontdoor.listCandidates()
    if (result.ok) setCandidates(result.value)
  }, [])

  const inspectCandidateItem = useCallback(async (candidateId: string): Promise<void> => {
    setSelectedCandidateId(candidateId)
    const result = await window.adfFrontdoor.inspectCandidate(candidateId)
    if (result.ok) {
      setCandidateInspection(result.value)
      void refreshCandidates()
    } else {
      setMessage(`Candidate inspection error: ${result.error}`)
    }
  }, [refreshCandidates])

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.adfFrontdoor.list()
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setRuns(result.value)
    void refreshCandidates()
    const nextId = selectedRunId && result.value.some((run) => run.runId === selectedRunId) ? selectedRunId : result.value[0]?.runId
    if (nextId) await inspect(nextId)
    else {
      setSelectedRunId(null)
      setInspection(null)
    }
  }, [inspect, refreshCandidates, selectedRunId])


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

  const buildIntakeRequest = (requestId: string): FrontdoorRequestInput => ({
    requestId,
    source: 'owner',
    objective: intakeObjective.trim(),
    userInput: intakeUserInput.trim(),
    projectRef: intakeProjectRef.trim(),
    constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 8, maxDepth: 4, externalSend: false },
    requestedOutput: intakeRequestedOutput.trim(),
    contextReferences: listValue(intakeContext),
    scope: { inScope: listValue(intakeInScope), outOfScope: listValue(intakeOutOfScope) }
  })

  const proposePlan = async (): Promise<void> => {
    if (!intakeObjective.trim() || !intakeUserInput.trim()) return
    setBusy(true)
    setMessage(null)
    const requestId = intakeRequestId ?? `frontdoor-ui-${Date.now().toString(36)}`
    setIntakeRequestId(requestId)
    try {
      const result = await window.adfFrontdoor.proposePlan(buildIntakeRequest(requestId))
      if (!result.ok) setMessage(result.error)
      else {
        const planInput = JSON.parse(JSON.stringify(result.value.plan)) as Record<string, unknown>
        delete planInput.planHash
        setIntakePlanJson(JSON.stringify(planInput, null, 2))
        setPlannerProposal(result.value)
        setMessage(`Planner案を生成しました（未承認）: ${result.value.plan.planHash}`)
      }
    } catch (error) {
      setMessage(`Planner案の生成に失敗しました: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const submitIntake = async (): Promise<void> => {
    if (!intakeObjective.trim() || !intakeUserInput.trim()) return
    setBusy(true)
    setMessage(null)
    const requestId = intakeRequestId ?? `frontdoor-ui-${Date.now().toString(36)}`
    setIntakeRequestId(requestId)
    try {
      const plan = JSON.parse(intakePlanJson) as Record<string, unknown>
      const input: FrontdoorPrepareInput = {
        request: buildIntakeRequest(requestId),
        plan: { ...plan, requestId } as FrontdoorPrepareInput['plan']
      }
      const result = await window.adfFrontdoor.prepare(input)
      if (!result.ok) setMessage(result.error)
      else {
        setIntakeOpen(false)
        setMessage(`${result.value.reused ? '既存Runを再利用しました' : '新しいRunを作成しました'}: ${result.value.run.runId}`)
        await refresh()
        await inspect(result.value.run.runId)
      }
    } catch (error) {
      setMessage(`Request／Plan入力を解釈できません: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const run = inspection?.run
  const currentGate = gateFromState(run?.ownerGate)
  const dispatchApproved = Boolean(inspection?.decisions.some((decision) => decision.gate === 'dispatch' && decision.decision === 'dispatch'))
  const completionAccepted = Boolean(inspection?.decisions.some((decision) => decision.gate === 'result-review' && decision.decision === 'accept'))
  const artifactExported = Boolean(inspection?.decisions.some((decision) => decision.gate === 'artifact-export' && decision.decision === 'export'))
  const canOwnerAct = approvedBy.trim().length > 0 && !busy
  const packetsReady = runs.find((entry) => entry.runId === selectedRunId)?.packetsReady ?? false
  const openQuestions = inspection?.openQuestions.filter((question) => question.status === 'open') ?? []
  const nodeReview = inspection?.nodeReview
  const activities = inspection?.activities ?? []
  const latestActivity = activities.at(-1)
  const waitingActivity = [...activities].reverse().find((activity) => activity.status === 'waiting')
  const terminal = run ? ['complete', 'partial', 'failed', 'cancelled'].includes(run.state) : false

  const toggleActivity = (visible: boolean): void => {
    setActivityVisible(visible)
    try {
      window.localStorage.setItem('adf.activity-trace.visible', String(visible))
    } catch {
      // Local display preference is optional; the Activity projection remains read-only.
    }
  }

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

      {message && <p className="frontdoor-message" role="status">{message}</p>}

      <section className="frontdoor-card frontdoor-intake" aria-label="Frontdoor Request Intake">
        <div className="frontdoor-summary">
          <div>
            <p className="eyebrow">REQUEST INTAKE · NO DISPATCH</p>
            <h3>窓口依頼をADFへ投入</h3>
            <p className="turn-refs">PrepareはRunとPlan証跡だけを作成し、Intake承認待ちで停止します。</p>
          </div>
          <button type="button" className="text-button" disabled={busy} onClick={() => setIntakeOpen((open) => !open)}>{intakeOpen ? '入力を閉じる' : '新規Request'}</button>
        </div>
        {intakeOpen && (
          <div className="frontdoor-intake-grid">
            <label className="frontdoor-field">目的（必須）<input value={intakeObjective} onChange={(event) => setIntakeObjective(event.target.value)} disabled={busy} /></label>
            <label className="frontdoor-field">窓口からの依頼（必須）<textarea value={intakeUserInput} onChange={(event) => setIntakeUserInput(event.target.value)} rows={3} disabled={busy} /></label>
            <label className="frontdoor-field">Project参照<input value={intakeProjectRef} onChange={(event) => setIntakeProjectRef(event.target.value)} disabled={busy} /></label>
            <label className="frontdoor-field">期待する出力<input value={intakeRequestedOutput} onChange={(event) => setIntakeRequestedOutput(event.target.value)} disabled={busy} /></label>
            <label className="frontdoor-field">Context参照（カンマ区切り）<input value={intakeContext} onChange={(event) => setIntakeContext(event.target.value)} disabled={busy} /></label>
            <label className="frontdoor-field">In scope（カンマ区切り）<input value={intakeInScope} onChange={(event) => setIntakeInScope(event.target.value)} disabled={busy} /></label>
            <label className="frontdoor-field">Out of scope（カンマ区切り）<input value={intakeOutOfScope} onChange={(event) => setIntakeOutOfScope(event.target.value)} disabled={busy} /></label>
            <label className="frontdoor-field frontdoor-plan-field">Plan案 JSON（Planner案または窓口AI／Ownerが確認して入力）<textarea value={intakePlanJson} onChange={(event) => setIntakePlanJson(event.target.value)} rows={12} disabled={busy} /></label>
            {plannerProposal && <div className="frontdoor-plan-proposal" aria-label="Planner Proposal">
              <strong>未承認Planner案</strong>
              <span>Planner: {plannerProposal.plannerId} / {plannerProposal.plannerVersion}</span>
              <span>Request hash: {plannerProposal.requestHash}</span>
              <span>Plan hash: {plannerProposal.plan.planHash}</span>
              <span>前提: {plannerProposal.assumptions.join(' ／ ')}</span>
              <span>リスク: {plannerProposal.risks.join(' ／ ')}</span>
            </div>}
            <div className="frontdoor-intake-actions">
              <button type="button" className="text-button" disabled={busy || !intakeObjective.trim() || !intakeUserInput.trim()} onClick={() => void proposePlan()}>Planner案を生成（未承認）</button>
              <button type="button" className="text-button" disabled={busy || !intakeObjective.trim() || !intakeUserInput.trim()} onClick={() => void submitIntake()}>Run案を作成（Intake待ち）</button>
              <span className="turn-refs">Planner案の生成はRun／Job／Thread／送信を行いません。Run作成はOwner確認後に実行してください。</span>
            </div>
          </div>
        )}
      </section>

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

            <section className="frontdoor-card frontdoor-activity-toggle" aria-label="AI Activity表示設定">
              <div>
                <h3>AI Activity（おまけ）</h3>
                <p className="turn-refs">Event Ledgerから、ADFが観測できるAI Node・Owner Gate・Verificationの進行を表示します。</p>
              </div>
              <label className="activity-switch">
                <input type="checkbox" checked={activityVisible} onChange={(event) => toggleActivity(event.target.checked)} />
                <span>Activityを表示</span>
              </label>
            </section>

            {activityVisible && (
              <section className="frontdoor-card frontdoor-activity-panel" aria-label="AI Activity Timeline">
                <div className="activity-summary">
                  <div>
                    <h3>AI Activity Timeline</h3>
                    <p className="turn-refs">{waitingActivity ? waitingActivity.label : latestActivity ? latestActivity.label : 'まだActivityがありません'}</p>
                  </div>
                  <span className={`activity-state ${waitingActivity ? 'waiting' : latestActivity?.status ?? 'complete'}`}>{waitingActivity ? 'Owner判断待ち' : latestActivity ? activityStatusLabels[latestActivity.status] : '未開始'}</span>
                </div>
                {activities.length === 0 && <p className="lane-empty">ADF Event LedgerにActivityがまだありません。</p>}
                {activities.length > 0 && (
                  <ol className="activity-timeline">
                    {[...activities].reverse().map((activity) => (
                      <li key={activity.activityId} className={`activity-item ${activity.status}`}>
                        <span className="activity-dot" aria-hidden="true" />
                        <div className="activity-content">
                          <div className="activity-meta"><strong>{activityKindLabels[activity.kind]}</strong><span>{activityStatusLabels[activity.status]}</span><time dateTime={activity.occurredAt}>{activityTime(activity.occurredAt)}</time></div>
                          <h4>{activity.label}</h4>
                          <p>{activity.detail}</p>
                          <div className="activity-tags">
                            {activity.adapterId && <span>Adapter: {activity.adapterId}</span>}
                            {activity.role && <span>Role: {activity.role}</span>}
                            <span>Skill: {activity.skillId ?? 'ADF未記録'}</span>
                            {activity.nodeId && <span>Node: {activity.nodeId}</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="turn-refs activity-disclosure">Codex内部のSkill／サブエージェントはADFから自動観測できません。明示的に記録されたSkill IDだけを表示し、未記録は推測しません。</p>
              </section>
            )}

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
                {currentGate === 'node-review' && nodeReview && (
                  <>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewNode({ runId: run.runId, nodeId: nodeReview.nodeId, approvedBy: approvedBy.trim(), decision: 'continue', note: note || undefined }))}>次のNodeへ進む</button>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewNode({ runId: run.runId, nodeId: nodeReview.nodeId, approvedBy: approvedBy.trim(), decision: 'stop', note: note || undefined }))}>ここで停止</button>
                  </>
                )}
                {currentGate === 'result-review' && !terminal && (
                  <>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewResult({ runId: run.runId, approvedBy: approvedBy.trim(), decision: 'accept', note: note || undefined }))}>Resultを受入</button>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewResult({ runId: run.runId, approvedBy: approvedBy.trim(), decision: 'follow-up', note: note || undefined }))}>Follow-up</button>
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.reviewResult({ runId: run.runId, approvedBy: approvedBy.trim(), decision: 'reject', note: note || undefined }))}>Resultを拒否</button>
                  </>
                )}
                {currentGate === 'completion' && completionAccepted && (
                  <>
                    {!artifactExported && <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.exportArtifact({ runId: run.runId, approvedBy: approvedBy.trim(), note: note || undefined }))}>Work PlaneへExport</button>}
                    <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.complete({ runId: run.runId, approvedBy: approvedBy.trim(), note: note || undefined }))}>Completionを承認</button>
                  </>
                )}
                {!terminal && <button type="button" className="text-button" disabled={!canOwnerAct} onClick={() => void runAction(() => window.adfFrontdoor.stop({ runId: run.runId, approvedBy: approvedBy.trim(), note: note || undefined }))}>Runを停止</button>}
                {run.state === 'running' && <button type="button" className="text-button" disabled={busy} onClick={() => void runAction(() => window.adfFrontdoor.recover(run.runId))}>Recovery状態を確認</button>}
              </div>
            </section>

            {currentGate === 'node-review' && nodeReview && (
              <section className="frontdoor-card" aria-label="Node Result Review">
                <h3>Node Result Review</h3>
                <dl className="detail-grid">
                  <div><dt>完了Node</dt><dd>{nodeReview.nodeId}</dd></div>
                  <div><dt>Result status</dt><dd>{nodeReview.status ?? '未記録'}</dd></div>
                  <div><dt>次のNode</dt><dd>{nodeReview.nextNodeIds.join(', ')}</dd></div>
                  <div><dt>Evidence</dt><dd>{nodeReview.resultRef ?? '未生成'}</dd></div>
                </dl>
                {nodeReview.summary && <p className="turn-content">{nodeReview.summary}</p>}
                {nodeReview.content && <pre className="frontdoor-json">{nodeReview.content}</pre>}
                <p className="turn-refs">Node Resultを確認してから、次のNodeへの継続または停止を選択してください。target hash: {nodeReview.targetHash}</p>
              </section>
            )}

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

            <section className="frontdoor-card" aria-label="Candidate Review">
              <h3>Candidate Review (候補成果物レビュー)</h3>
              {candidates.length === 0 ? (
                <p className="lane-empty">レビュー対象のCandidateはまだありません。</p>
              ) : (
                <div>
                  <div className="frontdoor-run-list">
                    {candidates.map((cand) => (
                      <button
                        key={cand.candidateId}
                        type="button"
                        className={`frontdoor-run-item ${selectedCandidateId === cand.candidateId ? 'selected' : ''}`}
                        onClick={() => void inspectCandidateItem(cand.candidateId)}
                      >
                        <strong>{cand.candidateId}</strong>
                        <span className="run-state">{cand.state}</span>
                        <small>{cand.fileCount} ファイル ({cand.totalBytes} B)</small>
                      </button>
                    ))}
                  </div>

                  {candidateInspection && selectedCandidateId === candidateInspection.summary.candidateId && (
                    <div style={{ marginTop: '12px' }}>
                      <dl className="detail-grid">
                        <div><dt>Candidate ID</dt><dd>{candidateInspection.summary.candidateId}</dd></div>
                        <div><dt>State</dt><dd><strong>{candidateInspection.state}</strong></dd></div>
                        <div><dt>Candidate Hash</dt><dd><small>{candidateInspection.summary.candidateHash}</small></dd></div>
                        <div><dt>Parent Run ID</dt><dd>{candidateInspection.binding.parentRunId}</dd></div>
                      </dl>

                      <h4>候補ファイル一覧 ({candidateInspection.candidate.files.length}件)</h4>
                      {candidateInspection.candidate.files.map((file) => (
                        <div key={file.relativePath} style={{ marginBottom: '8px' }}>
                          <p><strong>{file.relativePath}</strong> <small>(hash: {file.contentHash.slice(0, 16)}...)</small></p>
                          <pre className="frontdoor-json" style={{ maxHeight: '160px', overflow: 'auto' }}>{file.content}</pre>
                        </div>
                      ))}

                      {candidateInspection.state === 'owner-review' && (
                        <div className="frontdoor-action-group" style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            className="text-button"
                            disabled={!canOwnerAct}
                            onClick={() => void runAction(async () => {
                              const res = await window.adfFrontdoor.reviewCandidate({
                                candidateId: candidateInspection.summary.candidateId,
                                decision: 'accept',
                                approvedBy: approvedBy.trim(),
                                targetHash: candidateInspection.targetHash,
                                note: note.trim() || undefined
                              })
                              if (res.ok) void refreshCandidates()
                              return res
                            })}
                          >
                            採用承認 (Accept)
                          </button>
                          <button
                            type="button"
                            className="text-button text-button-danger"
                            disabled={!canOwnerAct}
                            onClick={() => void runAction(async () => {
                              const res = await window.adfFrontdoor.reviewCandidate({
                                candidateId: candidateInspection.summary.candidateId,
                                decision: 'reject',
                                approvedBy: approvedBy.trim(),
                                targetHash: candidateInspection.targetHash,
                                note: note.trim() || undefined
                              })
                              if (res.ok) void refreshCandidates()
                              return res
                            })}
                          >
                            不採用 (Reject)
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            disabled={!canOwnerAct}
                            onClick={() => void runAction(async () => {
                              const res = await window.adfFrontdoor.reviewCandidate({
                                candidateId: candidateInspection.summary.candidateId,
                                decision: 'follow-up',
                                approvedBy: approvedBy.trim(),
                                targetHash: candidateInspection.targetHash,
                                note: note.trim() || undefined
                              })
                              if (res.ok) void refreshCandidates()
                              return res
                            })}
                          >
                            再提案要求 (Follow-up)
                          </button>
                        </div>
                      )}

                      {['accepted', 'rejected', 'follow-up'].includes(candidateInspection.state) && (
                        <p className="turn-refs" style={{ marginTop: '8px' }}>
                          この Candidate は終端状態 (<strong>{candidateInspection.state}</strong>) に達しました。修正・再提案は新しい Candidate ID で管理されます。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

      </div>
    </section>
  )
}
