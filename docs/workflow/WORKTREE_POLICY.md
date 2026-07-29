# Local Worktree Policy

## Purpose

同じGitHubリポジトリの複数クローンが存在すると、AIと人間が異なる履歴・異なる未push変更を見てしまう。この文書は、1リポジトリにつき1つの正本作業コピーを運用するための規則を定める。

## Rule

- 日常の変更、commit、pushは、GitHub Desktopに登録され、`main`が`origin/main`と同期している正本作業コピーでだけ行う。
- 別のクローン、古いコピー、未コミットの設計ドラフトは、正本作業コピーとして扱わない。
- 既存コピーを削除する前に、branch、commit、未追跡ファイル、正本との差分を確認する。
- 内容を確認していないドラフトは、移動・削除・mergeしない。別Taskで扱う。

## Start-of-Task Check

AIと人間は、実装前に正本作業コピーで次を確認する。

```bash
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git log -1 --oneline
```

正本か判断できない場合、調査・Plan作成に留め、変更・commit・pushを行わない。

## Archive Rule

重複クローンは、内容と履歴を失わないようローカルArchiveへ移して保管できる。Archive内のクローンは、明示的に復元・比較する場合を除き、実装・commit・pushに使用しない。

## Current Resolution

2026-07-29時点で、GitHub Desktopに登録され、最新の共有履歴と同期しているADF作業コピーを正本とする。Desktop上の重複クローンはArchiveへ退避し、未コミットの設計ドラフトは内容を比較・承認するまで隔離する。

## Related Documents

- [AI Delegation Charter](AI_DELEGATION_CHARTER.md)
- [ADR-001: 知識基盤と複数AI協働の統治](../decisions/ADR-001-knowledge-and-multi-ai-governance.md)
