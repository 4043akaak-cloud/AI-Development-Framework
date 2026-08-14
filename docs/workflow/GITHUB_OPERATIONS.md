# GitHub 運用ガイド

このドキュメントは、このフレームワークを実装するプロジェクトにおけるGitHub（Projects、Issues、Pull Requests）の運用候補を定めます。

基本ルールは `guidelines/AI_COLLABORATION.md`、承認・停止条件は `docs/workflow/AI_DELEGATION_CHARTER.md`、状態遷移は `docs/workflow/TASK_LIFECYCLE.md` を参照します。

> 現在のCodex単独パイロットでは、GitHub Project、Feature Branch、PRを必須にしません。まず [Codex単独パイロット](CODEX_SOLO_PILOT.md) のTask記録と人間レビューを検証します。

---

## 適用段階

### Phase 0（現在）

必須なのは、GitHub内のTask記録、Required Obsidian Context、Plan、Project Ownerの承認・レビュー、Current Stateの更新である。GitHub Project、Feature Branch、PR、日次pushは必須ではない。Taskの状態と停止条件は [Task Lifecycle](TASK_LIFECYCLE.md) を正本とする。

### Phase 1以降（将来）

以下のProjects、Branch、Pull Requestの節は、複数AIまたは複数人での実装運用を導入する段階の候補である。導入は別Taskで承認し、Project Ownerが権限境界を決める。

## 概要

### Phase 1以降の例

```
GitHub Projects（進捗可視化）
    ↓
GitHub Issues（タスク管理）
    ↓
Feature Branch（実装）
    ↓
GitHub PR（レビュー）
    ↓
Merge to main（完了）
```

---

## 1. Projects（プロジェクト進捗管理）

> 適用: Phase 1以降。Phase 0ではTaskとCurrent Stateで現在地を管理する。

### 目的

複数のAIと人間が、進捗状況をリアルタイムで共有し、優先順位を確認できるようにする。

### 構造

#### ボード構成

```
Status:
├─ 📋 Backlog（実装予定）
├─ 📍 In Progress（実装中）
├─ 🔍 In Review（レビュー中）
├─ ✅ Done（完了）
└─ ❌ On Hold（保留中）
```

#### メタデータ

各カード（Issue）には以下を設定します。

- **Assignee**: 担当AI or 人間
- **Priority**: Critical / High / Medium / Low
- **Phase**: Phase番号（Phase 1, Phase 2 など）
- **Label**: 種別（feature, bugfix, docs, refactor など）

### 運用ルール

1. **新しいタスク作成時**
   - Phase 1以降で必要なら対応する Issue を作成する
   - Project Boardを導入済みの場合だけBacklogへ追加する

2. **作業開始時**
   - ContextとPlanを確認し、Approval Statusを記録する
   - 承認済みで、かつ実装にbranchが必要な場合だけIssueを「In Progress」に移動し、AssigneeとFeature branchを設定する

3. **進捗更新**
   - Issue のコメントで進捗を記録
   - 問題や判断待ちがあれば明記

4. **レビュー段階**
   - PR運用を導入済みの場合だけPRを作成する
   - Project Boardを導入済みの場合だけIssueを「In Review」に移動する
   - 実装者以外のレビュー担当またはProject Ownerに確認を依頼

5. **完了時**
   - PR運用を導入済みの場合、マージ後にIssueを「Done」に移動する
   - 決定記録や知見を記録してからクローズ

---

## 2. Issues（タスク管理）

> 適用: Phase 0ではリポジトリ内の`TASK.md`または`docs/tasks/`を使ってよい。GitHub Issueを使う場合も、Task LifecycleとAI Task Packetの必須項目を省略しない。

### 命名規則

```
[タイプ] 目的
```

#### タイプの一覧

| タイプ | 用途 | 例 |
|--------|------|-----|
| `[Feature]` | 新機能・新規実装 | `[Feature] 予測エンジン基盤構築` |
| `[Bugfix]` | バグ修正 | `[Bugfix] RecipeDetail 型エラー修正` |
| `[Refactor]` | リファクタリング | `[Refactor] コンポーネント再設計` |
| `[Docs]` | ドキュメント | `[Docs] API仕様書作成` |
| `[Test]` | テスト | `[Test] 単体テストカバレッジ向上` |
| `[Chore]` | 保守作業 | `[Chore] 依存パッケージ更新` |
| `[Decision]` | 設計判断 | `[Decision] アーキテクチャ決定` |

### Issue テンプレート

各 Issue は以下の構造で記述します。

```markdown
## 【背景】
この課題が生じた理由、制約、関連する既存の決定

## 【目的】
何を解決・実装するのか、完了したときの状態

## 【完了条件】
- [ ] 条件1
- [ ] 条件2
- [ ] 条件3

## 【受け入れ基準】
テストコード、ドキュメント、仕様を満たすための要件

## 【技術的考慮】
技術スタック、既存実装との相互作用、パフォーマンス

## 【関連資料】
- 関連 Issue: #123
- 決定記録: docs/decisions/...
- Required Obsidian Context: [[ノート名]]（今回採用する制約も記載）

## 【変更してはいけない部分】
保護すべき機能、削除してはいけないファイル

## 【担当】
Assignee（複数可）
```

### 運用ルール

1. **Issue 作成**
   - テンプレートを使用し、背景・目的・完了条件を明確に
   - 関連する Obsidian ファイルを参照

2. **Issue 割り当て**
   - 人間が担当と権限境界を設定する
   - AIは、TaskのApproval Statusを確認できない場合、実装を開始しない

3. **コメント運用**
   - 進捗、判断、懸念を記録
   - 別の AI への引き継ぎ情報もコメントに記載

