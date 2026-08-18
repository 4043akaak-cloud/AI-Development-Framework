# ADF-WORKPLANE-INTEGRITY-GATE-001

Status: Done

## 1. Objective

実装AIをWork Planeへ接続する前提として、既存のResult-derived Work Plane Exportとread-only artifact取得を、Result／Evidence／Owner Decision／Runtime root／Ledgerの整合性が崩れた場合にfail-closedで停止する安全境界へ引き上げる。

本Taskは、AIに任意ファイルを書かせるTaskではない。次段の`ADF-WORKPLANE-IMPLEMENTATION-AGENT-001`が候補patch／候補ファイルを安全に返せるよう、既存Work Planeの検証契約を先に固定する。

## 2. Scope

### In scope

- Work Plane artifact read時の本文`contentHash`再計算とmanifest照合
- Export直前のRun bundle／Event Ledger／Result／Evidence／Owner Decisionの再検証
- 最新のOwner Decisionだけを有効とする判定（accept後のreject／follow-upで過去acceptを再利用しない）
- Export Decisionにおけるcapability、data policy、期限、対象hashの必須検証
- runtime rootがCanonical repo、Obsidian正本、またはそれらへのsymlinkでないことの検証
- `..`、絶対path、symlink、別Run参照、既存artifactへのoverwriteの拒否
- artifact生成途中の不完全状態を再Export可能にしないRecovery／orphan検出
- Fake／injected経路によるpositive／negative testと、既存Frontdoor回帰検証
- Task正本、CURRENT_STATE、Obsidianマイルストーンへの検証記録

### Out of scope

- 実装AIの起動、Claude Code CLIのMain／Renderer登録、実Provider送信
- AIによる任意OS操作、canonical repo／Obsidianへの書込み、worktree編集
- `write-sandbox` Capabilityの新設、OS sandbox、commit、push、merge、公開
- Owner identityの暗号学的認証基盤（現行のOwner Gate契約の別Task候補）
- 複数実装AIの自動Routing、並列実行、自動Review、自動Retry、自動Completion
- APIキー、外部送信、課金、モデルpull

## 3. Design

### 3.1 整合性の判定順序

Exportとartifact readの両方で、次の順に検証する。

1. runtime root、Run ID、相対path、symlink境界
2. Run bundleのmanifest、Event Ledger replay、Request／Plan／Node hash
3. Result／Evidence／Job／Threadの参照とhash
4. 最新Owner Decisionのtarget hash、decision、capability、data policy、expiry
5. artifact manifestと保存本文のcontent hash

1つでも不一致なら、artifact生成・artifact返却・Export Decision記録を成功扱いにしない。

### 3.2 不完全状態と再実行

- artifact生成はRun固有のWork Plane内で一時領域へ行い、ready markerとmanifestの整合が確認できたものだけを公開する。
- 最終artifactだけ、またはLedger eventだけが残った場合は`recovery-needed`として停止し、自動再Export・自動Retry・上書きを行わない。
- 同一Exportの再実行は既存artifactを保持したまま拒否する。再実行は新しいOwner Decisionと新しい明示Runを必要とする。
- 最終ファイル作成はno-clobberで行い、競合時は失敗として記録する。

### 3.3 Owner介入点

- Result Review: Resultを採用候補として扱うか
- Work Plane Export: 検証済みartifactを生成するか
- Recovery: 不完全状態を停止・調査するか

本Taskでは、Owner DecisionをADFが自動生成したり、過去のacceptを再利用したりしない。

## 4. Acceptance Criteria

1. artifact readは保存本文を再hashし、manifestの`contentHash`不一致を拒否する。
2. Export前にRun／Event Ledger replay／Result／Evidence／Job／Threadのbindingを再検証し、別Run・改ざん・欠落を拒否する。
3. 最新Owner Decisionが`accept`であり、対象hash、capability、data policy、期限が一致しない限りExportしない。accept後のreject／follow-upがある場合は拒否する。
4. runtime rootがCanonical repo、Obsidian正本、またはそれらへのsymlinkの場合に停止する。Work Plane内でも`..`、絶対path、symlink、別Run pathを拒否する。
5. 生成途中のartifact／Ledger片側残存を`recovery-needed`として検出し、自動再Export・自動Retry・overwriteを行わない。
6. Result Review前、hash不一致、capability不許可、期限切れ、再Export、競合書込みのnegative testがある。
7. 既存のMCP、CLI、Electron Frontdoor、Ollama Proposal／Critic E2Eに回帰がない。
8. Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。
9. Canonical repo、Obsidian、API key、外部送信、commit、push、mergeに変更がない。

## 5. Non-goals and Stop Conditions

### Non-goals

- 本Taskの完了を、実装AIが候補成果物を作れることや、候補が採用されたことと解釈しない。
- `approvedBy`文字列の存在を、Owner identityの真正性認証とは解釈しない。

### Stop Conditions

- Canonical repo／Obsidianへの書込みが必要になった場合
- 実Provider、API key、課金、外部送信、OS sandbox、新規依存が必要になった場合
- hash、symlink、path、最新Decision、Ledger replayの不一致を解消できない場合
- artifactとLedgerの片側だけが残る状態をfail-closedにできない場合
- 同じ原因の検証失敗が2回連続、または異なる原因の失敗が3回続いた場合

