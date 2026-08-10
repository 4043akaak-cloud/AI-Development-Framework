import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ConversationThread, OwnerAction, ThreadState, ThreadSummary } from '../../shared/threadTypes'

const stateCopy: Record<ThreadState, string> = {
  open: '送信可能',
  'awaiting-owner': 'Owner判断待ち',
  stopped: '停止',
  approved: '承認済み',
  completed: '完了・次Taskへ',
  failed: '失敗'
}

type DecisionAction = Exclude<OwnerAction, 'continue'>

/** Mirrors the Thread transition table, so the UI never offers an action the Relay would reject. */
const allowedDecisions: Record<ThreadState, readonly DecisionAction[]> = {
  open: ['stop'],
  'awaiting-owner': ['stop', 'approve'],
  approved: ['next-task', 'stop'],
  stopped: [],
  completed: [],
  failed: []
}

const decisionLabels: Record<DecisionAction, string> = {
  stop: '停止',
  approve: 'Resultを承認',
  'next-task': '次Task化して完了'
}

type RelayCall<T> = () => Promise<{ ok: true; value: T } | { ok: false; error: string }>

export default function ThreadPanel(): JSX.Element {
  const [approvedTaskIds, setApprovedTaskIds] = useState<string[]>([])
  const [summaries, setSummaries] = useState<ThreadSummary[]>([])
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const [threads, approved] = await Promise.all([window.adfRelay.listThreads(), window.adfRelay.listApprovedTaskIds()])
    if (threads.ok) setSummaries(threads.value)
    else setMessage(threads.error)
    if (approved.ok) setApprovedTaskIds(approved.value)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (call: RelayCall<ConversationThread>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const result = await call()
    if (result.ok) setThread(result.value)
    else setMessage(result.error)
    await refresh()
    setBusy(false)
  }

  const belowLimit = thread ? thread.turns.length < thread.maxTurns : false
  const canSendFirst = thread?.state === 'open' && belowLimit
  const canContinue = thread?.state === 'awaiting-owner' && belowLimit
  const decisions = thread ? allowedDecisions[thread.state] : []
  const hasEvidence = thread ? thread.turns.some((turn) => turn.resultEnvelopeRef && (turn.status === 'success' || turn.status === 'partial')) : false

  return (
    <section className="thread-panel" aria-label="ADF Conversation Thread">
      <div className="thread-heading">
        <div>
          <p className="eyebrow">LOCAL CONVERSATION THREAD · FAKE ADAPTERS</p>
          <h2>ADF上のAI議論</h2>
          <p>Threadは承認済みTask Packetからのみ開始できます。外部AIへの送信、認証、課金は行いません。GitHubとObsidianの正本は自動更新しません。</p>
        </div>
      </div>

      <div className="approved-tasks" aria-label="承認済みTask">
        <h3>承認済みTaskからThreadを開始</h3>
        {approvedTaskIds.length === 0 && <p className="lane-empty">承認済みTask Packetがありません。Ownerが <code>approved-tasks/&lt;taskId&gt;.json</code> を配置してください。</p>}
        {approvedTaskIds.map((taskId) => (
          <button key={taskId} type="button" className="text-button" disabled={busy} onClick={() => void run(() => window.adfRelay.startThread(taskId))}>
            {taskId} でThreadを開始 / 開く
          </button>
        ))}
      </div>

      {message && <p className="failure" role="status">{message}</p>}

      <div className="thread-layout">
        <aside className="thread-list" aria-label="Thread一覧">
          <h3>Thread一覧</h3>
          {summaries.length === 0 && <p className="lane-empty">Threadがまだありません。</p>}
          {summaries.map((summary) => (
            <button
              key={summary.threadId}
              type="button"
              className={`thread-list-item ${thread?.threadId === summary.threadId ? 'selected' : ''}`}
              onClick={() => void run(() => window.adfRelay.getThread(summary.threadId))}
            >
              <span className="card-id">{summary.taskId}</span>
              <span className="card-objective">{summary.title}</span>
              <span className="card-status">{stateCopy[summary.state]} · {summary.turnCount}/{summary.maxTurns} Turn</span>
              {summary.ownerActionRequired && <span className="freshness stale">Owner判断待ち</span>}
            </button>
          ))}
        </aside>

        <div className="thread-detail">
          {!thread && <p className="lane-empty">Threadを選択すると、Turnの時系列とOwner操作を表示します。</p>}
          {thread && (
            <>
              <dl className="detail-grid">
                <div><dt>Thread</dt><dd>{thread.title}</dd></div>
                <div><dt>Task ID</dt><dd>{thread.taskId}</dd></div>
                <div><dt>状態</dt><dd>{stateCopy[thread.state]}{thread.stopReason ? ` · ${thread.stopReason}` : ''}</dd></div>
                <div><dt>Approval</dt><dd>{thread.approvalId}</dd></div>
                <div><dt>Turn</dt><dd>{thread.turns.length} / {thread.maxTurns}</dd></div>
                <div><dt>Job（ACK済み）</dt><dd>jobs/{thread.jobId}/</dd></div>
                <div><dt>Ledger / Evidence</dt><dd>threads/{thread.threadId}/thread.json · evidence-links.json</dd></div>
              </dl>

              <div className="owner-actions" aria-label="Owner操作">
                {canSendFirst && (
                  <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => window.adfRelay.sendFirstTurn(thread.threadId))}>
                    最初のAIへ送信
                  </button>
                )}
                {canContinue && (
                  <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => window.adfRelay.continueThread(thread.threadId))}>
                    継続（承認して次のAIへ送信）
                  </button>
                )}
                {decisions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="text-button"
                    disabled={busy || (action === 'approve' && !hasEvidence)}
                    title={action === 'approve' && !hasEvidence ? '検証済みResult Envelopeを持つTurnがまだありません' : undefined}
                    onClick={() => void run(() => window.adfRelay.decideThread(thread.threadId, action))}
                  >
                    {decisionLabels[action]}
                  </button>
                ))}
                {decisions.length === 0 && !canSendFirst && !canContinue && <small className="turn-refs">このThreadは終端状態です。Owner操作はありません。</small>}
              </div>

              {thread.turns.length === 0 && <p className="lane-empty">まだ発言がありません。「次のAIへ送信」でProposal役から開始します。</p>}
              <ol className="turn-list" aria-label="Turnの時系列">
                {thread.turns.map((turn) => (
                  <li key={turn.turnId} className={`turn-card turn-${turn.role}`}>
                    <div className="turn-meta">
                      <strong>{turn.adapterId}</strong>
                      <span>{turn.role} · Turn {turn.sequence + 1} · {turn.status}</span>
                      <small>{turn.createdAt}</small>
                    </div>
                    <p className="turn-content">{turn.content}</p>
                    <small className="turn-refs">
                      {turn.respondsToTurnId ? `返信先: ${turn.respondsToTurnId}` : '起点Turn'}
                      {turn.resultEnvelopeRef ? ` · Result: ${turn.resultEnvelopeRef}` : ''}
                      {turn.errorRef ? ` · Error: ${turn.errorRef}` : ''}
                    </small>
                  </li>
                ))}
              </ol>

              {thread.ownerDecisions.length > 0 && (
                <section className="owner-log">
                  <h3>Owner判断の履歴</h3>
                  <ul>
                    {thread.ownerDecisions.map((decision, index) => (
                      <li key={`${decision.decidedAt}-${index}`}>{decision.action} · {decision.decidedAt}{decision.note ? ` · ${decision.note}` : ''}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
