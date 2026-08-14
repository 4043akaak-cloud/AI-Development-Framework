# Task — ADF-OLLAMA-LIVE-CONNECTION-001: ローカルOllamaへの最小実接続

> Type: Implementation
> Status: Done
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [ADF-ADAPTER-PROVIDER-NEUTRAL-001](./ADF-ADAPTER-PROVIDER-NEUTRAL-001.md)（Done・再変更なし）/ [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md) / [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md)

## 1. Objective

既に起動済みのローカルOllama（`llama3:latest`、`http://127.0.0.1:11434`）へ、既存のProvider-neutral Adapter契約（`ADF-ADAPTER-PROVIDER-NEUTRAL-001`）を使って一回だけ実接続し、Synthetic Packet送信→実推論受信→Result Envelope/Evidence/Ledger記録→Ownerレビュー待ちまでを、既存アプリ（`index.ts`／Renderer／IPC）を変更しない独立スクリプトで実証する。

## 2. Approval

- Approval required?: Yes
- 承認対象: Registry `ollama-local`の`status`変更（`planned`→`available`）、`/api/tags`readinessヘルパーの追加、独立確認スクリプトの追加。
- 承認記録: 2026-08-12、Project Ownerが設計OKを明示し、「アプリ終了状態で進めて」と実行方針を指示した。
- `ADF-ADAPTER-PROVIDER-NEUTRAL-001`は再レビュー・再変更していない。

## 3. Scope

### In scope

- `src/main/jobLoop/adapterRegistry.ts`: `ollama-local`の`status`を`available`へ変更（1エントリのみ）。
- `src/main/jobLoop/ollamaTransport.ts`: `checkOllamaReadiness()`（`/api/tags`確認、新規・加算的）。`preflightExternalSend`は変更しない。
- `src/cli/ollamaConnectivityProbe.ts`（新規）: 独立した`ConversationRelay`を構築し、`ollama-local`を明示`adapterId`指定で一回だけ実行するスクリプト。
- 実Ollamaに対する一回の実接続検証と、注入fetchによる決定的単体テスト。

### Out of scope（別Task・別承認）

- `src/main/index.ts`／Renderer／IPCの変更。
- 自動Routingへの組込み（`local-http`は引き続き自動選択対象外）。
- 複数モデル対応、常設Thread運用、Ollama Cloud、APIキー、Claude Code CLI接続。
- `ADF-ADAPTER-PROVIDER-NEUTRAL-001`の成果物の変更。

## 4. Acceptance Criteria

1. `ollama-local`は明示`adapterId`指定でのみ到達可能で、自動Routingには含まれない。
2. Registry変更後も既存のFake Adapter自動討論・既存External Adapter（Anthropic）経路が回帰しない。
3. 実Ollamaへ一回だけ実接続し、Result Envelope・Evidence・Ledgerが生成される。
4. 生成されたThread／Turnは、既存アプリ（Electron）を再度起動した際にThreadPanel／Live Boardで読み取り専用に確認できる。
5. `index.ts`／Renderer／IPCへの変更が無い。
6. 資格情報・APIキーを一切扱わない。
7. Ollama停止・非200・timeout・cancel・malformed応答が明確な失敗状態として記録される。

## 5. Stop Conditions

- Ollama実応答の形状が既存Transportの前提と食い違う場合。
- `/api/tags`に対象モデルが存在しない場合。
- endpoint確認（`isLocalEndpoint`）が失敗する場合。
- 原因不明の再現不能な失敗が生じた場合。

## 6. Implementation Log

作業開始前に `pkill -f "Electron.*out/main"` 相当の確認でElectronアプリが起動していないことを確認し、`curl http://127.0.0.1:11434/api/tags`（読み取りのみ）で `llama3:latest` の存在を確認した。

