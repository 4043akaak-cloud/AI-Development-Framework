# Task — ADF-RELAY-RECOVERY-001: pending dispatchの検出とOwner判断による復旧

> Type: Implementation
> Status: Done
> Owner: Claude Code
> Review AI: Project Owner（最終Review）
> Related: [Relay Recovery設計](../design/ADF_RELAY_RECOVERY.md) / [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md)

このTaskは `docs/workflow/TASK_LIFECYCLE.md` と `docs/workflow/AI_DELEGATION_CHARTER.md` に従う。設計承認、実装、検証、Project Ownerレビューまで完了している。

## 1. Objective

- なぜ今このTaskが必要か: `ADF-CONVERSATION-RELAY-001`のRelayは、Turn送信後・受信前にプロセスが終了すると、そのThreadが継続も停止も承認もできない状態で恒久停止する。公開APIにもUIにもpendingを解除する手段が無い。
- 達成したい結果: 起動時にpendingを検出して`recovery-needed`として提示し、Ownerが「再送」「失敗記録」「Thread停止」から選んで復旧できるようにする。
- 対象ユーザー: Project Owner。アプリを閉じた後に再開しても、会話が詰まったままにならない状態を得る。

## 2. Approval

- Approval required?: Yes
- 承認対象: 本Taskの設計、Scope、Thread状態`recovery-needed`の追加、Owner復旧操作3種、再送時のID方針、timeoutの表示限定運用。
- 承認者: Project Owner
- 承認記録: Project Ownerが2026-08-10に設計OKを明示し、実装担当をClaude Code、監視・検証・差分レビューをCodexとして実装を指示した。
- 実接続（外部AI、認証、課金、MCP）は本Taskの承認に含まれない。

## 3. Required Context

### GitHub

- [Relay Recovery設計](../design/ADF_RELAY_RECOVERY.md)
- [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md) / [ADF-JOB-LOOP-001](./ADF-JOB-LOOP-001.md) / [ADF-DISPATCH-ACK-001](./ADF-DISPATCH-ACK-001.md)
- [ADF Agent Adapter Contract](../design/ADF_AGENT_ADAPTER_CONTRACT.md) / [ADF Multi-AI Control Plane](../design/ADF_MULTI_AI_CONTROL_PLANE.md)
- [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)
- 開始時点のbranch: `codex/adf-pilot-governance`（`f8fb1c7`）

### Obsidian

| ノート | 採用する制約・判断 |
|---|---|
| `Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md` | ローカルRuntimeとファイルLedgerで足り、DB・ブローカー・常駐Workerは作らない。失敗時も構造化Resultを残し、チャットだけで終わらせない。app再起動後の孤児Job・重複dispatch・無限retryを0件にすることが成功条件である。 |

## 4. Scope

### In scope

- `adapter.send()`の**前**に`relay.dispatch-intent`を記録する。
- `adapter.send()`が例外を投げた場合、`relay.send-failed`（`sendError`は先頭200文字）を記録し、pendingは作らず、例外を呼び出し元へ再送出し、Threadは`open`のままとする。この記録はintentを解決済みにしない。
- `appendRecoveryTurn()`を追加する。`recovery-needed`から`status: 'failed'`かつ`errorRef`ありのTurnだけを追加でき、既存`appendTurn()`の`open`ガードは緩めない。順序・重複・親Turn hash・`maxTurns`の検証は両経路で共有する。
- pendingへの`expiresAt`付与と、経過時間・期限超過の**表示**。
- 起動時に全Threadを一度走査し、次の2区分を検出する。
  - Case A `answer-unavailable`: pendingあり、`getState`が`'ready'`以外または例外
  - Case B `send-unconfirmed`: intentあり・pendingなし・当該sequenceのTurnなし
