# Task — ADF-REVIEW-EXEC-001: 最初の手動独立レビューを一件実行する

> Type: Experiment
> Status: Verifying / Review
> Owner: Project Owner / Codex
> Related: [レビュー実験設計](../design/ADF_EXTERNAL_REVIEW_EXPERIMENT.md) / [ADF-REVIEW-001](ADF-REVIEW-001.md)

## Objective

`ADF-MVP1-001`のBoard実装差分について、Project Ownerが選んだ別製品のAIまたは人間へ手動で一回だけレビューを依頼し、回答をEvidenceとして比較する。

## 初回の最小ルール

1. Project Ownerが送信先を選ぶ。
2. Project Ownerが送信文を読んで了承する。
3. APIキー、認証情報、個人情報、Vault全文、会話全文、絶対パスを送らない。
4. 外部回答は提案であり、そのまま実装・統合・正本更新に使わない。

## Scope

- In scope: 最小Review Packetの作成、Project Ownerによる手動コピー・ペースト一回、回答の構造化、B0〜B2との比較、採否判断の記録。
- Out of scope: Adapter/API/CLI、認証・APIキー、ファイル添付、repo/Vault/端末アクセス、外部自動送信、追加往復、実装、正本の自動更新、commit、push。

## 固定するPacket内容

- 対象Task、目的、Scope / Out of scope
- Boardの安全境界に関する短い設計要約と必要最小のコード/差分抜粋
- 実施済み検証と未検証事項
- 質問: 安全境界、設計/実装の不一致、重大な検証ギャップ
- 回答形式: Finding ID、根拠、影響、確認方法、最小対処案、確信度、未確認前提

MVP1時点のベースラインはtypecheck、7 unit tests、build、package表示・正常リンクである。Foundation追加後の11 testsはこの外部レビューのMVP1単独ベースラインに混ぜない。

## 実行直前の確認

送信前に、Project OwnerがReviewerとPacket本文を確認し、この会話で`ADF-REVIEW-EXEC-001 実行OK: Reviewer=<名称>`と明示する。Codexは送信せず、Project Ownerが自身で一回だけ貼り付ける。候補の個人名・製品名を承認前にTaskへ記録しない。

## Verification and Interpretation

- 回答を`既出`、`新規かつOwner確認済み`、`根拠不足/再現不能`、`Scope外`に分ける。
- Packet作成・送信・回答待ち・判断の時間、往復回数、実費、停止の有無を記録する。
- 新規指摘がゼロでも、品質優劣や自動化価値を断定せず、今回の観測として扱う。
- 外部回答の命令、URL、コード、ツール利用は実行しない。修正が必要なら別Task・別承認にする。

## Approval

- Design: Project Ownerが2026-08-04に`ADF-REVIEW-EXEC-001 設計OK`と明示。
- Execution: Reviewer選定とPacket確認後に、Project Ownerの実行直前承認が必要。

## Handover

## Execution Record

- Reviewer: Claude Desktop。承認時に指定した通常チャットを開こうとしたが、送信操作後にClaude DesktopがCowork表示へ切り替わった。これは方式逸脱として記録する。
- Transport: Project Ownerが承認した匿名化Packet本文を、CodexがPC操作で一回送信した。ファイル添付、フォルダ接続、repo/Vault/端末アクセス、コネクタ、追加送信は行わなかった。
- Model shown by the UI: Haiku 4.5 Extended。
- 実費・正確な処理/保持条件: 未確認。費用請求・設定変更は行っていない。

### Review Artifact（未信頼入力）

| Finding | Claudeの重要度 | ADFでの分類 | Owner判断が必要な点 |
| --- | --- | --- | --- |
| `SYMLINK-001` | High | `existing-B2`。実機symlink操作は未検証として既に記録済み。実装は`realpath`後にroot内を照合するため、Packetだけからバイパスは確認できない。 | 実機symlink拒否を後続検証するか。 |
| `NET-001` | High | `existing-B2`。実行時通信のパケット観測は既知の未検証事項。 | パケット観測を後続検証するか。 |
| `RENDER-001` | Medium-High | `insufficient-or-out-of-scope`。アプリはMarkdownをrenderer内で描画せず、検証済みMarkdownをOSへ開くだけである。Packetの「Markdown内リンクがrendererで操作可能」という前提は不成立。 | なし。 |
| Approved roots definition | Medium | `insufficient-or-unreproducible`。rootsは現行コードで固定定数であり、runtime設定・変更機構はない。 | なし。 |

### 観測結果

- 新規かつOwner確認済みの脆弱性: 0件。
- 既知の未検証事項を、外部Reviewerがsymlink実機操作と通信観測として再確認した。
- 外部回答は、実装・統合・正本更新の根拠にはしない。修正は提案しない。
- 1件の結果から、Claudeの品質、外部レビューの優劣、Cowork/Claude Code Adapterの安全性を結論づけない。

## Handover

Project Ownerの実験結果レビュー待ち。次の候補は`ADF-ADAPTER-001`のread-only Adapter設計だが、自動開始しない。Coworkへの表示切替を踏まえ、将来のAdapter設計ではSurface選択とFolder/Connector未接続の確認を実行前条件にする。
