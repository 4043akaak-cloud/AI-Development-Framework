# Task — ADF-FRONTDOOR-ORCHESTRATION-001: 窓口依頼から複数AI結果までの最小グラフ実行

> Type: Implementation
> Status: Blocked — 独立レビューで受入条件に直結するP1指摘があり、Owner確認待ち
> Owner: Codex
> Review AI: Codex read-only Safety/Critic review + post-implementation independent review
> Related Goal / MVP / Roadmap: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)

このTaskは `docs/workflow/TASK_LIFECYCLE.md` と `docs/workflow/AI_DELEGATION_CHARTER.md` に従う。Project Ownerの2026-08-14「設計OK」を受け、Claude Codeへの手渡しなしでCodexが実装・検証する。

## 1. Objective

- なぜ今このTaskが必要か: 現行ADFは単一Approved TaskのJob / Thread / Adapter / Result / Evidence / Owner Reviewまで成立しているが、窓口AIの依頼を複数Subtaskへ分解し、回答・質問を集約して窓口へ返す親実行モデルがないため。
- 達成したい結果: Fake Adapterだけで、`FrontdoorRequest → DecompositionPlan → DAG + Node State Machine → 子Job/Thread実行 → Result/Question集約 → FrontdoorReturn`を一周させる。
- 完了条件: 契約のhash・親子関係・依存関係・質問・部分成功を検証し、既存のFake討論・Ollama・Claude CLI planned境界を壊さない。

## 2. Required Context

### GitHub

- `docs/project/GOAL.md` — ADFはAI間の安全な受け渡しとEvidenceを担い、AI推論や正本更新を代行しない。
- `docs/project/MVP.md` — ローカルFake AI討論を現在のMVPの実行基盤とする。
- `docs/project/ROADMAP.md` — 実AI・MCP・Work Plane・動的Routingは後続段階である。
- `docs/project/CURRENT_STATE.md` — 現行LiveはConversationRelay / Recovery / Board / Adapter経路である。
- `docs/tasks/ADF-ORCH-001.md` — Control / Work / Evidence Plane、承認、Artifact、統合ゲートの契約。
- `docs/tasks/ADF-ADAPTER-PROVIDER-NEUTRAL-001.md` — Provider-neutral Adapter契約と自動Routing境界。
- `docs/tasks/ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md` — Ollama実接続は個別証跡であり、Frontdoor完成の証明ではない。
- `docs/tasks/ADF-CLAUDE-CODE-CLI-ADAPTER-001.md` — Claude CLIはTransportとテストまでで、Main登録・実送信は未実施。

### Obsidian

| ノート | Taskで採用する制約・学び | 確認者 |
| --- | --- | --- |
| `16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md` | 手動コピーをなくし、窓口AI → ADF → 各AI → ADF → Ownerの往復を作る。MCPはRuntimeの後に薄く載せる。 | Codex |
| `06_複数AI管制エンジン設計_2026-08-04.md` | Control / Work / Evidenceを分離し、統括AIは承認・統合を代行しない。 | Codex |
| `04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md` | 最終製品はAIRFLOW型の可視化とループコーディングを統合した司令塔である。 | Codex |

### 作業環境と既存差分

- Git root: `/Users/kawakamiatsushishi/GitHub/AI-Development-Framework`
- Branch: `codex/adf-pilot-governance`
- 作業開始時: `HEAD`と`origin/codex/adf-pilot-governance`は一致、working tree clean。
- `Documents/Neo ADF`は別の旧実験コピーであり、本Taskの実装正本には使用しない。

## 3. Scope

### In scope

- `FrontdoorRequest`、`DecompositionPlan`、`OrchestrationRun`、`Question`、`AggregateResult`、`FrontdoorReturn`の共有契約。
- 親Requestのhash、分解Planのhash、子Nodeの親Scope・依存・Capability境界の検証。
- DAGの循環検出、重複Node、未解決依存、fan-out / depth上限の検証。
- DAGを実行状態機械として扱う最小Orchestrator。Nodeは既存のFake Adapterを通してConversationRelayへ委譲する。
- 子Resultの成功・部分成功・失敗・質問を集約し、`complete` / `partial` / `blocked-by-question` / `failed` / `cancelled` / `awaiting-owner`を区別する。
- 親RunのファイルLedgerと再構築可能な状態。
- 純粋関数テストとFake AdapterによるEnd-to-Endテスト。