4. **クローズ**
   - PR がマージされたとき
   - 決定記録や知見がある場合は、作業完了前に記録

---

## 3. ブランチ戦略

> 適用: Phase 1以降、またはProject Ownerがbranch運用を明示承認したTask。Phase 0ではbranchは必須ではない。

### ブランチ命名規則

```
<type>/<short-description>
```

#### タイプ

- `feature/` - 新機能（例：`feature/prediction-engine-core`）
- `bugfix/` - バグ修正（例：`bugfix/recipe-detail-type-error`）
- `refactor/` - リファクタリング（例：`refactor/component-restructure`）
- `docs/` - ドキュメント（例：`docs/api-specification`）
- `hotfix/` - 緊急修正（例：`hotfix/critical-security-issue`）

### ルール

1. **ブランチの作成**
   - `main` から新しいブランチを作成
   - 例：`git checkout -b feature/my-feature`

2. **コミット**
   - 1コミット = 1つのロジカルな変更
   - コミットメッセージは明確に（例：`Add prediction engine core`）

3. **プッシュ**
   - Project Ownerが承認したTask単位でpushする
   - リモートに反映する前に、差分、検証、push対象branchを確認する

4. **PR 作成前**
   - リモートブランチが最新か確認
   - ローカルテストが成功したか確認

---

## 4. Pull Requests（コード・ドキュメント変更）

> 適用: Phase 1以降、またはProject OwnerがPR運用を明示承認したTask。Phase 0の文書TaskではPRを必須にしない。

### PR の目的

- 変更内容を可視化
- Codex（最終確認者）による最終レビュー
- 決定記録を確認
- マージ前の最終チェック

### PR テンプレート

```markdown
## 【目的】
この PR で解決する課題、実装する機能

## 【変更内容】
何を変えたか、なぜ変えたか
- ファイル1: 理由
- ファイル2: 理由

## 【関連 Issue】
Closes #123

## 【テスト・検証】
- [ ] ローカルテスト実施
- [ ] 型チェック成功
- [ ] ビルド成功
- [ ] ドキュメント確認

## 【決定記録の確認】
- [ ] 新しい決定がある場合は `docs/decisions/` に記録
- [ ] または既存の記録から該当するものを参照

## 【Obsidian 確認】
- [ ] Obsidian の関連ファイルを確認済み
- [ ] 学習・教訓が必要な場合は記録予定

## 【Codex レビュー前の確認】
- [ ] 変更範囲が Issue の完了条件に一致
- [ ] 受け入れ基準を満たしている
- [ ] 既存の変更を上書きしていない

## 【残る懸念・未実施事項】
実施できなかった検証、後続作業など
```

### レビュープロセス

#### Step 1: 自動チェック

```
- TypeScript/Lint: エラーなし
- ビルド: 成功
- テスト: 成功（存在する場合）
```

#### Step 2: AI による自己レビュー

PR 作成時に、AI が以下を確認：
- Issue の完了条件を満たしているか
- テストが十分か
- ドキュメントは正確か

#### Step 3: Codex（人間）による最終確認

Codex は以下を確認：
- [ ] 目的と変更内容が一致しているか
- [ ] 受け入れ基準を満たしているか
- [ ] Issue が正しくクローズされるか
- [ ] 決定記録が正確か
- [ ] 他の変更と矛盾していないか

### マージルール

1. **マージ前の確認**
   - すべてのチェック項目が完了している
   - Codex のレビューを受けている
   - 競合がない

2. **マージ方法**
   - "Squash and merge"（コミット履歴を単一化）推奨
   - または "Create a merge commit"（履歴を保持）

3. **マージ後**
   - リモートブランチを削除
   - Issue をクローズ

---

## 5. コミットメッセージの形式

### 形式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 例

```
feat(prediction-engine): implement core orchestration

- Add PredictionEngine class
- Implement 4-step coordinator pattern
- Add recipe registry management

Closes #45
Related to: docs/decisions/ADR-001-prediction-flow
```

### ガイドライン

- **type**: feat, fix, refactor, docs, test, chore
- **scope**: 影響を受けるコンポーネント
- **subject**: 命令形、簡潔（50文字以内推奨）
- **body**: 詳細説明、変更理由（72文字で折り返し）
- **footer**: Issue参照、関連資料

---

## 6. CI/CD との連携

### 今後の検討項目

現時点では GitHub の基本機能を使用します。

将来的には以下を検討：
- [ ] GitHub Actions による自動テスト
- [ ] 静的解析（Lint、型チェック）の自動実行
- [ ] ドキュメント生成の自動化
- [ ] ブランチ保護ルール（マージ前のチェック必須化）

---

## 7. よくある質問

### Q: 複数の AI が同時に異なる Issue に取り組むことはできますか？

**A**: はい。各 Issue が独立していれば、複数 AI の並列作業が可能です。ブランチを分けてください。

### Q: Issue の内容を変更したいときは？

**A**: 人間が Issue を編集してください。進行中の場合は、コメントで AI に通知します。

### Q: PR がレビュー中に Issue の要件が変わった場合は？

**A**: Issue と PR の同期が必要です。人間が判断し、PR をクローズするか、内容を更新するか決めてください。

### Q: Issue を途中でクローズしたい場合は？

**A**: Issue をクローズする前に、理由をコメントに記録してください。後続の AI が理由を理解できるようにします。

---

## 更新方針

このドキュメントは、実際の運用で以下が発生したときに更新します。

- 運用が曖昧で手戻りが生じた
- 新しい運用パターンが必要になった
- 複数 AI 間で理解が異なった

改善案があれば、Issue を作成し、`docs/decisions/` に記録します。
