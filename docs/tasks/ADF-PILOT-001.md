# Task — ADF-PILOT-001: 最初のCodex単独Planを作る

> Type: Docs
> Status: Done (Preflight; countable pilot taskではない)
> Owner: Codex
> Review: Project Owner（Codex単独パイロットのため独立AIレビューは行わない）
> Related: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md)

このTaskは[Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)に従う。`Approved`になるまで、ファイル変更、commit、pushは行わない。

## Objective

AI Task Packetを使い、CodexがRequired Obsidian Contextを確認して、文書のみの小Taskに対するPlanと停止条件を提出できることを検証する。

## Required Context

### GitHub

- [AI Task Packet](../../templates/AI_TASK_PACKET.md)
- [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
- [Current State](../project/CURRENT_STATE.md)

### Obsidian

- Vault ID / root: `secondbrain` / `/Users/kawakamiatsushishi/Desktop/secondbrain`
- `Projects/AI-Development-Framework/00_MOC.md` — GitHubとObsidianの役割分担。GitHubをTask・検証の正本、Obsidianを背景・判断理由の知識基盤として使う。
- `Projects/AI-Development-Framework/02_Codex単独パイロット_2026-07-30.md` — CodexとProject Ownerだけで始め、外部AI、OpenRouter、外部API、自動pushを使わない。

## Context Read Record

- 読んだGitHub Context: `AGENTS.md`、`AI Delegation Charter`、`Task Lifecycle`、`Codex単独パイロット`、`Current State`、`AI Task Packet`、`Codex単独の固定依頼文`、`Worktree Policy`。
- 正本候補: `/Users/kawakamiatsushishi/GitHub/AI-Development-Framework`、`main...origin/main`、HEAD `4d6b481`。
- 既存状態: このworktreeには、本Taskの開始以前から未commit・未追跡のADF文書変更がある。これらを本Taskの成果や、公開済みGitHubの事実として扱わない。
- Context不足時の扱い: 指定ノートまたは正本性を確認できない場合は`Blocked`で停止する。

## Scope

- In scope: Taskを読んだCodexが、Context確認、Plan、影響、検証方法、停止条件を報告する。
- Out of scope: ファイル変更、commit、push、他AIへの委任、外部API。

## Plan

1. 上記のGitHub・Obsidian Contextと、採用した制約を確認する。
2. このPreflightの目的、影響、検証方法、停止条件をTaskに永続記録する。
3. Project Ownerが記録をレビューし、Preflightを完了扱いにするか、次の可逆な文書Taskを`Waiting Approval`へ進めるかを決める。
4. Project Ownerの明示的な承認なしに、実装、commit、push、外部操作、次Taskの自動開始を行わない。

## Impact and Verification

- 影響: プロダクト・コード・外部状態への影響はない。GitHub Task記録の再開可能性だけを検証する。
- 検証: Required Context、採用制約、Plan、影響、停止条件、次の人間判断がこのTaskだけから読めることを確認する。
- Not run: コードテスト、commit、push、外部APIは対象外のため実施しない。
- 停止条件: Scope変更、秘密情報、外部サービス、費用、不可逆操作、正本性の不明確化が発生した場合は`Blocked`または`Waiting Approval`で停止する。

## Completion Criteria

- [x] 参照したGitHub・Obsidian Contextと、採用した制約が明示される。
- [x] Plan、影響、検証方法、停止条件が記録される。
- [x] Project OwnerがPreflightを受け入れ、次のTaskを`Waiting Approval`へ進めた。

## Approval

- Approval required?: No（Plan作成のみ）。
- 現在必要なProject Ownerの判断: 上記Plan記録をPreflightの完了として受け入れるか、または修正を求めるか。
- 次の変更Task: Scope、Plan、対象ファイルを別途明示承認してから開始する。
- 変更・commit・pushを行う場合: 別途明示承認が必要。

## Next Action

Preflightは2026-08-03のProject Owner承認により完了した。次は`ADF-PILOT-002`で、最初に数える可逆な文書TaskをPlan・承認・実装・検証・人間レビューまで進める。

## Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | Project Ownerが「この内容でお願いします。開始して下さい。」と承認。Plan-onlyのPreflightとして受理。 | 2026-08-03 | この会話 |
| Diff / Verification | Not applicable | コード・外部状態・commit・pushは対象外。Task記録の再読で確認。 | 2026-08-03 | このTask |
| 残存リスク | Follow-up required | 正本作業コピーには未commitのADF文書変更がある。次Taskでも無関係な変更を混在させない。 | 2026-08-03 | `git status --short --branch` |

### Completion

- [x] Required Contextと採用制約を記録した。
- [x] Plan、影響、検証方法、停止条件を記録した。
- [x] Project OwnerのPreflight承認を記録した。
- [x] 変更、commit、push、外部操作を行っていない。
