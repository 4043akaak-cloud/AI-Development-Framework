# AI Delegation Charter

## Purpose

この文書は、人間と複数のAIが安全に協働するための、役割・権限・承認・エスカレーションの共通契約である。対象AIはCodex、Claude Code、Z.ai、将来追加されるAIを含む。特定の製品機能に依存しない。

## Shared Task Gate

実装Taskは、次の順序を飛ばしてはならない。

```text
Idea / Research
  → Required Obsidian Contextを確認
  → Planを提出
  → Approvalを取得
  → Approved Scopeだけを実装
  → Verificationと独立レビュー
  → GitHubとObsidianを更新
```

承認前に許可されるのは調査、選択肢の提示、Plan作成だけである。コード、設定、依存関係、データ、UI、構造の変更は行わない。

## Required Task Record

各TaskまたはIssueには、最低限次を記録する。

- Task ID、Objective、Background、Scope、Out of Scope
- Required Obsidian Context（ノートへのリンク）と、採用した制約
- Expected Result、Acceptance Criteria、Verification
- Plan、Approval Status、実装ブランチ、レビュー担当
- GitHub / Obsidian Update、Remaining Issues、Handover

## Roles and Permissions

| Role | Responsibility | Allowed Actions |
| --- | --- | --- |
| Project Owner | Goal、MVP、優先順位、予算、公開、不可逆操作の決定 | 方針と承認境界を決める |
| Supervising AI | Contextの整理、Task分解、リスク監督 | 承認済みGoal・MVP・Roadmapの範囲で、限定Taskを委任する |
| Review AI | 設計・差分・テスト・セキュリティの独立確認 | 根拠とともに承認・差し戻しを提案する。自分の実装は最終承認しない |
| Implementation AI | 承認済みTaskの変更と検証 | 指定Scope・指定ファイルだけを変更し、結果と未検証事項を報告する |
| CI / Automated Check | 機械的検証 | テスト、型、リンク、秘密情報、規約違反を検出する |

## Delegation Rule

Project OwnerがGoal、MVP、Roadmap、受入条件、権限境界を承認済みの場合、Supervising AIはその範囲内の通常Taskを委任できる。これは「実装AIに目的変更の権限を与える」ことを意味しない。

同一Taskでは、実装AIと最終レビューAIを分ける。AIの製品名ではなく、担当した成果物と権限で役割を区別する。

## Mandatory Escalation

以下はProject Ownerの明示承認なしに実行しない。

- Goal、MVP、優先順位、設計原則の変更
- Scope外の変更、新規依存関係、外部API、費用の発生
- DB移行、データ削除、互換性を壊す変更
- GitHubへの公開、SNS投稿、課金、権限変更、秘密情報の取扱い
- 影響範囲を特定できない変更、または元に戻せない操作
- テスト失敗、レビュー結果、根本原因によりPlanが成立しなくなった場合

不可逆な操作は、失敗後ではなく実行前に識別して止める。

## Completion Rule

TaskをDoneにできるのは、次が記録された場合だけである。

- Required Contextを確認した根拠
- Approved Scope内の実装
- 定義済みVerificationの結果
- 独立レビューまたは該当しない理由
- GitHubのTask / Current State更新
- 必要なObsidianの判断・学び・Handover更新

未実施・失敗・未確認はPassedやDoneとして扱わない。

## Automation Boundary

初期のループは、読み取り専用の調査、品質検出、報告、Issue草案作成までに限定する。自動修正、Push、Merge、公開、SNS投稿は、手動運用で有効性と安全性を検証してから別Taskとして導入する。

## AI-Specific Adapters

- `AGENTS.md`: 全AIが読む共通入口
- `CLAUDE.md`など: AI固有の起動方法・機能だけを補足するアダプタ
- Skills、Subagents、MCP、Hooks: 共通契約を置き換えず、反復作業・検証・外部接続を補助する手段

AI固有の会話履歴やMemoryだけを、運用上の唯一の正本にしてはならない。
