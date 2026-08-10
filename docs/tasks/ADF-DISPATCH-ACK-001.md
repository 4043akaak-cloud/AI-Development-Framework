# Task — ADF-DISPATCH-ACK-001: Dispatch握手と実行前照合を実装する

> Type: Implementation
> Status: Verifying
> Owner: Codex
> Review AI: Project Owner（最終Review）
> Related Task: [ADF-JOB-LOOP-001](./ADF-JOB-LOOP-001.md)

このTaskは `docs/workflow/TASK_LIFECYCLE.md` と `docs/workflow/AI_DELEGATION_CHARTER.md` に従う。

## 1. Objective

- なぜ今このTaskが必要か: Jobを登録・実行する前に、ADFが「どのTaskを、どの対象へ、どの権限で渡したか」を受信側のACKで照合できなければ、誤配送や未確認実行を検出できないため。
- 達成したい結果: Fake Receiverを使い、`dispatched → acknowledged → preflight-valid → running` の境界をローカルで検証する。
- 完了条件: Task ID、packet hash、scope hash、capability、repository、branch、worktree、許可ファイル、禁止変更が完全一致したACKだけがJob実行へ進み、不一致またはACK欠落はJob登録前に停止する。

## 2. Approval

- Approval required?: Yes
- 承認対象: Dispatch Packet型、Fake Receiver、厳密なACK照合、JobRuntime統合、失敗系テスト。
- 承認者: Project Owner
- 承認記録: Project Ownerが2026-08-10に`設計OK`と明示。
- 承認日時: 2026-08-10

## 3. Required Context

### GitHub

- [Current State](../project/CURRENT_STATE.md)
- [ADF Multi-AI Control Plane](../design/ADF_MULTI_AI_CONTROL_PLANE.md)
- [ADF Agent Adapter Contract](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- [ADF-JOB-LOOP-001](./ADF-JOB-LOOP-001.md)
- 開始時点のbranch: `codex/adf-pilot-governance`
- 開始時点の既存未コミット・未追跡差分は対象外として保持する。

### Obsidian

| ノート | Taskで採用する制約 |
|---|---|
| `Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md` | Local RuntimeとFake Adapterを先に検証し、外部AI接続は後続に分ける。 |
| `Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md` | Control、Work、Evidenceを分け、Owner承認とEvidenceを統合前提にする。 |
| `Projects/AI-Development-Framework/09_Control_Plane_Foundation実装_2026-08-04.md` | Foundationと実行・権限付与・外部接続を混同しない。 |

## 4. Scope

### In scope

- `DispatchTarget`、`DispatchPacket`、`DispatchAck`、dispatch状態の共有型。
- Fake ReceiverによるACK生成。
- Task ID、dispatch ID、packet hash、scope hash、capability、対象repository／branch／worktree、許可ファイル、禁止変更の完全照合。
- ACK欠落・不一致時の`Blocked / Delivery not confirmed`相当の例外と、Job／Adapter実行前停止。
- 有効なACKのLedger記録、Job実行への接続、既存Board Projectionへのdispatch状態表示。
- 正常系、ACK欠落、packet hash不一致、対象不一致、capability不一致のテスト。

### Out of scope

- Claude Code、Gemini、OpenRouter等の実AI接続。
- MCP、API、認証、外部送信、課金。
- 実worktree作成、対象repositoryの変更、commit、push、merge。
- 複数Receiverの並列実行、常駐Worker、DB、動的モデル選定。
- GitHub／Obsidian正本への自動書込み、Taskの自動Done。

## 5. Plan

| Step | 行うこと | 検証方法 | Reversible? |
|---|---|---|---|
| 1 | GitHub Task正本とCurrent Stateを更新する | 差分確認 | Yes |
| 2 | Dispatch PacketとACK契約、Fake Receiverを追加する | 型検査、照合テスト | Yes |
| 3 | JobRuntimeでACKをJob登録・Adapter実行より前に検証する | 欠落・不一致テスト | Yes |
| 4 | 有効な握手をLedgerとBoardへ記録する | イベント・Projection確認 | Yes |
| 5 | typecheck、Vitest、build、diff境界を確認する | 自動・静的検証 | Yes |

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 逸脱・追加判断 |
|---|---|---|---|
| 2026-08-10 | Codex | Task記録を追加し、Project Ownerの設計承認後に実装開始 | 既存差分は対象外として保持 |
| 2026-08-10 | Codex | Dispatch契約、Fake Receiver、ACK完全照合、JobRuntime統合、Board dispatch状態を実装 | ACK不一致・欠落はJob登録前に停止 |

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
|---|---|---|---|---|
| 自動 | TypeScript typecheck | Pass | Codex | |
| 自動 | Vitest（既存を含む24 tests） | Pass | Codex | |
| 自動 | electron-vite build / electron-builder arm64 package | Pass | Codex | Developer ID signingは未実施 |
| 静的 | `git diff --check` | Pass | Codex | |
| 手動相当 | 有効ACKのdispatchイベント、Job実行、Board `preflight-valid`表示 | Pass | Codex | 視覚的Board UI操作は後続確認 |
| 失敗系 | ACK欠落、packet hash、target branch、capability不一致でJob未作成 | Pass | Codex | |

- 受入条件の照合:
  - [x] Task ID、dispatch ID、packet hash、scope hashをACKと照合する。
  - [x] repository、branch、worktree、許可ファイル、禁止変更をACKと照合する。
  - [x] capabilityを完全一致で照合する。
  - [x] 有効ACKの後だけJob登録・Fake Adapter実行へ進む。
  - [x] ACK欠落・不一致を`Blocked / Delivery not confirmed`としてJob登録前に停止する。
  - [x] GitHub／Obsidian正本、外部repository、worktreeを自動変更しない。
- 実装ファイル: `src/main/jobLoop/dispatchAck.ts`、`src/main/jobLoop/runtime.ts`、`src/main/jobLoop/contracts.ts`、`src/shared/jobLoopTypes.ts`、`tests/jobLoop.test.ts`
- 残るリスク・未検証事項: Fake Receiverは実AIの配送保証を証明しない。実Claude Adapter、実worktree、外部送信、MCP、Receiverのプロセス中断復旧、署名済みアプリの実機起動は未検証。

## 8. Handover

- 次の安全な一手: Project Ownerが差分、テスト、ACK停止境界をレビューする。
- 後続Task候補: 単一Claude Code Adapter、worktree境界、Result Intake、動的Board、MCP、複数AI接続。

## 9. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 |
|---|---|---|---|
| Plan / Scope | Approved | `設計OK` | 2026-08-10 |
| Diff / Verification | Pending | 自動検証はPass。Project Ownerの差分・受入レビュー待ち | |
