# Task — ADF-JOB-LOOP-001: Fake Adapterによる最小討論Job Loopを実装する

> Type: Implementation
> Status: Verifying
> Owner: Codex
> Review AI: Project Owner（最終Review）
> Related Goal / MVP / Roadmap: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md)

このTaskは `docs/workflow/TASK_LIFECYCLE.md` と `docs/workflow/AI_DELEGATION_CHARTER.md` に従う。

## 1. Objective

- なぜ今このTaskが必要か: 手動・読み取り専用Boardと管制設計の次に、ADFが承認済みTaskを受け取り、複数AIの討論結果をEvidenceとしてOwnerへ戻す最小搬送路を検証するため。
- 達成したい結果: 外部AIなしのFake Adapter A/Bで、提案・反論の1ラウンドをJobとして記録し、構造化ResultとBoard Projectionを生成する。
- 完了条件: Approval検証、Job登録、A/B討論、Result検証、Owner Review待ち表示、失敗系・冪等性テスト、正本非変更境界の検証が揃うこと。

## 2. Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Current State](../project/CURRENT_STATE.md)
- [複数AI管制エンジン設計](../design/ADF_MULTI_AI_CONTROL_PLANE.md)
- [Adapter契約](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- 現在のbranch・変更状況: `codex/adf-pilot-governance`。既存の未コミット・未追跡差分はTask開始前から存在し、今回の対象外として保持する。

### Obsidian

| ノート | Taskで採用する制約・学び | 確認者 |
|---|---|---|
| `Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md` | Local Runtime、ファイルLedger、Fake Adapter、Result取込、Board反映を先に実証し、MCP・実AI接続を後続に分ける。 | Codex |
| `Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md` | Control / Work / Evidenceを分け、Owner承認とEvidenceを統合前提にする。 | Codex |
| `Projects/AI-Development-Framework/09_Control_Plane_Foundation実装_2026-08-04.md` | 既存Foundationは表示用であり、実行・権限付与・外部接続ではない。 | Codex |

## 3. Scope

- In scope:
  - 承認済みTask Packetの検証
  - ローカルforegroundの単一Debate Run
  - Fake Adapter A（提案）とFake Adapter B（反論）による1ラウンド
  - `request.json`、`approval.json`、`context-manifest.json`、`events.jsonl`、`result.json`、`evidence-links.json`
  - `queued → running → awaiting-review` と `failed` / `cancelled` の状態
  - Result hash、A/Bの参照関係、重複dispatch防止
  - Ledgerからの読み取り専用Board Projection
  - 成功、partial、failed、invalid、不正Approval、不正遷移のテスト
- 変更候補ファイル・コンポーネント:
  - `src/main/jobLoop/`
  - `src/shared/jobLoopTypes.ts`
  - `tests/jobLoop.test.ts`
  - `docs/tasks/ADF-JOB-LOOP-001.md`
  - `docs/project/CURRENT_STATE.md`
  - 必要最小限のBoard表示契約
- Out of scope:
  - Claude Code、Gemini、OpenRouter等の実AI接続
  - MCP、API、認証、外部送信、課金
  - Task worktree、実コード変更、commit、push、merge
  - DB、常駐Worker、並列Job、複数ラウンド自動討論
  - GitHub／Obsidianへの自動書込み、Taskの自動Done、統合
- 触れてはいけない部分:
  - 既存の未コミット・未追跡差分
  - GitHub／Obsidian正本の自動更新処理
  - APIキー、token、会話全文、個人情報の保存

## 4. Plan（実装前）

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
|---|---|---|---|---|
| 1 | Task契約、Approval、Scope hash、Context hashを検証する | Task受付境界 | 正常・未承認・期限切れ・hash不一致テスト | Yes |
| 2 | Job Ledgerと許可状態遷移を追加する | Local Runtimeのみ | 状態遷移、再起動、重複dispatchテスト | Yes |
| 3 | Fake A/Bを1ラウンド実行し、ResultとEvidenceを保存する | Fake Work Planeのみ | A/B hash参照、success/partial/failed/invalidテスト | Yes |
| 4 | LedgerからOwner Review待ちBoard Projectionを生成する | 派生JSONのみ | 正本非変更、Projection内容確認 | Yes |
| 5 | 外部I/O・秘密情報・任意パスがないことを検証する | 安全境界 | 静的検査、負のテスト | Yes |

### 代替案・リスク

- 実AIを先に接続する案は、認証・外部送信・費用・停止条件の検証が増えるため不採用。
- Neo ADFの試作は設計・挙動確認の材料とし、GitHubのTask・実装・検証を正本に戻す。
- Fakeの成功は実AIの品質・接続性・独立性を証明しない。
- Scope外の依存、API、外部送信、正本書込みが必要になったら`Waiting Approval`へ戻る。

## 5. Approval

- Approval required?: Yes
- 承認対象: 本TaskのScope、Plan、Fake Adapter A/Bの1ラウンド実装、ローカルLedger、Board Projection。
- 承認者: Project Owner
- 承認記録: Project Ownerが2026-08-08に`設計OK`と明示。
- 承認日時: 2026-08-08

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
|---|---|---|---|---|
| 2026-08-10 | Codex | GitHub正本へTask記録を追加し、Neo ADFの試作を設計材料として、GitHub側へJob Loop実装を開始 | Task・Scope・Approvalを正本へ戻してから実装するため | 既存の未コミット・未追跡差分は変更しない |
| 2026-08-10 | Codex | `src/main/jobLoop/`、`src/shared/jobLoopTypes.ts`、`tests/jobLoop.test.ts`を追加 | Fake A/Bの1ラウンド、Ledger、Result、Board ProjectionをGitHub側の実装正本へ反映するため | 外部AI、MCP、正本書込み、UI操作は追加していない |

実装完了。Project OwnerのDiff / Verification Review待ち。

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
|---|---|---|---|---|
| 自動 | TypeScript typecheck | Pass | Codex | |
| 自動 | Vitest（既存を含む20 tests） | Pass | Codex | |
| 自動 | electron-vite build / electron-builder arm64 package | Pass | Codex | Developer ID signingは未実施 |
| 静的 | `git diff --check`、Job Loop範囲のnetwork/API/child process参照なし | Pass | Codex | アプリ実行時のパケット観測は未実施 |
| 手動 | Fake A提案 → Fake B反論 → `awaiting-review` → Board Projection | Pass | Codex | 視覚的BoardでのJob表示は後続確認 |
| 独立レビュー | | Not applicable | | 同一Codex内の役割分離は独立外部レビューではない |

- 受入条件の照合:
  - [x] Approval、Task ID、Scope hash、Context hashを検証する。
  - [x] Fake Adapter Aが提案し、Fake Adapter BがAのResult hashを参照して反論する。
  - [x] `queued → running → awaiting-review`、`failed`の状態遷移を検証する。
  - [x] Result、Evidence link、Ledger、Board Projectionを生成する。
  - [x] 重複dispatch、Approval違反、partial/failed/invalid、不正遷移をテストする。
  - [x] GitHub／Obsidian正本を自動変更しない。
- 実装ファイル: `src/main/jobLoop/contracts.ts`、`src/main/jobLoop/fakeAdapters.ts`、`src/main/jobLoop/hash.ts`、`src/main/jobLoop/ledger.ts`、`src/main/jobLoop/runtime.ts`、`src/shared/jobLoopTypes.ts`、`tests/jobLoop.test.ts`
- 残るリスク・未検証事項: 実AI接続、MCP、複数ラウンド、実worktree、視覚的Board UI、Ledgerのプロセス中断復旧、パケット観測、Developer ID signingは未実施。

## 8. Completion and Handover

- GitHub更新: 本Task、Current State、必要な設計・検証記録を更新する。
- Obsidian更新: 長期判断・失敗学として必要な内容のみ、別途判断する。
- 次の安全な一手: Project OwnerのDiff / Verification Review後、実AI AdapterまたはResult Intakeを別Taskで設計する。
- Handover文書: 実装後に追加する。

## 9. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
|---|---|---|---|---|
| Plan / Scope | Approved | `設計OK` | 2026-08-08 | 本Task Approval |
| Diff / Verification | Not applicable | Project Ownerレビュー待ち | | |
| 残存リスク | Follow-up required | 実AI接続・MCP・worktreeは後続Task | | |

### Done checklist

- [x] Required Contextを確認し、採用した制約を記録した。
- [x] PlanとScopeが承認済みである。
- [x] 承認済みScopeだけを変更した。
- [x] Verificationの結果と未検証事項を記録した。
- [ ] 独立レビュー、または該当しない理由を記録した。
- [ ] Project Owner Reviewの対象・決定・根拠を記録した。
- [x] GitHubのTask記録を更新した。
