# ADF Relay Recovery 設計

> Status: Design only — 実装未着手。Project Ownerの「設計OK」まで実装しない。
> Related task: [ADF-RELAY-RECOVERY-001](../tasks/ADF-RELAY-RECOVERY-001.md) / [ADF-CONVERSATION-RELAY-001](../tasks/ADF-CONVERSATION-RELAY-001.md)

## 1. 解決する問題

`ADF-CONVERSATION-RELAY-001`のRelayは、Turnの送信と受信を分離している。送信時に`threads/<threadId>/pending-dispatch.json`を排他作成し、受信時に削除する。

この二つの間でプロセスが終了すると、再起動後にThreadが恒久停止する。

| 操作 | 現在の挙動 |
|---|---|
| `sendToAdapter` / `continueJob` | pendingが残っているため`a dispatch is already pending`で拒否される |
| `receiveFromAdapter` | Fake Adapterの回答はプロセス内メモリにあり復元されないため`no pending answer`で失敗する |
| pendingの解除 | `clearPending`はprivateで、公開APIもUI導線も存在しない |

結果として、そのThreadは継続も停止も承認もできない。UIでは「継続」ボタンが消えるだけで理由が表示されない。

これは外部AI接続の構造的な前提でもある。外部AIは受理と回答の間に秒〜分の間隔があり、その間にアプリが閉じられ得る。pendingがプロセスを跨いで復旧できない限り、外部Adapterは動作しない。

## 2. 設計方針

MVPを軽く保つため、次を原則とする。

- **自動復旧をしない**。ADFは検出と提示だけを行い、復旧はOwnerが選ぶ。
- **常駐Worker、DB、バックグラウンド再開を作らない**。起動時の一度の走査と、Ownerの明示操作だけで完結させる。
- **timeoutは自動処理の引き金にしない**。期限は「Ownerが判断するための表示」であり、期限超過が自動で失敗や再送を起こすことはない。
- **既存のFake Adapter会話と外部AI接続契約（`send` / `getState` / `receive`）を変更しない**。拡張はRelayと永続化層に限定する。

## 3. 中断が起こりうる二つの地点

送信処理は、Adapterへの受け渡しとpendingの永続化という二段階からなる。どちらで中断したかで残る痕跡が違うため、区別して扱う。

```text
sendToAdapter
  ① thread-events.jsonl へ relay.dispatch-intent を追記   ← 追加する
  ② adapter.send(request) を呼ぶ
      ─── ここで中断すると「送ったが記録が無い」状態（Case B）
  ③ pending-dispatch.json を排他作成
      ─── ここで中断すると「記録はあるが回答を取り出せない」状態（Case A）
  ④ relay.sent を追記し、Job を running へ同期
```

`relay.dispatch-intent`を②の前に置くことで、②と③のあいだで中断しても「ADFがAdapterへ送信を試みた事実」がLedgerに残る。この追記が本設計で唯一、既存の送信処理へ加える変更である。

| 区分 | 痕跡 | 意味 | 復旧理由コード |
|---|---|---|---|
| Case A | pendingあり | Adapterは受理したが、回答を取り出せない | `answer-unavailable` |
| Case B | intentあり・pendingなし・当該sequenceのTurnなし | Adapterへ送ったかどうかADFが確認できない | `send-unconfirmed` |
| 正常 | intentとpendingとTurnが揃う | 中断していない | — |

Case Bは、Fake Adapterでは実害がない（回答はメモリ上にあり失われるだけ）。しかし将来の外部AIでは、**AIが実際に処理を行い課金が発生していてもADFがそれを知らない**状態にあたる。Ownerが「もう一度送るか」を判断できるよう、自動では送り直さず`recovery-needed`として提示する。

### 3.1 `adapter.send()`が例外を投げた場合

プロセスは生きているが送信が失敗した場合も、Case Bと**同じ`send-unconfirmed`として扱う**。例外は「送信されなかったこと」を証明しないためである。リクエストが相手に届いた後で応答が失われた場合や、外部AIが処理を開始した直後に接続が切れた場合も、同じ例外として観測される。

処理は次のとおり。

1. `relay.send-failed`を`thread-events.jsonl`へ追記する。`dispatchId` / `sequence` / `adapterId` / `attempt`と、例外メッセージの先頭200文字を`sendError`として残す。スタックトレース、認証情報、リクエスト本文は残さない。
2. pendingは**作成しない**。
3. 例外は呼び出し元へ再送出し、UIには「送信に失敗した。外部へ送られたかどうかは不明である」旨を表示する。
4. Threadは`open`のままとする。

