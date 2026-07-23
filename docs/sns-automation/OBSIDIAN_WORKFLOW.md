# SNS投稿自動化システム - Obsidian ワークフロー

**対象**: X（Twitter）・Instagram への投稿自動化  
**現状**: Phase 0（ドラフト自動生成） - 手間 60-70% 削減  
**目標**: 月数回の投稿を効率化

---

## 全体フロー

```
【ユーザーの作業】
Step 1: 投稿スケジュール作成（月次）
└─ Obsidian に投稿情報を記録

【私（Claude Code）の作業】
Step 2: ドラフト自動生成
└─ X用 + Instagram用のテキストを自動生成
└─ Obsidian に Drafts フォルダに保存

【ユーザーの最終作業】
Step 3: ドラフトをコピペして投稿
└─ 2-3分/投稿（X + Instagram）

【結果】
手間: 60-70% 削減
投稿手間: 2-3分 / 投稿
```

---

## Obsidian フォルダ構造

```
Obsidian Vault/
├── Projects/
│   ├── SNSAutomationSystem.md（概要・リンク集）
│   └── SNSSchedule_[YEAR].md（月間投稿スケジュール）
│
├── SNS/（新規フォルダ）
│   ├── Assets/
│   │   ├── 制作物1/
│   │   │   ├── 説明.md（背景・ポイント）
│   │   │   ├── 画像.png
│   │   │   └── thumbnail.png
│   │   ├── 制作物2/
│   │   └── ...（6-10個）
│   │
│   ├── Drafts/
│   │   ├── X_Draft_2026-08-05.md（自動生成）
│   │   ├── Instagram_Draft_2026-08-05.md（自動生成）
│   │   └── ...（毎週生成）
│   │
│   └── Schedule/
│       └── 2026-08-Calendar.md（投稿カレンダー）
│
└── Reference/
    └── SNS_Templates.md（テンプレート定義）
```

---

## Step 1: 投稿スケジュール作成（ユーザー）

### ファイル作成

**名前**: `Projects/SNSSchedule_[YEAR].md`

**例**: `Projects/SNSSchedule_2026.md`

### テンプレート

```markdown
# SNSSchedule_2026

## 投稿1（予定日: 2026-08-05）

### 制作物
[制作物1](../SNS/Assets/制作物1/説明.md)

### 背景・説明
[50-100文字で、どうやって作ったか、何が良いか]

### ポイント（3-5個）
- [視点1]
- [視点2]
- [視点3]

### ビジュアル
![alt](../SNS/Assets/制作物1/画像.png)

### 投稿予定時刻
火曜日 10:00 AM

### X用ハッシュタグ（3-5個）
#[tag1] #[tag2] #[tag3]

### Instagram用ハッシュタグ（10-20個）
#[tag1] #[tag2] ... #[tag20]

### 補足
[特別な指示があれば]

---

## 投稿2（予定日: 2026-08-12）

[同様の構成]

---

## 投稿3（予定日: 2026-08-19）

[同様の構成]
```

### 記入例

```markdown
# SNSSchedule_2026

## 投稿1（予定日: 2026-08-05）

### 制作物
[Prediction Engine - Type Inference System](../SNS/Assets/prediction-engine-types/説明.md)

### 背景・説明
TypeScript の型推論を完全にサポートする Prediction Engine Core のコンポーネント。
複雑な型定義を自動解析し、開発体験を大幅に向上。

### ポイント
- 型チェックエラーを 40% 削減
- 開発速度を 3倍に高速化
- TypeScript 5.0+ に対応

### ビジュアル
![Prediction Engine Type System](../SNS/Assets/prediction-engine-types/demo.png)

### 投稿予定時刻
火曜日 10:00 AM

### X用ハッシュタグ
#TypeScript #AI #開発効率化

### Instagram用ハッシュタグ
#TypeScript #開発 #AI #機械学習 #エンジニア #プログラミング #テック #フルスタック #ロードマップ #新機能

### 補足
X では技術詳細をアピール。Instagram ではビジュアルとストーリー性を重視。
```

---

## Step 2: ドラフト自動生成（Claude Code）

### 自動生成の流れ

毎週 Monday 朝に以下を自動実行：

```
1. SNSSchedule_[YEAR].md を読み込み
2. 今週の投稿予定をチェック
3. X用テキストを生成 → SNS/Drafts/X_Draft_[DATE].md に保存
4. Instagram用テキストを生成 → SNS/Drafts/Instagram_Draft_[DATE].md に保存
5. Obsidian に保存完了
```

### 生成されるドラフト例

#### X用ドラフト

```markdown
# X Draft - 2026-08-05

📢 TypeScript の型推論を完全サポート 🚀

Prediction Engine Core に新しいコンポーネントが登場。
複雑な型定義を自動解析し、型チェックエラーを 40% 削減。
開発速度を 3倍に高速化します。

詳細: [AI Development Framework]

#TypeScript #AI #開発効率化

---

**投稿予定**: 2026-08-05 10:00 AM  
**画像**: ../SNS/Assets/prediction-engine-types/demo.png
```

#### Instagram用ドラフト

