# Task — ADF-CLAUDE-SKILL-003: native discovery実験の契約曖昧さを解消する

> Type: Implementation / Docs
> Status: Done
> Owner: Project Owner / Codex
> Related: [Contract Clarification](../design/ADF_CLAUDE_REVIEWER_CONTRACT_CLARIFICATION.md) / [ADF-CLAUDE-SKILL-002](ADF-CLAUDE-SKILL-002.md)

## Objective

`native-discovery-packet-only`の実行前に、mode表示、attachment ID、Ownerによる一回入力、Reviewerの二次送信禁止を矛盾なく定義する。

## Required Context

- GitHub: [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)、[ADF-CLAUDE-SKILL-002](ADF-CLAUDE-SKILL-002.md)、[Native Discovery Attachment](../design/ADF_CLAUDE_NATIVE_DISCOVERY_ATTACHMENT.md)。
- Obsidian: `12_Claude_Codeレビュースキル_forward_test設計_2026-08-04.md`、`13_Claude_Code_native_discovery_attachment設計_2026-08-05.md`。採用制約は、実行前に測定と停止条件を固定し、技術的隔離を主張しないこと。

## Scope

- In scope: `SKILL.md`、Packet契約、出力テンプレート、Owner preflight reference、設計/Task/Current State、Obsidian判断/MOC入口。
- Out of scope: Claude Code接続、repo attachment、Packet送信、runtime test、実repo/Vault読取、Connector/MCP/GitHub integration、API、commit、push。

## Plan

| Step | Work | Verification |
| --- | --- | --- |
| 1 | modeとaccess宣言を二つのmodeに対応させる | Skill/テンプレートを照合 |
| 2 | pathをOwner preflightへ、attachment IDをPacketへ分離する | absolute pathがPacket契約に入らないことを確認 |
| 3 | Owner deliveryとReviewer sendを分離する | 禁止操作と実行承認境界を照合 |
| 4 | GitHub/Obsidian記録を更新する | links、`git diff --check` |

## Approval

- Design approval: Project Ownerが2026-08-05に`ADF-CLAUDE-SKILL-003 設計OK`と明示。
- This approval does not authorize Claude Code connection, repository attachment, packet send, runtime test, tool use, external API, commit, or push.

## Implementation Record

| Date | Actor | Change | Boundary |
| --- | --- | --- | --- |
| 2026-08-05 | Codex | 二mode表示、Owner preflight、attachment ID、Owner delivery/Reviewer send分離を追加 | 実行例外は将来の実行承認だけで有効となる。 |

## Verification

| Type | Result |
| --- | --- |
| Static | Pass: 二mode、attachment ID、Owner delivery/Reviewer send、Folder数とファイル添付数の分離、Obsidian MOC入口を確認した。 |
| Automated | Pass: `git diff --check`と新規Skill/設計/Taskファイルへの`git diff --check --no-index`。 |
| Automated | Not run: Skill Creatorの`quick_validate.py`は`PyYAML`未導入により起動できない。依存追加はしない。 |
| Runtime | Not run — 別Task/別実行承認 |
| Project Owner review | Pending |

## Handover

The next safe Task is `ADF-REVIEW-FORWARD-002` design. It must bind the exact attachment ID/path in Owner preflight and separately obtain execution approval before any Claude Code attachment or synthetic-packet delivery.

## Project Owner Review

| Target | Decision | Evidence | Date |
| --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-CLAUDE-SKILL-003 設計OK` | 2026-08-05 |
| Diff / Verification | Approved | `ADF-CLAUDE-SKILL-003 レビューOK` | 2026-08-05 |
| Remaining risk | Accepted | runtime接続、native Skill discovery、repo非読取、hidden context、telemetry、技術的隔離は未検証。 | 2026-08-05 |
