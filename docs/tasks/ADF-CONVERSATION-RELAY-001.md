# Task — ADF-CONVERSATION-RELAY-001: ADF上の会話Threadと複数AI Relayを実装する

> Type: Implementation
> Status: Verifying
> Owner: Claude Code
> Review AI: Project Owner（最終Review）
> Related Tasks: [ADF-JOB-LOOP-001](./ADF-JOB-LOOP-001.md) / [ADF-DISPATCH-ACK-001](./ADF-DISPATCH-ACK-001.md) / [ADF-CLAUDE-ADAPTER-001](./ADF-CLAUDE-ADAPTER-001.md)

このTaskは `docs/workflow/TASK_LIFECYCLE.md` と `docs/workflow/AI_DELEGATION_CHARTER.md` に従う。実装担当はClaude Codeであり、最終Diff / Verification ReviewはProject Ownerが行う。

## 1. Objective

- なぜ今このTaskが必要か: `ADF-JOB-LOOP-001`はA提案→B反論の1往復をJobの最終Result一件として畳み込むため、Project Ownerが「AI同士の会話」として追跡・介入できない。ADFの目的は搬送路ではなく、Owner起点の会話をADF上で確認・制御できることである。
- 達成したい結果: Task配下にThread（順序付きTurn列）を一次データとして持ち、複数Adapterが同じThreadへ発言し、Ownerが途中で継続・停止・承認・次Task化を選べる状態にする。
- 対象ユーザー: Project Owner。ADF画面上でAIの発言と自分の判断点を確認する。

## 2. Approval

- Approval required?: Yes
- 承認対象: Thread / Turnデータモデル、Adapter Interface 4関数、Fake Adapterによる複数ターン会話、Owner操作、最小UI、外部AI候補のRegistry登録（`planned`のみ）。
- 承認者: Project Owner
- 承認記録: Project Ownerが2026-08-10に本Taskの設計と実装を指示。実装担当をCodexからClaude Codeへ変更する指示も同日に受領。
- 実接続（認証・外部送信・課金）は本Taskの承認に含まれない。別Task・別承認とする。

## 3. Required Context

### GitHub