1. `src/main/jobLoop/adapterRegistry.ts`: `ollama-local` の `status` を `'planned'` → `'available'` に変更（1行）。既存の2段安全ゲート（`supports()` の `connection !== 'local-http'` 除外／`relay.ts` の `adapterForRole()` の同等除外）は無変更のまま維持し、コメントで意図を明記した。
2. `src/main/jobLoop/ollamaTransport.ts`: `checkOllamaReadiness()` を新規追加。`/api/tags` への読み取り専用GET（`redirect: 'error'`）で疎通とモデル存在（bareモデル名と`:latest`タグの一致判定込み）を確認する。`preflightExternalSend`（凍結対象）には触れていない。
3. `docs/tasks/ADF-OLLAMA-LIVE-CONNECTION-001.md`（本ファイル）を新規作成し、`## ADF Execution Summary` フェンス付きJSONを含めて記述。
4. 既存の Task-Packet CLI（`out/cli/cli/bin.js`）を `--write` 付きで実行し、本Taskの `ApprovedTaskPacket` を実行時Runtime Ledgerに生成・永続化した（`~/Library/Application Support/adf-task-board/adf-runtime/approved-tasks/ADF-OLLAMA-LIVE-CONNECTION-001.json`）。
5. `src/cli/ollamaConnectivityProbe.ts` を新規作成。ライブアプリ（`index.ts`）とは完全に独立した、専用スクリプトだけが保持する `ConversationRelay` を構築し、`ollama-local` の `ExternalConversationAdapter`（`OllamaLocalHttpTransport`）のみを登録。承認済みPacketを読み込み `startThread` → 既存Turnが無い場合のみ `continueJob(threadId, 'ollama-local')` を1回実行する。
6. `tsconfig.cli.json` の `include` に、上記スクリプトの依存閉包（`relay.ts` / `externalAdapter.ts` / `externalApproval.ts` / `externalTransport.ts` / `ollamaTransport.ts` / `anthropicTransport.ts` / `conversationAdapters.ts` / `syntheticPacket.ts` / `resultEnvelope.ts` / `thread.ts` / `runtime.ts` / `dispatchAck.ts` と共有型）を追加。
7. `tsc -p tsconfig.cli.json` でコンパイルし、生成された `out/cli/cli/ollamaConnectivityProbe.js` を実際のローカルOllamaサーバー（実ネットワーク、注入なし）に対して実行した。

   結果: `threadId: thread-1330cbb90aaea8d3`、`turnId: turn-0-3f31269e7a83`、`status: success`、応答内容は実際のllama3応答（`"Here are my responses:\n\n1. はい、受信した。\n2. プロポーサル（proposal）\n3. 以上で応答を終える。"`）、`durationMs: 33404`、`costTier: free`。Thread状態は `awaiting-owner` に遷移。生成された `results/turn-0-3f31269e7a83.json` / `evidence-links.json` / `external-calls.jsonl` を直接 `cat` で確認し、ハッシュ参照の整合性・資格情報が一切含まれないことを確認した。
8. 既存テストスイート全体を実行し、Registryの `status` 変更に伴う1件のみの既存想定違反（`ollama-local` の `status` を `'planned'` と期待していた旧テスト）を検出。該当テストを更新し、実Registryエントリに対する自動Routing除外を証明する新規テストを追加した（`tests/adapterRegistry.test.ts`）。
9. `tests/ollamaTransport.test.ts` に `checkOllamaReadiness` の単体テスト6件（到達可・モデル有／モデル無／接続拒否／非200／malformed本文／redirect不追従）と、`send()` の接続拒否テスト1件を追加。すべて注入fetchによる決定的テストで、実ネットワークへは一切接続しない。
10. `tests/conversationRelay.test.ts` に、Registryが`available`になった後も自動Routingには一切含まれないことを証明するテスト、および実際の応答文言を模した注入fetchによる `continueJob(threadId, 'ollama-local')` 経由の完全なラウンドトリップテストを追加。

## 7. Verification

| 項目 | コマンド／方法 | 結果 |
|---|---|---|
| CLI/確認スクリプトのコンパイル | `tsc -p tsconfig.cli.json` | Pass（エラー0件） |
| Node設定での型検査 | `tsc --noEmit -p tsconfig.node.json` | Pass（エラー0件） |
| 単体・結合テスト全体 | `vitest run` | Pass — Test Files 14 passed (14) / Tests 205 passed (205)（実装前195件から、Registry更新テスト1件差替＋readiness/connection-refusedテスト7件＋Relay統合テスト2件の計+10件） |
| Electronビルド（Main/Preload/Renderer） | `electron-vite build` | Pass — `out/main/index.js` 105.84 kB（Registry/Transport変更分のみ増加）、`out/preload/index.js` 1.48 kB、`out/renderer` 一式（Renderer/Preload/IPCは無変更につきビルド出力の構造に変化なし） |
| diff整形チェック | `git diff --check` | Pass（該当なし） |
| Git状態 | `git status --short --branch` | 想定どおりのファイルのみ変更／新規（`docs/tasks/ADF-OLLAMA-LIVE-CONNECTION-001.md`含む）。commit・pushは未実施。既存の未コミット差分（ADF-EXTERNAL-ADAPTER-001他）はすべて保持されたまま。 |
| 実Ollama実接続（本Taskの中核証跡） | `ollamaConnectivityProbe.ts` を実サーバーに対して1回実行 | Pass — `thread-1330cbb90aaea8d3` / `turn-0-3f31269e7a83`、`status: success`、実推論応答を受信、Result Envelope・Evidence・Ledgerがディスク上に生成され、資格情報は一切含まれない |
| 自動Routing除外の回帰確認 | `routeAdapters()` / `adapterForRole()` の既存除外ロジック（`connection !== 'local-http'`）を実Registryエントリに対してテスト | Pass — `ollama-local` が `available` になった後も `proposal`/`critic` の自動選定結果は `fake-ai-a` / `fake-ai-b` のまま変化なし |
| ライブアプリからの到達不能性 | `index.ts` の `ConversationRelay` 初期化コードを確認 | 変更なし — `ollama-local` 用の `ExternalConversationAdapter` は登録されておらず、起動中のElectronアプリからは（Registry状態に関わらず）到達不能なまま |

（当時の検証時点）Status は `Verifying`。その後、§12でProject Ownerの完了承認を受け、`Done`へ更新した。`ADF-ADAPTER-PROVIDER-NEUTRAL-001` は未変更。commit・pushはこの時点では未実施。

