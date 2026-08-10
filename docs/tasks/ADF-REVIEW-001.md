# Task — ADF-REVIEW-001: 最初の独立レビュー実験を設計する

> Type: Design / Docs
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [外部独立レビュー実験設計](../design/ADF_EXTERNAL_REVIEW_EXPERIMENT.md) / [Current State](../project/CURRENT_STATE.md)

## 1. Objective

`ADF-MVP1-001`のBoard差分を、外部AIまたは人間に安全に一回だけ手動レビューして測るための契約を定める。接続を作るTaskではなく、送信対象、承認、出力、比較、停止を固定する設計Taskである。

## 2. Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)、[Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)
- [ADF-MVP1-001](ADF-MVP1-001.md)、[ADF-ORCH-001](ADF-ORCH-001.md)
- [Control Plane設計](../design/ADF_MULTI_AI_CONTROL_PLANE.md)、[Adapter契約](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- [Current State](../project/CURRENT_STATE.md)、[Roadmap](../project/ROADMAP.md)

### Obsidian

| ノート | 採用する制約 |
| --- | --- |
| `04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md` | Boardは正本を置換せず、人間の判断を助ける。 |
| `05_Phase0振り返り_2026-08-03.md` | Board差分を対象に、外部AIは別Task・別承認で扱う。 |
| `06_複数AI管制エンジン設計_2026-08-04.md` | 最小Context、deny by default、EvidenceとOwner Gateを維持する。 |
| `07_Product_MVP1実装開始_2026-08-04.md` | MVP1の実施済み検証と未検証事項を過大表示しない。 |

## 3. Scope and Plan

- In scope: 本Task、レビュー実験設計、Current State/Roadmap、Obsidianの判断記録とMOC入口。
- Out of scope: 外部Reviewerの選定・送信、API/CLI/Adapter、認証・APIキー、課金、添付、UI/コード、repo/Vaultアクセス、commit、push。

| Step | 作業 | 検証 |
| --- | --- | --- |
| 1 | Review Packet、Artifact、二段階承認、停止条件を設計する | Charter/Adapter契約と手動照合 |
| 2 | B0〜B2と比較する測定・判定を設計する | MVP1の実施済み/未実施記録と照合 |
| 3 | GitHub/Obsidianの現在地と次の安全な一手を更新する | Markdownリンク、`git diff --check` |

## 4. Approval

- Approval required?: Yes。
- 承認対象: 本Taskの文書設計、GitHub/Obsidianへの設計記録。
- 承認者: Project Owner。
- 承認記録: 2026-08-04、Project Ownerが`ADF-REVIEW-001 設計OK`と明示した。
- この承認に含まれないこと: 外部送信、ログイン、規約同意、無料枠/費用の消費、APIキー、添付、Adapter接続、実装、正本更新の自動化。

## 5. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-04 | Codex | 手動・一回・最小共有の独立レビュー実験契約と、GitHub/Obsidianの現在地を記録 | 外部AI/人間レビューの価値と安全性を、接続前に測定可能にするため | Provider選定、送信、接続、費用、UI/コード実装は行わない。 |

## 6. Verification

| 種別 | 実施内容 | 結果 | 実施者 |
| --- | --- | --- | --- |
| 静的 | Task、設計、Current State、Roadmap、Obsidianノート/MOCのリンクと方針を照合 | Pass | Codex |
| 自動 | `git diff --check` | Pass | Codex |
| Review | Project Ownerによる差分・検証レビュー | Approved | Project Owner |

## 7. Handover

- 次の安全な一手: `ADF-FOUNDATION-001`として、将来の全Adapterに共通するRegistry、Job、Artifact、Approval、Integration Gate、停止/復旧の設計を一括で定める。外部レビューの実行には、Reviewer、Packet hash、送信先、データ分類、費用上限、回数、期限を含む実行直前の別承認が引き続き必要である。
- 残存リスク: 外部サービスごとの接続可否・利用規約・保持方針・費用・品質・サブエージェント機能は未検証。実験一件で品質優劣や自動化価値を判断しない。

## 8. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 |
| --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-REVIEW-001 設計OK` | 2026-08-04 |
| Diff / Verification | Approved | Project Ownerが「レビュー完了」と明示 | 2026-08-04 |
| 残存リスク | Accepted | 外部送信・接続・費用・品質は個別実行時に承認・実測する | 2026-08-04 |
