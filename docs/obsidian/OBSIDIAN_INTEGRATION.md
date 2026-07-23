# Obsidian 連携ガイド

このドキュメントは、GitHub リポジトリ（コード・設計・決定）と Obsidian Vault（知識・教訓・分析）の連携方法を定めます。

---

## 目的

コードを書くだけではなく、**知識を蓄積する** ための仕組みです。

- 過去のプロジェクトから学ぶ
- 失敗パターンを認識して避ける
- 設計判断の背景を理解する
- 将来のプロジェクトの参考にする

---

## 基本原則

1. **コード = 現在の実装**
2. **Obsidian = 知識・教訓・判断の記録**

両方が揃って、初めて「完全な開発」です。

---

## 対応ファイルマップ

### GitHub → Obsidian

| GitHub の対象 | Obsidian の記録先 | 記録内容 |
|--------------|-----------------|--------|
| `docs/architecture/` | `Projects/[Project]_Architecture.md` | 設計方針、技術判断 |
| `docs/decisions/` | `Projects/[Project]_Decisions.md` | 決定内容、理由、影響 |
| コード実装 | `Technical/[Topic]_Implementation.md` | 実装パターン、ハマった点 |
| バグ修正 | `Technical/[Topic]_BugFix.md` | 問題原因、解決策、教訓 |
| テスト | `Technical/[Topic]_TestLessons.md` | テスト設計、教訓 |
| リファクタリング | `Technical/[Topic]_Refactoring.md` | 改善内容、効果、判断 |

---

## 実装フェーズごとの記録方法

### フェーズ 1: 計画・設計

**実施者**: Lead AI Engineer（Claude Code）

**GitHub**: `docs/project/PROJECT.md`, `docs/architecture/...`

**Obsidian 記録**:

```
Projects/[Project_Name]-Design.md
├── プロジェクト概要
├── 設計方針
├── 技術スタック
├── 既知のリスク
└── 参考資料（関連Obsidianファイル）
```

**記録時期**: 設計完了時、人間の確認後

---

### フェーズ 2: 実装

**実施者**: AI（Claude Code）

**GitHub**: コード、`docs/decisions/...`

**Obsidian 記録**（各実装単位で）:

```
Technical/[Feature_Name]-Implementation.md
├── 実装背景
├── 採用した技術
├── コード例（または GitHub リンク）
├── 意思決定（なぜこうしたのか）
├── ハマった点・解決策
├── テスト方法
└── 参考資料
```

**記録時期**: Issue クローズ前

---

### フェーズ 3: 検証・テスト

**実施者**: AI + 人間（Codex）

**GitHub**: テストコード、`docs/decisions/`（必要に応じて）

**Obsidian 記録**:

```
Technical/[Feature_Name]-TestAnalysis.md
├── テスト設計
├── 実施結果
├── 見つかったバグ
├── テストカバレッジ
└── 改善案
```

**記録時期**: テスト完了時

---

### フェーズ 4: 失敗分析・教訓

**実施者**: AI（Claude Code）

**GitHub**: `docs/decisions/` に記録

**Obsidian 記録**（重要な失敗のみ）:

```
Technical/[Topic]-FailureAnalysis.md
├── 失敗内容
├── 根本原因
├── 対応方法
├── 次回の予防策
└── 関連プロジェクト
```

**記録時期**: 失敗発生直後、原因特定後

---

## 記録テンプレート

### 実装記録テンプレート

```markdown
# [機能名] 実装記録

## 背景
この機能を実装することになった理由

## 設計方針
どのように実装したか、なぜこの方針にしたか

## 実装内容
- ファイル: [パス]
- コードの概要（全文ではなく、キーになる部分のみ）
- GitHub リンク: [コミット or PR]

## 技術判断
```
なぜこの技術を選んだか（複数の選択肢があった場合）
- 選択肢1: 理由
- 選択肢2: 理由
→ 採用：理由
```

## ハマった点・解決策

### Issue: [問題名]
- **現象**: [何が起きたか]
- **原因**: [なぜそうなったか]
- **解決策**: [どう対応したか]
- **学習**: [今後の注意点]

## テスト
- テスト方法: [どうテストしたか]
- 結果: [成功/失敗]
- カバレッジ: [どこまでテストしたか]

## 参考資料
- 関連 GitHub Issue: #123
- 決定記録: docs/decisions/ADR-001
- 関連 Obsidian: Technical/...

## 次のステップ
- [ ] 次に実装すべきこと
- [ ] ドキュメント更新
- [ ] 他の AI への引き継ぎ内容
```

### 失敗分析テンプレート

```markdown
# [トピック] 失敗分析

## 失敗内容
具体的に何が失敗したか

## なぜ失敗したのか
### 根本原因
最初の問題

### 連鎖する原因
1. 原因1
2. 原因2
3. 原因3

## 対応方法
実施した解決策と効果

## 次回の予防策
### 短期（このプロジェクト内）
- [ ] 対策1
- [ ] 対策2

### 中期（他のプロジェクトでも適用）
- [ ] ポリシー更新
- [ ] テンプレート改善

### 長期（フレームワーク改善）
- [ ] ガイドライン改善
- [ ] ルール更新

## 関連プロジェクト
この失敗は、以下でも発生する可能性がある：
- [プロジェクト1]
- [プロジェクト2]

## 参考資料
- GitHub Issue: #123
- 実装記録: Technical/...
- 関連決定: docs/decisions/ADR-001
```

