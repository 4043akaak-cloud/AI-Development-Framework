# Task — ADF-PROBE-001: 役割分離Codexプローブ

> Type: Research / Review
> Status: Waiting Approval
> Owner: Coordinating Codex
> Review: Project Owner
> Related: [Roadmap](../project/ROADMAP.md) / [Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)

## Objective

CodexサブエージェントをPlanner、Critic、Observerとして分離し、Current StateとTaskだけから、Context不足、承認境界、状態遷移、評価不能な成功条件を検出できるかを読み取り専用で測る。

これは「役割分離Codexレビュー」のプローブである。独立AIレビュー、実装Task、Phase 1の達成を主張しない。

## Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
- [Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)
- [Current State](../project/CURRENT_STATE.md)
- [ADF-PILOT-001](ADF-PILOT-001.md)

### Obsidian

- Vault ID / root: `secondbrain`
- `Projects/AI-Development-Framework/00_MOC.md` — GitHubとObsidianの役割分担
- `Projects/AI-Development-Framework/02_Codex単独パイロット_2026-07-30.md` — 現在のパイロット範囲

## Scope

- In scope: 読み取り、Plan、批判、観測、結果比較、実験記録の下書き。
- Out of scope: 実ファイル変更、Task状態変更、commit、push、外部API、他AI製品、秘密情報。

## Completion Criteria

- [ ] 各役割がTaskと規約の根拠を示して出力する。
- [ ] Consensus、Disagreement、Assumptions、Required human decisionを分離する。
- [ ] Context、Scope、Approval、Measurementの不足を記録する。
- [ ] Project Ownerが、改善を採用するかを判断できる。

## Approval

- Approval required?: No（読み取り専用の実験）。
- 文書を更新して結果を永続記録する場合: Project Ownerの明示承認が必要。

## Result

- [Experiment Record — 2026-07-31](ADF-PROBE-001-RESULT-2026-07-31.md)
- 現在必要なProject Ownerの判断: 改善を受け入れ、`ADF-PILOT-001`のPreflightを完了扱いにするか、追加修正を求めるか。