### 変更候補ファイル

- `src/shared/frontdoorTypes.ts`
- `src/main/frontdoor/intake.ts`
- `src/main/frontdoor/decomposition.ts`
- `src/main/frontdoor/questionAggregator.ts`
- `src/main/frontdoor/returnEnvelope.ts`
- `src/main/frontdoor/orchestrator.ts`
- `src/main/frontdoor/ledger.ts`
- `src/shared/threadTypes.ts`（Adapter応答の任意質問欄を追加）
- `src/main/jobLoop/relay.ts`（質問をResult Envelope / Turnへ保存）
- `src/main/jobLoop/resultEnvelope.ts`（質問の任意配列を検証可能なResultへ保持）
- `src/main/jobLoop/conversationAdapters.ts`（Fake partial fixtureで質問を生成）
- `tests/frontdoorContracts.test.ts`
- `tests/frontdoorOrchestrator.test.ts`
- `tests/frontdoorQuestions.test.ts`
- `docs/project/CURRENT_STATE.md`

### Out of scope

- ChatGPT / Codexから直接呼ぶMCP・HTTP・IPC入口。
- Ollama、Anthropic、Claude Code CLIの実送信・認証・APIキー・課金。
- Work Plane、repo / worktree接続、ファイル書込み、差分Collector、正本への自動反映。
- GUIの大幅変更、複数プロジェクトBoard、DB、常駐Worker、無制限並列実行。
- 自動Approval、自動Capability昇格、自動Retry、外部Adapterへの自動Failover。
- commit・push・merge・公開。

## 4. Plan

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | Frontdoor共有型とhash・状態・質問語彙を追加 | 新規共有契約のみ | 型検査、契約negative tests | Yes |
| 2 | Decomposition Planの親子Scope・依存・上限検証を追加 | 既存Relay無変更 | 循環・越権・重複・期限テスト | Yes |
| 3 | DAG + Node State MachineのOrchestratorを追加 | 新規frontdoorモジュール | Fake Adapter E2E、重複claim・停止・再起動テスト | Yes |
| 4 | Result / Question / Evidence参照を集約しFrontdoorReturnを生成 | 既存Result契約を読み取り再利用 | 状態別集約テスト、hash照合 | Yes |
| 5 | Task正本・Current State・Obsidianを実装結果へ同期 | 文書記録 | `git diff --check`、リンクと状態照合 | Yes |

### DAG + Node State Machine

```text
OrchestrationRun
  └─ DAG: DecompositionNode / dependsOn
       └─ Node State Machine
            queued → ready → running → completed
                              ├→ awaiting-question
                              ├→ failed
                              ├→ cancelled
                              └→ recovery-needed
```

初期実装はfan-outを安全な上限内で逐次実行する。並列実行は契約上の依存関係を持つが、本Taskでは実測・実装しない。

### 代替案・リスク

- DAGだけで管理する案は、質問待ち・Recovery・Owner停止を表現しにくいため不採用。DAGのNodeごとに状態機械を持たせる。
- 既存ConversationThreadを親Runへ拡張する案は、単一Taskの会話責務と親Orchestration責務が混ざるため不採用。`OrchestrationRun`を親Aggregateとして新設する。
- 新しいDBやWorkflow Engineは、現在のローカルLedgerで検証できる範囲を超えるため不採用。
- 親ApprovalのTarget / Capability完全hash束縛は重要な後続課題として記録する。本Taskでは自動昇格を禁止し、子NodeのCapabilityは`read | propose`に固定する。

### 停止条件

- 同じ原因による検証失敗が2回連続した場合。
- 別原因でも検証失敗が3回続いた場合。
- Plan変更、Scope拡張、新規依存、外部送信、認証、費用、Work Plane書込みが必要になった場合。
- 既存Adapter、Thread、Relay、Recoveryの安全境界を弱める必要が出た場合。
- 親Approvalを自動生成・自動拡張しないと成立しない場合。
- テスト失敗の原因が特定できない、または回避策が既存契約を破る場合。

