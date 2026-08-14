# Task — ADF-RETRO-001: Phase 0を振り返り、Product MVP 1の開始順を決定する

> Type: Review / Docs
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)

このTaskは、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)と[AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)に従う。Phase 0の記録を読み取り、次の開始順を決定・記録する文書Taskであり、Product MVP 1のUI実装ではない。

## 1. Objective

- なぜ今このTaskが必要か: CodexとProject OwnerによるPhase 0の実証Task 3件が完走したため、実証済みの範囲と未検証事項を分け、Product MVP 1と外部AIレビューの開始順を判断する必要がある。
- 達成したい結果: Phase 0の証拠・ボトルネック・未検証事項を記録し、次はローカルの読み取り専用Task Boardの実装設計を先行する、とProject Ownerが判断できる状態にする。
- 完了条件: 本Task、MVP、Current State、Obsidianの判断記録が同じ結論と残存リスクを示し、Project Ownerが差分・検証をレビューする。

## 2. Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
- [Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)
- [Current State](../project/CURRENT_STATE.md)
- [MVP](../project/MVP.md)
- [Task Board MVP設計](../design/ADF_TASK_BOARD_MVP.md)
- [ADF-PILOT-002](ADF-PILOT-002.md)、[ADF-PILOT-003](ADF-PILOT-003.md)、[ADF-PILOT-004](ADF-PILOT-004.md)
- 現在のbranch・変更状況: `codex/adf-pilot-governance`、HEAD `3c0eab8`。`CURRENT_STATE.md`、`GOAL.md`、`MVP.md`、`ROADMAP.md`、`docs/design/`、`ADF-PILOT-004.md`には本Task開始前から未コミット変更がある。これらを本Taskの変更・公開済み事実として扱わず、対象箇所だけを変更する。

### Obsidian

| ノート | Taskで採用する制約・学び | 確認者 |
| --- | --- | --- |
| `Projects/AI-Development-Framework/00_MOC.md` | GitHubはTask・検証の正本、Obsidianは理念・背景・判断理由・学びの正本とする。 | Codex |
| `Projects/AI-Development-Framework/02_Codex単独パイロット_2026-07-30.md` | 外部AI、OpenRouter、外部API、自動pushを導入せず、3件完走後に別AIレビューを判断する。 | Codex |
| `Projects/AI-Development-Framework/03_役割分離Codexプローブ_2026-07-31.md` | 役割分離Codexは独立AIレビューの代替ではない。 | Codex |
| `Projects/AI-Development-Framework/04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md` | 最初は手動・読み取り専用Boardで判断可能性を確かめ、外部AIは別Task・別承認で扱う。 | Codex |

## 3. Scope

- In scope: `ADF-PILOT-002`〜`004`の記録を根拠に、Phase 0で実証できたこと、観測したボトルネック、未検証事項、次の開始順を記録する。MVPの既存受入条件のうち、根拠を確認できる項目だけを更新する。
- 変更候補ファイル: 本Task、`docs/project/MVP.md`、`docs/project/CURRENT_STATE.md`、`Projects/AI-Development-Framework/05_Phase0振り返り_2026-08-03.md`、`Projects/AI-Development-Framework/00_MOC.md`。
- Out of scope: Task BoardのUI・コード・設定・依存関係、GitHub/Obsidian API、外部AI、OpenRouter、認証、データベース、自動化、commit、push、PR更新。
- 触れてはいけない部分: Task Lifecycle、AI Delegation Charter、Goal・Roadmap、既存未コミット変更の整理、既存Taskの実施記録。

## 4. Plan（実装前）

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | 3件のTask記録を照合し、必須成果物、無承認変更、手戻り、未取得の測定値を本Taskへ記録する | Phase 0の完了根拠を明確化する | 各TaskのContext、Plan、Approval、Verification、Review、Handoverを手動照合 | Yes |
| 2 | 「Product MVP 1を先行し、外部AIレビュー設計は最初のBoard差分を対象にする」と記録する | 次段階の開始順を明確化する | MVP・Current State・Obsidian記録の結論を照合 | Yes |
| 3 | 根拠が確認できるMVP受入条件だけを更新し、次の未承認Taskを明記する | 状態の過大表示を防ぐ | 受入条件と本Taskの証拠を手動照合 | Yes |
| 4 | GitHub Task / Current Stateと、Obsidianの長い判断記録・MOC入口を更新する | 引き継ぎ可能性を維持する | Markdownリンク、MOC往復、`git diff --check`を確認 | Yes |