## 6. Verification Plan

- Unit: contentHash、latest Decision、capability／expiry、root/path／symlink、no-clobber
- Integration: export前のbundle／replay／Result binding、MCP read、CLI／Electron service
- Recovery: temp write、rename、ready marker、Ledger appendの各段階の失敗注入
- Regression: 既存Runのread-only inspect、Result Review、Ollama Proposal／Criticの既存証跡
- Evidence: 新しいRunでFake／injected経路を1回実行し、検証結果と未変更対象を記録

実Ollama再送信、実装AI起動、canonical統合は行わない。

## 7. Next Task

本Task完了後に、次の別Taskを設計・承認する。

`ADF-WORKPLANE-IMPLEMENTATION-AGENT-001` — 承認済みResultから派生するchild Implementation Runを作り、`propose` Capabilityの範囲でpatchまたは候補ファイル集合をRun専用Work Planeへ返し、Owner Review待ちで停止する。canonical統合はさらに別Taskとする。

## 8. Execution Summary

```json
{
  "taskId": "ADF-WORKPLANE-INTEGRITY-GATE-001",
  "objective": "Harden Work Plane export and read integrity before connecting an implementation agent.",
  "scope": "Result/Evidence/Owner Decision binding, artifact content hash, runtime-root confinement, recovery and no-clobber verification.",
  "acceptance": [
    "Artifact contentHash is recomputed on read.",
    "Export revalidates run bundle, ledger replay, result/evidence/job/thread bindings.",
    "Only the latest matching Owner accept with capability, data policy and expiry can export.",
    "Canonical/Obsidian roots, symlinks, traversal, absolute paths and cross-run references are rejected.",
    "Partial artifact/Ledger states become recovery-needed without auto-retry or overwrite.",
    "Positive, negative, recovery and regression tests pass without canonical or external writes."
  ],
  "target": {
    "repository": "/Users/kawakamiatsushishi/GitHub/AI-Development-Framework",
    "branch": "main",
    "worktree": "canonical-repo-unchanged"
  },
  "stopConditions": [
    "canonical-write",
    "external-send",
    "api-key",
    "new-dependency",
    "unresolved-integrity-mismatch",
    "repeated-verification-failure"
  ],
  "obsidianContext": "/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/36_ADF_WorkPlane_Integrity_Gate_2026-08-15.md"
}
```

## 9. Implementation Log

- Work Plane／MCP共通の`pathIntegrity`を追加し、Canonical repo・Block Defense repo・Obsidian rootとの重複、symlink、`..`、絶対pathをfail-closedにした。
- 初回runtime rootが未作成でも安全に検査できるよう、最近傍の既存親をrealpath化して未作成suffixを検査する方式にした。
- `runIntegrity`を共通化し、Export直前にもbundle manifest、Run hash、Plan／Request／Node、Event Ledger replayを再検証するようにした。
- Work Plane artifact readを`readVerifiedWorkPlaneArtifact`へ共通化し、要求Run、artifactId、manifest hash、本文`contentHash`を照合するようにした。
- Export時にJob request、Result Envelope、Thread、Thread turn、Evidence links、`orchestrationRunId`を相互照合するようにした。
- Result Reviewは最新のpaired `result-reviewed` eventだけを有効とし、expiryを検証するようにした。Completionも過去acceptの再利用をしない。
- Export Decisionへ`allowedCapability: propose`、`dataPolicy: local-only`、expiryを束縛した。
- artifact生成は一時ファイルからno-clobber linkで確定し、Ledger記録前の失敗時はWork Planeを削除せず`recovery-needed.json`を残すようにした。
- 既存のFrontdoor／MCP／Ollama経路に対する変更はIntegrity検証の追加のみ。実Ollama送信、外部送信、canonical writeは行っていない。

## 10. Verification

- 対象Integrity／Owner Gate／MCPテスト：**22/22 Pass**
- 全Vitest：**355/355 Pass**（31 files）
- Node typecheck：Pass
- Web typecheck：Pass
- CLI typecheck：Pass
- `electron-vite build`：Pass
- `git diff --check`：Pass
- 追加したnegative coverage：protected root、未作成runtime root、symlink、parent traversal、要求Run不一致、本文hash改ざん、Job request改ざん、Result Review follow-up後のExport、再Export／recovery-needed
- 独立Safety再レビュー：PASS
- 独立Verification再レビュー：途中終了のため判定不能。ただし、同レビュー担当は変更を行っておらず、上記の全体検証はCodex側で完了している。

## 11. Residual Risks / Next Step

- `approvedBy`文字列の真正性認証は未実装であり、Owner identity基盤の別Task候補として残す。
- Event Ledgerの跨プロセス同時appendそのものの排他性は別Task候補として残す。
- Work Plane候補成果物を実装AIに生成させるTask、Claude Code CLIのMain登録、実Provider送信、Canonical統合は未着手。
- 次は`ADF-WORKPLANE-IMPLEMENTATION-AGENT-001`の設計・承認へ進み、`propose`範囲の候補patch／候補ファイル集合をchild Implementation Runで返す。

## 12. Owner Review

Status: Done

実装・自動検証・独立Safety再レビュー・最終Diff確認が完了した。2026-08-15、Project Ownerが`Done`を承認した。commit・pushは未実施。
