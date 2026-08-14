# ADF MVP — 基盤検証から司令塔へ

## MVP 0 — 運用基盤の検証（現在）

CodexとProject Ownerだけで、1件の小Taskを、指定Obsidian文脈・Plan・人間承認・承認済み変更・検証・人間レビュー・記録更新まで追跡可能に完走する。

## MVPの範囲

- `AGENTS.md`、Task、AI Task Packetを共通入口として使う。
- 最初は文書Taskまたは可逆な小変更を対象にする。
- CodexはPlanと実装、Project Ownerは承認とレビューを担当する。
- Task単位でGitHubとObsidianの参照先・判断を残す。

## Product MVP 1 — 手動・読み取り専用司令塔

基盤検証の後に作る最初のアプリは、GitHub・Obsidianを正本のまま保つローカルの可視化画面である。

- プロジェクト、Task、承認待ち、リスク、担当ロールをカードとして見渡せる。
- 1枚のCardからGitHub TaskとRequired Obsidian Contextを開ける。
- `観測 → Context → Plan → Approval → Implementation → Verification → Review → 学び → 次Task`の現在地を表示する。
- 書き込み・同期・自動実行を行わず、まず人間が手動で確認・判断できる。
- 将来のJobやArtifactを表示できる余地は設計上残すが、Agent Registry、Execution Ledger、Adapter接続は実装しない。

## Current ADF MVP Goal: Local AI Debate Room

ADFの現在のMVPゴールは、このPC内に、管理対象プロジェクトの完遂に向けてAI同士が議論し、結果をOwnerへ返す場所を作ることである。

### MVPの成立条件

- Project Ownerが依頼をTaskとして承認できる
- 承認済みTaskからローカルJobを登録し、状態を追跡できる
- Proposal役とCritic役など、複数の役割を持つAdapterが一つのTaskについて議論できる
- 各発言・Result・Evidenceを構造化してローカルLedgerへ記録できる
- 議論の結果をOwnerレビュー待ちとしてADF Boardへ反映できる
- Ownerのレビュー後に、完了または次のTaskへ進めることができる
- GitHub／Obsidianなどの正本を、承認なしに自動変更しない

### MVPの2つの境界

1. 実行場所はこのPC内のローカル環境に限定する。
2. ADFはプロジェクトの進捗管理とAI間の受け渡しに限定し、プロジェクト固有の分析やAIそのものの推論は担当しない。

現在の議論はFake Adapterで成立させる。実AI Adapter、Claude API/CLI、外部送信、課金、クラウド運用、外部正本の自動変更は、ローカルMVPの成立後に別Task・別承認で扱う。

## 将来の管制境界

Product MVP 1は、[複数AI管制エンジン設計](../design/ADF_MULTI_AI_CONTROL_PLANE.md)のControl Planeのうち、人間がTask・承認待ち・Evidenceへのリンクを見る最小部分だけを扱う。Work Plane、外部送信、Adapter、Local Ledger、隔離書込み、統合の自動実行は後続の別Task・別承認で扱う。

## 現時点の対象外

- 実AIによる複数AIの自動会話、Adapter接続、独立AIレビュー、OpenRouter（Fake AdapterによるMVP検証は対象）。
- APIキー、外部API、費用が発生する自動化。
- 自動commit、push、merge、公開、SNS投稿。
- 複数プロジェクトの同時実装。

## 受入条件

- [x] 小Taskを3件、`docs/workflow/CODEX_SOLO_PILOT.md`どおりに完走する。
- [x] `ADF-PILOT-002`〜`004`にRequired Context、Plan、Approval、Verification、Project Owner Review、次の一手が残る。開始・終了時刻と承認待ち時間は未記録のため、`ADF-RETRO-001`で未検証として扱う。
- [x] パイロット後に、改善点と次段階へ進むかの判断を`ADF-RETRO-001`へ記録し、Project Ownerが差分・検証をレビューした。
- [x] Product MVP 1の画面から、表示Taskの正本と必要文脈へ移動できる。`ADF-MVP1-001`でpackage済みアプリ、Card選択、許可済みTask Markdownを確認し、Project Ownerレビューを完了した。Dock起動、Broken/Stale、3代表ケースの60秒探索は後続検証とする。
- [x] Product MVP 1で、ボード表示が正本を更新・上書きしない。編集・同期・API・DBを実装せず、固定手動Snapshotとallow-listリンクだけを使う設計をProject Ownerがレビューした。
