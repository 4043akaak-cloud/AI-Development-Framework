import { useEffect, useMemo, useState, type JSX } from 'react'
import type { BoardCard, BoardLane, SnapshotState } from '../../shared/boardTypes'
import { artifactSnapshot, adapterSnapshot, grantSnapshot, integrationGateSnapshot, jobSnapshot } from './data/foundationSnapshot'
import { boardSnapshot } from './data/boardSnapshot'
import { registeredProjectFor, registeredProjects } from '../../shared/projectRegistry'
import { liveLaneCounts, projectLiveBoard, type LiveBoardEntry } from './boardProjection'
import ThreadPanel from './ThreadPanel'
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

function LiveCard({ entry }: { entry: LiveBoardEntry }): JSX.Element {
  return (
    <div className="task-card live-card" aria-label={`${entry.taskId} (${entry.statusLabel})`}>
      <span className="card-id">{entry.taskId}</span>
      <span className="card-objective">{entry.title}</span>
      <span className="card-status">状態: {entry.statusLabel}</span>
      {entry.kind === 'thread' && <span className="card-status">Turn: {entry.turnCount} / {entry.maxTurns}</span>}
      <div className="live-badges">
        {entry.ownerActionRequired && <span className="live-badge owner-action">Owner確認待ち</span>}
        {entry.recoveryRequired && <span className="live-badge recovery">Recovery</span>}
      </div>
      {entry.updatedAt && <small className="turn-refs">更新: {entry.updatedAt}</small>}
    </div>
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
                    {entries.length === 0 ? <p className="lane-empty">対象なし</p> : entries.map((entry) => <LiveCard key={entry.threadId ?? entry.taskId} entry={entry} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>

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