- `getState`の例外は`'ready'`以外と同じ扱いとし、メッセージ先頭200文字を`probeError`へ記録して走査を継続する。
- Thread状態`recovery-needed`の追加と、Job Ledger側`recovery-needed`との同期。
- Ownerの復旧操作3種: 再送 / 失敗として記録 / Thread停止。
- `dispatchId`生成規則を`(threadId, sequence, adapterId, attempt)`へ変更し、永続化前に既存IDとの重複を検査する。
- 失敗記録の3ファイル出力: 失敗Turn / 検証済みResult Envelope（`terminationReason: recovery-failed`）/ `errors/<turnId>.json`。
- `thread-events.jsonl`への`relay.dispatch-intent` / `recovery.detected` / `recovery.resent` / `recovery.failed-recorded` / `recovery.stopped`の記録。
- `recovery-needed`のThreadを判別でき、停止理由と3操作だけを出すUI。
- 上記の単体テストと、プロセス終了・再起動を模した復旧テスト。

### Out of scope（別Task・別承認）

- 自動再送、自動リトライ、指数バックオフ、常駐Worker、バックグラウンド再開。
- DB、メッセージブローカー、並列Job、複数Threadの一括復旧。
- 外部AIへの実接続、認証、APIキー、外部送信、課金、MCP。
- 承認Packet作成導線の整備、計測・ログ基盤、配布用コード署名。
- Adapter契約（`send` / `getState` / `receive`）の変更。

### 触れてはいけない部分

- 既存のFake Adapter会話フローと、`ADF-JOB-LOOP-001` / `ADF-DISPATCH-ACK-001`の検証済み挙動。
- GitHub／Obsidian正本の自動更新。

## 5. Plan

| Step | 行うこと | 検証方法 | Reversible? |
|---|---|---|---|
| 1 | Thread状態`recovery-needed`と遷移規則を追加する | 遷移テスト、既存遷移の回帰 | Yes |
| 2 | `appendTurn()`の検証を共有化し、`appendRecoveryTurn()`を追加する | 両経路の受理・拒否テスト、既存`appendTurn`の回帰 | Yes |
| 3 | `dispatchId`生成規則に`attempt`を加え、重複検査を入れる | 同一sequence再送でIDが変わるテスト | Yes |
| 4 | `relay.dispatch-intent`の事前記録、`send`例外時の`relay.send-failed`、pendingの`expiresAt`を追加する | 単体テスト、例外Adapterでの状態確認 | Yes |
| 5 | 起動時走査でCase A / Case Bを検出する。`getState`例外も含む | pending残存・intent残存・例外Adapterの各フィクスチャ | Yes |
| 6 | 復旧操作3種と、失敗記録の3ファイル出力を実装する | 操作ごとの状態・ファイル・Envelope検証テスト | Yes |
| 7 | Job Ledgerの`recovery-needed`同期を追加する | Job状態テスト、遷移不能時のskip記録 | Yes |
| 8 | UIに復旧表示と3操作を追加する | 実機操作 | Yes |
| 9 | プロセス終了・再起動を含む実機検証 | 手動 | Yes |

### 代替案

- pendingを起動時に自動破棄する案は、Ownerが「AIは回答したのか」を判断できなくなるため不採用。
- pendingにAdapterの回答本体を保存する案は、外部AIの回答をADFが未承認のまま保持することになるため、本Taskでは不採用とする。

## 6. 受入条件

