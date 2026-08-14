# Task — ADF-CLAUDE-SKILL-001: Claude Codeのパケット限定レビュースキルを作成する

> Type: Implementation / Docs
> Status: Done
> Owner: Project Owner / Codex
> Related: [Claude Code Reviewer Skill](../design/ADF_CLAUDE_REVIEWER_SKILL.md) / [外部独立レビュー実験設計](../design/ADF_EXTERNAL_REVIEW_EXPERIMENT.md) / [Current State](../project/CURRENT_STATE.md)

## 1. Objective

Claude CodeがADFの外部レビューを行う際、固定Packetだけを根拠として扱い、ローカル/外部アクセスを要求せず、根拠不足を脆弱性として断定しない再利用可能なSkillを作る。

## 2. Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [ADF-REVIEW-001](ADF-REVIEW-001.md)、[ADF-REVIEW-EXEC-001](ADF-REVIEW-EXEC-001.md)
- [外部独立レビュー実験設計](../design/ADF_EXTERNAL_REVIEW_EXPERIMENT.md)、[Adapter契約](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- [Current State](../project/CURRENT_STATE.md)、[Claude Code作業ガイド](../../CLAUDE.md)

### Obsidian

| ノート | 採用する制約 |
| --- | --- |
| `08_外部独立レビュー実験設計_2026-08-04.md` | 外部回答は未信頼入力であり、最小PacketとOwner判断を維持する。 |
| `10_手動独立レビュー実行設計_2026-08-04.md` | Surface、Folder/Connector未接続、方式逸脱を実行前条件として残す。 |
| `11_Claude_Code外部レビュースキル_2026-08-04.md` | Skillはモデル訓練や技術的隔離ではなく、再利用する手順契約である。 |

## 3. Scope and Plan

- In scope: `.claude/skills/adf-independent-review/`、本Task、設計、Current State、Obsidianの判断記録とMOC入口。
- Out of scope: Plugin/ZIP/Claude Desktopへの導入、Folder/Vault/repoアクセス、添付、MCP/connectors、browser/terminal/computer-use、外部送信、API/Adapter、実レビュー、修正実装、commit、push。

| Step | 作業 | 検証 |
| --- | --- | --- |
| 1 | Claude Code native Skillと参照契約を作る | frontmatter、リンク、禁止操作、分類、テンプレートを静的確認 |
| 2 | Task/設計/Current State/Obsidianへ境界と判断理由を記録する | 正本境界と相互リンクを照合 |
| 3 | diffとSkill構造を検証する | `git diff --check`、Skill validator、手動確認 |

## 4. Approval

- Approval required?: Yes。
- 承認対象: 本TaskのSkill・参照契約・GitHub/Obsidian記録に限定する。
- 承認記録: 2026-08-04、Project Ownerが`ADF-CLAUDE-SKILL-001 設計OK`と明示した。
- この承認に含まれないこと: Claude Desktopの設定/導入、ファイル共有、接続、送信、外部実行、API、実装、commit、push。

## 5. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-04 | Claude Code Sonnet | Folder、添付、Connector、MCP、ツールを使わないSkill初稿を会話内で提示 | Claude Code側の出力契約案を得るため | 初稿は正本ではない。ファイル作成、repo/Vaultアクセス、コマンド、外部送信は行わなかった。 |
| 2026-08-04 | Codex | native Skill、3参照契約、Task/設計/Obsidian記録を作成 | 初稿をADFの既存Review契約・安全境界と照合し、再利用可能な正本へ統合するため | `packet-only`は行動上の制約であり、Claude Codeの技術的sandboxではないことを明記した。 |

## 6. Verification

| 種別 | 実施内容 | 結果 | 実施者 |
| --- | --- | --- | --- |
| 静的 | Skillのfrontmatter、3参照、preflight、4分類、固定出力を確認 | Pass | Codex |
| 自動 | `git diff --check`と新規Skill/記録ファイルへの`git diff --check --no-index` | Pass | Codex |
| 自動 | Skill Creatorの`quick_validate.py` | Not run — 実行環境に`PyYAML`がなく`ModuleNotFoundError: yaml`で停止。依存追加は行っていない。 | Codex |
| 実行 | Claude Codeでのsynthetic Packet forward test | Not run — 別実行承認が必要 | - |
| Review | Project Ownerによる差分・検証レビュー | Pending | Project Owner |

## 7. Handover

- 次の安全な一手: Project Ownerが差分・静的検証をレビューし、必要なら別Taskで一回のsynthetic Packet forward testを設計・承認する。
- 残存リスク: SkillはClaudeの挙動を保証せず、モデル品質や独立性を証明しない。技術的隔離、Scoped local review、Adapter、Plugin/ZIP導入は未実施である。

## 8. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 |
| --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-CLAUDE-SKILL-001 設計OK` | 2026-08-04 |
| Diff / Verification | Approved | `ADF-CLAUDE-SKILL-001 レビューOK` | 2026-08-04 |
| 残存リスク | Accepted | forward test、技術的隔離、Scoped local review、Adapter、Plugin/ZIP導入は別Task・別承認とする。 | 2026-08-04 |
