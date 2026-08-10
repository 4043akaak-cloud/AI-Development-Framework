# Task — ADF-PILOT-004: AIRFLOW × ループコーディング型ADFの最小設計を正本化する

> Type: Design
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md)

このTaskは、Codex単独Phase 0で3件目に数える、可逆な設計Taskである。最終ゴールである「AIRFLOW型の司令塔」と「ループコーディング」を統合するADFアプリの最小設計を定める。Task Boardアプリや自動化の実装ではない。

## Objective

GitHubをTask・実装・検証の正本、Obsidianを背景・判断理由の正本として維持したまま、次の二つを一体として扱うADFアプリの最小設計を定める。

1. **AIRFLOW型の司令塔**: 複数プロジェクト・Task・担当AI・承認待ち・リスクをカードと役割で見渡す。
2. **ループコーディング**: `観測 → Context → Plan → Approval → Implementation → Verification → Review → 学び → 次Task`を、根拠を失わず継続的に回す。

将来のカードUI、上司AI、他AIレビュー、OpenRouter連携が、この共通契約に従える状態をつくる。

## Required Context

### GitHub

- [AI Task Packet](../../templates/AI_TASK_PACKET.md)
- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
- [Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)
- [GitHub Operations](../workflow/GITHUB_OPERATIONS.md) — Project BoardはPhase 1以降の候補である。
- [Loop Coding historical artifact](../loop-coding/WEEK1_ISSUES.md) — 過去のIssue案は正本ではなく、反復改善の意図だけを参照する。
- [Current State](../project/CURRENT_STATE.md)
- 現在のbranch・変更状況: `codex/adf-pilot-governance`、`3c0eab8`、Task起票前はclean。下書きPR [#1](https://github.com/4043akaak-cloud/AI-Development-Framework/pull/1) は未マージ。

### Obsidian

- Vault ID / root: `secondbrain` / `/Users/kawakamiatsushishi/Desktop/secondbrain`
- `Projects/AI-Development-Framework/00_MOC.md` — GitHubとObsidianの役割を分ける。
- `Projects/AI-Development-Framework/02_Codex単独パイロット_2026-07-30.md` — まずCodexとProject Ownerだけで、安全に再開できる最小ループを検証する。

## Context Read Record

- 採用する制約: Phase 0ではCodexとProject Ownerだけで運用し、外部AI、API、データベース、Webアプリ、GitHub Project、自動委任、自動pushを導入しない。
- 問題: GitHub TaskとObsidian文脈は整備されたが、複数Taskの状態、承認待ち、担当、リスクを一画面で見通し、検証結果を次のTaskへ還元する設計契約がない。
- 前提: Boardは正本を複製・更新する場所ではなく、GitHub Taskを起点にした手動の閲覧・判断層とする。ループの各工程も、AIの自動実行ではなく人間承認を含む状態遷移として扱う。

## Scope

- In scope: `docs/project/GOAL.md`、`docs/project/MVP.md`、`docs/project/ROADMAP.md`を、最終ゴールがAIRFLOW × ループコーディング型ADFアプリであることに合わせて更新する。あわせて`docs/design/ADF_TASK_BOARD_MVP.md`を新設し、司令塔、正本境界、カード項目、状態・承認・リスク表示、役割、ループ工程、手動運用、最小画面構成、受入条件、将来拡張境界を設計する。
- 変更候補ファイル: `docs/project/GOAL.md`、`docs/project/MVP.md`、`docs/project/ROADMAP.md`、`docs/design/ADF_TASK_BOARD_MVP.md`。Task状態とCurrent Stateの更新は必須運用記録として別途行う。
- Out of scope: BoardのUI実装、データベース、認証、GitHub API、Obsidian API、外部AI、OpenRouter、GitHub Project作成、カードの自動同期、自動Task作成、commit、push、PR更新。
- 触れてはいけない部分: 既存のTask Lifecycle、AI Delegation Charter、GitHub/Obsidianの正本分担、既存の未マージPRの内容。

## Plan

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | Goal・MVP・Roadmapに、AIRFLOW型司令塔とループコーディングを統合した最終ゴールを記録する | 製品方向の明確化 | Phase 0の検証目的と最終製品を混同していないことを手動確認 | Yes |
| 2 | 司令塔の正本境界、Cardの必須項目、状態列、承認・リスク表示、担当ロールを定義する | 将来の二重正本化と権限逸脱を防ぐ | Task LifecycleとCharterの必須項目を照合 | Yes |
| 3 | ループコーディングの工程、各工程の入力・出力・停止条件・人間承認を定義する | 反復改善の再現性 | ADF-PILOT-001〜003を、ループ上の根拠として説明可能か確認 | Yes |
| 4 | 手動更新の運用、最小画面構成、失敗条件、将来のUI・API・他AI・OpenRouterの境界を定義する | 段階的拡張の安全性 | Phase 0の禁止事項を越えないことを確認 | Yes |

### 代替案・リスク

- 代替案: 直ちにTrello型Webアプリを実装する。正本、認証、同期、データ保護、運用責任を同時に増やすため不採用とする。
- 主なリスク: 手動BoardがGitHub Taskとずれること。Boardに編集権限を持たせず、Task ID・GitHubリンク・最終確認日時を必須にする設計で抑制する。
- 停止条件: APIキー、外部サービス、費用、認証、データ保存、既存規約の変更、UI実装が必要になった場合は`Waiting Approval`または`Blocked`へ戻る。

## Acceptance Criteria

- [x] Goal・MVP・Roadmapが、最終ゴールをAIRFLOW × ループコーディング型ADFアプリとして明記し、Phase 0の検証目的と分離する。
- [x] `ADF_TASK_BOARD_MVP.md`が、GitHubとObsidianの正本境界を明記する。
- [x] Cardの必須項目に、Task ID、状態、承認、担当、GitHub Task、Required Obsidian Context、最終確認日時、リスクが含まれる。
- [x] 状態列がTask Lifecycleの状態を勝手に置き換えず、表示用の集約であると明記する。
- [x] Project Owner、Supervising AI、Implementation AI、Review AIの権限境界を表示する。
- [x] ループコーディングの各工程に、入力・出力・停止条件・承認者を定義する。
- [x] Phase 0で実装しないUI・API・自動化・外部AIを明記する。
- [x] `git diff --check`と手動照合を記録し、Project Owner Reviewを受ける。

## Approval

- Approval required?: Yes。
- 承認対象: Goal・MVP・Roadmapの製品方向更新、および`docs/design/ADF_TASK_BOARD_MVP.md`の新設に限定する上記ScopeとPlan。Task台帳とCurrent Stateの必須運用記録を除き、他文書・外部状態を変更しない。
- 承認者: Project Owner。
- 承認記録: 2026-08-03、Project Ownerが`ADF-PILOT-004 設計OK`と明示し、上記ScopeとPlanを承認。

## Implementation and Verification Record

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-03 | Codex | Goal・MVP・RoadmapをAIRFLOW × ループコーディング型ADFアプリの方向へ更新 | Phase 0の基盤検証と最終製品を分離するため | UI、API、外部AI、自動化は追加しない |
| 2026-08-03 | Codex | `docs/design/ADF_TASK_BOARD_MVP.md`を新設 | Card、役割、ループ、画面、段階的実装の契約を正本化するため | 実装仕様・技術選定は未決定のまま保持 |

## Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- | --- |
| 自動 | `git diff --check` | Pass | Codex | |
| 手動 | Acceptance CriteriaとGoal・MVP・Roadmap・設計書、およびObsidian MOCリンクの相互照合 | Pass | Codex | |
| 独立レビュー | Project Ownerによる差分確認 | Approved | Project Owner | `ADF-PILOT-004 レビューOK` |

- 受入条件の照合: 8項目すべてPassまたはApproved。
- 残るリスク・未検証事項: 実際のUI操作、API連携、複数AI運用、費用・データ方針は未検証。

## Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-PILOT-004 設計OK` | 2026-08-03 | 本TaskのApproval記録 |
| Diff / Verification | Approved | `ADF-PILOT-004 レビューOK`。Project Ownerが設計差分と検証記録を確認 | 2026-08-03 | 本Taskのレビュー記録 |
| 残存リスク | Accepted | UI、API、複数AI、費用・データ方針は未検証。Product MVP 1以降の別Taskで扱う | 2026-08-03 | 本TaskのScope |

## Handover

- `ADF-PILOT-004`は、Codex単独Phase 0で3件目に数える完走Taskである。
- 得られた学び: 可視化Boardと反復ループは別々の機能ではない。Cardは「今どの工程にいて、次に誰が何を判断するか」を示し、検証・レビューの結果を次Taskへ戻すための入口になる。
- 次の安全な一手: Phase 0の振り返りTaskを起票し、Product MVP 1の実装を先に始めるか、外部AIレビューの導入設計を先に行うかをProject Ownerが判断する。