1. pending保存後に落として再起動しても（Case A）、Threadが恒久停止しない。
2. `adapter.send()`成功後・pending保存前に落として再起動しても（Case B）、送信を試みた事実がLedgerに残り、`recovery-needed`として提示される。
3. `getState`が例外を投げても起動処理が失敗せず、当該Threadは`recovery-needed`（`answer-unavailable`）になり、走査は次のThreadへ進む。`probeError`が記録され、秘密情報・スタックトレースは含まない。
4. `recovery-needed`のThreadがUI上で理由付きで判別できる。
5. 再送 / 失敗記録 / Thread停止の3操作がいずれも成立し、Ledgerに残る。
6. 同一`sequence`・同一Adapterで再送しても`dispatchId`が必ず変わり、旧`dispatchId`のHandleでは受信できない。重複が生じた場合は再送せず失敗する。
7. 失敗記録が、失敗Turn・検証済みResult Envelope・`errors/<turnId>.json`の3点を残し、Threadを`awaiting-owner`へ戻す。この`failed` Turnでは承認できない。
8. `appendRecoveryTurn()`は`recovery-needed`以外の状態、`failed`以外のstatus、`errorRef`なしのTurnをいずれも拒否する。`appendTurn()`は従来どおり`open`以外を拒否する。順序・重複turnId・親Turn hashの検証は両経路で同じく効く。
9. `adapter.send()`が例外を投げたとき、pendingが作られず、`relay.send-failed`が記録され、Threadは`open`のままで再試行できる。その`sequence`にTurnが生まれないまま再起動すると`send-unconfirmed`として検出される。同じ`sequence`にTurnが生まれていれば検出されない。
10. Owner操作なしに自動再送・自動失敗記録が起きない。期限超過は表示のみで状態を変えない。
11. `ADF-JOB-LOOP-001` / `ADF-DISPATCH-ACK-001` / `ADF-CONVERSATION-RELAY-001`の既存テストが回帰しない。特にAdapterが`failed`を返す通常経路がThreadを`failed`にする挙動は変わらない。
12. 外部送信、認証、APIキー、課金に該当するコードを追加しない。

## 7. リスクと停止条件

| 優先度 | 対象 | 方針 |
|---|---|---|
| A | `recovery-needed`追加による既存Thread遷移の破壊 | 追加のみとし、既存の許可遷移を減らさない。既存遷移テストの回帰を必須にする |
| A | 再送によるAdapter側の二重実行 | Fakeでは検出できない。冪等キーは外部Adapter接続Taskで扱うことを明記し、本Taskでは`attempt`と旧新`dispatchId`の記録に留める |
| A | `dispatchId`生成規則の変更 | 現行規則は`(threadId, sequence, adapterId)`の決定的hashであり、再送で同じIDになる。`attempt`を加える変更なしには要件を満たせない。既存Threadの記録済みIDは再計算しないため不整合は生じない |
| B | Case Bで外部AIに課金が発生していた可能性 | ADFは検出できない。Result Envelopeの`risks`に明記し、Ownerの判断材料として提示する |
| B | Job Ledger同期の遷移不能ケース | `job.state-skipped`として記録し、Threadを壊さない既存方針を踏襲する |
| C | timeout既定値 | 実測根拠が無いため暫定値とし、未検証事項に記録する |

次の場合は実装を継続せず`Waiting Approval`または`Blocked`へ戻す。

- Adapter契約の変更が必要になった場合。
- 既存の検証済み挙動を変えないと実装できない場合。
- 外部送信、認証、課金、新規依存が必要になった場合。

## 8. Implementation Log

| 日時 | 実施者 | 変更 | 逸脱・追加判断 |
|---|---|---|---|
| 2026-08-10 | Claude Code | 設計書とTask正本を作成 | Project Ownerの指示により、設計の正本化のみ |
| 2026-08-10 | Claude Code | Thread状態`recovery-needed`、`appendRecoveryTurn`、intent記録、send例外処理、attempt付dispatchId、起動時走査、復旧3操作、Job同期、UIを実装 | 下記「実装時に判明した設計の穴」を参照 |

### 実装時に判明した設計の穴と対応

同一Claude Code環境内の役割分離レビュー（実装範囲を越える権限は与えていない。独立した外部AIレビューではない）と、実行したテストで次を検出し、いずれも修正した。