**`relay.send-failed`はintentを解決済みにしない。** これは直感に反するため明記する。この記録は観測結果であって、「送信されていない」ことの証明ではない。したがって当該`sequence`にTurnが生まれないまま次回起動を迎えた場合、そのintentは未対応として検出され、`send-unconfirmed`の`recovery-needed`になる。

同一セッション内でThreadを即座に`recovery-needed`へ移す案も検討したが、不採用とした。pendingが無いためThreadは`open`のままで詰まらず、Ownerはそのまま再試行できる。また`recovery-needed`へ移しても、Ownerに提示される選択肢は結局「再送」であり、二重実行のリスクは変わらない。中間状態を増やさず、エラー表示で不確実性を伝え、放置された場合は次回起動の走査で拾う。

Ownerが再試行して同じ`sequence`にTurnが生まれた場合、そのsequenceのintentはすべて解決済みとして扱う（intentの解決判定は`sequence`単位である）。

## 4. 起動時の検出

アプリ起動時に、全Threadを一度だけ走査する。走査は一巡のみで、リトライも常駐監視も行わない。

```text
起動
  → threads/* を走査
  → pendingあり かつ Thread stateが open
      → Adapterへ getState(acceptance) を問い合わせる
          → 'ready'  … 回答が復元できる。Thread は open のまま、通常の受信で継続可能
          → それ以外 … recovery-needed へ（理由 answer-unavailable）
          → 例外     … recovery-needed へ（理由 answer-unavailable、下記 4.1）
  → pendingなし かつ 未対応の relay.dispatch-intent あり
      → recovery-needed へ（理由 send-unconfirmed）
  → いずれでもない … 何もしない
```

「未対応の`relay.dispatch-intent`」とは、次を両方満たすintentを指す。

1. その`sequence`における**最新attempt**のintentであること。同一`sequence`に後続attemptのintentがあれば、古いattemptは置き換えられた履歴として扱い、判定対象にしない。これを行わないと、`relay.send-failed`で終わった古いattemptが永久に未解決のまま残り、同一`sequence`の後続attemptが成功しても誤って`send-unconfirmed`と判定されうる。
2. その`dispatchId`について`relay.sent`も、そのdispatchIdを持つTurnも、`recovery.*`の記録も存在しないこと。最新attempt内をdispatchId単位で判定することで、再送後にもう一度中断した場合も検出できる。

Fake Adapterは回答をプロセス内メモリに持つため、再起動後の`getState`は必ず`'ready'`以外を返す。将来の外部Adapterは、自身の会話IDから回答を再取得できれば`'ready'`を返せる。この差はAdapter契約の内側に閉じており、Relayの処理は変わらない。

### 4.1 `getState()`が例外を投げた場合

外部Adapterでは、ネットワーク断や認証失効で`getState`が例外になり得る。次のとおり扱う。

- 例外は`'ready'`以外と**同じ扱い**とし、Thread を`recovery-needed`（理由`answer-unavailable`）へ遷移させる。例外を握りつぶして`open`のままにはしない。
- 例外のメッセージは先頭200文字までを`recovery.detected`イベントの`probeError`へ記録する。スタックトレース、認証情報、リクエスト本文は記録しない。
- 例外が起きても走査は中断せず、次のThreadへ進む。1つのAdapterの不調で起動が失敗したり、他のThreadが未検出のまま残ったりしないようにする。
- 起動時の`getState`は1回だけ呼ぶ。再試行はしない。回答が後から取り出せるようになった場合は、Ownerが「再送」を選ぶ。

`recovery-needed`は終端ではないため、この扱いによって回復不能になることはない。

## 5. Thread状態 `recovery-needed`

既存の遷移表へ次を追加する。

| From | 追加される To |
|---|---|
| `open` | `recovery-needed` |
| `recovery-needed` | `open`（再送）/ `awaiting-owner`（失敗記録）/ `stopped`（停止） |

`recovery-needed`は終端ではない。Ownerの操作でのみ抜ける。

Job Ledger側には既に未使用の`recovery-needed`（`running`からのみ遷移可）が定義済みであり、これを対応付ける。Threadが`recovery-needed`になった時点でJobも`running → recovery-needed`へ同期する。遷移不能な場合は既存方針どおり`job.state-skipped`として記録し、Threadを壊さない。

## 6. Ownerの復旧操作

