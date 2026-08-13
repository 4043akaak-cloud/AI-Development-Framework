import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ConversationThread, OwnerAction, RecoveryAction, RecoveryReason, ThreadState, ThreadSummary } from '../../shared/threadTypes'
import type { ExternalPreflight } from '../../shared/externalAdapterTypes'

const externalAdapterId = 'claude-external'

const stateCopy: Record<ThreadState, string> = {
  open: '送信可能',
  'awaiting-owner': 'Owner判断待ち',
  'recovery-needed': '要復旧',
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
  // Recovery has its own three actions; the ordinary decisions are refused in this state.
  'recovery-needed': [],
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

const recoveryReasonCopy: Record<RecoveryReason, string> = {
  'answer-unavailable': 'Adapterは受理したが、回答を取得できない（Case A）',
  'send-unconfirmed': 'Adapterへ届いたか確認できない（Case B）'
}

const recoveryActions: ReadonlyArray<{ action: RecoveryAction; label: string }> = [
  { action: 'resend', label: '再送（同じ順番・新しいdispatch）' },
  { action: 'record-failure', label: '失敗として記録' },
  { action: 'stop', label: 'Threadを停止' }
]

type RelayCall<T> = () => Promise<{ ok: true; value: T } | { ok: false; error: string }>

export default function ThreadPanel(): JSX.Element {
  const [approvedTaskIds, setApprovedTaskIds] = useState<string[]>([])
  const [summaries, setSummaries] = useState<ThreadSummary[]>([])
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preflight, setPreflight] = useState<ExternalPreflight | null>(null)
  const [inFlight, setInFlight] = useState(false)

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
  const inRecovery = thread?.state === 'recovery-needed'
  const canSendFirst = thread?.state === 'open' && belowLimit
  const canContinue = thread?.state === 'awaiting-owner' && belowLimit
  const decisions = thread ? allowedDecisions[thread.state] : []
  const recovery = thread?.recovery
  const expired = Boolean(recovery?.expiresAt && new Date(recovery.expiresAt).getTime() < Date.now())

  const runPreflight = async (): Promise<void> => {
    if (!thread) return
    setBusy(true)
    const result = await window.adfRelay.preflightExternal(thread.threadId, externalAdapterId)
    setPreflight(result.ok ? result.value : null)
    if (!result.ok) setMessage(result.error)
    setBusy(false)
  }

  const runExternalSend = async (): Promise<void> => {
    if (!thread) return
    setBusy(true)
    setMessage(null)
    // Poll while the send is open so the cancel button reflects the real in-flight state.
    const poll = setInterval(() => void window.adfRelay.externalSendState(thread.threadId).then((s) => setInFlight(s.ok && s.value.inFlight)), 250)
    const result = await window.adfRelay.sendExternal(thread.threadId, externalAdapterId)
    clearInterval(poll)
    setInFlight(false)
    if (result.ok) setThread(result.value)
    else setMessage(result.error)
    await Promise.all([refresh(), runPreflight()])
    setBusy(false)
  }
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
              {summary.recoveryRequired && <span className="freshness broken">要復旧{summary.recoveryReason === 'send-unconfirmed' ? '（Case B）' : '（Case A）'}</span>}
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

              {inRecovery && recovery && (
                <section className="recovery-panel" aria-label="復旧が必要なThread">
                  <h3>復旧が必要です（{recovery.reason === 'answer-unavailable' ? 'Case A' : 'Case B'}）</h3>
                  <p className="turn-content">{recoveryReasonCopy[recovery.reason]}</p>
                  <dl className="detail-grid">
                    <div><dt>対象Turn</dt><dd>{recovery.sequence + 1}（sequence {recovery.sequence}）</dd></div>
                    <div><dt>Adapter</dt><dd>{recovery.adapterId} / {recovery.role}</dd></div>
                    <div><dt>dispatchId</dt><dd>{recovery.dispatchId}</dd></div>
                    <div><dt>attempt</dt><dd>{recovery.attempt}</dd></div>
                    <div><dt>送信時刻</dt><dd>{recovery.sentAt}</dd></div>
                    <div><dt>期限</dt><dd>{recovery.expiresAt ?? '記録なし'}{expired ? ' · 期限超過' : ''}</dd></div>
                    <div><dt>検出時刻</dt><dd>{recovery.detectedAt}</dd></div>
                    {recovery.probeError && <div><dt>Adapter応答エラー</dt><dd>{recovery.probeError}</dd></div>}
                  </dl>
                  <p className="turn-refs">期限超過は表示のみです。ADFは自動で再送・失敗記録・停止を行いません。</p>
                  <div className="owner-actions" aria-label="復旧操作">
                    {recoveryActions.map((entry) => (
                      <button key={entry.action} type="button" className="text-button" disabled={busy} onClick={() => void run(() => window.adfRelay.recoverThread(thread.threadId, entry.action))}>
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

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
                {decisions.length === 0 && !canSendFirst && !canContinue && !inRecovery && <small className="turn-refs">このThreadは終端状態です。Owner操作はありません。</small>}
              </div>

              <section className="external-panel" aria-label="外部AI Adapter">
                <div className="thread-heading">
                  <div>
                    <p className="eyebrow">EXTERNAL ADAPTER · OWNER APPROVAL REQUIRED</p>
                    <h3>外部AIへの送信</h3>
                    <p className="turn-refs">送信できるのは合成Packetだけです。承認ファイルはこの画面からは作成できません。Ownerが直接配置してください。</p>
                  </div>
                  <button type="button" className="text-button" disabled={busy} onClick={() => void runPreflight()}>preflightを確認</button>
                </div>

                {!preflight && <p className="lane-empty">「preflightを確認」を押すと、送信前に照合される項目が表示されます。ネットワークへは接続しません。</p>}
                {preflight && (
                  <>
                    <dl className="detail-grid">
                      <div><dt>Adapter / role</dt><dd>{preflight.adapterId} / {preflight.role}</dd></div>
                      <div><dt>Provider / 接続</dt><dd>{preflight.provider} / {preflight.connection}</dd></div>
                      <div><dt>packetHash</dt><dd>{preflight.packetHash.slice(0, 24)}…</dd></div>
                      <div><dt>scopeHash</dt><dd>{preflight.scopeHash.slice(0, 24)}…</dd></div>
                      <div><dt>contextHash</dt><dd>{preflight.contextHash.slice(0, 24)}…</dd></div>
                      <div><dt>認証</dt><dd>{!preflight.credential.required ? '不要' : preflight.credential.present ? `設定済み（${preflight.credential.source}）` : `未設定（${preflight.credential.source}）`}</dd></div>
                      <div><dt>承認</dt><dd>{preflight.approvalId ?? '未配置'}</dd></div>
                      <div><dt>有効期限</dt><dd>{preflight.expiresAt ?? '—'}</dd></div>
                      <div><dt>費用Tier</dt><dd>{preflight.costTier}</dd></div>
                      <div><dt>残り送信回数</dt><dd>{preflight.sendsRemaining}</dd></div>
                    </dl>
                    <ul className="preflight-checks">
                      {preflight.checks.map((check) => (
                        <li key={check.name} className={check.status === 'pass' ? 'check-complete' : 'check-missing'}>
                          {check.status === 'pass' ? '✓' : '○'} {check.name} — {check.detail}
                        </li>
                      ))}
                    </ul>
                    {!preflight.ok && (
                      <p className="failure" role="status">送信できません: {preflight.blockingReasons.join(' / ')}</p>
                    )}
                  </>
                )}

                <div className="owner-actions" aria-label="外部送信操作">
                  <button type="button" className="text-button" disabled={busy || !preflight?.ok || inFlight} title={preflight?.ok ? undefined : 'preflightがPassするまで送信できません'} onClick={() => void runExternalSend()}>
                    外部AIへ送信（Ownerの明示操作）
                  </button>
                  <button type="button" className="text-button" disabled={!inFlight} onClick={() => void window.adfRelay.cancelExternal(thread.threadId)}>
                    送信を中断
                  </button>
                  {inFlight && <small className="turn-refs">送信中…中断できます。</small>}
                </div>
              </section>

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