## 8. Blocking Finding — Packet/Dispatch境界の不一致（Owner Review, 2026-08-13）

### 8.1 指摘内容

Project Ownerより、§6-7で証跡とした実Ollama接続（`thread-1330cbb90aaea8d3` / `turn-0-3f31269e7a83`）について、Blocking findingの指摘を受けた。

- 承認済みTask Packet（`buildApprovedTaskPacket.ts`が`routeAdapters()`で生成）の`adapterPlan.selections`は`fake-ai-a`（proposal）/ `fake-ai-b`（critic）であり、`ollama-local`を一切含んでいなかった。
- 一方、`ollamaConnectivityProbe.ts`は`continueJob(threadId, 'ollama-local')`でPacketのadapterPlan外のAdapterを明示指定し、実際にそちらへdispatchしていた。
- 「承認されたRouting Plan」と「実際のDispatch先」が一致しておらず、ADFのControl Plane境界（Owner承認の範囲内でのみDispatchが行われるという前提）に反する。

### 8.2 根本原因

1. `buildApprovedTaskPacket.ts`はPacket生成時に常に`routeAdapters()`（自動Routing）のみを呼び、明示Adapter指定でPacketを構築する手段が存在しなかった。
2. `relay.ts`の`sendToAdapterUnsafe()`は、明示`adapterId`指定によるDispatch時、Registry（`resolveAdapter()`）の状態のみを検証し、そのThreadの承認済みPacketの`adapterPlan`にそのAdapterが含まれているかを一切検証していなかった。
3. `ConversationThread`自体が、生成元Packetの`adapterPlan`（実体）を保持していなかった（`routingPlanHash`というハッシュのみ保持）ため、Dispatch時点でPlanとの照合が構造的に不可能だった。

### 8.3 修正設計・実装

Owner指示（4項目）に対応して以下を実装した。いずれもProvider-neutral（Ollama固有ではなく、`dataPolicy`ベースで判定）。

1. **明示Adapter指定をPacketへ反映**
   - [adapterRegistry.ts](../../src/main/jobLoop/adapterRegistry.ts)に`buildExplicitAdapterPlan(taskId, adapterId, role, capabilities, maxCostTier)`を追加。`routeAdapters()`を経由せず、Owner指定の1 Adapter・1 roleのみを含む`AdapterPlan`を構築する。`dataPolicy !== 'local-only'`の場合は最優先で拒否（external-sendは従来通りこの経路に入れない）。
   - [buildApprovedTaskPacket.ts](../../src/cli/buildApprovedTaskPacket.ts)に`--explicit-adapter`オプションを追加。指定時は`--roles`を1個に限定し、`buildExplicitAdapterPlan`でPlanを構築する（未指定時は従来どおり`routeAdapters()`、既存Task向けの挙動は無変更）。
   - `approval.routingPlanHash`は引き続き`hashJson(adapterPlan)`から機械的に導出されるため、明示Planに対しても自動的に束縛される。

2. **Probe側のfail-closed検証**
   - [ollamaConnectivityProbe.ts](../../src/cli/ollamaConnectivityProbe.ts)に`assertExplicitDispatchIsApproved()`を追加。Relayを構築する前、送信前に以下を検証し、1件でも満たさない場合は`OllamaDispatchBoundaryError`で全件を報告して停止する：
     - `approval.routingPlanHash === hashJson(packet.adapterPlan)`（改ざん・陳腐化していない）
     - Packetの`adapterPlan.selections`に指定Adapter・roleが含まれる
     - Registry Profileの`status === 'available'`
     - Registry Profileの`connection`とTransportの`connection`が一致
     - Transportの`isLocalEndpoint()`がtrue

3. **Relay/Dispatch境界での拒否**
   - [threadTypes.ts](../../src/shared/threadTypes.ts) / [thread.ts](../../src/main/jobLoop/thread.ts): `ConversationThread`に`adapterPlan`（Packetそのものの実体）を追加。`createThread()`は非空の`adapterPlan`を必須化。
   - [relay.ts](../../src/main/jobLoop/relay.ts): `startThread()`で`packet.adapterPlan`をThreadへ束縛。`sendToAdapterUnsafe()`に`assertExplicitDispatchIsApprovedPlan()`を追加し、明示`adapterId`指定かつ`profile.dataPolicy === 'local-only'`の場合のみ、そのAdapter・roleがThreadの`adapterPlan.selections`に含まれることを要求。含まれない場合は`ThreadRejectedError`で拒否し、Adapterへの送信自体を行わない。
   - `dataPolicy !== 'local-only'`（Anthropic等のexternal-send）はこの新チェックの対象外とし、既存の`preflightExternalSend`（Owner承認ファイル）による境界を変更していない。`AdapterPlan`自体が構造的にexternal-send Adapterを含み得ない（`validateAdapterPlan`）ため、Fake Adapter討論・Anthropic経路・`ADF-ADAPTER-PROVIDER-NEUTRAL-001`の成果物は無変更。

### 8.4 追加テスト

