# ADF Task Board MVP 設計

> Status: Design only — UI、API、DB、自動化は未実装。
> Product direction: AIRFLOW型の司令塔 × ループコーディング。

## 1. このアプリがすること

ADF Task Boardは、AI支援開発のための**司令塔画面**である。人間が、複数プロジェクトのTask、担当AI、承認待ち、リスク、検証結果、次の判断を一画面で見渡す。

同時に、各Taskを次のループとして扱う。

```text
観測 → Context → Plan → Approval → Implementation → Verification
  → Review → 学び・Handover → 次Task
```

「Taskを完了にする」だけでなく、検証・レビューで得た学びを次のTaskの入力に戻す点が、単なるカンバンとの違いである。

## 2. 正本の境界

| 情報 | 正本 | Boardの役割 |
| --- | --- | --- |
| Task、Plan、Approval、変更、検証、レビュー、Git履歴 | GitHub Repository | Task IDとリンク、要約、最終確認日時を表示する |
| 背景、長い調査、判断理由、失敗学、アイデア | Obsidian | Required Contextへのリンクと採用制約を表示する |
| 現在見るべき順序、承認待ち、リスク、役割の全体像 | Board | 閲覧・判断を助ける。正本を上書きしない |

Boardは、GitHubやObsidianを複製した別データベースではない。最初のMVPでは、人間またはSupervising AIが正本を読んで手動で表示内容を確認する。

## 3. Cardの最小契約

各Cardは1つのGitHub Taskを表す。Cardだけを見て判断せず、必ず正本Taskへ戻れるようにする。

| 項目 | 意味 | 例 |
| --- | --- | --- |
| Task ID | Taskを一意に特定する番号 | `ADF-PILOT-004` |
| Project | 所属プロジェクト | `AI-Development-Framework` |
| Objective | 今回達成したい一文 | Task Boardの最小設計を定める |
| 表示状態 | Board上の集約表示 | `承認待ち` |
| Lifecycle status | GitHub Taskに記録された正式状態 | `Waiting Approval` |
| Approval | 人間が何を判断する必要があるか | Plan / Scope承認 |
| Role / Owner | 実施者とレビュー担当 | Codex / Project Owner |
| GitHub Task | Task正本へのリンク | `docs/tasks/...` |
| Required Obsidian Context | 必要なノートと採用制約 | ADF MOC、Codex単独パイロット |
| Evidence | 検証・レビュー・決定へのリンク | diff check、レビュー記録 |
| Risk / Blocker | 未解決事項と停止条件 | APIが必要なら停止 |
| Last confirmed | 表示内容を正本と照合した日時 | `2026-08-03` |

## 4. 表示状態と正式状態

Boardの列は、Task Lifecycleを置き換えない。複数の正式状態を、人間が見やすい表示にまとめるだけである。

| Board列 | 対応する正式状態の例 | 人間が見るべきこと |
| --- | --- | --- |
| Inbox / 観測 | Captured | Task化すべき問題・機会は何か |
| Context・Plan | Context Read、Planned | 必要な背景とPlanは揃っているか |
| 承認待ち | Waiting Approval | 今回、人間が決めることは何か |
| 実装中 | Approved、Implementing | 承認済みScopeから逸脱していないか |
| 検証・レビュー | Verifying、Ready to Push、Pushed | 根拠、未検証、残存リスクは何か |
| 学び・完了 | Done、Deferred | 次のTaskへ渡す学びは何か |
| Blocked | Blocked | 解消に必要な判断・情報・権限は何か |

## 5. 役割と権限

| 役割 | Board上の責務 | 実行できないこと |
| --- | --- | --- |
| Project Owner | Goal、優先順位、承認、最終レビュー、不可逆操作の判断 | 目的変更をAIへ丸投げしない |
| Supervising AI（上司AI） | Taskを分解し、依存・リスク・承認待ちを集約して提示する | Owner未承認で実装・push・公開しない |
| Implementation AI（作業AI） | 承認済みScopeを実装・検証し、根拠をTaskへ戻す | Goal・優先順位・Scopeを勝手に変えない |
| Review AI | 差分、検証、矛盾、リスクを独立確認する | 自分の実装を最終承認しない |

## 6. ループコーディングの契約

