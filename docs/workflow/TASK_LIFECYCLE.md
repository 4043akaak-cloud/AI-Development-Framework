# Task Lifecycle

## Purpose

この文書は、GitHub Issueまたは`TASK.md`で管理するTaskの状態と、次の状態へ進むための条件を定める。状態名そのものより、必要な記録と停止条件を守ることを優先する。

共通の役割・承認境界は [AI Delegation Charter](AI_DELEGATION_CHARTER.md) を正本とする。Taskの記入項目は [TASK template](../../templates/TASK.md) を使う。

## State Flow

```text
Captured
  → Context Read
  → Planned
  → Waiting Approval
  → Approved
  → Implementing
  → Verifying
  → Ready to Push
  → Pushed
  → Done

Any state → Blocked / Deferred
```

## States and Gates

| Status | 意味 | 次へ進むための必須条件 |
| --- | --- | --- |
| Captured | 依頼・アイデアを記録しただけ | ObjectiveとOwnerを記載する。変更しない。 |
| Context Read | 関連情報を読んだ | GitHubとRequired Obsidian Context、および採用する制約を記録する。 |
| Planned | 実行案を作成した | Scope / Out of Scope、影響、検証、代替案、停止条件を記録する。変更しない。 |
| Waiting Approval | 承認待ち | 承認対象と承認者を明記する。承認前は調査とPlanのみ。 |
| Approved | 実装可能 | ScopeとPlanの承認記録がある。承認不要なら根拠を記録する。 |
| Implementing | 承認済みScopeを実装中 | 逸脱・新しいリスク・不可逆操作を見つけたら停止してBlockedまたはWaiting Approvalへ戻す。 |
| Verifying | 実装を確認中 | 完了条件ごとの検証を実施し、Pass / Fail / Not runを記録する。 |
| Ready to Push | commit済みで公開前 | 差分、検証、レビュー、push対象branchを確認する。PushはProject Ownerの権限境界に従う。 |
| Pushed | リモートへ反映済み | リモート反映を確認し、PR / Issue / Current Stateを更新する。 |
| Done | Taskを閉じられる | CharterのCompletion Ruleを満たし、未検証を隠さず、引き継ぎ先または次の一手を記録する。 |
| Blocked | 安全に進められない | 原因、影響、必要な判断・解消条件、Ownerを記録する。 |
| Deferred | 意図して後回しにする | 再開条件、理由、失うもの、参照先を記録する。 |

## Hard Stops

次の場合は、実装を継続せず`Waiting Approval`または`Blocked`へ戻す。

- Goal、MVP、優先順位、Scope、受入条件が変わる。
- 新規依存関係、外部API、費用、権限、秘密情報、公開・SNS投稿・課金が必要になる。
- DB移行、データ削除、互換性を壊す変更、ロールバック不能な操作が必要になる。
- Planどおりに検証できない、またはテスト・レビューから根本的な問題が見つかる。
- Required Contextが欠け、影響を安全に判断できない。

## Update Rules

- `CURRENT_STATE.md`は、Task開始・Blocked・Pushed・Doneで更新する。
- 再利用できる設計判断はADRへ、長い調査・発想・学びはObsidianへ記録する。
- Implementation AIと最終Review AIは原則分ける。分けられない場合は理由と代替の検証をTaskに残す。