- `tests/adapterRegistry.test.ts`: `buildExplicitAdapterPlan`の成功・role不一致・未availableアダプタ・external-send拒否・未知adapterId拒否。
- `tests/taskPacketCli.test.ts`: `--explicit-adapter`でのPacket生成、複数roleとの併用拒否、未availableアダプタ拒否、`claude-external`（external-send）拒否。
- `tests/ollamaConnectivityProbe.test.ts`（新規）: `assertExplicitDispatchIsApproved`の合格ケース、Plan不一致（fake-ai-a承認下でollama-local要求）、role不一致、routingPlanHash改ざん、Registry未available、Registry/Transport connection不一致、非local endpoint、複数違反の同時報告。
- `tests/conversationRelay.test.ts`:
  - 既存の実接続風ラウンドトリップテストを、Packetが明示的に`ollama-local`/proposalを承認したケースへ修正（従来はfake-ai-a承認PacketのままDispatchしており、これがOwner指摘の再現そのものだった）。
  - 新規: 「Packetがfake-ai-aを承認している状態でexplicit dispatchでollama-localを要求すると拒否される」（送信前に拒否され、Turnが一切記録されないことも確認）。
  - 新規: `explicitAdapterPacket()`ベースで`approval.routingPlanHash`を改ざんした場合、`startThread()`が拒否されることを確認。
  - `threadFixture`・`createThread`直接呼び出しの既存テストを、新しい必須フィールド`adapterPlan`に対応させて更新。

### 8.5 検証結果

| 項目 | コマンド | 結果 |
|---|---|---|
| Node設定での型検査 | `tsc --noEmit -p tsconfig.node.json` | Pass |
| CLI/確認スクリプトのコンパイル | `tsc -p tsconfig.cli.json` | Pass |
| 単体・結合テスト全体 | `vitest run` | Pass — Test Files 15 passed (15) / Tests **224 passed (224)**（§7時点の205件から+19件） |
| Electronビルド | `electron-vite build` | Pass — Main微増のみ、Preload/Renderer無変更 |
| diff整形チェック | `git diff --check` | Pass |
| Git状態 | `git status --short --branch` | 想定ファイルのみ変更、commit・push未実施 |

### 8.6 既存証跡の扱い（重要）

- §6-7で証跡とした実Ollama接続（`thread-1330cbb90aaea8d3` / `turn-0-3f31269e7a83`、Runtime Ledger上の`approved-tasks/ADF-OLLAMA-LIVE-CONNECTION-001.json`を含む）は、**削除・変更していない**（Owner指示どおり）。
- ただし、この既存証跡は「PacketのadapterPlanが`fake-ai-a`を承認したまま`ollama-local`へ明示Dispatchした」という、本Blocking findingの原因そのものを含んだ実行であり、修正後の境界（§8.3の3.）を適用すれば**現在は拒否される**組み合わせである。したがって、この証跡単独では受入基準3（「実Ollamaへ一回だけ実接続し...」）の完全な満足を主張しない。
- 修正後の境界に適合した実接続（Packetが`ollama-local`を明示承認した状態での実送信）は、本ラウンドでは実施していない。実行時Runtime Ledger上の承認済みPacketファイルは既存のまま（`--force`未実装のため上書きされていない）であり、そのファイル自体も同じ不整合（`adapterPlan`が`fake-ai-a`のまま）を含んでいる。
- 同じモデルへの再送信は、Owner指示どおり本境界修正の完了後に限定し、本ラウンドでは実施していない。実施する場合は、Packetを`--explicit-adapter ollama-local --roles proposal`で再生成し（既存ファイルとは別経路で書き込む必要がある）、新しいThreadで送信することになる。この判断はProject Ownerの指示を待つ。

Status は `Verifying` を維持する。

## 9. 修正後の正規実接続（Owner承認、2026-08-13）

§8の境界修正後、Project Ownerより「実Ollamaへの再送信を1回だけ承認」の指示を受け、以下の手順で実施した。

### 9.1 事前確認

- Electronアプリ：プロセス確認（`ps aux`）で起動していないことを確認。
- Ollama到達可能性：`curl http://127.0.0.1:11434/api/tags`（読み取りのみ）で200応答、`llama3:latest`の存在を確認。

### 9.2 正規Packetの生成

- 旧Packet（`adapterPlan`が`fake-ai-a`のまま）を削除せず、`approved-tasks/ADF-OLLAMA-LIVE-CONNECTION-001.superseded-fake-ai-a-plan.json`へリネームして退避。
- `buildApprovedTaskPacket.ts`を`--explicit-adapter ollama-local --roles proposal`で実行し、`approval-id`を新規（`approval-adf-ollama-live-connection-001-explicit-v2`）にして、同じ`approved-tasks/ADF-OLLAMA-LIVE-CONNECTION-001.json`パスへ`--write`。
- 生成結果：`adapterPlan.selections = [{ adapterId: "ollama-local", role: "proposal" }]`、`approval.routingPlanHash = 9f31e661da31c22b71e6432570da7635a9ad5e7e18ef6316bd38c2610fa43f26`（`hashJson(adapterPlan)`と一致）。scope/context/acceptance/stopConditions/targetは旧Packetと同一。

