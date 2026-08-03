# ADF MVP — Codex単独パイロット

## 提供する最小価値

CodexとProject Ownerだけで、1件の小Taskを、指定Obsidian文脈・Plan・人間承認・承認済み変更・検証・人間レビュー・記録更新まで追跡可能に完走する。

## MVPの範囲

- `AGENTS.md`、Task、AI Task Packetを共通入口として使う。
- 最初は文書Taskまたは可逆な小変更を対象にする。
- CodexはPlanと実装、Project Ownerは承認とレビューを担当する。
- Task単位でGitHubとObsidianの参照先・判断を残す。

## 対象外

- 複数AIの自動会話、独立AIレビュー、OpenRouter。
- APIキー、外部API、費用が発生する自動化。
- 自動commit、push、merge、公開、SNS投稿。
- 複数プロジェクトの同時実装。

## 受入条件

- [ ] 小Taskを3件、`docs/workflow/CODEX_SOLO_PILOT.md`どおりに完走する。
- [ ] 各TaskにRequired Context、Plan、Approval、Verification、Human Review、次の一手が残る。
- [ ] パイロット後に、改善点と次段階へ進むかの判断を記録する。