| 検出 | 内容 | 対応 |
|---|---|---|
| Job遷移表の行き止まり | `contracts.ts`の`'recovery-needed': []`は終端で、同期後に再送も停止も`job.state-skipped`になる。Case Bでは`queued → recovery-needed`自体が不可 | `queued`へ`recovery-needed`を追加し、`'recovery-needed': ['running','cancelled','failed']`とした。既存の許可遷移は減らしていない |
| Case Bの親Turn参照欠落 | intentは`respondsTo*`を持たないため、sequence 1以降の失敗記録が「親Turn参照が必要」で失敗する | 失敗Turnの親参照を保存値ではなく記録時のThread（`lastTurn`）から導出する |
| `relay.send-failed`がintentを解決していた | 同イベントが`dispatchId`を持つため、settled集合に入りCase Bを検出できなかった（テストで検出） | `relay.send-failed`をsettled集合から除外。設計の「解決済みにしない」と一致させた |
| 承認ガードの順序 | `approve`でEvidence検証が復旧ガードより先に走り、誤ったエラーを返した（テストで検出） | 復旧ガードを先に評価する |
| 再送が二操作だった | 初版の`resendFromRecovery`は送信のみで、Ownerがもう一度受信操作を要した | `continueJobUnsafe`へ接続し、承認済みの「継続」と同じく一操作で完了させた |
| 再送後の再中断が未検出 | intentの解決判定をsequence単位にすると、再送後の同一sequenceが恒久的に解決済みになる | 判定を`dispatchId`単位へ変更した |
| 起動時走査とIPCの競合 | ハンドラ登録後にウィンドウを開くと、走査中にrendererが操作できる | `app.whenReady`を`async`にし、走査完了後に`createWindow()`する |

### 監視レビューで検出したP1（修正済み）

Codexの監視レビューで、`send-failed`後の同一sequence再送に関する誤検出を1件指摘された。

- **内容**: intentの解決判定をdispatchId単位のみで行っていたため、`relay.send-failed`で終わった古いattemptのintentが永久に未解決のまま残る。同一sequenceの後続attemptが成功しても古いintentは解消されず、Threadが`open`のまま再起動した場合に、解決済みのsequenceを`send-unconfirmed`として誤検出しうる。
- **再現経路**: `send-failed` → セッション内で再送成功 → Ownerが`continue`してThreadが`open`になった直後に終了 → 再起動走査で古いintentを拾う。
- **修正**: sequenceごとに**最新attemptのintentだけ**を判定対象にした。同一sequenceの古いattemptは、後続attemptに置き換えられた履歴として扱う。最新attempt内の解決判定は従来どおりdispatchId単位で、再送後の再中断は引き続き検出できる。
- **回帰テスト**: 「`send-failed` → 同一sequence再送成功 → 再起動走査で検出0件」と「`send-failed` → 再送も中断 → 最新attemptのintentだけをCase B検出」の2件を追加した。前者は修正前のロジックで実際に失敗することを確認済みである（後者は修正前も通るため、要件を固定する保護テストとして残す）。

## 9. Verification

| 種別 | 実施内容 | 結果 | 実施者 |
|---|---|---|---|
| 自動 | TypeScript typecheck（node / web） | Pass | Claude Code |
| 自動 | Vitest 77 tests（既存60＋復旧15＋P1回帰2） | Pass | Claude Code |
| 自動 | electron-vite build（main / preload / renderer） | Pass | Claude Code |
| 静的 | `git diff --check` | Pass | Claude Code |
| 静的 | 追加コードに外部通信・認証・child process・APIキー参照が無いこと | Pass | Claude Code |
| **実機** | **別プロセスでの送信→強制終了→別プロセスで走査→再送** | **Pass** | Claude Code |
| **実機** | 同上→失敗記録（3ファイル出力・`awaiting-owner`・Job `running`） | **Pass** | Claude Code |
| **実機** | 同上→停止（`stopped`・Job `cancelled`） | **Pass** | Claude Code |
| 手動 | Electron画面での復旧表示とOwner操作 | **未確認（プロセス跨ぎでのバックエンド動作＝再送・失敗記録・停止は検証済み。Electron画面上でのUI操作としての実機確認は事実が確定していないため、確定するまで未確認として扱う。§10参照。2026-08-11、`ADF-TASK-PACKET-CLI-001`のOwner指示により訂正）** | Codex |

実行環境にはNode.jsが無いため、`node_modules/electron/dist`の同梱Node v24を`ELECTRON_RUN_AS_NODE=1`で使用した。

### 実機検証の記録（プロセス跨ぎ）

`sendToAdapter`の直後に`process.exit(0)`で強制終了する送信プロセスと、同じruntimeRootを走査する別プロセスを用意して確認した。Fake Adapterの回答はプロセス内メモリにしか無いため、これは回答喪失を伴う本物の中断である。

