# Task — ADF-TASK-LEDGER-DRIFT-001: Task文書とLedgerの整合チェック

> Status: `Verifying` — 実装・検証完了。独立レビューとOwner完了承認が残る。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementer: Claude Code
> Independent Review: 未実施
> Date: 2026-09-09

## 1. Objective

Task文書が主張する実行記録と、Runtime Ledgerが実際に保持する記録の食い違いを、読み取り専用で検出する。

## 2. Background

2026-09-08、手作業で3件の乖離を発見した（Obsidian `49_ADF_2CycleE2E検証で判明した記録乖離`）。

- Task本文が「Cycle 1のResult Review未実施」と記載する一方、Ledgerには2026-08-21のaccept決定が存在した
- Electron実画面から完走したRun 2件が、どのTask文書にも記録されていなかった

構造的な原因は**Ledgerは自動追記だがTask本文は手書き**という非対称である。特にOwnerが自分でUIを操作したときは、記録する主体がそもそも存在しない。

`ADF-TASK-PACKET-CLI-001` は残存リスクとして「Task本文とExecution Summaryの将来的な乖離を検出できない」を記録していた。**本Taskはその残存リスクの回収でもある。**

## 3. Final Flow Contribution

- **Final Flow Contribution**: GitHubをTaskの正本、Ledgerを実行状態とする役割分担が、実際に一致していることを機械的に確認できるようにする。
- **Vertical Slice Outcome**: Ownerが1コマンドで、記録されていないRun・存在しないRunへの参照・Packet CLIが読めないExecution Summaryを一覧できる。
- **Next Flow Unlocked**: Done判定の根拠が、散文の主張ではなく突き合わせ可能な事実になる。
- **Deferred Details**: 自動修正、CI組み込み、Status文字列の意味解析、Obsidianノートの突き合わせ。

## 4. 設計

### 4.1 検出する3種類

| 種別 | 内容 | 判定 |
| --- | --- | --- |
| `undocumentedRuns` | Ledgerにあり、どの文書も言及しないRun | 記録漏れ |
| `unverifiableReferences` | 文書が参照し、現Ledgerに無いRun | **エラーとしない。** Runtimeリセット後の履歴が通常 |
| `unreadableSummaries` | 見出しはあるがPacket CLIが読めないブロック | 規約との乖離 |
| `summaryTaskIdMismatches` | Execution SummaryのtaskIdがファイル名と不一致 | 記録誤り |

### 4.2 正本パーサの再利用

Execution Summaryの判定は `extractExecutionSummary()`（`src/cli/executionSummary.ts`）をそのまま使う。

初版では独自の正規表現で解析し、**7件の不一致を報告したが全て誤検出だった**。見出し文字列に言及した散文を拾っていただけである。何がSummaryかはパーサが決めることであり、別実装の第二意見は所見を捏造するだけだった。

### 4.3 報告のみ、修正しない

どちらが古いかは意図の判断であり、`docs/decisions` がそれをOwnerに留保している。exit codeは乖離があっても0とする。履歴にRuntimeリセットが含まれるだけで落ちる検査は、1週間で無効化される。

## 5. Scope

### In scope

`src/cli/taskLedgerDrift.ts`（新規）、`src/cli/bin.ts` へのサブコマンド追加、`tests/taskLedgerDrift.test.ts`、Task／CURRENT_STATE。

### Out of scope

自動修正、CI、Status文字列の意味解析、Obsidian突き合わせ、Ledgerへの書込み、外部送信、新規依存。

## 6. Verification

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 48 files / 488 tests**（実装前 47 files / 476、回帰なし） |
| 自動 | `tests/taskLedgerDrift.test.ts` | Pass 12/12 |
| 自動 | `electron-vite build`、`git diff --check` | Pass |
| 手動 | **実リポジトリ67文書と実Ledger 6 Runへ適用** | 下記のとおり実際の乖離を検出 |

### 実測した乖離（2026-09-09）

```text
task/ledger drift: 67 documents, 6 Runs in the Ledger
  undocumented Runs: 1
    - run-6aee23a0451084eaa19f
  unverifiable references: 6
    - run-0cf084773023ec7ae222, run-30c7a84186862404fe38, run-657fbad20b7a6861d18d,
      run-79bba1a471695ed3671d, run-9e156c781b2234515369, run-e598a9036a406f405311
  unreadable Execution Summary blocks: 10
```

**10件の`unreadableSummaries`は本物の発見である。** `ADF-TASK-PACKET-CLI-001` が fence info string を `json adf-execution-summary` と定めたのに、後続の10文書は素の ```json を使っている。Packet CLIはこれらを1件も読めない。規約を決めたTask自身がその遵守を検証できていなかった。

`run-6aee23a0451084eaa19f`（Cycle 2 AggregateからCandidateを提案したRun）は、どの文書にも記録されていない。

## 7. 残るリスク・未検証事項

- **検出した乖離そのものは未修正。** 10文書のfence修正、`run-6aee23a0451084eaa19f`の記録、6件の参照の履歴扱いは、いずれもOwnerの判断を要する別作業とする。
- Run ID以外の識別子（Job／Thread／Decision／hash）は突き合わせていない。
- Status文字列やVerification記述の意味的な整合は見ていない。文字列解析では「主張」を判定できないため、意図的に範囲外とした。
- CI未組込み。手動実行のみ。
- 独立レビュー未実施。