### 9.3 実送信

`ollamaConnectivityProbe.ts`を実Ollamaに対して1回実行した。§8.3で追加した`assertExplicitDispatchIsApproved()`（Packet/Registry/Transport照合）と、`relay.ts`の`assertExplicitDispatchIsApprovedPlan()`（Thread側のPlan照合）の両方を通過し、送信が実行された。

- **Thread**：`thread-2de7d930e27a365b`（旧・不整合Threadの`thread-1330cbb90aaea8d3`とは別ID。retained、削除なし）
- **Turn**：`turn-0-b7e06657e442`、`status: success`、`adapterId: ollama-local`、`role: proposal`
- **応答内容**：「1. いいえ、このパケットを受信しました。2. 与えられた役割名は「proposal」です。3. 以上で応答を終えます。」
- **Thread.adapterPlan**（新規保持フィールド）：`ollama-local`/proposalのみを記録 — Dispatch先とThreadの承認Planが一致していることが構造的に確認できる。
- **所要時間**：22168ms、`costTier: free`

### 9.4 Result Envelope / Evidence / Ledger

- Result Envelope（`threads/thread-2de7d930e27a365b/results/turn-0-b7e06657e442.json`）：`status: success`、`verification: [{ name: "external-answer-received", status: "pass" }]`、`ownerDecisionRequired: true`。
- Evidence Links（`threads/thread-2de7d930e27a365b/evidence-links.json`）：Turn 1件、`resultEnvelopeRef`が正しく参照。
- Ledger（`external-calls.jsonl`）：`provider: "ollama-local-http"`、`status: success`、資格情報は一切含まれない。
- Job Ledger：`job-a974bd6e81682131`（`dispatchKey`がtaskId/scopeHash/contextHash/target/adapterのみに基づき`adapterPlan`を含まないため、旧・不整合実行と同一Jobが再利用された）。**既知の残留不整合**として記録する：このJobの`request.json`/`adapter-plan.json`は旧`fake-ai-a`のまま更新されていない（`registerApprovedJob`は既存Job検出時に再書き込みしない仕様のため）。Thread自体の`adapterPlan`（Dispatch境界判定の実体）は正しく`ollama-local`を保持しており機能的な問題はないが、Job Ledger単体を見た場合の記録としては旧Planのままである点をOwnerに透明に開示する。この扱い（Job Ledgerの補記要否）は本Taskのスコープ外であり、対応要否はOwner判断とする。

### 9.5 Thread表示確認結果

Electronアプリ（GUI）は起動せず、ThreadPanel/Live Boardが内部的に使用するものと同じ読み取り専用パス（`ConversationRelay.listThreads()`、同一runtimeRoot）を直接呼び出して確認した。結果、新Thread `thread-2de7d930e27a365b`（`lastAdapterId: ollama-local`、`state: awaiting-owner`、`turnCount: 1`）が、既存の他Thread（旧・不整合Thread `thread-1330cbb90aaea8d3`を含む）と並んで正しく一覧に含まれることを確認した。

**注記**：これはThreadPanel/Live Boardが使う read-only 関数そのものを直接呼び出した確認であり、GUIを実際に起動してOwnerが目視した確認ではない。受入基準4「既存アプリを再度起動した際にThreadPanel／Live Boardで読み取り専用に確認できる」の完全な充足には、Owner自身によるGUI上の目視確認が別途必要。

### 9.6 事後状態

- Electronアプリ：未起動のまま（送信前後で状態変更なし）。
- commit・push：この時点では未実施。
- Status：当時は`Verifying`。その後、§12でProject Ownerの完了承認を受け、`Done`へ更新した。

## 10. 追加Blocking Finding — Job識別がPacket承認内容を区別しない（Owner Review, 2026-08-13）

### 10.1 指摘内容

§9の実接続後、Project Ownerより2件目のBlocking findingの指摘を受けた。

- 新Thread `thread-2de7d930e27a365b` は `adapterPlan: ollama-local/proposal`、`approvalId: approval-adf-ollama-live-connection-001-explicit-v2` を正しく保持している（§8で修正したThread側の境界は機能していた）。
- しかし、参照先のJob `job-a974bd6e81682131` は**旧Job（fake-ai-a承認時に登録されたもの）がそのまま再利用**されており、`request.json` / `adapter-plan.json` / `approval.json` / `dispatch-packet.json` / `dispatch-ack.json` のすべてが旧`fake-ai-a`承認のまま更新されていなかった（§9.4で「既知の残留不整合」として開示済みの事象そのもの）。
- 旧Threadと新Threadが同一jobIdを共有しており、承認Plan・実Dispatch先・Job Ledgerの3者が一致しない状態は、TaskのEvidence Planeとして受入不可との判断。

### 10.2 根本原因の調査

[contracts.ts](../../src/main/jobLoop/contracts.ts)の`createDispatchKey(packet)`を確認した。