| 操作 | 結果 |
|---|---|
| 走査 | `recovery-needed` / `answer-unavailable`として検出 |
| 再送 | dispatchIdが`…16818` → `…c93c9e3b`へ変化。sequenceは0のまま。`awaiting-owner`、Job `running`、recovery情報クリア |
| 失敗記録 | `status: failed`のTurn、`results/turn-0-recovery-0.json`、`errors/turn-0-recovery-0.json`を出力。`awaiting-owner`、Job `running` |
| 停止 | `stopped`、Job `cancelled` |

検証に使った2本のスクリプトは確認後に削除しており、リポジトリには残していない。

### 受入条件の照合

- [x] 1. Case Aで恒久停止しない（実機で確認）
- [x] 2. Case Bを検出し、送信を試みた事実がLedgerに残る
- [x] 3. `getState`例外でも走査が止まらず、`probeError`は200文字・スタックトレースなし
- [x] 4. `recovery-needed`をUIで理由付きに表示（実機確認）
- [x] 5. 再送 / 失敗記録 / 停止の3操作が成立しLedgerに残る（実機で確認）
- [x] 6. 同一sequence・同一Adapterの再送でdispatchIdが変わり、重複時は再送せず失敗する
- [x] 7. 失敗記録が3点を残し`awaiting-owner`へ戻る。この`failed` Turnでは承認できない
- [x] 8. `appendRecoveryTurn`の3条件と、`appendTurn`の`open`ガード維持
- [x] 9. `send`例外でpendingを作らず、Threadは`open`のまま。Turnが生まれなければ次回起動で`send-unconfirmed`
- [x] 10. 自動再送・自動失敗記録なし。期限超過は表示のみ
- [x] 11. 既存テストが回帰しない（Vitest 77件Pass。Adapterの`failed`が通常経路でThreadを`failed`にする挙動も維持）
- [x] 12. 外部送信・認証・APIキー・課金のコードなし

## 10. 残存リスク・未検証事項

- **Electron画面での復旧UIは未確認**。復旧パネル、Case A/B表示、3ボタン、期限超過表示はコードとしては実装済みだが実機で操作していない。
- **受信途中の中断は本Taskの対象外**。`receiveFromAdapterUnsafe`は`thread.json`を最後に保存するため、`clearPending`後・保存前に落ちるとTurnが失われる。ただし`relay.received`が`dispatchId`を解決するためThreadは`open`のまま詰まらず、Ownerは同じsequenceへ再送できる。恒久停止ではないが、Turnの喪失と孤児Result fileが残る。
- **復旧の失敗Turnもrole交替に数える**。失敗Turnがsequenceを消費するため、次のTurnは通常どおり相手役へ渡る。Fake Criticは直前のproposal役Turn（=ADF生成の失敗記録）を引用する。Fake固有の見え方の問題であり、実Adapterでの扱いは外部接続Taskで再検討する。
- **`attempt`は`thread-events.jsonl`のみから決まる**。ログが破損して`readEvents`が失敗すると再送できない。ただしその場合も失敗記録と停止は選べるため、Threadが恒久停止することはない。
- **`adapterConversationId`はattempt単位ではない**（`adapterId:threadId:sequence`）。pendingは常に1件のためFakeでは実害がないが、冪等キーの設計は外部Adapter接続Taskで扱う。
- **旧形式のpendingは復旧対象になる**。`RelayDispatchHandle`に`attempt` / `expiresAt`が加わり`handleHash`が変わったため、本変更以前に書かれたpendingは受信できない。該当Threadは`recovery-needed`として検出され、Ownerが再送・失敗記録・停止を選べる。
- `pendingTtlMs`の既定値15分に実測根拠はない。暫定値である。

## 11. 実装ファイル

- 変更: `src/shared/threadTypes.ts`、`src/main/jobLoop/thread.ts`、`src/main/jobLoop/relay.ts`、`src/main/jobLoop/contracts.ts`、`src/main/relayService.ts`、`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/src/env.d.ts`、`src/renderer/src/ThreadPanel.tsx`、`src/renderer/src/styles.css`、`tests/conversationRelay.test.ts`
- 新規ファイルなし。`contracts.ts`と`thread.ts`は`ADF-JOB-LOOP-001` / `ADF-CONVERSATION-RELAY-001`の成果物だが、変更はいずれも加算的で、既存の許可遷移・既存ガードを減らしていない。

