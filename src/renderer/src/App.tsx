import { useEffect, useMemo, useState, type JSX } from 'react'
import type { BoardCard, BoardLane, SnapshotState } from '../../shared/boardTypes'
import { artifactSnapshot, adapterSnapshot, grantSnapshot, integrationGateSnapshot, jobSnapshot } from './data/foundationSnapshot'
import { boardSnapshot } from './data/boardSnapshot'
import { registeredProjectFor, registeredProjects } from '../../shared/projectRegistry'
import { isLiveArtifactOpenable, liveLaneCounts, projectLiveBoard, type LiveBoardEntry } from './boardProjection'
import type { LiveArtifactInspection } from '../../shared/liveArtifactTypes'
import ThreadPanel from './ThreadPanel'
import FrontdoorPanel from './FrontdoorPanel'
import './styles.css'

const lanes: ReadonlyArray<{ id: BoardLane; label: string }> = [
  { id: 'context-plan', label: 'Context・Plan' },
  { id: 'waiting-approval', label: '承認待ち' },
  { id: 'implementing', label: '実装中' },
  { id: 'verifying-review', label: '検証・レビュー' },
  { id: 'done', label: '完了' },
  { id: 'blocked', label: 'Blocked' }
]

const stateCopy: Record<SnapshotState, string> = {
  Current: '照合済み',
  Stale: '要再照合',
  Broken: '参照不可',
  Unconfirmed: '未確認'
}

function SourceButton({ label, sourceId }: { label: string; sourceId: string }): JSX.Element {
  const [result, setResult] = useState<string | undefined>()

  const open = async (): Promise<void> => {
    const response = await window.adfBoard.openCanonicalSource(sourceId)
    setResult(response.ok ? '開きました' : `開けません: ${response.reason}`)
  }

  return (
    <span className="source-action">
      <button type="button" className="text-button" onClick={() => void open()}>{label}</button>
      {result && <small className={result === '開きました' ? 'success' : 'failure'}>{result}</small>}
    </span>
  )
}

function LiveCard({ entry, selected, onOpen }: { entry: LiveBoardEntry; selected: boolean; onOpen: () => void }): JSX.Element {
  const openable = isLiveArtifactOpenable(entry)
  const body = (
    <>
      <span className="card-id">{entry.taskId}</span>
      <span className="card-objective">{entry.title}</span>
      <span className="card-status">状態: {entry.statusLabel}</span>
      {entry.kind === 'thread' && <span className="card-status">Turn: {entry.turnCount} / {entry.maxTurns}</span>}
      <div className="live-badges">
        {entry.ownerActionRequired && <span className="live-badge owner-action">Owner確認待ち</span>}
        {entry.recoveryRequired && <span className="live-badge recovery">Recovery</span>}
      </div>
      {entry.updatedAt && <small className="turn-refs">更新: {entry.updatedAt}</small>}
      {openable && <span className="live-artifact-cta">成果物を確認</span>}
    </>
  )
  if (!openable) return <div className="task-card live-card" aria-label={`${entry.taskId} (${entry.statusLabel})`}>{body}</div>
  return <button type="button" className={`task-card live-card live-card-action ${selected ? 'selected' : ''}`} aria-label={`${entry.taskId} の成果物を確認`} aria-pressed={selected} onClick={onOpen}>{body}</button>
}

function artifactStatusCopy(status: string): string {
  switch (status) {
    case 'available': return '確認済み'
    case 'broken': return 'Broken（参照不可）'
    case 'not-generated': return '未生成'
    default: return '対象外'
  }
}