| 操作 | 動作 | 結果のThread state |
|---|---|---|
| 再送 | pendingを破棄し、**同じ`sequence`**で新しい`dispatchId`を発行して再dispatchする | `open` → 通常の送信フローへ |
| 失敗記録 | 当該Turnを`failed`として記録し、pendingを破棄する | `awaiting-owner` |
| Thread停止 | pendingを破棄し、Threadを停止する | `stopped` |

Case A（`answer-unavailable`）とCase B（`send-unconfirmed`）で操作の選択肢は変わらない。違いは記録される理由コードと、失敗記録時の`reason`だけである。

### 6.1 再送と`dispatchId`の生成規則

現在の生成規則は次のとおりで、`(threadId, sequence, adapterId)`から決定的に定まる。

```ts
// 現行（変更が必要）
dispatchId = `relay-dispatch-${hashJson([threadId, sequence, adapterId]).slice(0, 20)}`
```

再送は`sequence`も`adapterId`も変えないため、**この規則のままでは再送しても同じ`dispatchId`になる**。「再送時は必ず新しい`dispatchId`」という要件は、規則の変更なしには満たせない。次の規則へ変更する。

```ts
// 変更後
attempt     = 当該 sequence について既に記録された relay.dispatch-intent の件数（初回=0、初回の再送=1、…）
dispatchId  = `relay-dispatch-${hashJson([threadId, sequence, adapterId, attempt]).slice(0, 20)}`
```

- `attempt`はLedger（`thread-events.jsonl`）から数える。時刻を混ぜないのは、Relayのclockが注入可能で、テストの固定clockでは同値になり得るためである。
- 永続化の直前に、生成した`dispatchId`が当該Threadの既存記録すべてと異なることを検査する。一致した場合は再送せず失敗させる。黙って旧IDを使い回さない。
- 旧`dispatchId`、新`dispatchId`、`attempt`を`recovery.resent`へ記録する。
- `sequence`は変えない。Turnの順序と親Turn hash照合を維持するためである。
- 自動再送はしない。Ownerが押した回数だけ再送される。

既に保存済みのThreadが持つ`dispatchId`は記録値をそのまま使い続けるため、再計算による不整合は起きない。新しい規則は、これから発行する`dispatchId`にのみ適用される。

### 6.2 失敗Turnの追加経路

現行の`appendTurn()`は先頭で`thread.state !== 'open'`を弾く。失敗記録は`recovery-needed`から行うため、このままでは失敗Turnを追加できない。両立させるため、**`recovery-needed`から失敗Turnだけを追加できる専用経路**を設ける。`appendTurn()`の`open`ガードは緩めない。

```text
appendTurn(thread, turn)            … thread.state === 'open' のみ。Adapterの回答を追加する通常経路
appendRecoveryTurn(thread, turn)    … thread.state === 'recovery-needed' のみ。ADFが生成した失敗記録専用
```

両者は次の検証を共有する。順序保証・重複turnId拒否・親Turn hash照合という不変条件を、復旧経路でも一切緩めないためである。

- `threadId` / `jobId`の一致
- `turnId`の非空と重複拒否
- `sequence === thread.turns.length`
- `respondsToTurnId`の存在と`respondsToHash`の一致（先頭Turn以外は親参照必須）
- `maxTurns`の上限

`appendRecoveryTurn()`だけが追加で要求する条件は次の3つである。

- `thread.state === 'recovery-needed'`
- `turn.status === 'failed'`（`success` / `partial` / `invalid`は受け付けない）
- `turn.errorRef`が存在する

追加後、Threadは`recovery-needed → awaiting-owner`へ遷移する。

**`maxTurns`との関係**: 失敗Turnは1つのTurn枠を消費する。上限を超えることはない。`recovery-needed`は必ず送信の中断から生じ、その送信時点で`sendToAdapter`が`turns.length < maxTurns`を確認済みだからである。したがって失敗Turn追加後の`turns.length`は最大でも`maxTurns`に等しい。上限に達した場合、以降の「継続」は既存の規則どおり`failed`となる。

**この経路を採る理由**: 失敗Turnを作らずError EvidenceとイベントだけをLedgerに残す案も検討したが、不採用とした。Turnを作らないと`sequence`が消費されないため「失敗記録」と「再送」がほぼ同一の挙動になり、かつOwnerが読むTurnの時系列から中断の事実が消える。ADFの中核は会話と根拠をOwnerが追えることにあり、失敗を時系列から落とすことはこれに反する。

### 6.3 失敗記録のLedger形式

回答が存在しないため、Turnの本文はAdapterからではなくADFが生成する。書き出すのは次の3つである。

**(a) 失敗Turn**（`thread.json`の`turns[]`へ追記）

