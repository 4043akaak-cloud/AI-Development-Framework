# 開発フロー（概要）

この文書は、ADFの流れを素早く確認するための概要である。権限と停止条件は[AI Delegation Charter](AI_DELEGATION_CHARTER.md)、Taskの状態遷移は[Task Lifecycle](TASK_LIFECYCLE.md)を正本とする。

```text
Idea / Research
  → Required Obsidian Context
  → TaskとPlan
  → Human Approval
  → Approved Scopeの変更
  → Verification
  → Review
  → GitHub / Obsidian Update
  → Stop
```

## 現在の適用

現在は[Codex単独パイロット](CODEX_SOLO_PILOT.md)でこの流れを検証する。CodexはPlanと承認済みScopeの変更を担当し、Project Ownerが承認、レビュー、commit・push判断を担当する。

## 将来の適用

別AIの独立レビュー、GitHub Project、PR運用、補助自動化は、Codex単独パイロットで記録を確認した後に追加する。外部APIやOpenRouterによるモデル自動選定は、さらに後の別Taskで扱う。