## 12. Handover

- 完了確認: Codexが差分・検証をレビューし、Recovery UIの表示と失敗記録を実機確認した。再送・停止は別プロセス検証で確認した。
- 後続Task: `ADF-EXTERNAL-ADAPTER-001`。外部送信・課金・認証は別の実行直前承認で扱う。
- commit / push: `932357c`を`origin/codex/adf-pilot-governance`へpush済み。

## 13. Project Owner Review

- Review date: 2026-08-10
- Decision: Approved / Done
- Project Ownerが実装結果、残存リスク、77 tests、typecheck、build、プロセス跨ぎ復旧検証を確認し、コミット・プッシュを承認した。
- 監視担当: Codex。実装担当: Claude Code。同一Codex環境内の役割分離は独立した外部AIレビューとは扱わない。

## ADF Execution Summary

```json adf-execution-summary
{
  "adfExecutionSummary": "v1",
  "taskId": "ADF-RELAY-RECOVERY-001",
  "objective": "Turn送信後・受信前にプロセスが終了したThreadを、起動時の検出とOwner判断による復旧（再送 / 失敗記録 / 停止）で解消する。",
  "scope": {
    "inScope": [
      "adapter.send()前のrelay.dispatch-intent記録",
      "send失敗時のrelay.send-failed記録とThread openの維持",
      "appendRecoveryTurn()の追加とappendTurn()のopenガード維持",
      "起動時の全Thread走査によるCase A(answer-unavailable) / Case B(send-unconfirmed)の検出",
      "Thread状態recovery-needed追加とJob Ledger同期",
      "Owner復旧操作3種（再送 / 失敗記録 / Thread停止）",
      "dispatchId生成規則へのattempt追加と重複検査",
      "recovery-needed UIと単体・復旧テスト",
      "pendingへのexpiresAt付与と、経過時間・期限超過の表示"
    ],
    "outOfScope": [
      "自動再送、自動リトライ、常駐Worker、バックグラウンド再開",
      "DB、メッセージブローカー、並列Job、複数Threadの一括復旧",
      "外部AIへの実接続、認証、APIキー、外部送信、課金、MCP",
      "Adapter契約（send / getState / receive）の変更",
      "承認Packet作成導線の整備、計測・ログ基盤、配布用コード署名"
    ]
  },
  "context": {
    "githubTask": "docs/tasks/ADF-RELAY-RECOVERY-001.md",
    "obsidianContext": [
      "Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md"
    ],
    "adoptedPrinciples": [
      "owner-approval",
      "no-db-no-broker",
      "structured-result-even-on-failure"
    ]
  },
  "acceptance": [
    "pending保存後の再起動でThreadが恒久停止しない（Case A）",
    "send成功後・pending保存前の再起動でも送信を試みた事実がLedgerに残る（Case B）",
    "getState例外でも走査が止まらずrecovery-neededになる",
    "再送 / 失敗記録 / 停止の3操作がいずれも成立しLedgerに残る",
    "同一sequence・同一Adapterの再送でdispatchIdが必ず変わる",
    "Owner操作なしに自動再送・自動失敗記録が起きない",
    "recovery-neededのThreadがUI上で理由付きで判別できる",
    "失敗記録が失敗Turn・検証済みResult Envelope・errors/<turnId>.jsonの3点を残し、このfailed Turnでは承認できない",
    "appendRecoveryTurn()はrecovery-needed以外・failed以外のstatus・errorRefなしのTurnをいずれも拒否し、appendTurn()はopen以外を拒否する",
    "既存テスト（Fake Adapterを含む）が回帰しない",
    "外部送信、認証、APIキー、課金に該当するコードを追加しない"
  ],
  "stopConditions": [
    "Adapter契約の変更が必要になった場合",
    "既存の検証済み挙動を変えないと実装できない場合",
    "外部送信、認証、課金、新規依存が必要になった場合"
  ]
}
```
