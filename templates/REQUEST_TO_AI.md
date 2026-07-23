# AI への依頼テンプレート

このテンプレートを使用して、AI（Claude Code、Codex、ChatGPT など）に作業を依頼してください。

このテンプレートを使用することで、複数の AI が同じ文脈で作業を理解でき、引き継ぎが容易になります。

---

## 使用方法

1. このテンプレートをコピー
2. GitHub Issue または conversation に貼り付け
3. 各セクションを具体的に記入
4. 依頼を送信

**ポイント**: 曖昧性を排除し、完了条件を明確にしてください。

---

## テンプレート

### ■ 【プロジェクト名】
```
[プロジェクト名・Issue タイトル]
```

### ■ 【背景・文脈】
```
【この作業が必要になった理由】
- 解決したい課題
- ビジネス上の制約
- 関連する既存の決定

【前提条件】
- 既に実装されたもの
- 確定している仕様
- 今回は実装しないもの

【参考資料】
- GitHub PR/Issue: #123
- Obsidian ファイル: ~/Desktop/second Brain/obsidian/Projects/...
- 関連決定: docs/decisions/ADR-001.md
- 既存実装: [ファイルパス]
```

### ■ 【目的】（WHY）
```
【最終的に達成したい状態】
- ユーザーが得られるメリット
- システムにおける役割
- 成功のイメージ

【この作業の優先度】
- Critical / High / Medium / Low
- 期限（ある場合）
```

### ■ 【完了条件】（DEFINITION OF DONE）
```
作業が完了したと判断する基準をリストアップしてください。

- [ ] 完了条件1（例：User model に email field が追加される）
- [ ] 完了条件2（例：ユーザー登録画面で email が入力可能になる）
- [ ] 完了条件3（例：単体テストが 100% パスする）
- [ ] 完了条件4（例：TypeScript エラーが 0 になる）
- [ ] ドキュメント更新（必要に応じて）
- [ ] Obsidian に実装記録を作成

```

### ■ 【実装範囲】（SCOPE）
```
【実装してよい部分】
- ファイル: [パス]
- 機能: [具体的な機能]
- 修正対象: [対象コンポーネント]

【実装してはいけない部分】
- 既存のルール・ポリシーの変更
- 無関係なリファクタリング
- スコープ外の「ついでに修正」
```

### ■ 【受け入れ基準】（ACCEPTANCE CRITERIA）
```
テストコード、ドキュメント、仕様について、何をもって「完了」とするか。

- [ ] Unit test で網羅性 X% 以上
- [ ] Integration test で [具体的なシナリオ] をテスト
- [ ] TypeScript の型チェック エラー 0
- [ ] Linter エラー 0
- [ ] README が最新に更新されている
- [ ] コード内の重要な判断が記録されている（コメント or 決定記録）
```

### ■ 【技術的考慮】（TECHNICAL NOTES）
```
実装時に気をつけるべき技術的な制約、依存関係、パフォーマンス。

【アーキテクチャ上の注意】
- 他のコンポーネントとの相互作用
- データフロー
- 既存パターンとの整合性

【技術スタック】
- 使用すべき技術: [言語/フレームワーク]
- 使用してはいけない技術: [理由]

【パフォーマンス・セキュリティ】
- 性能要件（例：1秒以内に完了）
- セキュリティ要件（例：認証が必須）

【既知の制限】
- 外部API が利用不可の場合のフォールバック
- データベース容量の制限
- ブラウザ互換性の制限
```

### ■ 【今後の判断が必要な場合】
```
依頼を始める前に、以下が確認できるまで待つ / 先に進める？

【Blocked On（何かが完了するまで待つ）】
- [ ] Issue #XYZ がクローズされるまで待つ
- [ ] 人間のレビュー待ち

【Quick Decision（先に進む前に判断が必要）】
- [ ] [判断内容]
  - 選択肢 A: [説明]
  - 選択肢 B: [説明]
  - → 推奨: 選択肢 A（理由）
```

### ■ 【検証方法】（HOW TO VERIFY）
```
完了条件を確認するため、何をテストするか。

【自動テスト】
- Unit test: [テスト対象]
- Integration test: [テストシナリオ]

【手動確認】
- 画面で確認: [操作手順]
- ログで確認: [ログ内容]
- データベース確認: [確認内容]

【ドキュメント確認】
- コメント/決定記録: [場所]
- Obsidian: [ファイル]
```