function LiveArtifactPanel({ threadId, onClose }: { threadId: string; onClose: () => void }): JSX.Element {
  const [inspection, setInspection] = useState<LiveArtifactInspection | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setInspection(null)
    setError(null)
    void window.adfRelay.inspectLiveArtifacts(threadId).then((result) => {
      if (!active) return
      if (result.ok) setInspection(result.value)
      else setError(result.error)
    })
    return () => { active = false }
  }, [threadId])

  return (
    <section className="live-artifact-panel" aria-label="完了Threadの成果物" aria-live="polite">
      <div className="thread-heading">
        <div>
          <p className="eyebrow">EVIDENCE PLANE · READ ONLY</p>
          <h3>成果物を確認</h3>
          <p>ResultとEvidenceはMain側でThread・Job・hashを検証してから表示しています。ここから承認・送信・Export・正本書込みは行いません。</p>
        </div>
        <button type="button" className="text-button" onClick={onClose}>閉じる</button>
      </div>
      {error && <p className="failure" role="alert">成果物を読み込めませんでした: {error}</p>}
      {!inspection && !error && <p className="lane-empty">成果物を検証中…</p>}
      {inspection && (
        <>
          <dl className="detail-grid">
            <div><dt>Task</dt><dd>{inspection.taskId}</dd></div>
            <div><dt>Thread</dt><dd>{inspection.threadId}</dd></div>
            <div><dt>Job</dt><dd>{inspection.jobId}</dd></div>
          </dl>
          <section className="live-artifact-section" aria-label="Result Envelope">
            <h4>Result Envelope</h4>
            {inspection.results.length === 0 && <p className="lane-empty">Resultはまだありません。</p>}
            {inspection.results.map((result) => (
              <article key={result.turnId} className={`live-artifact-card ${result.artifactStatus}`}>
                <div className="turn-meta"><strong>{result.role}</strong><span>{result.adapterId}</span><small>{artifactStatusCopy(result.artifactStatus)} · {result.status}</small></div>
                <small className="turn-refs">Turn {result.turnId} · {result.reference} · hash {result.hash ?? '検証不可'}</small>
                {result.summary && <p className="turn-content"><strong>要約：</strong>{result.summary}</p>}
                {result.content && <pre className="live-artifact-content">{result.content}</pre>}
                {result.verification && result.verification.length > 0 && <ul className="live-artifact-list">{result.verification.map((check) => <li key={check.name}>{check.status === 'pass' ? '✓' : check.status === 'fail' ? '×' : '○'} {check.name}{check.reason ? ` — ${check.reason}` : ''}</li>)}</ul>}
                {result.risks && result.risks.length > 0 && <p className="turn-refs"><strong>Risk：</strong>{result.risks.join(' · ')}</p>}
                {result.issue && <p className="failure">{result.issue}</p>}
              </article>
            ))}
          </section>
          <section className="live-artifact-section" aria-label="Evidence">
            <h4>Evidence</h4>
            <article className={`live-artifact-card ${inspection.evidence.artifactStatus}`}>
              <strong>{artifactStatusCopy(inspection.evidence.artifactStatus)}</strong>
              <small className="turn-refs">{inspection.evidence.reference} · {inspection.evidence.turnCount} Turn · hash {inspection.evidence.hash ?? '検証不可'}</small>
              {inspection.evidence.issue && <p className="failure">{inspection.evidence.issue}</p>}
            </article>
          </section>
          <section className="live-artifact-section" aria-label="Work Plane">
            <h4>Work Plane</h4>
            <article className="live-artifact-card"><strong>{artifactStatusCopy(inspection.workPlane.artifactStatus)}</strong><p className="turn-refs">{inspection.workPlane.note}</p></article>
          </section>
        </>
      )}
    </section>
  )
}