## 5. Approval

- Approval required?: Yes
- 承認対象: 本TaskのScope、Plan、Fake Adapter限定の最小End-to-End実装、および上記停止条件。
- 承認者: Project Owner
- 承認記録: 2026-08-14、Project Ownerが「設計OK」と明示。
- 実装許可: Codexが実装・検証・Task/Obsidian記録を担当。外部送信、認証、課金、commit、pushは別判断。

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-14 | Codex | Task正本、Obsidianマイルストーン、Current Stateを作成・同期 | 最終目標に逆算した新Taskの正本化 | なし |
| 2026-08-14 | Codex | Frontdoor共有型、Intake、DAG検証、Question集約、Return、Ledger、Orchestratorを追加 | Fake Adapterで最小End-to-Endを通すため | なし |
| 2026-08-14 | Codex | Adapter応答に任意`questions`、依存NodeのResult参照を追加 | AIの質問と依存ResultをADFへ返すための最小契約拡張 | 既存必須契約・Result検証条件は維持 |
| 2026-08-14 | Codex | 初回E2E失敗2回後に停止 | Critic先頭Role、Critic検証Pass不足を検出 | Project Ownerへ確認 |
| 2026-08-14 | Codex | 依存Result参照をCriticへ渡す修正を実装 | 既存の成功Result Pass条件を弱めずに再開するため | Project Owner「再開OK」 |
| 2026-08-14 | Codex | 独立レビューの8指摘を修正（hash再検証、親Context、依存Result provenance、質問停止、深いDAG失敗伝播、Recovery/Stop、exclusive claim、computed depth） | 承認Plan・実Dispatch・Evidenceの一致を強化するため | 全自動検証Pass |
| 2026-08-14 | Codex | 追加の完全性修正（Frontdoor binding、`orchestrationRunId`、Run snapshot、stale claim判定、`bundle.ready`） | 独立レビューで残った改ざん・Recovery境界を閉じるため | P1残存のため停止。設計追加承認待ち |
| 2026-08-14 | Codex | 追加承認後、Event Replay、bundle manifest再計算、stale claimのactive process保護、Resultの`orchestrationRunId`を実装 | Project Ownerの追加承認に対応 | 自動検証Pass。独立レビューは完全Event-Sourcing境界を後続課題として指摘 |

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- | --- |
| 自動 | Frontdoor契約・Plan検証・質問集約・Fake E2E・改ざん・claim・Recovery | Pass: 14/14 | Codex | — |
| 自動 | 全Vitest回帰 | Pass: 284/284、20 files | Codex | — |
| 自動 | node/web/cli typecheck、Electron build、`git diff --check` | Pass | Codex | — |
| 手動 | 生成Run JSONとResult/Evidence参照の読み取り確認 | Pass（E2Eテスト内で確認） | Codex | Electron GUIは未確認 |
| 手動 | アプリ再起動後のRun再構築、重複Dispatch、Owner停止 | Not run | Codex | Electron GUI・実プロセス再起動は本Task対象外。状態遷移は自動テストで検証 |
| 独立レビュー | 実装Diff・依存Result・質問・Recovery・改ざん境界 | Changes requested | Codex subagent | 追加承認後も、完全Event-Sourcing、全Result／Job／Eventの完全束縛、完全原子BundleにP1/P2が残った。同一Codex環境の読み取りレビューであり外部AIレビューではない |

### 受入条件

- [x] FrontdoorRequestから一意なRunとPlan hashを生成できる。
- [x] 2つ以上のFake Nodeへ分解し、親子Scope・role・依存関係を検証できる。
- [x] 依存順にFake Adapterを実行し、既存Thread / Result / Evidence / Ledgerへ紐付けられる。
- [x] 完了、部分成功、失敗、質問待ち、Owner判断待ちを区別できる。
- [x] QuestionをResult本文から分離し、blocking questionをFrontdoorReturnへ返せる。
- [x] 同一Nodeの循環依存、越権Capability、Plan境界を拒否できる。重複Dispatch・Plan改ざんは追加検証待ち。
- [ ] 停止・再起動後にRun状態をLedgerイベントだけから完全再構築できる（snapshot検出とstale claim処理は実装済みだが、完全Replayは未達）。
- [x] 外部送信、正本変更、Work Plane書込み、MCP、commit、pushが発生しない。

