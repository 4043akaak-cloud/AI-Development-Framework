# Codex単独パイロット

## 目的

複数AIの自動連携やOpenRouterを導入する前に、CodexとProject OwnerだけでADFの基本ループを安全に完走できることを検証する。

```text
GitHub Task
  → Required Obsidian Context
  → CodexによるPlan
  → Project Ownerの承認
  → Codexによる承認済みScopeの変更
  → Verification
  → Project OwnerのレビューとPush判断
  → GitHub / Obsidian Update
```

## 範囲

### このパイロットで行うこと

- GitHubをTask、変更、検証結果の正本として使う。
- ObsidianからTaskに必要なノートだけを指定し、採用した制約をTaskへ記録する。
- CodexはPlanと実装を担当する。Project OwnerはGoal、Scope、Approval、レビュー、Pushを担当する。
- 最初は文書Taskまたは可逆で小さい変更だけを扱う。

### このパイロットで行わないこと

- Claude Code、Z.ai、その他AIへの自動委任・自動討論。
- OpenRouter、外部API、APIキー、費用の発生する自動化。
- 自動commit、push、merge、公開、SNS投稿、削除・移行などの不可逆操作。
- 「独立AIレビュー済み」との表記。Codexだけでは独立レビューは成立しない。

## 実行手順

1. Project OwnerがTaskを作成し、`templates/AI_TASK_PACKET.md`を使って目的、範囲、Required Obsidian Context、完了条件を記録する。
2. Codexは`Context Read`で、GitHubの正本、指定ノート、採用する制約を確認する。
3. Codexは`Planned`で、Plan、影響、検証、停止条件だけを提出する。Project Ownerはこの出力をTaskへ転記し、チャットだけを唯一の記録にしない。
4. Project OwnerがScopeとPlanを確認し、必要なら`Waiting Approval`で修正依頼を出す。
5. Project Ownerが明示的に承認した場合だけ、Taskを`Approved`へ進める。
6. Codexは承認済み範囲だけを変更し、検証結果をTaskへ記録する。
7. Project Ownerが差分、検証、残存リスクをレビューする。commit・pushはProject Ownerの明示的な承認後だけに行う。
8. 結果、判断理由、再利用できる学びをGitHubと必要なObsidianノートへ記録する。

## 成功条件

`ADF-PILOT-001`は、Task PacketとPlan記録を確認する**0件目のPreflight**であり、下記の3件には数えない。

以下を満たす小Taskを3件連続で完走したら、次の段階を設計できる。

- TaskにRequired Context、Plan、Approval、変更、Verification、Human Review、次の一手が残る。
- Codexが承認前に変更・commit・pushを行わない。
- Project Ownerが、Taskと記録だけで判断・再開できる。
- Obsidianの長い背景を、必要なリンクとして参照できる。

各Taskで、開始・終了時刻、必須成果物の有無、無承認変更数、手戻り回数、非承認Blocker、残存リスク、Project Ownerの判定を記録する。Phase 1へ進む最低条件は、3件すべてで必須成果物が揃い、無承認変更が0件であることとする。

## 次段階への条件

3件の結果をレビューし、テンプレートの不足、手戻り、品質、作業時間、承認漏れを記録する。その後に初めて、別AIによる独立レビューを追加するTaskを起票できる。OpenRouterによる自動モデル選定は、その後の別Taskとする。