```ts
// 修正前
export function createDispatchKey(packet: ApprovedTaskPacket): string {
  return hashJson([packet.taskId, packet.scopeHash, packet.contextHash, packet.target, packet.adapter, 'debate-round-1'])
}
```

`taskId` / `scopeHash` / `contextHash` / `target` / `adapter`（Adapter"モード"文字列、`multi-ai-routing-v1`など）のみをハッシュ入力としており、**`adapterPlan`・`routingPlanHash`・`approval.approvalId`を一切含んでいなかった**。

[runtime.ts](../../src/main/jobLoop/runtime.ts)の`registerApprovedJob()`は`jobId = job-${dispatchKey.slice(0,16)}`とし、`jobs/<jobId>/request.json`が既に存在する場合は`alreadyRegistered: true`を返して**以後の書き込みを一切行わない**（§9.4で確認した実際の動作）。

§9で生成した正規Packetは、旧Packetとscope/context/target/adapterモード文字列が同一（`adapterPlan`のみ差し替え）だったため、`dispatchKey`が旧Packetと完全一致し、`registerApprovedJob()`が「既に登録済み」と誤判定して旧Jobをそのまま返した。これが根本原因である。

### 10.3 修正方針（Owner指示1-4への対応）

`createDispatchKey()`のハッシュ入力に`packet.approval.approvalId`と`packet.approval.routingPlanHash`を追加した。

```ts
export function createDispatchKey(packet: ApprovedTaskPacket): string {
  return hashJson([
    packet.taskId,
    packet.scopeHash,
    packet.contextHash,
    packet.target,
    packet.adapter,
    packet.approval.approvalId,
    packet.approval.routingPlanHash,
    'debate-round-1'
  ])
}
```

- **1. adapterPlan/routingPlanHashが異なる場合は旧Jobを再利用しない**：`routingPlanHash`（`hashJson(adapterPlan)`と等価）をキーに含めたことで直接満たす。
- **2. 新しいPacketからは新しいJob IDを生成する**：`dispatchKey`が変われば`jobId = job-${dispatchKey.slice(0,16)}`も変わるため、`registerApprovedJob()`の「既存検出」分岐に入らず、新規登録分岐（67-99行）が実行される。
- **3. 新Jobの5ファイルすべてを正規Packetへ束縛**：新規登録分岐は既存コードのまま（無変更）で`request.json` / `adapter-plan.json` / `approval.json` / `dispatch-packet.json` / `dispatch-ack.json`を一括で書き込む。今回のバグは「この分岐に到達できていなかった」ことが原因であり、分岐自体の実装は元から正しかったため、５ファイル束縛のための追加実装は不要だった。
- **4. 既存の旧Job・旧Thread・旧Packetは無変更**：`createDispatchKey`の変更は新規登録される側の判定にのみ影響し、既存ファイルへの書き込み・削除は一切発生しない（§10.4のテストで確認）。
- **approvalId も含めた理由**：`routingPlanHash`のみをキーにすると、同一adapterPlanで異なるApproval（別のapprovalId・別の承認日時）が同一Jobへ束縛されてしまい、`approval.json`が後続の承認を記録できなくなる。Approval自体を一意な識別子として扱うため、`approvalId`も含めた。

### 10.4 追加テスト（[tests/jobLoop.test.ts](../../tests/jobLoop.test.ts)）

- `createDispatchKey`がadapterPlan（routingPlanHash）差異で変化することを確認（Scope/Context/Target/adapterモードは同一のまま）。
- `createDispatchKey`が同一Packetの再実行（バイト単位で同一内容）では変化しないことを確認（既存の idempotent 再送信は無影響）。
- 異なるadapterPlanのPacketが異なるJobId・`alreadyRegistered: false`で新規登録されることを確認。
- 同一Packetの再登録は`alreadyRegistered: true`・同一jobIdで再利用されることを確認（唯一の正当な再利用ケース）。
- 新Jobの`request.json` / `adapter-plan.json` / `approval.json` / `dispatch-packet.json` / `dispatch-ack.json`すべてが新しい`ollama-local`承認Packetと一致することを確認。
- 旧`fake-ai-a` Jobの`request.json` / `approval.json` / `adapter-plan.json`が、後続の新規Job登録後も一切変更されていないことを確認（バイト単位比較）。

### 10.5 検証結果

| 項目 | コマンド | 結果 |
|---|---|---|
| Node設定での型検査 | `tsc --noEmit -p tsconfig.node.json` | Pass |
| CLI/確認スクリプトのコンパイル | `tsc -p tsconfig.cli.json` | Pass |
| 単体・結合テスト全体 | `vitest run` | Pass — Test Files 15 passed (15) / Tests **230 passed (230)**（§9時点の224件から+6件） |
| Electronビルド | `electron-vite build` | Pass |
| diff整形チェック | `git diff --check` | Pass |
| Git状態 | `git status --short --branch` | 想定ファイルのみ変更（`contracts.ts`、`tests/jobLoop.test.ts`が新規変更）、commit・push未実施 |

### 10.6 実Ollamaへの再送信について

