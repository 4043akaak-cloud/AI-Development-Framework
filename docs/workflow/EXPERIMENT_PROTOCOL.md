# ADF 実験プロトコル

## 目的

ADFの運用を小さく検証し、問題、ボトルネック、改善点を証拠付きで発見する。実験結果を、AIの自律性や独立レビューの証明として過大評価しない。

## 段階

| 段階 | 構成 | 許可すること | 禁止すること |
| --- | --- | --- | --- |
| Phase 0 | Codex + Project Owner | Task、Plan、承認、可逆な小変更、検証、人間レビュー | 他AI、自動化、外部API、自動push |
| Phase 0.5 | Codex + Codex subagents | 役割分離した読み取り、Plan、批判、観測 | 独立AIレビュー表記、実装、外部操作 |
| Phase 1 | 外部AI 1つ + Project Owner | 別製品のレビュー、手動引継ぎ、比較 | 自動委任、自動push、費用・秘密情報の無承認利用 |
| Later | 承認済みの自動化 | 読み取り専用補助、モデル選定の評価 | 無承認の外部送信・公開・不可逆操作 |

## Phase 0.5 の役割

| 役割 | 入力 | 出力 | 権限 |
| --- | --- | --- | --- |
| Coordinator | 固定Taskと規約 | 結果の比較 | 書込み・最終判断をしない |
| Planner | TaskとRequired Context | Plan | 読み取りのみ |
| Critic | TaskとRequired Context | 根拠付きの問題・最小修正 | 読み取りのみ |
| Observer | TaskとRequired Context | 評価項目・ボトルネック | 読み取りのみ |
| Project Owner | 全結果 | 採否・次段階の判断 | 承認とレビュー |

同一Codex内の役割分離は、会話と役割を分けるための実験であり、モデル独立性を保証しない。

## 必須記録

各実験では、次をGitHubへ残す。

- 実験ID、Task、開始・終了、役割、許可操作、実施操作
- Required Context、採用制約、Context不足
- Consensus、Disagreement、Assumptions、Required human decision
- 手戻り回数と原因、非承認Blockerと解消時間
- 受入条件ごとの確認根拠、未実施、残存リスク

長い背景・学び・調査は、TaskにリンクしたObsidianノートへ残す。

## 停止条件

Required Context不足、Scope変更、秘密情報、外部サービス、費用、不可逆操作、評価不能な完了条件が必要になったら、`Blocked`または`Waiting Approval`で停止する。

## 進行条件

- Phase 0からPhase 0.5: Project Ownerが読み取り専用プローブを明示承認する。
- Phase 0.5からPhase 1: Phase 0の3件が完走し、役割分離プローブの改善点が記録されている。
- Phase 1から自動化: 役割分離、外部AIレビュー、ログ、コスト・データ方針が別Taskで承認されている。