### 代替案・リスク

- 代替案: 外部AIレビュー導入設計を先に行う。実装対象がないまま、共有範囲・評価指標・有効性を抽象的に設計することになるため不採用とする。
- 判断理由: Product MVP 1は、外部送信・費用・認証・書き込みを伴わず、Phase 0で未実証の実装・UI操作・テストを最小範囲で測れる。Boardの実装差分は後続の外部AIレビューの具体的な評価対象にもなる。
- 主なリスク: 3件は文書・設計Taskであり、実装品質や独立AIレビューの有効性は証明しない。Taskごとの開始・終了時刻、承認待ち時間も記録されていないため、推測で補完しない。
- 停止条件: 外部AI、APIキー、費用、認証、データ保存、UI実装、既存未コミット変更の整理、Scope外文書の変更が必要になった場合は`Waiting Approval`または`Blocked`へ戻る。

## 5. Approval

- Approval required?: Yes。
- 承認対象: 本TaskのScope・Planに限定したGitHub 3ファイルとObsidian 2ファイルの記録更新。コード、外部操作、commit、pushは含まない。
- 承認者: Project Owner。
- 承認記録: 2026-08-03、Project Ownerが`ADF-RETRO-001 設計OK`と明示し、上記ScopeとPlanを承認。
- 承認日時: 2026-08-03。

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-03 | Codex | Phase 0の振り返りTask、MVP・Current State、Obsidian判断記録とMOC入口を更新 | 実証済み範囲、未検証事項、Board先行の判断を引き継げる正本へ残すため | 3件にない作業時間・承認待ち時間は推測で補完しない。UI・外部AI・API・commit・pushは行わない。 |

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- |
| 自動 | `git diff --check`、対象Markdownファイル5件の存在確認 | Pass | Codex | |
| 手動 | 3件のTaskと本Task、MVP、Current State、Obsidian判断記録の根拠・結論・未検証事項を照合 | Pass | Codex | |
| 独立レビュー | Project Ownerによる差分確認 | Approved | Project Owner | `レビューOK`（2026-08-04） |

- 受入条件の照合:
  - [x] `ADF-PILOT-002`〜`004`のContext、Plan、Approval、Verification、Project Owner Review、Handoverを確認した。
  - [x] Board先行の結論と、実装・外部AIレビューが未検証であることを、GitHubとObsidianで一致させた。
  - [x] 開始・終了時刻と承認待ち時間が未記録であることを明記し、推測で補完していない。
  - [x] UI、API、外部AI、commit、pushを実施していない。
  - [x] Project Ownerによる差分・検証レビュー。
- 残るリスク・未検証事項: UI操作、コード実装、テスト、独立AIレビュー、外部API・費用・データ方針は未検証。

## 8. Completion and Handover

- GitHub更新: 本Task、MVP、Current Stateを更新済み。
- Obsidian更新: Phase 0の判断記録とMOC入口を更新済み。
- 次の安全な一手: `ADF-ORCH-001`として、複数AI管制エンジンの設計契約を定める。これはBoardの実装前に、将来のAdapter・成果物・統合・承認境界を設計するTaskであり、外部AI接続やコード実装は含まない。
- Handover文書: 本Taskおよび`Projects/AI-Development-Framework/05_Phase0振り返り_2026-08-03.md`。

## 9. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-RETRO-001 設計OK` | 2026-08-03 | 本TaskのApproval記録 |
| Diff / Verification | Approved | Project Ownerが`レビューOK`と明示し、差分と検証結果を確認 | 2026-08-04 | この会話 |
| 残存リスク | Accepted | UI、実装、外部AIレビュー、費用・データ方針は未検証。後続の別Taskで扱う | 2026-08-04 | このTaskのVerification |

### Done checklist

- [x] Required Contextを確認し、採用した制約を記録した。
- [x] PlanとScopeが承認済みである、または承認不要の理由を記録した。
- [x] 承認済みScopeだけを変更した。
- [x] Verificationの結果と未検証事項を記録した。
- [x] 独立レビュー、または該当しない理由を記録した。
- [x] Project Owner Reviewの対象・決定・根拠を記録した。
- [x] GitHubと必要なObsidianの記録を更新した。