### ■ 【作業完了後の報告】
```
作業が終わったら、AI は以下を報告してください。

- 実施した変更と目的
- 変更したファイル一覧
- 実施した検証と結果
- 未検証事項（テストできなかった部分）
- 残る懸念事項
- 次に行う作業（ある場合）
```

### ■ 【補足・特別な指示】
```
その他、重要な指示や注意点。

- この作業に関して質問があれば、[方法] で報告してください
- 問題が発生した場合は、[対応] をしてください
- 思いもよらない課題を見つけた場合は、Issue を作成して報告してください
```

---

## 具体例

### 例 1: 新機能実装

```markdown
## 【プロジェクト名】
User Authentication System - Email Verification

## 【背景・文脈】
- ユーザーが不正な email で登録されるのを防ぐ必要がある
- 既に User model と Registration form が実装されている
- 参考: GitHub Issue #42, Obsidian: Projects/Auth_System_Design.md

## 【目的】
ユーザー登録時に email を検証し、確認メールを送信する機能を実装する。

## 【完了条件】
- [ ] Email verification endpoint が実装される
- [ ] メール送信ロジックが実装される
- [ ] Registration form に "Verify email" ステップが追加される
- [ ] Unit test で email validation が確認される
- [ ] Integration test で end-to-end フロー（登録→メール送信→確認）がテストされる
- [ ] TypeScript エラー 0
- [ ] Obsidian に実装記録を作成

## 【実装範囲】
- 実装：server/routes/verify-email.ts
- 実装：shared/types/auth.ts（型更新）
- 修正：server/services/email-service.ts（呼び出し追加）
- テスト：server/routes/__tests__/verify-email.test.ts

- 実装してはいけない：Registration form の完全なリデザイン

## 【受け入れ基準】
- [ ] Unit test で email format validation をテスト
- [ ] Integration test で メール送信を confirm（mock でOK）
- [ ] TypeScript エラー 0
- [ ] existing tests が全てパス

## 【技術的考慮】
- Email service: 既に実装されている `server/services/email-service.ts` を使用
- Token 生成: 既存の `lib/token.ts` の `generateVerificationToken()` を使用
- データベース: user テーブルに `email_verified_at` カラムが存在する

## 【検証方法】
- Unit test: npm run test -- verify-email.test.ts
- Manual: Postman で /api/verify-email endpoint をテスト
- Obsidian: 実装記録と新しい判断を記録
```

### 例 2: バグ修正

```markdown
## 【プロジェクト名】
Prediction Engine - RecipeDetail Type Error Fix

## 【背景】
Recipe detail ページで TypeScript エラー（TS2339）が発生している。
RecipeDetail.tsx で recipe.difficulty にアクセスしているが、型定義に difficulty がない。

参考: GitHub Issue #85, Obsidian: Technical/PEC_ErrorAnalysis.md（同じパターンの失敗分析）

## 【目的】
Recipe 型定義を完全にし、RecipeDetail ページの型エラーを 0 にする。

## 【完了条件】
- [ ] shared/types/recipe.ts に difficulty フィールドが追加される
- [ ] RecipeDetail.tsx の TypeScript エラーが 0 になる
- [ ] 他のコンポーネントの同様のエラーも修正される
- [ ] 新しく追加したフィールドに対応するテストが追加される
```

---

## AI（複数）に依頼する場合

複数の AI が同じプロジェクトで作業する場合：

1. **最初の AI**（例：Claude Code）が Phase 1 を実装
2. **完了時に報告**（このテンプレートの「作業完了後の報告」セクション）
3. **2番目の AI**（例：Codex）が報告を読んで Phase 2 を実装
4. **互いに引き継ぎ情報を残す**

---

## よくある質問

### Q: このテンプレートはいつも全部埋める必要がありますか？

**A**: いいえ。シンプルなタスク（例：ドキュメント修正）では省略可能です。
ただし「背景」「目的」「完了条件」は必須です。

### Q: 作業開始時に条件が不明確な場合は？

**A**: AI は以下を実施してください：
1. 前提を明示する
2. 不明な項目をコメントで質問する
3. 人間の確認を待つ

### Q: 作業途中で完了条件が変わったら？

**A**: Issue/conversation のコメントで「条件が変わった」ことを記録し、
人間と確認してから進めてください。

---

## テンプレート改善

このテンプレートは、実際の運用で改善します。

不十分だった項目や、追加すべき項目があれば Issue を作成してください。
