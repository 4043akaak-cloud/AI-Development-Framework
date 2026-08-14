# Task — ADF-CLAUDE-SKILL-002: native Skill discovery attachment契約を追加する

> Type: Implementation / Docs
> Status: Done
> Owner: Project Owner / Codex
> Related: [Native Discovery Attachment設計](../design/ADF_CLAUDE_NATIVE_DISCOVERY_ATTACHMENT.md) / [ADF-CLAUDE-SKILL-001](ADF-CLAUDE-SKILL-001.md) / [ADF-REVIEW-FORWARD-001](ADF-REVIEW-FORWARD-001.md)

## Objective

Claude Codeがchecked-in Skillを発見するための、正確な一プロジェクトだけのattachment例外を定義する。repoをReview Packetの根拠に使う権限や、技術的な読み取り隔離を作るTaskではない。

## Required Context

- GitHub: [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)、[Claude Code Reviewer Skill](../design/ADF_CLAUDE_REVIEWER_SKILL.md)、[Forward Test設計](../design/ADF_REVIEW_FORWARD_TEST.md)、[Current State](../project/CURRENT_STATE.md)。
- Obsidian: `11_Claude_Code外部レビュースキル_2026-08-04.md`、`12_Claude_Codeレビュースキル_forward_test設計_2026-08-04.md`。採用制約は、Skillはモデル訓練や技術的sandboxではなく、実験の接続・逸脱・未検証を正本へ残すこと。

## Scope

- In scope: `.claude/skills/adf-independent-review/`の契約、native discovery attachment設計、本Task、Current State、Obsidianの判断/MOC入口。
- Out of scope: Claude Codeへの実repo接続、FWD-01〜03送信、実repo/Vault読取、Connector/MCP/GitHub integration、Skill配布、Adapter/API、実装、commit、push。

## Plan

| Step | Work | Verification |
| --- | --- | --- |
| 1 | `native-discovery-packet-only`の唯一の例外とSTOP条件をSkillへ加える | path、禁止操作、Invalid条件を静的照合 |
| 2 | 状態モデル、観測限界、受入条件を設計書へ記録 | packet-onlyと技術的隔離を混同しないことを照合 |
| 3 | GitHub/Obsidianの判断と次Taskを更新 | links、`git diff --check` |

## Approval

- Design approval: Project Ownerが2026-08-05に`ADF-CLAUDE-SKILL-002 設計OK`と明示。
- This approval does not authorize: repo attachment, Packet send, tool use, external API, file read, Skill distribution, commit, or push.

## Implementation Record

| Date | Actor | Change | Boundary |
| --- | --- | --- | --- |
| 2026-08-05 | Codex | SkillのFolder状態を`none`/`native-discovery-only`/`active`/`unknown`に分け、exact path・禁止操作・Invalid条件を追加 | AttachmentはSkill発見だけであり、repo本文を根拠に使わない。 |

## Verification

| Type | Result |
| --- | --- |
| Static | Pass: frontmatter、4状態、exact path、禁止操作、Invalid条件、Obsidian MOC入口を確認した。 |
| Automated | Pass: `git diff --check`と新規Skill/設計/Taskファイルへの`git diff --check --no-index`。 |
| Automated | Not run: Skill Creatorの`quick_validate.py`は`PyYAML`未導入により起動できない。依存追加はしない。 |
| Runtime | Not run: Claude Code接続・Packet送信は別Task/別実行承認。 |
| Project Owner review | Pending |

## Handover

Next safe Task is `ADF-REVIEW-FORWARD-002`: attach only the exact approved ADF project for native discovery, then run synthetic packets under a new execution approval. Remaining risk is that this is not a technical sandbox and repository non-reading cannot be proven.

## Project Owner Review

| Target | Decision | Evidence | Date |
| --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-CLAUDE-SKILL-002 設計OK` | 2026-08-05 |
| Diff / Verification | Approved | `ADF-CLAUDE-SKILL-002 レビューOK` | 2026-08-05 |
| Remaining risk | Accepted | native discovery attachmentは技術的隔離でなく、runtime検証は別Task・別承認。 | 2026-08-05 |