| 項目 | 値 |
|---|---|
| `turnId` | `turn-<sequence>-recovery-<attempt>` |
| `sequence` | 中断した送信と同じ値 |
| `adapterId` / `role` | pendingまたはintentに記録された値 |
| `dispatchId` | 中断した送信の`dispatchId`（新規発行しない） |
| `respondsToTurnId` / `respondsToHash` | 中断した送信と同じ値（存在する場合） |
| `content` | ADFが生成する固定文。Adapterの発言ではない旨を含む |
| `status` | `failed` |
| `resultEnvelopeRef` / `resultEnvelopeHash` | (b)への参照とそのhash |
| `errorRef` | (c)への参照 |

**(b) Result Envelope**（`threads/<threadId>/results/<turnId>.json`）

通常のTurnと同じ経路で生成し、`validateResultEnvelope()`で検証してから保存する。`taskId` / `jobId` / `inputHash` / `scopeHash` / `contextHash`はThreadの値を使う。

| 項目 | 値 |
|---|---|
| `status` | `failed` |
| `summary` | 中断地点と復旧理由を1文で要約したもの |
| `verification` | `[{ name: 'adapter-answer-recovered', status: 'not-run', reason: <理由コード> }]` |
| `risks` | Case Aは「Adapterが処理を完了していた可能性がある」、Case Bは「Adapterへ届いたか不明であり、外部AIでは課金が発生している可能性がある」 |
| `terminationReason` | `recovery-failed` |
| `ownerDecisionRequired` | `true` |

`failed`のTurnは既存の承認条件（success / partialかつ検証済みEnvelope）を満たさないため、これを根拠に承認することはできない。既存の「Evidenceなしでは承認できない」制約はそのまま働く。

**(c) エラー記録**（`threads/<threadId>/errors/<turnId>.json`）

| 項目 | 内容 |
|---|---|
| `reason` | `answer-unavailable` / `send-unconfirmed` |
| `dispatchId` / `sequence` / `adapterId` / `role` | 中断した送信の識別情報 |
| `sentAt` / `expiresAt` / `detectedAt` / `recordedAt` | 送信時刻、期限、検出時刻、記録時刻 |
| `attempt` | 中断時点の試行回数 |
| `probeError` | `getState`が例外だった場合のメッセージ先頭200文字。無ければ省略 |

秘密情報、認証値、リクエスト本文、スタックトレースは保存しない。

**(d) イベント**（`thread-events.jsonl`）に`recovery.failed-recorded`を追記する。

### 6.4 失敗記録後に`awaiting-owner`へ戻す理由

通常の受信では、Adapterが`failed`を返すとThreadを`failed`にする。これは「AI自身が失敗を報告した」ためである。

復旧時の失敗記録はこれと意味が異なり、「AIの回答が得られなかった事実をOwnerが記録した」ものである。Ownerはこのあと、停止するのか、それまでのTurnを承認するのか、別Adapterへ送り直すのかを選べる必要がある。そのため`failed`ではなく`awaiting-owner`へ戻す。

この差は意図的なものであり、実装時に混同しないよう両経路を別のテストで固定する。

## 7. timeoutの扱い

pendingに`expiresAt`を持たせるが、**期限超過は自動処理を起こさない**。

- UIはpendingの経過時間と期限超過を表示する。
- 期限を過ぎてもThread stateは自動では変わらない。
- 期限は「Ownerがこの復旧操作を選ぶ判断材料」としてのみ機能する。

既定値には実測根拠がないため暫定値とし、Taskの未検証事項に明記する。

## 8. UI

- Thread一覧で`recovery-needed`のThreadを判別できるようにする。
- Thread詳細に、停止している理由（送信済み・未受信であること、対象`sequence`、送信時刻、期限超過の有無）を表示する。
- 復旧操作は「再送」「失敗として記録」「Thread停止」の3つだけを出す。他のOwner操作はこの状態では出さない。

## 9. 作らないもの

- 自動再送、自動リトライ、指数バックオフ。
- 常駐Worker、バックグラウンド再開、DB、メッセージブローカー。
- 並列Job、複数Threadの一括復旧。
- 外部AIへの実接続、認証、APIキー、外部送信、課金、MCP。

## 10. 未解決事項

- 「再送」はAdapter側が前回分を既に処理していた場合の二重実行を検出できない。Fakeでは観測できないため、冪等キーの設計は外部Adapter接続Taskで扱う。
- timeoutの既定値。
- 復旧回数・復旧までの時間の計測は、計測Taskで扱う。
