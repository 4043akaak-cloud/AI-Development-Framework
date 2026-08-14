# Obsidian 連携ガイド

## 正本の役割分担

| 保存先 | 正本にするもの |
| --- | --- |
| GitHub Repository | Task、Plan、Approval、変更、テスト、レビュー、Current State、ADR、履歴 |
| Obsidian Vault | 理念、発想、長い調査、判断理由、失敗学、プロジェクト横断の知識 |

同じ本文を両方へ無計画に複製しない。GitHubのTask ID・Issue/PR URL・ADR、またはObsidianノートへのリンクで相互参照する。

## Task開始時

1. GitHubのTaskで、Required Obsidian Contextを列挙する。
2. 各ノートから今回採用する制約・学びをTaskへ短く記録する。
3. AIへはVault全体を渡さず、Taskに指定されたノートだけを渡す。
4. Contextが不足する場合は、推測で実装せず`Context Read`または`Blocked`で止まる。

Taskへの依頼には [AI Task Packet](../../templates/AI_TASK_PACKET.md) を使う。

## Task完了時

- GitHubには、変更、検証結果、承認、残存リスク、次の一手を残す。
- Obsidianには、再利用可能な判断理由、長い調査、失敗・学びだけを残す。
- GitHub側のTask ID / Issue / PRと、Obsidian側のノートを相互リンクする。
- 日々の細かな進捗をObsidianへ重複記録する必要はない。

## Vaultの入口

Vault Homeと、各プロジェクトのMOCを入口にする。ADFの背景と現在の最小運用は、Obsidianの`Projects/AI-Development-Framework/00_MOC.md`およびその配下のパイロットノートに記録する。

## 現在の段階

現在は [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md) を行う。AI間の自動会話、外部API、OpenRouter、自動pushは、手動パイロットと独立レビューの結果を評価してから別Taskとして導入する。