---

## タイミング・責任

### 記録すべき内容

| 場面 | 記録者 | 時期 | 内容 |
|-----|-------|------|------|
| 実装完了 | AI | PR マージ前 | 実装記録 |
| バグ発見 | AI | 修正実装時 | 失敗分析 |
| テスト完了 | AI | テスト終了時 | テスト分析 |
| 重要な判断 | AI | 決定時 | 判断の背景 |
| フレームワーク改善 | Lead AI | 改善実装時 | ルール変更理由 |

### 記録しなくてよい内容

- 日々の進捗（GitHub Issues で十分）
- 実装中の試行錯誤（成功した方法のみ記録）
- 明白なバグ修正（原因が簡明で教訓がない場合）
- 型チェックエラー（パターン化されている場合のみ）

---

## 日々の運用

### 実装開始時

1. **Obsidian で関連ファイルを確認**
   - `_INDEX.md` で過去プロジェクトを確認
   - `Projects/` から類似プロジェクトの記録を読む
   - `Technical/` から技術的な失敗パターンを確認

2. **学べることを記録**
   - この Issue の計画に「参考にした Obsidian ファイル」をコメント記載
   - GitHub で参照を残す

### 実装完了時

1. **Obsidian 記録を作成**
   - テンプレートに従って記録
   - Obsidian の `Technical/` フォルダに保存

2. **GitHub PR から Obsidian への リンク**
   - PR の本文に「Obsidian 記録: ...」とコメント記載
   - 両者が双方向で参照可能に

3. **次の AI への引き継ぎ**
   - Issue のコメントに Obsidian ファイルへのリンク記載
   - 「次のステップ」セクションに記録

### 定期的な見直し

**月 1 回**（または Phase 完了時）

1. その月の Obsidian 記録を確認
2. 重複や矛盾がないか確認
3. 「フレームワーク改善」が必要な場合は Issue 作成
4. `docs/decisions/` に記録された判断をレビュー

---

## GitHub と Obsidian の相互参照

### GitHub → Obsidian

PR/Issue に以下のように記載：

```markdown
## 参考資料

**Obsidian**
- 設計参考: ~/Desktop/second Brain/obsidian/Projects/PEC_WorkReport.md
- 技術参考: ~/Desktop/second Brain/obsidian/Technical/PEC_ErrorAnalysis.md
- 失敗から学ぶ: ~/Desktop/second Brain/obsidian/Projects/AnimeAcademy_FailureAnalysis.md
```

### Obsidian → GitHub

Obsidian の記録に以下を記載：

```
**実装**: GitHub PR #123
**コード**: https://github.com/[org]/[repo]/blob/main/[file].ts
**決定記録**: docs/decisions/ADR-001.md
```

---

## Obsidian のディレクトリ構成

推奨される Obsidian vault の構成（参考）：

```
obsidian/
├── _INDEX.md                          # マスターインデックス
├── Projects/                          # プロジェクト報告書・分析
│   ├── [Project]_WorkReport.md
│   ├── [Project]_Architecture.md
│   ├── [Project]_Decisions.md
│   └── [Project]_FailureAnalysis.md
├── Technical/                         # 技術記録
│   ├── [Feature]_Implementation.md
│   ├── [Feature]_FailureAnalysis.md
│   └── [Topic]_Lessons.md
├── References/                        # 参考資料
│   ├── Grok_Conversations/
│   └── Gemini_NotebookLM/
└── Daily/                             # デイリーノート
```

---

## FAQ

### Q: GitHub と Obsidian、どっちに記録すべき？

**A**: 基本ルール：
- **GitHub**: プロジェクト・実装・決定の「公式記録」
- **Obsidian**: 知識・教訓・分析の「個人/チーム知識」

両方に記録することもあります。例：
```
GitHub: docs/decisions/ADR-001.md
Obsidian: Projects/[Project]_Decisions.md（詳細分析）
```

### Q: Obsidian 記録を GitHub PR に含めるべき？

**A**: いいえ。Obsidian は GitHub リポジトリ外です。

代わりに：
- GitHub PR に「Obsidian 記録: [ファイル名]」とコメント記載
- Issue のコメントで Obsidian ファイルへの相互参照を作成

### Q: 失敗した実装の Obsidian 記録は削除すべき？

**A**: いいえ。失敗こそが最大の学習です。削除せず、以下を記録：
- 失敗内容
- 原因分析
- 対応方法
- 今後の予防策

### Q: 同じ失敗が繰り返されるときは？

**A**: 以下を実施：
1. Obsidian に「何度も発生している」ことを記録
2. `docs/decisions/` に「予防策の実装」を記録
3. ガイドライン or テンプレートを更新
4. Issue で複数 AI に通知

---

## 更新方針

このドキュメントは以下のときに更新します。

- Obsidian 記録が GitHub と矛盾した
- 記録の方法が明確でないため迷った
- 新しい種類の記録が必要になった（例：「セキュリティ関連の教訓」）

改善案があれば、Issue を作成し、改善して更新します。