| 工程 | 入力 | 出力 | 停止条件 | 承認者 |
| --- | --- | --- | --- | --- |
| 観測 | 利用者の課題、障害、アイデア、前Taskの学び | Task候補、優先度の根拠 | Goalや価値が不明 | Project Owner |
| Context | GitHub正本、Required Obsidian Context | 採用制約、現状、影響範囲 | Context不足・リンク切れ | Supervising AI / Owner |
| Plan | Context、受入条件 | Scope、手順、検証、代替案 | Scope・リスク・検証が不明 | Project Owner |
| Approval | Plan、影響、費用・権限の有無 | Approved Scopeまたは差し戻し | 未承認、不可逆操作、費用 | Project Owner |
| Implementation | Approved Scope | 変更、実施記録 | Scope外、失敗、秘密情報、外部送信 | Implementation AIが停止しOwnerへ |
| Verification | 変更、受入条件 | Pass / Fail / Not run、根拠 | 検証不能・失敗 | Implementation AI / Review AI |
| Review | 差分、検証、残存リスク | 承認・差し戻し・次の判断 | 独立性不足、重大リスク | Project Owner / Review AI |
| 学び・Handover | 完了Task、問題、判断 | Obsidianの学び、次Task候補 | 正本更新・未検証が欠ける | Supervising AI / Owner |

## 7. 最小画面構成

```text
┌ Project selector ─────────────────── Approval / Risk queue ┐
│  ADF  |  Project A  |  Project B       Owner action needed  │
├─────────────── Task Board ──────────────────────────────────┤
│ Context・Plan | 承認待ち | 実装中 | 検証・レビュー | 完了 │
│ [Card]        | [Card]   | [Card] | [Card]          | [Card]│
├ Focus panel ─────────────────────── Evidence / Context ─────┤
│ Objective / Role / Stop condition    GitHub / Obsidian links │
└─────────────────────────────────────────────────────────────┘
```

初期画面で重要なのは、カードを派手に動かすことではない。Project Ownerが「今決めるべきこと」「止まっている理由」「次の安全な一手」を数秒で見つけられることである。

## 8. 初心者向けの言葉

- **UI（ユーアイ）**: 画面の見た目と操作部分。Cardや列、ボタンなど。
- **API（エーピーアイ）**: アプリ同士が情報を渡すための窓口。GitHubからTaskを自動取得する場合などに必要になる。
- **データベース**: アプリ用の情報を保存する箱。最初のBoardでは新設せず、GitHubとObsidianを参照する。
- **ローカルアプリ**: 自分のMacだけで動くアプリ。最初の実装候補であり、公開サーバーやログインが不要な範囲から始められる。
- **同期**: 二つの場所の情報を同じに保つ処理。便利だが、ずれや上書きの危険があるため後段で扱う。

## 9. 段階的な実装計画

| 製品段階 | 作るもの | まだ作らないもの | 開始条件 |
| --- | --- | --- | --- |
| Design（今回） | この設計契約、Card、ループ、権限境界 | UI、API、DB | Project Owner承認 |
| Product MVP 1 | ローカルの読み取り専用Board画面。手動でTask情報を表示 | GitHub/Obsidian API、書き込み、他AI | Phase 0の3件完走と設計レビュー |
| Product MVP 2 | GitHubの読み取り専用参照、正本リンク、更新確認表示 | 自動書き込み、push、merge | データ方針・秘密情報管理の承認 |
| Product MVP 3 | 手動で複数AIのPlan・批判・レビューを並べる画面 | 自動討論・自動実装 | 外部AIレビューの実証 |
| Product MVP 4 | 承認済み範囲のモデル候補選定・読み取り補助 | 無承認の外部送信、費用発生、公開 | OpenRouter等の費用・データ方針承認 |

## 10. 今は作らないもの

- GitHub API、Obsidian API、外部AI、OpenRouter、認証、データベース。
- Cardの自動作成・自動同期・自動移動。
- 自動commit、push、merge、SNS投稿、課金、公開。
- 人間の承認を飛ばして実装を始める機能。

これらは便利に見えても、秘密情報、費用、同期競合、誤操作、責任境界を同時に増やす。各段階の手動運用と検証結果を確認してから、別Taskで導入を判断する。