```markdown
# Instagram Draft - 2026-08-05

✨ 開発体験が変わる 🔧

TypeScript の型推論を完全サポート。
複雑な型定義も、Prediction Engine Core が自動解析します。

🎯 型チェックエラー 40% 削減
⚡ 開発速度 3倍高速化
🔗 詳細: [AI Development Framework]

#TypeScript #開発 #AI #機械学習 #エンジニア #プログラミング #テック #フルスタック #ロードマップ #新機能 #開発効率化 #自動化

---

**投稿予定**: 2026-08-05 10:00 AM  
**画像**: ../SNS/Assets/prediction-engine-types/demo.png
```

---

## Step 3: ドラフトをコピペして投稿（ユーザー）

### 投稿手順

```
【X（Twitter）での投稿】
1. Obsidian で SNS/Drafts/X_Draft_2026-08-05.md を開く
2. テキスト全体をコピー
3. twitter.com にアクセス
4. 「ポスト」をクリック
5. テキストをペースト
6. 画像を添付
7. 「ポスト」をクリック

【Instagram での投稿】
1. Obsidian で SNS/Drafts/Instagram_Draft_2026-08-05.md を開く
2. テキスト全体をコピー
3. Instagram にアクセス
4. 「投稿を作成」をクリック
5. 画像を選択
6. キャプションにテキストをペースト
7. 「シェア」をクリック

【総時間】
2-3分 / 投稿
```

---

## 既存制作物の集約プロセス

### Phase 0 スタート時（今）

現在、6-10個の制作物が複数の場所に散らばっています。

**Step 1: Obsidian に集約**

```
複数の場所にある制作物
  ├─ クラウドストレージ
  ├─ GitHub リポジトリ
  ├─ ローカルフォルダ
  └─ 他のツール

↓ （集約）

Obsidian: SNS/Assets/ に統一
  ├─ 制作物1/
  │  ├─ 説明.md
  │  ├─ 画像.png
  │  └─ thumbnail.png
  ├─ 制作物2/
  └─ ...
```

**Step 2: 投稿スケジュール化**

6-10個を「いつ投稿するか」を決めて、`SNSSchedule_[YEAR].md` に記録。

**Step 3: ドラフト自動生成テスト**

「投稿1」のドラフトを生成して、テストします。

---

## 管理方法

### 投稿後の処理

投稿完了後、Obsidian にログを記録：

```markdown
# SNSSchedule_2026

## 投稿1（予定日: 2026-08-05）

### ステータス
✅ **投稿完了**
- X: 2026-08-05 10:05 AM
- Instagram: 2026-08-05 10:08 AM
- いいね数: [後日更新]

### 反応
[X での反応・質問への回答記録]

### 学習
- [X で響いたポイント]
- [次回へのフィードバック]
```

---

## テンプレート定義

### Reference/SNS_Templates.md の内容

```markdown
# SNS投稿テンプレート

## X（Twitter）用テキストの書き方

### パターン A: 技術紹介

【構成】
📢 [タイトル]
[詳細説明（50-100文字）]
[メリット 3-5個を箇条書き]
詳細: [リンク]
#[tag1] #[tag2] #[tag3]

### パターン B: 発表・イベント

【構成】
🎉 [イベント名] が始まります
[詳細（いつ、どこで、何が起きるか）]
#[tag1] #[tag2]

## Instagram用テキストの書き方

### パターン A: ビジュアル + ストーリー

【構成】
✨ [タイトル（ビジュアル重視）]
[ストーリー性のある説明]
[メリットをハイライト]
🔗 [リンク]
#[tag1] #[tag2] ... #[tag20]

### ハッシュタグ設計

**X**: 3-5個（絞って、高精度に）
**Instagram**: 10-20個（広く、リーチを最大化）
```

---

## チェックリスト

### 初期セットアップ

- [ ] `SNS/Assets/` フォルダを作成
- [ ] 既存制作物 6-10個を集約
- [ ] 各制作物フォルダに説明.md と画像を配置
- [ ] `SNSSchedule_2026.md` を作成
- [ ] 投稿1-3の情報を入力
- [ ] `Reference/SNS_Templates.md` を作成

### 毎月

- [ ] `SNSSchedule_[YEAR].md` を更新（来月分）
- [ ] 各投稿の背景・説明・ポイント・ハッシュタグを記入

### 毎週（Claude Code が実行）

- [ ] ドラフト自動生成
- [ ] Obsidian に Drafts フォルダに保存

### 毎週（ユーザーが実行）

- [ ] ドラフトをコピペして投稿
- [ ] 投稿ログを Obsidian に記録
- [ ] 反応・学習をメモ

---

## FAQ

### Q: 画像をどこに置けば良い？
**A**: `SNS/Assets/制作物X/` フォルダに置いて、相対パス（`../SNS/Assets/制作物X/画像.png`）で参照。

### Q: 複数の画像がある場合？
**A**: `demo.png`, `thumbnail.png` など、複数ファイルを置いて、Obsidian のドラフトで最適な画像を指定。

### Q: 投稿スケジュールを変更したい場合？
**A**: `SNSSchedule_[YEAR].md` を直接編集。次回のドラフト自動生成で反映。

### Q: 手間を減らしたい場合？
**A**: Phase 1（完全自動投稿）へ移行。X API + Instagram API と連携して、自動投稿を実現。

---

## 参照

- **Memory**: `sns_automation_design.md`
- **GitHub Docs**: `docs/sns-automation/TEMPLATES.md`
- **Obsidian**: `Projects/SNSAutomationSystem.md`

---

**Last Updated**: 2026-07-24  
**Status**: Phase 0 Ready for Implementation