## 8. Completion and Handover

- GitHub更新: 本Task、Current State、必要な実装・テスト記録。
- Obsidian更新: `19_ADF_Frontdoor_Orchestration_2026-08-14.md`へ設計判断・実測・失敗学を記録。
- 次の安全な一手: Frontdoor IPC / MCP入口、Work Plane、Result Intake、実Adapterの順に別Task化する。

## 9. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | 設計OK、Fake限定の最小縦切りと停止条件を承認 | 2026-08-14 | 本会話 |
| Diff / Verification | Pending | 実装・検証後にOwner確認 | — | — |
| 残存リスク | Pending | Target hash束縛、MCP、Work Plane、実Adapterは後続 | — | — |

## 10. Failure Stop Log

| 連続回数 | 検証段階 | 原因 | 対応 | Owner確認 |
| --- | --- | --- | --- | --- |
| 1 | Frontdoor正常系E2E | Critic専用Nodeを先頭Turnとして扱えず、Proposal roleを要求して拒否 | `nextRole()`を初回Plan selectionのroleへ修正 | 未確認 |
| 2 | Frontdoor正常系E2E | Critic Fakeの成功ResultにPass検証がなく、既存RelayのResult受入条件で拒否 | 追加修正せず停止 | 必要 |
| — | 再開判断 | Project Ownerが「再開OK」と承認 | 依存Result参照をAdapter要求へ追加して再検証 | 2026-08-14 |
| — | 独立レビュー | P1指摘8件: hash再検証、Context束縛、依存Evidence、質問停止、深いDAG失敗、再起動Recovery、重複claim、実効depth | 修正前に停止 | 必要 |
| — | 独立レビュー再確認 | 8件のうち主要境界は修正済み。ただし完全Event Replay、Run状態／Result参照の完全束縛、Bundle hash照合にP1/P2が残存 | 同一Task内の追加修正後もBlocked維持 | Project Owner判断が必要 |
| — | 停止ルール適用 | 自動テストは284/284 Passだが、独立レビューで同一系統のP1が複数回継続 | 無限強化を止め、残存リスクをOwner確認へ移行 | 必要 |
| — | 追加承認後の独立レビュー | Event Replayとmanifestを追加したが、完全なEvent-Sourcing／改ざん耐性基盤までは未達 | 同一Taskの無制限拡張を止め、後続Task候補として分離 | Project Owner判断が必要 |

## ADF Execution Summary

```json
{
  "taskId": "ADF-FRONTDOOR-ORCHESTRATION-001",
  "objective": "窓口依頼から分解・複数Fake AI実行・Result/Question集約・Frontdoor返却までの最小グラフ実行を作る",
  "scope": {
    "inScope": [
      "frontdoor shared contracts",
      "DAG decomposition validation",
      "node state machine",
      "fake adapter end-to-end orchestration",
      "result/question aggregation",
      "run ledger and recovery reconstruction"
    ],
    "outOfScope": [
      "MCP/IPC/HTTP frontdoor",
      "external send/auth/payment",
      "Ollama or Claude CLI real execution",
      "worktree/write plane",
      "database/daemon/auto-retry/auto-approval",
      "commit/push/merge"
    ]
  },
  "acceptance": [
    "frontdoor request and plan hashes are reproducible",
    "parent-child scope and dependency boundaries are enforced",
    "two or more fake nodes execute in dependency order",
    "result, evidence, question and owner decision states remain distinct",
    "duplicate, cycle, tamper and capability escalation are rejected",
    "run snapshot and recovery-needed detection are recorded in the local ledger; complete event-only replay remains a follow-up acceptance item"
  ],
  "approval": {
    "status": "approved",
    "approvedBy": "Project Owner",
    "approvedAt": "2026-08-14",
    "externalSend": false,
    "newDependencies": false
  },
  "stopConditions": [
    "same-root-cause verification failure twice consecutively",
    "three verification failures consecutively across causes",
    "scope expansion or new dependency",
    "external send/auth/payment/work-plane write becomes necessary",
    "existing safety boundary must be weakened"
  ]
}
```