function Card({ card, selected, onSelect }: { card: BoardCard; selected: boolean; onSelect: () => void }): JSX.Element {
  const project = registeredProjectFor(card.projectId)
  return (
    <button type="button" className={`task-card ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <span className="card-id">{card.id}</span>
      <span className="card-project">{project?.name ?? card.projectId}</span>
      <span className="card-objective">{card.objective}</span>
      <span className="card-status">正式状態: {card.lifecycleStatus}</span>
      <span className={`freshness ${card.snapshotState.toLowerCase()}`}>{stateCopy[card.snapshotState]}</span>
    </button>
  )
}

export default function App(): JSX.Element {
  const [selectedId, setSelectedId] = useState(boardSnapshot[0]?.id ?? '')
  const selected = boardSnapshot.find((card) => card.id === selectedId)
  const actionCards = useMemo(() => boardSnapshot.filter((card) => card.boardLane === 'waiting-approval' || card.boardLane === 'blocked' || card.boardLane === 'verifying-review'), [])
  const selectedProject = registeredProjectFor(selected?.projectId ?? '')

  // Live Board state. Independent from the Legacy Snapshot above: fetched from the Runtime Ledger
  // via the existing read-only relay IPC, never merged into the Legacy Snapshot's own lane counts.
  const [liveEntries, setLiveEntries] = useState<LiveBoardEntry[] | null>(null)
  const [selectedLiveThreadId, setSelectedLiveThreadId] = useState<string | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)

  const refreshLiveBoard = async (): Promise<void> => {
    setLiveLoading(true)
    const [threadsResult, tasksResult] = await Promise.all([window.adfRelay.listThreads(), window.adfRelay.listApprovedTaskIds()])
    if (!threadsResult.ok) {
      setLiveError(threadsResult.error)
      setLiveLoading(false)
      return
    }
    if (!tasksResult.ok) {
      setLiveError(tasksResult.error)
      setLiveLoading(false)
      return
    }
    setLiveError(null)
    setLiveEntries(projectLiveBoard(threadsResult.value, tasksResult.value))
    setLiveLoading(false)
  }

  // Loads once on startup. No automatic polling — the Owner refreshes explicitly.
  useEffect(() => {
    void refreshLiveBoard()
  }, [])

  const liveCounts = useMemo(() => liveLaneCounts(liveEntries ?? []), [liveEntries])
  const liveOwnerActionCount = (liveEntries ?? []).filter((entry) => entry.ownerActionRequired).length
  const liveRecoveryCount = (liveEntries ?? []).filter((entry) => entry.recoveryRequired).length

  if (!selected) return <main className="empty-state">表示できるTaskスナップショットがありません。</main>

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">LOCAL · READ ONLY · REGISTERED PROJECT SNAPSHOT</p>
          <h1>ADF Task Board</h1>
          <p>表示は手動確認済みの派生スナップショットです。承認・正本更新はこの画面から行いません。</p>
          <div className="project-summary" aria-label="登録プロジェクト">
            {registeredProjects.map((project) => <span key={project.id}>{project.name} · {boardSnapshot.filter((card) => card.projectId === project.id).length} Task</span>)}
          </div>
        </div>
        <section className="decision-queue" aria-label="判断とリスクキュー">
          <span>判断・リスクキュー</span>
          <strong>{actionCards.length}件</strong>
          <small>{actionCards.length === 0 ? '現在、表示中の承認待ち・Blocked・検証中Taskはありません' : '正本Taskで判断してください'}</small>
        </section>
      </header>

      <section className="live-board" aria-label="Live Board">
        <div className="thread-heading">
          <div>
            <p className="eyebrow">LIVE · RUNTIME LEDGER · READ ONLY</p>
            <h2>Live Board（Thread実行状態）</h2>
            <p>ADF Runtime LedgerのThread / 承認済みTask状態を読み取り専用で表示します。承認・停止・継続・Packet書込みはこの画面から行いません。件数はLegacy Snapshotとは別集計です。</p>
          </div>
          <button type="button" className="text-button" disabled={liveLoading} onClick={() => void refreshLiveBoard()}>
            {liveLoading ? '更新中…' : 'Refresh'}
          </button>
        </div>

        {liveError && <p className="failure" role="alert">Live Boardを読み込めませんでした: {liveError}</p>}

        {!liveError && liveEntries !== null && (
          <p className="turn-refs">
            Owner確認待ち {liveOwnerActionCount}件 · Recovery {liveRecoveryCount}件 · 合計 {liveEntries.length}件
          </p>
        )}

        {!liveError && liveEntries !== null && liveEntries.length === 0 && (
          <p className="lane-empty">Threadも承認済みTaskもまだありません（Runtime Ledgerは空です）。</p>
        )}

        {!liveError && liveEntries !== null && liveEntries.length > 0 && (
          <div className="board">
            {lanes.map((lane) => {
              const entries = liveEntries.filter((entry) => entry.lane === lane.id)
              return (
                <section key={lane.id} className="lane">
                  <h2>{lane.label}<span>{liveCounts[lane.id]}</span></h2>
                  <div className="lane-cards">
                    {entries.length === 0 ? <p className="lane-empty">対象なし</p> : entries.map((entry) => <LiveCard key={entry.threadId ?? entry.taskId} entry={entry} selected={entry.threadId === selectedLiveThreadId} onOpen={() => setSelectedLiveThreadId(entry.threadId ?? null)} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        {selectedLiveThreadId && <LiveArtifactPanel threadId={selectedLiveThreadId} onClose={() => setSelectedLiveThreadId(null)} />}
      </section>

      <FrontdoorPanel />

      <section className="legacy-board-wrapper" aria-label="Legacy Snapshot">
        <div className="thread-heading">
          <div>
            <p className="eyebrow">LEGACY · STATIC SNAPSHOT</p>
            <h2>Legacy Snapshot</h2>
            <p>手作業で確認・更新される固定Snapshotです。現在のThread状態は表しません。上のLive Boardとは別集計で、自動書き換え・自動同期は行いません。</p>
          </div>
        </div>
        <section className="board" aria-label="Legacy Task Board">
          {lanes.map((lane) => {
            const cards = boardSnapshot.filter((card) => card.boardLane === lane.id)
            return (
              <section key={lane.id} className="lane">
                <h2>{lane.label}<span>{cards.length}</span></h2>
                <div className="lane-cards">
                  {cards.length === 0 ? <p className="lane-empty">対象なし</p> : cards.map((card) => <Card key={card.id} card={card} selected={card.id === selected.id} onSelect={() => setSelectedId(card.id)} />)}
                </div>
              </section>
            )
          })}
        </section>
      </section>

      <section className="focus-panel" aria-label="選択Taskの詳細">
        <div className="focus-heading">
          <div>
            <p className="eyebrow">FOCUS</p>
            <h2>{selected.id}</h2>
            <p>{selected.objective}</p>
          </div>
          <span className={`freshness ${selected.snapshotState.toLowerCase()}`}>{stateCopy[selected.snapshotState]} · {selected.lastConfirmed} · {selected.confirmedBy}</span>
        </div>
        <dl className="detail-grid">
          <div><dt>正式Lifecycle</dt><dd>{selected.lifecycleStatus}</dd></div>
          <div><dt>Project</dt><dd>{selectedProject?.name ?? selected.projectId}</dd></div>
          <div><dt>Owner / Role</dt><dd>{selected.owner} / {selected.role}</dd></div>
          <div><dt>今判断すべきこと</dt><dd>{selected.ownerDecision}</dd></div>
          <div><dt>Risk / Blocker</dt><dd>{selected.riskOrBlocker}</dd></div>
          <div><dt>Stop condition</dt><dd>{selected.stopCondition}</dd></div>
          <div><dt>次の安全な一手</dt><dd>{selected.nextSafeAction}</dd></div>
        </dl>
        <section className="sources">
          <h3>正本とEvidence</h3>
          <div className="source-list">
            <SourceButton label="GitHub Task（ローカル正本）" sourceId={selected.taskSourceId} />
            {selected.contextSourceIds.map((sourceId, index) => <SourceButton key={sourceId} label={`Required Obsidian Context ${index + 1}`} sourceId={sourceId} />)}
            {selected.evidence.map((evidence) => <SourceButton key={evidence.sourceId} label={evidence.label} sourceId={evidence.sourceId} />)}
          </div>
        </section>
      </section>

      <ThreadPanel />

      <section className="foundation-panel" aria-label="Control Plane Snapshot">
        <div className="foundation-heading"><div><p className="eyebrow">CONTROL PLANE SNAPSHOT</p><h2>表示専用の共通管制基盤</h2><p>Grant、Job、Artifact、Gateは手動確認済みの派生表示です。この画面は承認、実行、取消、送信、書込みを行いません。</p></div><span className="read-only-badge">権限付与なし</span></div>
        <div className="foundation-grid">
          <section><h3>Adapter Registry</h3>{adapterSnapshot.map((adapter) => <p key={adapter.id}><strong>{adapter.name}</strong><br /><small>{adapter.connection} · {adapter.status} · {adapter.dataClassification}</small></p>)}</section>
          <section><h3>Capability Grant</h3>{grantSnapshot.map((grant) => <p key={grant.id}><strong>{grant.state}</strong><br /><small>{grant.taskId} · {grant.capabilities.join(', ')} · {grant.note}</small></p>)}</section>
          <section><h3>Job / Stop</h3>{jobSnapshot.map((job) => <p key={job.id}><strong>{job.id}</strong><br /><small>{job.state} · {job.stopReason}</small></p>)}</section>
        </div>
        <section className="artifact-compare"><h3>Artifact Compare</h3>{artifactSnapshot.map((artifact) => <div key={artifact.id} className="artifact-card"><strong>{artifact.id}</strong><span>{artifact.taskId} · input {artifact.inputHash}</span><small>{artifact.type} · {artifact.verification}</small><SourceButton label="Evidenceを開く" sourceId={artifact.sourceId} /></div>)}</section>
        {integrationGateSnapshot.map((gate) => <section key={gate.taskId} className="integration-gate"><h3>Integration Gate · {gate.taskId}</h3><p><strong>{gate.state}</strong> — {gate.ownerDecision}</p><ul>{gate.checks.map((check) => <li key={check.label} className={check.complete ? 'check-complete' : 'check-missing'}>{check.complete ? '✓' : '○'} {check.label}</li>)}</ul><small>停止条件: {gate.stopCondition}</small></section>)}
      </section>
    </main>
  )
}