Owner指示どおり、**本修正では実Ollamaへの再送信を行っていない**。§9で生成済みの正規Packet（`approved-tasks/ADF-OLLAMA-LIVE-CONNECTION-001.json`、`ollama-local`/proposal承認）はそのまま有効であり、本修正により次回このPacketで`ollamaConnectivityProbe.ts`を実行すれば、新しいJob（現在の`job-a974bd6e81682131`とは異なるjobId）が新規登録され、5ファイルすべてが新しい承認内容に正しく束縛されることをテストで確認済みである。

**追加検証計画（実送信前）**：
1. 本§10のテスト（6件）がすべてPassしていることを再確認済み（上記10.5）。
2. 実送信を承認いただいた場合、`ollamaConnectivityProbe.ts`実行後に生成されるJob（現行の`job-a974bd6e81682131`とは異なるjobIdになる想定）の`request.json` / `adapter-plan.json` / `approval.json` / `dispatch-packet.json` / `dispatch-ack.json`をすべて`cat`で直接確認し、`ollama-local`/proposal/`approval-adf-ollama-live-connection-001-explicit-v2`と一致することを報告する。
3. 旧Job（`job-a974bd6e81682131`）と旧Thread（`thread-1330cbb90aaea8d3`）が変更されていないことも合わせて確認・報告する。
4. §9で既に生成されているThread `thread-2de7d930e27a365b`は、Job Ledgerが旧Jobを指したままの不整合な状態で残っている。これをどう扱うか（無効ラベルの付与、放置、別途Job修復など）はOwner判断を仰ぐ。

（当時の検証時点）Status は `Verifying`。commit・pushはこの時点では未実施。その後、§12でProject Ownerの完了承認を受け、`Done`へ更新した。

## 11. §10修正後の正規実接続（Owner承認、2026-08-13）

### 11.1 事前確認

- Electronアプリ：`ps aux`で未起動を確認。
- Ollama到達可能性：`curl /api/tags`（読み取りのみ）で200応答、`llama3:latest`存在を確認。

### 11.2 実送信結果

既存の正規Packet（`approved-tasks/ADF-OLLAMA-LIVE-CONNECTION-001.json`、`ollama-local`/proposal、`approval-adf-ollama-live-connection-001-explicit-v2`）に対して`ollamaConnectivityProbe.ts`を実行した。§10の修正により、**新しいJob**（`job-b0770ca2786ea9bf`）が新規生成され、**新しいThread**（`thread-d497734c1978f74f`）が作成された（同じPacketで再実行したにもかかわらず、`dispatchKey`が`approvalId`/`routingPlanHash`を含むようになったため、旧Job/旧Threadとは別の識別子になった）。

- **Thread**：`thread-d497734c1978f74f`（`adapterPlan`は`ollama-local`/proposalを正しく保持）
- **Job**：`job-b0770ca2786ea9bf`（新規登録、`alreadyRegistered: false`）
- **Turn**：`turn-0-226d34e64d93`、`status: success`
- **応答内容**：「1. はい、受信しました。2. プロポーザル（Proposal）です。3. 以上で応答を終えます。」
- **所要時間**：28699ms、`costTier: free`

### 11.3 Job Ledger 5ファイルの整合性確認（`cat`で直接確認）

| ファイル | 内容 |
|---|---|
| `request.json` | `task.adapterPlan.selections` = `ollama-local`/proposal |
| `adapter-plan.json` | `ollama-local`/proposalのみ |
| `approval.json` | `approvalId: approval-adf-ollama-live-connection-001-explicit-v2`、`routingPlanHash`はPacketと一致 |
| `dispatch-packet.json` | `adapterPlan` = `ollama-local`/proposal |
| `dispatch-ack.json` | `status: acknowledged` |

5ファイルすべてが正規Packetの承認内容と完全に一致していることを確認した。

### 11.4 Thread/Evidence/Ledgerの整合性確認

- `thread.json`：`jobId: job-b0770ca2786ea9bf`（新Job）、`adapterPlan`が`ollama-local`/proposalと一致、`state: awaiting-owner`
- `evidence-links.json`：`jobId`・`resultEnvelopeRef`が新Thread/新Jobと一致
- `external-calls.jsonl`：`provider: ollama-local-http`、`status: success`、資格情報なし
- Result Envelope：`status: success`、`verification: [{ name: "external-answer-received", status: "pass" }]`

承認Plan（Packet）・実Dispatch先（Thread.adapterPlan）・Job Ledger（5ファイル）の3者がすべて一致していることを確認した。

### 11.5 旧Job・旧Thread・旧Packetの無変更確認

- 旧Job`job-a974bd6e81682131`の`adapter-plan.json`：`fake-ai-a`のまま、変更なし
- 旧Thread`thread-1330cbb90aaea8d3`（§6-8由来）：`jobId: job-a974bd6e81682131`のまま、削除なし
- §9のThread`thread-2de7d930e27a365b`：`jobId: job-a974bd6e81682131`のまま、削除なし（**Job不整合を含んだ状態のまま残存 — §11.6参照**）
- 退避済みPacket`ADF-OLLAMA-LIVE-CONNECTION-001.superseded-fake-ai-a-plan.json`：削除なし

