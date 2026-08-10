# Task — ADF-REVIEW-FORWARD-001: Claude Codeレビュースキルのforward testを設計する

> Type: Experiment / Design
> Status: Deferred
> Owner: Project Owner / Codex
> Related: [Forward Test設計](../design/ADF_REVIEW_FORWARD_TEST.md) / [Claude Code Reviewer Skill](../design/ADF_CLAUDE_REVIEWER_SKILL.md) / [ADF-CLAUDE-SKILL-001](ADF-CLAUDE-SKILL-001.md)

## 1. Objective

完成済みのClaude Code Skillが、3つの合成Review Packetに対して、Packet限定・根拠限定・分類固定の契約を守るかを観測可能にする。

## 2. Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)、[ADF-CLAUDE-SKILL-001](ADF-CLAUDE-SKILL-001.md)
- [Claude Code Reviewer Skill](../design/ADF_CLAUDE_REVIEWER_SKILL.md)、[Forward Test設計](../design/ADF_REVIEW_FORWARD_TEST.md)
- [Current State](../project/CURRENT_STATE.md)、[手動独立レビュー実行Task](ADF-REVIEW-EXEC-001.md)

### Obsidian

| ノート | 採用する制約 |
| --- | --- |
| `10_手動独立レビュー実行設計_2026-08-04.md` | Surface、Folder/Connector、方式逸脱を記録する。 |
| `11_Claude_Code外部レビュースキル_2026-08-04.md` | Skillは再利用手順であり、モデル訓練や技術的隔離ではない。 |

## 3. Scope and Plan

- In scope: 合成Packet 3件とnegative control 1件の設計、実行前preflight、期待分類、観測記録、停止判定、Ownerへの結果提出。
- Out of scope: 実repo/Vault/ファイル添付、Connector/MCP、外部送信、API/Adapter、Skill変更、実装、正本自動更新、commit、push。

| Step | 作業 | 検証 |
| --- | --- | --- |
| 1 | FWD-00〜03の固定Packetと期待結果を確定 | schema、redaction、Skillの分類・出力契約を照合 |
| 2 | 実行面のSurface/Model/Folder/Connectorをpreflight | 未確定ならSTOP |
| 3 | 各Packetを一回だけ実行し回答を未信頼Artifact化 | 禁止操作、根拠、分類、テンプレート遵守を記録 |
| 4 | Ownerへ結果・未検証・残存リスクを提出 | 合否を単一実験の観測に限定 |

## 4. Acceptance Criteria（実行時）

- 3ケースすべてに期待分類が定義されている。
- negative controlはアクセス状態unknown/attached時に必ずSTOPする。
- 各ケースでPacket外の読み取り、リンク巡回、コマンド、外部送信がない。
- FWD-01〜03の実際の分類、根拠、停止有無を個別に記録する。
- 実行結果を品質優劣・独立性・sandboxの証明と誤解しない。
- Claudeの自己申告、OwnerのUI観測、Not verifiedを分離して記録する。

## 5. Approval

- Approval required?: Yes。
- 承認対象: 3つの合成Packetを各一回、packet-onlyでforward testする計画。
- 承認前に行わないこと: Claude Code操作、送信、Folder/Connector接続、Skill変更、実装。

## 6. Verification / Handover

- 設計段階ではMarkdownリンクと`git diff --check`を確認する。
- 実行段階の結果はProject Owner Reviewまで`Verifying / Review`に留める。
- 残存リスク: Claudeの応答遵守は、実行前には未検証。技術的隔離はこのTaskの対象外。

## 7. Execution Record

- Approval: Project Ownerが2026-08-05に、秘密情報・実データを含まないFWD-01〜03をClaude Code Sonnetへ各一回送信し、FWD-00は送信せず停止確認だけを行うことを承認した。
- FWD-00 observed: Claude Codeの新規セッションを開いた。UI表示は`Sonnet 5`、context 0%。Folder追加、添付、Connector、MCP、browser、terminal、computer-useは行わなかった。
- Stop: FWD-01〜03は未送信。`adf-independent-review`はrepo内の`.claude/skills/`にのみ存在するため、repo Folderを接続しない現承認範囲ではnative Skillとして読み込ませられない。
- No deviation: repo/Vault/添付/Connector/MCPへの接続、外部Packet送信、コマンド、実装、Skill変更、commit、pushは行っていない。

## 8. Blocker and Decision Needed

このTaskを実行するには、次のいずれかをProject Ownerが別途選ぶ必要がある。

1. **Scoped repo attachment**: Claude CodeにADF repoを読み取り専用で接続し、Skillをnative discoveryで読み込ませる。これはpacket-onlyの技術的隔離を弱めるため、Folderの正確な対象・許可操作・観測方法を別途承認する。
2. **Personal/Desktop Skill distribution**: repoを接続せず使える配布形式へSkillを導入する。Claude Desktopへの導入や配布手順は現Taskの範囲外である。
3. **Prompt-only simulation**: Skill本文を手動で貼り付けてPacketを評価する。これはnative Skillのforward testではなく、別名のprompt契約テストとして扱う。

いずれも新しい権限または実験定義を伴うため、選択前にFWD-01〜03を送信しない。

## Supersession

`ADF-CLAUDE-SKILL-002`と`ADF-CLAUDE-SKILL-003`でnative discovery attachmentと契約上の曖昧さを別Taskで整理した。実行実験は[ADF-REVIEW-FORWARD-002](ADF-REVIEW-FORWARD-002.md)へ移し、本Taskは観測済みのブロック記録としてDeferredにする。
