# Task — ADF-EXTERNAL-ADAPTER-001: 実AI Adapterの最小接続実証

> Type: Design / Implementation
> Status: Verifying — Electron接続まで完了、実送信は未実施（`外部送信OK`待ち）
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md) / [ADF-RELAY-RECOVERY-001](./ADF-RELAY-RECOVERY-001.md) / [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md)

## 1. Objective

ADFの既存Thread / Relayへ実AI Adapterを一つ接続し、Synthetic Packetの送信、回答受信、Result Envelope取込、Ownerレビュー待ちまでをこのPC上で実証する。Claudeは最初の技術試験対象とするが、製品境界は複数AI共通のAdapter契約に保つ。

## 2. Approval Gate

- 設計承認: 必須。設計、Scope、停止条件をProject Ownerが承認するまでコード変更を開始しない。
- 実行直前承認: 必須。Provider、送信Packet、外部送信、費用上限、認証状態を確認してから一回の送信を許可する。
- 認証情報: ADF、Ledger、GitHub、Obsidianへ保存しない。
- 自動承認: 不可。

## 3. Required Context

### GitHub

- [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)
- [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md)
- [ADF Agent Adapter Contract](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- [ADF Multi-AI Control Plane](../design/ADF_MULTI_AI_CONTROL_PLANE.md)
- [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md)
- [ADF-RELAY-RECOVERY-001](./ADF-RELAY-RECOVERY-001.md)
- [ADF-CLAUDE-ADAPTER-001](./ADF-CLAUDE-ADAPTER-001.md)

### Obsidian

- `/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md`
- `/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/00_MOC.md`
- `/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md`

採用する制約は、ADFをProject進捗管理とAI間の受け渡しに限定すること、GitHub / Obsidianを正本として維持すること、外部送信・費用・認証・正本変更を別承認にすること、Fake成功を実AI品質の証明と扱わないことである。

## 4. In Scope

- 実行方式のpreflightと、Provider / connection / data policy / cost tier / stop方法のRegistry記録。
- Synthetic Packetだけを使う一回の外部送信。
- 既存のThread / Relay / Recoveryと共通`send` / `getState` / `receive`契約への接続。
- Result Envelope、Evidence、Ledger、BoardのOwnerレビュー待ち反映。
- timeout、cancel、invalid、送信失敗、回答遅延、アプリ終了時の復旧確認。
- 使用したSkill、サブエージェント、実行結果、未実施、残存リスクの記録。

## 5. Out of Scope

- repo / branch / worktree / Obsidian / Vault全体の送信。
- 外部AIによるTerminal、Browser、MCP、ファイル編集、コード実行。
- 正本変更、commit、push、merge、公開。
- 動的Routing、並列Job、自動Fallback、無限討論、自動承認。
- 第二Providerの同時実装。第二Adapterは実測後の別Taskとする。
- APIキーの生成・保存・Ledger記録。

## 6. Acceptance Criteria

1. Ownerが実行直前承認したSynthetic Packetだけが外部へ送信される。
2. 送信前にProvider、role、Task / Thread、scope hash、data boundary、cost tierが照合される。
3. 実AIの回答が既存ThreadのTurnと検証済みResult Envelopeへ戻る。
4. 成功・失敗・timeout・cancel・invalidを区別してLedgerへ記録する。
5. 回答はOwnerレビュー待ちとなり、自動採用・正本変更は起きない。
6. repo、Obsidian、秘密情報、不要な会話全文が送信・保存されない。
7. アプリ終了・回答遅延時に既存Recoveryへ戻り、Owner操作なしに再送しない。
8. 実AI接続試験後もFake Adapterを含む既存テストがPassする。
9. 外部送信回数、所要時間、費用Tier、停止理由、未実施、残存リスクを確認できる。

## 7. Plan

| Step | 内容 | 実装開始条件 |
|---|---|---|
| 1 | 正本、環境、現在のRegistry、既存Relay / Recoveryを再確認 |  read-only |
| 2 | ProviderとAPI / CLI等の接続方式をpreflightし、候補を比較 | 実行方式の設計承認 |
| 3 | Synthetic Packet、送信範囲、費用上限、停止条件を固定 | 実行直前承認 |
| 4 | Adapterを共通契約へ接続し、外部送信を一回実装 | 実行直前承認 |
| 5 | Result / Evidence / Ledger / Boardへの取込を検証 | Adapter実装後 |
| 6 | 失敗、timeout、cancel、再起動、秘密情報非混入を検証 | 外部送信後 |
| 7 | Claude Code担当、Codex監視、Owner最終レビューを記録 | 全検証完了後 |

## 8. Stop Conditions

- 未承認の外部送信、課金、追加Context、Provider変更が必要になった場合。
- repo、Obsidian、worktree、秘密情報を送信しないと成立しない場合。
- 新規依存、認証方式、Ledger保持方式が設計から変わる場合。
- 外部AIの回答をADFが自動で正本へ反映する必要が生じた場合。
- 既存Fake Adapter、Thread、Recoveryの検証済み契約を壊す必要がある場合。

## 9. 実行環境preflight結果（2026-08-10）

読み取り専用で確認した。ネットワークへは一切アクセスしていない。

| 方式 | 検出 | 判定 |
|---|---|---|
| Claude CLI | PATH、`/usr/local/bin`、`/opt/homebrew/bin`、`~/.claude/local`、`~/.local/bin`のいずれにも無し | 未導入。導入は停止条件「新規依存」に該当 |
| 公式SDK `@anthropic-ai/sdk` | `package.json`・`node_modules`ともに無し | **新規依存が必要**。停止条件に該当 |
| API直呼び（Node組込`fetch`） | Node v24 / Electronに`fetch`あり。新規依存は不要 | `ANTHROPIC_API_KEY`が未設定。認証方式の決定が必要 |
| `ANTHROPIC_API_KEY` | unset（値は読んでいない） | 実送信には未設定 |
| Node.js / pnpm | PATHに無し。`node_modules/electron/dist`の同梱Node v24を`ELECTRON_RUN_AS_NODE=1`で使用 | 検証は可能 |

3方式すべてがOwner判断を要したため質問し、Project Ownerが **「API直呼び（組込`fetch`、新規依存なし）」** を選択した（2026-08-10）。採用理由は、新規依存の追加が不要であること、認証が環境変数のみで完結しADFへ秘密値を渡さないこと、CLIとSDKはいずれも未導入で導入自体が停止条件に該当することである。

なおTypeScriptには公式SDK（`@anthropic-ai/sdk`）が存在し、通常はそちらが推奨される。本Taskで生HTTPを採る根拠は「新規依存を追加しない」というProject Ownerの明示的制約であり、その事実をここに記録する。

## 10. 実装済み（実送信なし）

| 区分 | 内容 |
|---|---|
| Synthetic Packet | `buildSyntheticPacket`。識別子と固定文だけで構成し、Turn本文・repo・Vault・承認Task本文を含めない |
| 境界検査 | `assertPacketBoundary`。絶対パス、`~/`、Vault参照、repo参照、URL、認証らしき文字列、hash不一致、4000字超をfail-closedで拒否 |
| 実行直前承認 | `external-send-approvals/<threadId>.json`をOwnerが配置。rendererからは生成不可。Task/Thread/Adapter/Provider/packet hash/有効期限/送信回数/費用Tierを照合 |
| 停止ゲート | `preflightExternalSend`が全チェックを報告し、`assertExternalSendAllowed`が1つでもfailなら送信前に停止 |
| Transport抽象 | `ExternalTransport`。Provider固有はここだけ。`MockExternalTransport`（通信なし）と`UnconfiguredExternalTransport`（拒否）を用意 |
| Adapter | `ExternalConversationAdapter`。既存`send`/`getState`/`receive`契約に接続 |
| Ledger | `external-calls.jsonl`。provider/role/Task/Thread/Job/packet hash/input・scope・context hash/status/costTier/durationMs/terminationReason/開始・終了時刻。認証情報は保存しない |
| 状態区別 | `success`/`failed`/`timeout`/`cancelled`/`invalid`。Turn statusで表せない`timeout`/`cancelled`はResult Envelopeの`status`と`terminationReason`へ記録 |
| 自動採用の禁止 | 回答は既存経路でOwnerレビュー待ちへ。Evidenceの無い承認は既存ガードで拒否される |
| 自動Routing遮断 | `adapterForRole`は`local-only`以外を選ばない。外部Adapterは明示指定でしか動かない |

## 10.1 実送信トランスポート（実装済み・未実行）

`AnthropicMessagesTransport`（`src/main/jobLoop/anthropicTransport.ts`）。

| 項目 | 内容 |
|---|---|
| エンドポイント | `POST https://api.anthropic.com/v1/messages` |
| ヘッダ | `content-type` / `anthropic-version: 2023-06-01` / `x-api-key` |
| モデル | `claude-opus-5` |
| リクエスト | Synthetic Packetのみ。`max_tokens: 512`、`thinking: {type: 'disabled'}`（このモデル系は既定で思考が有効でmax_tokensを共有するため、短い決定的応答を得る目的で無効化。既定effort `high`以下では許容される） |
| 認証 | 送信時に`process.env.ANTHROPIC_API_KEY`を読むだけ。ADF・Ledger・Task・Obsidianへ保存も記録もしない。未設定なら`MissingCredentialError`で送信前に停止 |
| timeout | `AbortSignal`。中断は例外ではなく`status: 'timeout'`として記録 |
| 応答マッピング | `stop_reason: 'refusal'` → `failed`（カテゴリ付き）／テキストなし → `invalid`／`max_tokens` → `success`（`completed-truncated`）／429・5xx・401・403 → `failed`／その他4xx → `invalid`。HTTPエラー本文は先頭200文字のみ |

Registryの`claude-external`を`connection: 'api'` / `status: 'available'`へ更新した。`available`にしても無承認の送信は起きない。dispatchには(1)そのRelayへのAdapter登録、(2)ディスク上のOwner実行承認、(3)環境変数の認証情報、の3つがすべて必要である。

**`fallbacks`は実装していない。** 本Taskの承認範囲外であり、合成パケットの接続確認に不要なため。実運用で採用するかはOwner判断とする。

## 10.2 監視レビュー指摘と対応（2026-08-10）

| # | 指摘 | 対応 |
|---|---|---|
| 1 | Synthetic Packetに`scopeHash` / `contextHash`が無く、preflightが実際のScope変更を検出できない | 設計§4は当初からこの2つをPacketの構成要素として定めており、実装が設計に達していなかった。両hashをPacket本体へ追加し`packetHash`の対象に含めた。`ExternalSendApproval`にも両hashを持たせ、preflightで`approval-matches-scope` / `approval-matches-context`として個別に照合する。Scope変更は「Scope変更」として報告される |
| 2 | `TransportOptions.signal`がAdapterから渡されず、実APIリクエストをOwner操作で中断できない | Adapterがdispatch単位で`AbortController`を保持し、`transport.send`へ`signal`を渡す。`cancel(dispatchId)`で中断できる。Transportはタイムアウトとキャンセルを`signal.reason`で区別し、前者を`timeout`、後者を`cancelled`として記録する |
| 3 | 最終報告の「`fetch`/`http`が一切存在しない」が誤り | **指摘のとおり誤報告だった。** 検証コマンドで`grep -v "fetchImpl ??"`と書き、唯一の`fetch`行を自分で除外して「該当なし」と表示させていた。検査対象を隠す検証であり、報告として無効である。除外なしの走査結果を下記に記録する |

### 追加で判明した欠陥（テストが検出）

- **キャンセル済みでも`fetch`を呼んでいた。** 実`fetch`なら即rejectするが、送信を試みること自体が不要である。送信前に短絡し、`cancelled before the request was sent`として返す。リクエストは1件も発行されないことをテストで固定した。

### 外部通信・認証情報の実態（除外フィルタなし）

```
src/main/jobLoop/anthropicTransport.ts:13  export const anthropicMessagesEndpoint = 'https://api.anthropic.com/v1/messages'
src/main/jobLoop/anthropicTransport.ts:57  this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init))
src/main/jobLoop/anthropicTransport.ts:62  const key = process.env[this.credentialVariable]
src/main/jobLoop/anthropicTransport.ts:84  'x-api-key': key
```

**送信コードは存在する。** 実送信が行われていない根拠は「コードが無いこと」ではなく、承認ゲート（Owner実行承認ファイル・環境変数・Adapter登録の3点）が満たされていないことである。

## 11. 実装時に判明した設計の穴と対応

| 検出 | 内容 | 対応 |
|---|---|---|
| 失敗回答がTurnにならない | 外部Adapterが`failed`/`timeout`/`cancelled`時に`getState`を`failed`とし、Relayが「まだ回答が無い」と判断してTurnを作らなかった（テストで検出）。Ownerが失敗を確認できない | 回答本体が生成できた場合は常に`ready`とし、失敗も構造化Turn＋Evidenceとして記録する。`getState`の`failed`は本当に何も生成できなかった場合に限定 |
| 外部Adapterの自動選択 | `adapterForRole`はroleが一致すれば外部Adapterも選びうる | `local-only`以外を自動選択から除外。外部は明示指定のみ |
| Turn statusの表現力不足 | `TurnStatus`は`timeout`/`cancelled`を持たない | `RelayTurnPayload`へ任意の`envelopeStatus`/`terminationReason`を追加（加算的。既存Fakeは未使用で挙動不変） |

## 10.3 Electron接続（P1修正・2026-08-10）

指摘のとおり、External Adapterは実装済みでもElectronのどこからも到達できなかった。以下で接続した。

| 層 | 変更 | 内容 |
|---|---|---|
| Main | `src/main/index.ts` | `AnthropicMessagesTransport`、Fake二種、`ExternalConversationAdapter('claude-external', 'proposal', …)`を単一`ConversationRelay`へ登録。`externalTransports`にadapterId → transportを登録し、IPCがadapterIdだけでtransportを解決できるようにした。起動時に接続も認証読み取りも行わない |
| IPC | `src/main/relayService.ts` | `preflightExternal` / `sendExternal` / `cancelExternal` / `externalSendState`。threadId・adapterIdは`asIdentifier`で検証。`sendExternal`は表示用preflightを信用せず自分で再実行し、failなら送信前に例外。Adapter内部でも同じゲートが再度走る（二重） |
| Preload | `src/preload/index.ts` | 上記4chをcontextBridgeで公開。**承認ファイルを書き込むチャネルは1つも公開していない。** rendererはゲートを読めるが与えられない |
| Renderer | `src/renderer/src/ThreadPanel.tsx` | External Adapterパネル。接続状態／preflight結果／packet・scope・context hash／approval状態と有効期限／cost tier／残り送信回数／全チェック行／blocking reason／送信中状態／cancel可否を表示。送信ボタンはpreflight未Passで`disabled`＋理由をtitleに表示 |
| Relay | `src/main/jobLoop/relay.ts` | `inFlight: Map<threadId, {dispatchId, adapterId}>`を`sendToAdapter`の前後で維持。`cancelExternalSend(threadId)`が実Adapterの`AbortController`まで到達する。rendererはAdapter実体を持たないため、中断経路はmainプロセス内で完結する |
| Role整合 | `externalApproval.ts` ほか | roleはAdapter実体から取り、profileのrole配列からは推測しない。`adapter-declares-role` / `packet-matches-adapter-role` / `approval-matches-role`の3チェックを追加。`ExternalSendApproval.role`を必須化 |

### 実機確認（2026-08-10、外部送信ゼロ）

`electron-vite build`後の実アプリを`--remote-debugging-port`で起動し、CDP経由で実際のDOMとpreloadを操作した。UI文言は実画面から取得したものである。

| 確認 | 結果 |
|---|---|
| 起動〜`scanForRecovery`完了までの外部送信 | 0件。`external-calls.jsonl`は生成されない |
| preloadの公開面 | 12ch。うち外部関連は`preflightExternal`/`sendExternal`/`cancelExternal`/`externalSendState`のみ。承認書き込みchなし |
| preflight表示 | `claude-external / proposal`、`anthropic-messages-api / api`、packet・scope・context hashを表示。5件pass、`owner-approval-present`のみfail |
| approval不在時の停止表示 | 「送信できません: owner-approval-present: no execution approval on disk for this thread」 |
| 送信ボタン | `disabled: true` / title「preflightがPassするまで送信できません」 |
| cancelボタン | in-flightでないため`disabled: true` |
| IPCからの無承認送信 | `external send blocked: owner-approval-present: …`で拒否。transportは呼ばれない |
| 既存Fake Adapter Thread | `sendFirstTurn`で`fake-ai-a`のTurnが1件生成、`awaiting-owner`へ。従来どおり |
| Rendererコンソールエラー | なし |

実アプリでのcancel有効化状態は、外部送信を伴わずには再現できない。cancelがAbortSignalへ到達すること、`inFlight`が送信中だけtrueになることは自動テストで固定した（下記）。

### 実機確認で見つけて直した欠陥

preflightの`require`はfail時の文言をpass時にもそのまま表示していた。実画面に「✓ adapter-declares-role — adapter profile does not declare role proposal」と、成功行に失敗の文が出ていた。pass用文言を分離し、pass行がfailの文を持たないことをテストで固定した。テストでなく実機表示で見つかった不具合である。

### 追加テスト（`tests/externalIpc.test.ts`、17件。うち2件は§10.4）

`src/main/index.ts`と同じ組み立て（Fake二種＋External、`externalTransports`登録）を再現し、`relayService`のIPC関数経由で検証する。

1. 起動〜`scanForRecovery`で外部送信0件
2. preflight報告がIPCで取得でき、接続を開かない
3. pass行がfailの文言を持たない
4. 承認不在で送信0件・理由付き拒否
5. packet / scope / context / role不一致で送信0件（4ケース）
6. 承認済み1回送信 → Result → Owner`approve` → 予算枯渇で再びブロック
7. 待機中は`inFlight: false`、cancel対象なし
8. in-flight cancelが実`AbortSignal`へ到達し、Envelope・Ledgerが`cancelled`、`inFlight`が解除
9. キャンセル済みdispatchは`fetch`を1回も呼ばない
10. Fake Adapter Threadの回帰
11. 不正なthreadId / adapterIdをThread到達前に拒否
12. 壊れた承認ファイルは送信を許可しない
13. preload公開chの列挙が期待どおりで、承認書き込みchが存在しない

### 検証（除外フィルタなし）

| 項目 | 結果 |
|---|---|
| `tsc --noEmit -p tsconfig.node.json` / `tsconfig.web.json` | Pass |
| Vitest | **123 passed / 8 files**（前回105 → +18。`externalIpc.test.ts` 17件、pass文言テスト1件） |
| `electron-vite build` | Pass（main 103.09 kB / preload 1.48 kB / renderer 535.95 kB） |
| ネットワーク呼び出し走査 `grep -rn "fetch(\|http\.request\|https\.request\|net\.request\|XMLHttpRequest\|axios" src/` | 1件のみ: `anthropicTransport.ts:57`。前回の誤報告と異なり、除外フィルタを一切かけていない |
| Git | branch `codex/adf-pilot-governance` / HEAD `932357c`のまま。commit・push・merge・reset・checkoutなし。既存差分は保持 |
| 実送信 | **0件。** `external-calls.jsonl`は実アプリのruntimeに存在しない |

回帰テストが本当に効くことを、実装を一時的に壊して確認した（いずれも確認後に復元済み）。

- `approval-matches-role`を常時passにする → 該当テストのみfail（1 failed / 119 passed）
- `cancelExternalSend`を`return false`にする → cancel到達テストのみfail（1 failed / 14 passed）

## 10.4 認証状態のpreflight追加（P1修正・2026-08-10）

### 指摘

`preflightExternalSend`にAPIキーの存在確認が無く、実際の確認は送信開始後の`AnthropicMessagesTransport.send`（`MissingCredentialError`）でしか行われていなかった。承認ファイルだけ存在するとUI上は送信ボタンが有効になり、押した後に失敗する。`fetch`は認証確認より後なので実送信は起きないが、「送信前に認証状態を確認する」という契約を満たしていない。**指摘のとおりの欠陥であり、修正した。**

### 対応

| 箇所 | 変更 |
|---|---|
| `externalTransport.ts` | `ExternalTransport`に`credentialStatus(): CredentialStatus`を追加。返すのは`{ required, present, source }`の3項目のみで、**値は返さない・記録しない・保存しない**。Provider差し替え時も同じ契約で認証状態を報告する |
| `anthropicTransport.ts` | `credentialStatus()`は`process.env[credentialVariable]`の有無だけを判定して即破棄する。`source`は変数名（`environment variable ANTHROPIC_API_KEY`）であって値ではない |
| `externalTransport.ts`（Mock / Unconfigured） | Mockは`required: false`（プロセス内で認証対象が無い）、Unconfiguredは`required: true / present: false` |
| `externalApproval.ts` | `transport-configured`の直後に`credential-present`チェックを追加。承認ファイル照合より前に置き、承認の有無と独立に判定する |
| `externalAdapterTypes.ts` | `ExternalPreflight.credential: { required, present, source }`を追加 |
| `ThreadPanel.tsx` | 「認証」行を追加し、`設定済み（環境変数名）` / `未設定（環境変数名）` / `不要`を表示。未設定時は`credential-present`がfailするため送信ボタンは既存ロジックで無効化され、理由がblocking reasonとして表示される |

### 追加テスト（2件）

1. **認証未設定時に送信前で停止し、`fetch`が0回。** 承認ファイル・packet・scope・context・roleをすべて正しく揃え、キーだけを外した状態で検証する。preflightが`credential-present: fail`を返し、`sendExternal`が拒否され、`fetch`呼び出し0回、Turn 0件、`external-calls.jsonl`未生成（ENOENT）を確認する
2. **キー設定時に`present: true`を返し、値を一切含まない。** preflight報告全体をJSON化し、キーの値も`sk-ant`の断片も含まれないことを固定する

回帰検出の確認: `credential-present`の条件を常時passへ書き換えると1件目が単独でfailした（1 failed / 17 passed）。確認後に復元済み。

### 実機確認（2026-08-10、外部送信ゼロ）

| 条件 | 実画面の表示 |
|---|---|
| キー未設定 | 認証行「未設定（environment variable ANTHROPIC_API_KEY）」／`○ credential-present — no credential is set at environment variable ANTHROPIC_API_KEY; the Owner sets it outside ADF`／送信ボタン`disabled: true` |
| キー設定（ダミー値、承認ファイルなし） | 認証行「設定済み」／`credential-present`はpass／blockingは`owner-approval-present`のみ／preflight報告に値も`sk-ant`も含まれない（実アプリのIPC応答で確認） |

承認ファイルは実機に配置していない。Ownerの実行承認は私が作ってよい成果物ではなく、「承認あり＋キーなし」の組み合わせは上記テスト1で担保している。実行後、runtimeに`external-calls.jsonl`と`external-send-approvals`はいずれも存在しない。

### P2として記録（未実施）

`ThreadPanel.tsx`のExternal Adapterパネルは、Threadの次の役割が`critic`になった後も`proposal`専用の外部Adapterのpreflightを表示できる。実送信時は`relay.ts`の役割照合で拒否されるため安全上の欠陥ではない。改善案は、Threadの次の役割と登録Adapterのroleが一致しないときにパネルを非表示にするか「この順番では使えない」と明示することである。今回の指示範囲外のため実装していない。

### 使用したSkill / サブエージェント

`claude-api`スキル（モデルID `claude-opus-5`、`thinking`の扱い、SDK非使用時の生HTTP方針の確認）。サブエージェントは起動していない。今回の作業は既存実装への接続で、探索より既知ファイルの直接編集が短経路だったため。

### 残るOwner判断

1. **外部送信OKの可否。** `ANTHROPIC_API_KEY`の設定と、`external-send-approvals/<threadId>.json`の配置。ADFはどちらも生成しない
2. **承認ファイルの作成手段。** 現在はOwnerが手で置く。テンプレート生成コマンドを用意するかは未決（UIからの生成は本Taskで明示的に禁止されている）
3. **`fallbacks`の採否。** 未実装
4. **cost tierの実測。** `unknown`のまま。実送信後でなければ埋まらない

### 残存リスク

- 実APIの応答形状・エラー本文・レート制限は未検証である。`AnthropicMessagesTransport`のマッピングは公開仕様に基づく実装であり、実測ではない
- 実機で確認できたcancelは「無効状態」のみである。有効化と中断の実挙動は自動テストのみで担保されている
- `claude-external`は`status: 'available'`だが、これは「登録済み」の意味であって疎通確認済みではない
- Fake Adapterの成功は実AI品質の証明ではない。今回接続できたのは経路であって能力ではない

## 12. Expected Handover

- 変更ファイル、送信Packetのhash、Provider / connection、実行回数、費用Tier、Result hash。
- typecheck、test、build、実機送受信、停止・RecoveryのPass / Fail / Not run。
- 外部送信の事実、保存範囲、未検証のProvider固有挙動、残存リスク。
- 実AIを一つ接続できたことを、複数AI製品の完成やAI品質の証明と誤って扱わない記録。

## ADF Execution Summary

```json adf-execution-summary
{
  "adfExecutionSummary": "v1",
  "taskId": "ADF-EXTERNAL-ADAPTER-001",
  "objective": "ADFの既存Thread / Relayへ実AI Adapterを一つ接続し、Synthetic Packetの送信、回答受信、Result Envelope取込、Ownerレビュー待ちまでをこのPC上で実証する。",
  "scope": {
    "inScope": [
      "実行方式のpreflightとRegistry記録（Provider / connection / data policy / cost tier / stop方法）",
      "Synthetic Packetだけを使う一回の外部送信",
      "既存のThread / Relay / Recoveryと共通send / getState / receive契約への接続",
      "Result Envelope、Evidence、Ledger、BoardのOwnerレビュー待ち反映",
      "timeout、cancel、invalid、送信失敗、回答遅延、アプリ終了時の復旧確認"
    ],
    "outOfScope": [
      "repo / branch / worktree / Obsidian / Vault全体の送信",
      "外部AIによるTerminal、Browser、MCP、ファイル編集、コード実行",
      "正本変更、commit、push、merge、公開",
      "動的Routing、並列Job、自動Fallback、無限討論、自動承認",
      "第二Providerの同時実装",
      "APIキーの生成・保存・Ledger記録"
    ]
  },
  "context": {
    "githubTask": "docs/tasks/ADF-EXTERNAL-ADAPTER-001.md",
    "obsidianContext": [
      "Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md",
      "Projects/AI-Development-Framework/00_MOC.md",
      "Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md"
    ],
    "adoptedPrinciples": [
      "owner-approval",
      "canonical-source-boundary",
      "separate-approval-for-external-send",
      "fake-success-is-not-real-ai-proof"
    ]
  },
  "acceptance": [
    "Ownerが実行直前承認したSynthetic Packetだけが外部へ送信される",
    "送信前にProvider、role、Task / Thread、scope hash、data boundary、cost tierが照合される",
    "実AIの回答が既存ThreadのTurnと検証済みResult Envelopeへ戻る",
    "成功・失敗・timeout・cancel・invalidを区別してLedgerへ記録する",
    "回答はOwnerレビュー待ちとなり、自動採用・正本変更は起きない",
    "アプリ終了・回答遅延時に既存Recoveryへ戻り、Owner操作なしに再送しない",
    "repo、Obsidian、秘密情報、不要な会話全文が送信・保存されない",
    "実AI接続試験後もFake Adapterを含む既存テストがPassする",
    "外部送信回数、所要時間、費用Tier、停止理由、未実施、残存リスクを確認できる"
  ],
  "stopConditions": [
    "未承認の外部送信、課金、追加Context、Provider変更が必要になった場合",
    "repo、Obsidian、worktree、秘密情報を送信しないと成立しない場合",
    "新規依存、認証方式、Ledger保持方式が設計から変わる場合",
    "外部AIの回答をADFが自動で正本へ反映する必要が生じた場合",
    "既存Fake Adapter、Thread、Recoveryの検証済み契約を壊す必要がある場合"
  ]
}
```