### 11.6 残存する扱い決定事項（Owner判断待ち）

`thread-1330cbb90aaea8d3`・`thread-2de7d930e27a365b`の2件は、いずれも旧Job`job-a974bd6e81682131`（fake-ai-a承認のまま）を指したまま残存している。§10の修正はこれらのJobを修復するものではなく、**以後の新規登録が正しく分離される**ことを保証するのみである。この2Threadを無効ラベル付きで保持するか、他の対応を取るかはOwner判断とする。

### 11.7 事後状態

- Electronアプリ：未起動のまま。
- commit・push：この時点では未実施。
- Status：当時は`Verifying`。後続の§12でProject Ownerの完了承認を受け、`Done`へ更新した。

## 12. Owner完了承認・Done（2026-08-13）

Project Ownerより、Electron GUIで`thread-d497734c1978f74f`のThreadPanel／Live Board表示を確認した旨の報告を受けた。

- **GUI確認結果**：Result・Adapter・状態・Evidenceリンクの表示に問題なし（Owner自身による目視確認、受入基準4を充足）。
- **旧Threadの扱い**：`thread-1330cbb90aaea8d3`（§6-8、Job/Dispatch境界不整合を含む）・`thread-2de7d930e27a365b`（§9、Job Ledger不整合を含む）は、いずれも削除・修復せず、**過去の不整合証跡としてそのまま保持**する方針をOwnerが確定。退避済みPacket`ADF-OLLAMA-LIVE-CONNECTION-001.superseded-fake-ai-a-plan.json`も同様に保持。
- **受入基準7項目の最終状態**：
  1. ollama-localは明示adapterId指定でのみ到達可能、自動Routing対象外 — 充足
  2. Fake討論・Anthropic経路の回帰なし — 充足
  3. 実Ollamaへの実接続でResult Envelope・Evidence・Ledger生成、かつJob Ledgerとの整合性確認済み（`thread-d497734c1978f74f` / `job-b0770ca2786ea9bf`） — 充足
  4. 既存アプリ再起動時にThreadPanel／Live Boardで読み取り専用に確認できる — 充足（Owner目視確認済み）
  5. index.ts／Renderer／IPCへの変更なし — 充足
  6. 資格情報・APIキー不使用 — 充足
  7. 異常系が明確な失敗状態として記録される — 充足（ユニットテストで確認済み）
- **Project Owner承認**：ADF-OLLAMA-LIVE-CONNECTION-001の完了を承認。Status を `Done` へ更新。
- commit・push：Project Ownerの後続指示により、完了承認後に実施する。

Status は `Done`。Project Ownerの指示により、本ワークツリーの承認済みADF変更をcommit・pushする。

## ADF Execution Summary

```json adf-execution-summary
{
  "adfExecutionSummary": "v1",
  "taskId": "ADF-OLLAMA-LIVE-CONNECTION-001",
  "objective": "既に起動済みのローカルOllama（llama3:latest、127.0.0.1:11434）へ、既存のProvider-neutral Adapter契約を使い一回だけ実接続し、Synthetic Packet送信から実推論受信、Result Envelope・Evidence・Ledger記録、Ownerレビュー待ちまでを、既存アプリを変更しない独立スクリプトで実証する。",
  "scope": {
    "inScope": [
      "Registry ollama-localのstatus変更（planned→available、1エントリのみ）",
      "/api/tagsによるreadiness確認ヘルパーの追加（preflightExternalSendは変更しない）",
      "独立したConversationRelayを構築し、明示adapterId指定で一回だけ実行する確認スクリプトの追加",
      "実Ollamaへの一回の実接続検証と、注入fetchによる決定的単体テスト"
    ],
    "outOfScope": [
      "index.ts / Renderer / IPCの変更",
      "自動Routingへの組込み",
      "複数モデル対応、常設Thread運用、Ollama Cloud、APIキー、Claude Code CLI接続",
      "ADF-ADAPTER-PROVIDER-NEUTRAL-001の成果物の変更"
    ]
  },
  "context": {
    "githubTask": "docs/tasks/ADF-OLLAMA-LIVE-CONNECTION-001.md",
    "obsidianContext": [],
    "adoptedPrinciples": ["owner-approval", "local-only-is-not-zero-risk", "fake-success-is-not-real-ai-proof"]
  },
  "acceptance": [
    "ollama-localは明示adapterId指定でのみ到達可能で、自動Routingには含まれない",
    "Registry変更後も既存のFake Adapter自動討論・既存External Adapter経路が回帰しない",
    "実Ollamaへ一回だけ実接続し、Result Envelope・Evidence・Ledgerが生成される",
    "index.ts / Renderer / IPCへの変更が無い",
    "資格情報・APIキーを一切扱わない",
    "Ollama停止・非200・timeout・cancel・malformed応答が明確な失敗状態として記録される"
  ],
  "stopConditions": [
    "Ollama実応答の形状が既存Transportの前提と食い違う場合",
    "/api/tagsに対象モデルが存在しない場合",
    "endpoint確認が失敗する場合",
    "原因不明の再現不能な失敗が生じた場合"
  ]
}
```
