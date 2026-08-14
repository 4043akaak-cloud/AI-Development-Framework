# Task — ADF-PILOT-003: READMEの初回導線を現行の正本へ修正する

> Type: Docs
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md)

このTaskは、Codex単独Phase 0で2件目に数える、可逆な文書Taskである。

## Objective

`README.md`の「最初に読むファイル」が、存在しない`docs/project/PROJECT.md`を案内している不整合を解消する。新しいAIまたは人間が、現在のGoal・MVP・Roadmap・Current Stateへ迷わず到達できる状態にする。

## Required Context

### GitHub

- [AI Task Packet](../../templates/AI_TASK_PACKET.md)
- [AI Collaboration](../../guidelines/AI_COLLABORATION.md)
- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
- [Current State](../project/CURRENT_STATE.md)
- 確認済みの現状: `docs/project/PROJECT.md`は存在しない。`GOAL.md`、`MVP.md`、`ROADMAP.md`、`CURRENT_STATE.md`は存在する。

### Obsidian

- Vault ID / root: `secondbrain` / `/Users/kawakamiatsushishi/Desktop/secondbrain`
- `Projects/AI-Development-Framework/00_MOC.md` — GitHubを実装・Task・検証の正本として使う。
- `Projects/AI-Development-Framework/02_Codex単独パイロット_2026-07-30.md` — Phase 0では、再開できる記録と人間承認を検証する。

## Context Read Record

- 採用する制約: 現在のPhase 0では、外部AI・自動化・commit・pushを導入しない。READMEの導線だけを最小範囲で扱う。
- 既存状態: worktreeには本Taskより前の未commit・未追跡変更がある。READMEにも「現在の運用段階」節の既存差分があるため、初回導線の1行以外をstage、commit、修正しない。
- 実装前の問題: READMEの2番目の案内先が削除済みで、AIの初回Context Readが止まりうる。

## Scope

- In scope: `README.md`の「最初に読むファイル」内にある`docs/project/PROJECT.md`への案内だけを、現存する正本Project文書への案内へ置き換える。
- 変更候補ファイル: `README.md`のみ。
- Out of scope: `PROJECT.md`の復元、Goal・MVP・Roadmap・Current State本文の変更、他のREADME再編、GitHub設定、commit、push。
- 触れてはいけない部分: READMEの目的、思想、開発フロー、現在の運用段階、および既存の未commit変更。

## Plan

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | READMEの2番目の導線を、Goal・MVP・Roadmap・Current Stateへの現行リンクに置き換える | 初回読解の入口だけ | 変更前後の差分を確認 | Yes |
| 2 | README内の対象リンクとリンク先ファイルの存在を確認する | Markdown参照だけ | `test -e`と手動読解 | Yes |
| 3 | Markdown差分チェックとProject Ownerレビューを記録する | 文書品質 | `git diff --check`と人間レビュー | Yes |

### 代替案・リスク

- 代替案: 削除済み`PROJECT.md`を復元する。これは古い内容の正本化や範囲拡大を招くため不採用とする。
- リスク: READMEの初回導線以外にも古い参照が残っている可能性がある。本Taskでは検出しても修正せず、別Task候補として記録する。
- 停止条件: README以外の変更、Project文書の再設計、削除・復元、commit・push、リンク先の不在が必要になった場合は`Waiting Approval`または`Blocked`へ戻る。

## Acceptance Criteria

- [x] READMEの初回導線に、存在しない`docs/project/PROJECT.md`へのリンクが残らない。
- [x] 置き換えたProject文書のリンク先がすべて存在する。
- [x] READMEの対象導線以外を変更しない。
- [x] `git diff --check`と手動読解を記録する。
- [x] Project OwnerによるPlan / ScopeとDiff / Verificationのレビューを記録する。

## Approval

- Approval required?: Yes。
- 承認対象: `README.md`のみを対象とする上記Plan、検証、停止条件。
- 承認者: Project Owner。
- 承認記録: 2026-08-03、Project Ownerが`ADF-PILOT-003 設計OK`と明示し、上記ScopeとPlanを承認。

## Implementation and Verification Record

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-03 | Codex | `README.md`の初回導線をGoal、MVP、Roadmap、Current Stateへの現行リンクへ置換 | 削除済み`docs/project/PROJECT.md`への導線を解消するため | 「現在の運用段階」節の既存差分は未変更 |

## Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- |
| 自動 | `git diff --check` | Pass | Codex | |
| 手動 | READMEの対象導線に`PROJECT.md`がないこと、およびリンク先4文書の存在を確認 | Pass | Codex | |
| 独立レビュー | Project Ownerによる差分確認 | Approved | Project Owner | `DF-PILOT-003 レビューOK`をADF-PILOT-003への承認として記録 |

- 受入条件の照合: 5項目すべてPassまたはApproved。
- 残るリスク・未検証事項: README内の対象導線以外にある古い参照は本Taskの対象外。

## Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-PILOT-003 設計OK` | 2026-08-03 | 本TaskのApproval記録 |
| Diff / Verification | Approved | `DF-PILOT-003 レビューOK`（先頭の`A`なし）を、対象Taskへのレビュー承認として確認 | 2026-08-03 | 本Taskのレビュー記録 |
| 残存リスク | Accepted | READMEの対象導線以外にある古い参照は未監査。別Taskで扱う | 2026-08-03 | 本TaskのScope |

## Handover

- `ADF-PILOT-003`は、Codex単独Phase 0で2件目に数える完走Taskである。
- 得られた学び: 初回導線に存在しない文書を残すと、AIのContext Readは開始直後に止まりうる。削除ではなく正本の置換を選ぶ場合、リンク先の実在確認を受入条件に含める。
- 次のTaskは自動開始しない。Project Ownerが、Phase 0の3件目として可逆で独立した小Taskを選定・承認する。