- [AGENTS.md](../../AGENTS.md) / [AI協働ルール](../../guidelines/AI_COLLABORATION.md) / [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md) / [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)
- [ADF Multi-AI Control Plane](../design/ADF_MULTI_AI_CONTROL_PLANE.md) / [ADF Agent Adapter Contract](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- [ADF-JOB-LOOP-001](./ADF-JOB-LOOP-001.md) / [ADF-DISPATCH-ACK-001](./ADF-DISPATCH-ACK-001.md) / [ADF-CLAUDE-ADAPTER-001](./ADF-CLAUDE-ADAPTER-001.md)
- 開始時点のbranch: `codex/adf-pilot-governance`。既存の未コミット・未追跡差分は対象外として保持する。

### Obsidian

| ノート | 採用する制約・判断 |
|---|---|
| `Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md` | Ownerがプロンプトと結果を手作業でコピーし続けないことが最初の価値。Result自動回収と正本採用を分ける。ローカルRuntimeとファイルLedgerで足り、DB・ブローカーは作らない。 |
| `Projects/AI-Development-Framework/00_MOC.md` | GitHubを実装・Task・検証の正本、Obsidianを思想・判断理由の正本として維持する。 |

## 4. Scope

### In scope

- `ConversationThread` / `ConversationTurn` / `ThreadState` / `OwnerAction` の共有型。
- Thread検証ロジック（順序保証、重複turnId拒否、親Turn hash照合、状態遷移、最大Turn数）。
- Adapter Interface: `send_to_adapter` / `receive_from_adapter` / `continue_job` / `get_conversation_state`。
- Fake Adapter A（Proposal）／B（Critic）による複数ターン会話。
- `thread.json` と `thread-events.jsonl` によるローカル会話Ledger。
- Owner操作（継続・停止・承認・次Task化）と履歴記録。
- Thread一覧・Turn時系列・Owner操作を表示する最小UIとIPC境界。
- 外部AI候補（Claude / Codex）の`planned`登録。

### Out of scope（別Task・別承認）

- APIキーの取得・保存、認証、実HTTP送信、Claude CLI／Codex CLI起動、外部AIへの実データ送信、課金。
- MCP接続、外部Repository操作、worktree作成。
- GitHub／Obsidian正本の自動書込み、commit、push、merge、公開。
- 自律的な無限会話、並列Job、DB、クラウド同期、汎用チャットUI、AI人格設定。

## 5. データモデル

```text
Task ──1..n──> Thread ──1..n──> Turn
                 │                │
                 │                ├── jobId / dispatchId（実行の参照）
                 │                ├── respondsToTurnId + respondsToHash（親Turnの照合）
                 │                └── resultEnvelopeRef / errorRef（Evidence参照）
                 └── ownerDecisions[]（継続・停止・承認・次Task化の履歴）
```

- Threadは`taskId`に必ず紐づく。`thread.json`がADF内部の会話Ledgerであり、GitHub／Obsidian正本を置き換えない。
- Turnは`success` / `partial` / `failed` / `invalid` を`status`で識別する。`failed`と`invalid`はThreadを`failed`にする。`partial`はOwner判断へ回す。
- Boardと画面はThreadの派生表示であり、一次データにしない。

### Thread状態遷移

| From | 許可される To |
|---|---|
| `open` | `awaiting-owner` / `stopped` / `failed` |
| `awaiting-owner` | `open` / `stopped` / `approved` / `failed` |
| `approved` | `completed` / `stopped` |
| `stopped` / `completed` / `failed` | （終端） |

`approved`から`open`へは戻さない。Owner承認後の再依頼は、`awaiting-owner → open`（`continue`）の経路で行う。

### 無限会話の防止

- 次Turnは`open`状態でのみ送信できる。Turn受信後は必ず`awaiting-owner`へ移り、Ownerの`continue`がなければ次のTurnは発生しない。
- `maxTurns`（既定6）を超える送信は行わず、超過時は`failed`と`stopReason`を記録する。

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 逸脱・追加判断 |
|---|---|---|---|
| 2026-08-10 | Claude Code | Thread / Turn型、Thread検証、Relay、Fake会話Adapter、テスト、IPC、UIを追加 | 実装担当をCodexからClaude Codeへ変更するProject Ownerの指示による |
| 2026-08-10 | Claude Code | `AdapterConnection`に`unknown`を追加し、`claude-code-first-real`の`connection`を`cli`から`unknown`へ変更 | 「ClaudeについてSDKかCLIかを今回確定しない」というProject Ownerの指示に従い、未検証の確定記述を外した |
| 2026-08-10 | Claude Code | `claude-external` / `codex-external`を`status: planned`・`connection: unknown`・`dataPolicy: external-send`で登録 | 登録のみ。Routingとdispatchからは`available` / `local-only`条件で除外される |
| 2026-08-10 | Claude Code | Project Ownerの検証で判明した4件の欠陥を修正（下記「初回実装の欠陥と修正」） | 承認境界の迂回はP1として最優先で修正した |

## 6.1 初回実装の欠陥と修正

Project Ownerが同梱ランタイムのNode.jsでtypecheck / Vitest 43件 / build / package / `git diff --check`を実行しPassしたうえで、設計上の欠陥を4件検出した。いずれも自動テストでは検出できない契約違反であり、次のとおり修正した。

| # | 指摘 | 修正内容 |
|---|---|---|
| 1（P1） | 承認済みTaskを経由せずThreadを開始できた（承認境界の迂回） | `startThread`の引数を`ApprovedTaskPacket`にし、Jobと同じ`validateApprovedTask`ゲートを通す。Threadは`approvalId` / `scopeHash` / `contextHash` / `routingPlanHash`を保持する。IPCは承認済みPacketをディスク（`approved-tasks/<taskId>.json`）から読むだけで、rendererはtaskIdを指名できるのみとし、承認を捏造できない |
| 2 | Adapter Interfaceが`respond`のみで、外部AIを差し替えられなかった | Adapter契約を`send` / `getState` / `receive`の非同期3段に再定義。外部AIが受理と回答を別時点で行う形をAdapter側の契約に持たせ、Relayは`continue_job`と`get_conversation_state`の統括に限定した |
| 3 | 受信Handleが`dispatchId`しか照合されず、`jobId` / `adapterId` / `role` / `sequence`を呼び出し元が差し替えられた | pendingにHandle全体のhashを保存し、受信時に`hashJson(handle)`と完全一致照合する。Turn生成には呼び出し元のHandleではなく保存済みpendingのみを使う |
| 4 | 明示指定したAdapterのroleを検証せず、Critic順にProposalを実行できた | `sendToAdapter`で、Turn順序から求めた期待roleとAdapterのroleが一致しない場合に停止する |
| 補足 | UIのOwner操作ボタンが状態に関係なく表示され、無効操作でエラーになった | Thread状態遷移表をUI側にも持たせ、その状態で許可される操作のみ表示する。終端状態では操作なしと明示する |

## 6.2 二次レビューで判明した欠陥と修正

修正版はProject Ownerの検証でtypecheck / Vitest 49件 / build / package / `git diff --check`をPassしたが、ADF全体の受入としては`Changes requested`となり、さらに4件を指摘された。次のとおり修正した。

| # | 指摘 | 修正内容 |
|---|---|---|
| 5 | 既存Job Runtime／Dispatch ACKと未接続。Thread専用の合成`jobId`を作り、`Approval → Dispatch ACK → Job登録`を迂回していた | `JobRuntime`から`registerApprovedJob()`を切り出し（`runApprovedTask`は同メソッドを呼ぶだけの純粋なリファクタで既存挙動は不変）、`startThread`がこれを経由する。ACKが`preflight-valid`でなければThreadを作らない。Threadは登録済みJobの`jobId`と`inputHash`に束縛される |
| 6 | Result Envelope／Evidenceと未接続。Resultなしでも`approve → next-task → completed`が成立した | Turn受信ごとにADF側でResult Envelopeを組み立て`validateResultEnvelope()`で検証し、`threads/<id>/results/<turnId>.json`と`evidence-links.json`へ保存する。`taskId` / `jobId` / `inputHash` / `scopeHash`はADFが与えるためAdapterは詐称できない。`success`は最低1件のpass検証を要求し、`approve`は検証済みEnvelopeを持つTurnが無ければ拒否する |
| 7 | UIの「継続」が状態を戻すだけで、送信が別操作だった | `continueWithOwnerApproval()`を追加し、承認と次Turn送信を一操作にした。IPCの`decideThread`は`continue`を拒否し、`continueThread`へ誘導する。UIは`open`なら「最初のAIへ送信」、`awaiting-owner`なら「継続（承認して次のAIへ送信）」だけを出す |
| 8 | pendingの確認と書込みが排他的でなく、同時dispatchが競合しうる | pendingの作成を`flag: 'wx'`の排他作成にし、解放は削除に変更。加えてThread単位の直列化キューを設け、同一Thread上の`send` / `receive` / `owner decision`が並行しないようにした |

## 6.3 三次レビューで判明した欠陥と修正

2次修正版はtypecheck / Vitest 56件 / build / packageをPassしたが、さらに4件を指摘された。1〜3を修正し、4は環境要因として原因を特定した。

| # | 指摘 | 修正内容 |
|---|---|---|
| 9 | Jobの実行状態がThreadと連動せず、会話が進んでもJob Ledgerは`queued`のままだった | Turn送信時に`queued → running`、Thread終端時に`stopped → cancelled` / `failed → failed` / `approved`・`completed` → `awaiting-review`へ同期する。`awaiting-review`はJobの終端状態のため、会話の途中はJobを`running`に保つ。遷移不能な組み合わせは`job.state-skipped`として記録し、Threadを壊さない |
| 10 | 承認時のEvidence再検証が弱く、`resultEnvelopeRef`の文字列とTurn statusしか見ていなかった | Turnに`resultEnvelopeHash`を保存し、`approve`時に実ファイルを再読込して、存在・hash一致・`validateResultEnvelope`・status一致・pass検証の有無をすべて再確認する。改ざん・削除は承認を拒否する |
| 11 | `continueWithOwnerApproval()`がOwner決定記録とcontinueJobを別々のキュー処理として呼び、間に別のOwner操作が割り込めた | 全公開メソッドを`*Unsafe`内部実装＋単一の`serialise`ラッパに再構成し、継続を1つの直列化ステップにまとめた。内部からは`*Unsafe`のみを呼ぶためネスト待ちも起きない |
| 12 | UI実機確認が未完了 | `pnpm-workspace.yaml`へ`electron: true`を追加してElectronを再構築し、開発版Electronで起動・画面操作を完了 |

### 承認Packetの正本二重化について

指摘のとおり`approved-tasks/`と`jobs/<jobId>/approval.json`が併存していたため、役割を次のとおり分離した。二重の正本は作らない。

| 場所 | 役割 |
|---|---|
| GitHub Task | Approvalの**意味的正本**。承認の事実・対象・理由はここに残る |
| `approved-tasks/<taskId>.json` | Ownerが承認済みPacketを置く**入力（受付箱）**。rendererからは書き込めない |
| `jobs/<jobId>/approval.json` ほか | `registerApprovedJob`が書く**実行Ledger**。ACK・Packet hash付きの記録 |
| `threads/<threadId>/` | 会話Ledger。`evidence-links.json`が上記Job Ledgerを参照する |

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 備考 |
|---|---|---|---|---|
| 自動 | TypeScript typecheck（node / web） | Pass（**3次修正後**） | Project Owner | 同梱ランタイムのNode.jsを使用 |
| 自動 | Vitest 60 tests | Pass（**3次修正後**） | Project Owner | 5 test files |
| 自動 | electron-vite build / electron-builder package | Pass（**3次修正後**） | Project Owner | |
| 静的 | `git diff --check` | Pass | Claude Code / Project Owner | |
| 手動 | ADF画面でのThread表示とOwner操作 | Pass | Project Owner | 開発版ElectronでThread開始 → Proposal → 継続 → Critic → Result承認 → 次Task化を実操作 |
| 手動 | Electron起動とローカル画面表示 | Pass | Project Owner | Electron v43.2.0、外部送信なし、`localhost:5173`で確認 |
| 自動 | **3次修正後**のtypecheck / test / build | Pass | Project Owner | 同梱ランタイムを使用 |
| 自動 | 既存Job Loop / Dispatch ACKの回帰 | Pass | Project Owner | Vitest 60 testsに含む |
| 静的 | 追加コードに外部通信・認証・child process・APIキー参照が無いことのソース確認 | Pass | Claude Code | `fetch`／`http`／`child_process`／`process.env`の参照を追加していない |
| 静的 | 既存の未コミット・未追跡差分を変更していないことの確認 | Pass | Claude Code | 変更したのは下記の実装ファイルのみ |
| 静的 | 状態遷移表・受入条件と実装コードの突き合わせ | Pass | Claude Code | 自動テストの代替にはならない |

**検証結果**: 3次修正後のtypecheck、Vitest 56 tests、build/package、既存Job Loop / Dispatch ACK回帰、Electron起動、Thread画面操作をProject Ownerが確認し、すべてPassした。開発サーバー終了後もThread / Job / Result / Owner判断のLedgerがローカルに保存されていることを確認した。

### Electron起動エラーの原因と対応

`node_modules/electron/` に `dist/` と `path.txt` が存在せず、バイナリがダウンロードされていなかった。原因は `pnpm-workspace.yaml` の `allowBuilds` に`electron`が含まれず、postinstallがブロックされていたことである。`electron: true`を追加して再構築し、Electron v43.2.0の起動を確認した。

```yaml
allowBuilds:
  esbuild: true
  electron: true
  electron-winstaller: false
```

### 受入条件の照合（コードレビューによる確認のみ）

- [x] Job Ledgerの状態がThreadの進行に追随する（`queued → running → awaiting-review / cancelled / failed`）。
- [x] 承認時にResult Envelopeの実ファイルを再読込し、hash一致・schema・status一致・pass検証を再確認する。
- [x] 「継続」が単一の直列化ステップで、間に他のOwner操作が割り込めない。
- [x] Threadは`Approval → Dispatch Packet → Dispatch ACK → Job登録`を通過した後にのみ作成され、登録済みJobに束縛される。
- [x] Turnごとに`validateResultEnvelope`済みのResult Envelopeと`evidence-links.json`を生成する。
- [x] 検証済みResultを持たないThreadは`approve`できない。
- [x] Ownerの「継続」が承認と次Turn送信を一操作で行う。
- [x] 同一Thread上の同時dispatchは排他作成と直列化キューで1件だけが成立する。
- [x] Threadは`validateApprovedTask`を通過した承認済みPacketからのみ作成でき、承認情報を保持する。
- [x] Adapter契約が`send` / `getState` / `receive`を持ち、外部AIが後から回答する形へ差し替えられる。
- [x] 受信時に保存済みpending dispatchとHandle全体を照合し、Turn生成には保存済み情報のみを使う。
- [x] Turn順序から求めた期待roleと一致しないAdapterを拒否する。
- [x] Task配下にThreadを作り、Turnを順序付きで保存する。
- [x] 同一Thread内の重複turnIdと順序の飛びを拒否する。
- [x] `respondsToTurnId`と`respondsToHash`を親Turnと照合する。
- [x] Fake A（Proposal）とFake B（Critic）が2Turn以上会話し、再依頼・再反論まで到達する。
- [x] Ownerが継続・停止・承認・次Task化を選べ、履歴を残す。
- [x] `partial`はOwner判断へ、`failed`／`invalid`はThreadを`failed`にする。
- [x] 最大Turn数を超えて会話を継続しない。
- [x] Pending中の重複dispatchを拒否する。
- [x] `planned`な外部Adapter（Claude / Codex）はdispatchできない。
- [x] GitHub／Obsidian正本を自動変更しない。
- [x] 上記すべてを自動テストと実機で確認する。

### 実装ファイル

- 新規: `src/shared/threadTypes.ts`、`src/main/jobLoop/thread.ts`、`src/main/jobLoop/relay.ts`、`src/main/jobLoop/conversationAdapters.ts`、`src/main/relayService.ts`、`src/renderer/src/ThreadPanel.tsx`、`tests/conversationRelay.test.ts`
- 変更: `src/shared/jobLoopTypes.ts`（`AdapterConnection`に`unknown`追加）、`src/main/jobLoop/adapterRegistry.ts`（外部候補登録・`connection`修正）、`src/main/jobLoop/runtime.ts`（`registerApprovedJob`抽出）、`src/main/jobLoop/ledger.ts`（排他作成・削除）、`src/main/index.ts`（Relay IPC）、`src/preload/index.ts`（`adfRelay`公開）、`src/renderer/src/env.d.ts`、`src/renderer/src/App.tsx`（ThreadPanel挿入）、`src/renderer/src/styles.css`、`tsconfig.web.json`（shared型のinclude追加）

`runtime.ts`は`ADF-JOB-LOOP-001` / `ADF-DISPATCH-ACK-001`の成果物である。今回の変更は`runApprovedTask`の前半を`registerApprovedJob`として抽出し、`runApprovedTask`がそれを呼ぶだけにした加算的リファクタで、既存の挙動・状態遷移・書き出すファイルは変えていない。3次修正後の回帰テストはProject OwnerがPassを確認した。

## 8. 外部AI接続について

実施したこと:

- Adapter Registryへ`claude-external`と`codex-external`を`status: planned`、`connection: unknown`、`dataPolicy: external-send`、`costTier: unknown`で登録した。
- `send_to_adapter`で、`status !== 'available'`または`dataPolicy !== 'local-only'`のAdapterを拒否する境界を実装した。
- 送信と受信を`send_to_adapter`／`receive_from_adapter`に分離し、外部AIが非同期に回答する形へ差し替えられる構造にした。

実施していないこと:

- 認証、APIキーの取得・保存、実HTTP送信、Claude／Codex CLIの起動、外部AIへの実データ送信、課金、MCP接続。
- ClaudeがSDKとCLIのどちらで接続されるかの確定。今回は`unknown`のままとした。

## 9. 残存リスク・未検証事項

- 自動検証と開発版Electronでの実機確認は完了した。パッケージ版のコード署名は未実施であり、配布用署名は別Taskとする。
- Fake Adapterでの会話成立は、実AIの応答品質・遅延・失敗率・独立性を何も証明しない。
- `maxTurns`既定値6に運用上の根拠はなく、実測前の暫定値である。
- Relayは単一プロセス・foreground前提であり、アプリ再起動時のpending dispatch復旧は未実装。
- `ADF-JOB-LOOP-001`のJob Loopとの併存は型レベルで整合させたが、両者を同時に動かす統合テストは書いていない。
- `claude-code-first-real`の`connection`を`cli`から`unknown`へ変更したため、`ADF-CLAUDE-ADAPTER-001`の記述と差異が生じる。同Taskの記述整合はProject Ownerの判断事項とする。

## 10. Project OwnerがDiff / Verification Reviewで判断すべき点

1. 3次修正後のtypecheck / test / buildと、`ADF-JOB-LOOP-001` / `ADF-DISPATCH-ACK-001`の既存テスト回帰はPass確認済み。
2. `pnpm-workspace.yaml`の`allowBuilds`へ`electron: true`を追加し、Electron起動とThread操作をPass確認済み。
3. 承認Packetの三層（GitHub Task＝意味的正本 / `approved-tasks/`＝入力受付 / `jobs/<jobId>/`＝実行Ledger）の役割分担を受け入れるか。
4. Thread（`thread.json`）を会話の一次データとし、Board／画面を派生表示とする設計を受け入れるか。
5. `approved`から`open`へ戻さず、再依頼を`continue`経路に限定した解釈で問題ないか。
6. `maxTurns`既定6と、Owner操作なしでは次Turnが出ない制約が運用上妥当か。
7. `claude-code-first-real`の`connection`変更（`cli` → `unknown`）を承認するか、`ADF-CLAUDE-ADAPTER-001`側を合わせるか。
8. 実装担当（Claude Code）と最終Review担当（Project Owner）の分離で、独立レビュー要件を満たすとみなすか。

## 11. Handover

- 次の安全な一手: Project Ownerが最終Diffを確認し、commit / pushの扱いを判断する。
- 後続Task候補: 実外部Adapter接続（別承認）、pending dispatchの再開設計、Job LoopとThreadの統合、Turn単位の計測記録。
- add / commit / push / merge / 公開は、Project Ownerの明示依頼までは行わない。
