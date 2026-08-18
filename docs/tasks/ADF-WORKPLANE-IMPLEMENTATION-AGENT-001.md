# ADF-WORKPLANE-IMPLEMENTATION-AGENT-001

Status: Verifying

## 1. Objective

承認済みの親Frontdoor Resultからchild Implementation Runを1件だけ派生し、`read`／`propose`／`local-only`の範囲で候補ファイル集合を生成・検証し、Owner Review待ちで停止する。実装AIの品質や実Provider接続ではなく、親子binding・候補成果物・Owner Gateの最小縦切りを実証する。

## 2. Scope

### In scope

- 単一Node Resultをsourceとするchild Implementation Run
- `parentRunId`、source Result／Evidence／Job／Thread hash、Context Bundle hashのbinding
- 1 child Run・1 Node・1 Dispatch・1 attempt
- `read`／`propose`、`local-only`、Fake／injected Implementation Adapter
- `candidate-file-set`形式（相対path、本文、本文hash、候補全体hash）
- Run専用Work PlaneへのOwner承認後のcandidate export
- 最新Result Review、期限、Scope、Capability、path、Ledger、no-clobber、Recovery検証
- CLI／共通Serviceの最小入口と自動検証

### Out of scope

- 実Claude Code CLI、実Ollama、Anthropic API、APIキー、外部送信、課金
- `write-sandbox`、OS sandbox、repo／worktree／Obsidian書込み
- Candidateの自動採用、patch適用、テスト実行、commit、push、merge
- 複数Implementation Agent、並列child、自動Retry、自動Review、自動Integration
- Candidate Review専用Task、Canonical Integration、Owner identity真正性認証

## 3. Required Context

- `docs/project/GOAL.md`
- `docs/project/MVP.md`
- `docs/project/ROADMAP.md`
- `docs/project/CURRENT_STATE.md`
- `docs/workflow/AI_DELEGATION_CHARTER.md`
- `docs/workflow/TASK_LIFECYCLE.md`
- `docs/tasks/ADF-WORKPLANE-INTEGRITY-GATE-001.md`
- Obsidian `36_ADF_WorkPlane_Integrity_Gate_2026-08-15.md`
- Obsidian `06_複数AI管制エンジン設計_2026-08-04.md`

採用する制約は、Control／Work／Evidence Planeの分離、Owner Decisionのtarget hash／Capability／expiry binding、Canonical非変更、Result／Evidence／Ledgerの再検証である。

## 4. Design

```text
Parent Result Review=accept
  -> child Implementation Run prepare
  -> Owner Intake/Plan/Dispatch approval
  -> injected implementation adapter (one Node)
  -> candidate-file-set Result
  -> hash/path/Ledger validation
  -> Owner Review待ち
  -> separate Candidate Review Task
```

初回の実装Agentは実Providerではなく、構造化candidateを返すFake／injected Adapterとする。Adapter自身はファイルを書かず、ADFが検証済みpayloadだけをRun専用Work Planeへ保存する。

Candidateの初期上限は8ファイル、1ファイル16KiB、合計64KiB、UTF-8 text、相対pathのみとする。Ownerの許可file set外、`..`、絶対path、symlink、protected root、既存artifactへのoverwriteは拒否する。

## 5. Acceptance Criteria

1. 最新の親Result Reviewが`accept`で、source Result／Evidence／Job／Thread／hashが一致しない場合はchild Runを作成しない。
2. child Runに親Run、source Result、Context Bundle、Capability、data policy、expiryがhash束縛され、Replay後も一致する。
3. childは1 Run・1 Node・1 Dispatch・1 attemptに制限され、未承認Dispatch・重複Dispatch・期限切れDecisionを拒否する。
4. Candidateは`read`／`propose`／`local-only`だけで、許可file set外・path traversal・symlink・protected rootを拒否する。
5. Candidate manifest、各本文hash、候補全体hash、Result／Evidence／Job／Thread／Ledger bindingを再読込検証できる。
6. 既存candidateのoverwrite、再Export、片側残存、Ledger／manifest／本文不一致は`recovery-needed`または失敗として停止する。
7. 成功後に自動採用・自動Review・自動Completion・Canonical変更が発生せず、Owner Review待ちで停止する。
8. Fake／injectedの正常系、親改ざん、Capability逸脱、Scope逸脱、期限切れ、path、hash、Recovery、再Dispatchのnegative testがPassする。
9. 既存Frontdoor、MCP、CLI、Electron、Ollama Work Plane経路に回帰がない。
10. Node／Web／CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。
11. Canonical repo、Obsidian、API key、外部送信、commit、push、mergeに変更がない。

## 6. Stop Conditions

- 親Resultが最新acceptでない、またはbinding/hashが不一致
- `write-sandbox`、`write-canonical`、`external-send`、未知Capabilityの要求
- Context Bundleが固定allowlist外、秘密情報を含む、またはhash不一致
- 外部Provider、認証、課金、実CLI、OS操作、worktreeが必要
- Candidate／Ledger片側残存、path escape、overwrite、再利用可能な古い承認
- 同じ原因の検証失敗が2回連続、または異なる原因の失敗が3回続く

## 7. Verification Plan

- Unit: binding、candidate schema、file／size／hash／path、Capability／expiry
- Integration: parent accept → child prepare → Owner approval → dispatch → Result／Evidence → candidate export
- Recovery: temp、manifest、ready marker、Ledger append、再起動／Replay
- Regression: Frontdoor全体、MCP、CLI、Electron build、既存Ollama Work Plane
- Negative: tamper、cross-run、follow-up／reject、duplicate dispatch、no-clobber、external transport未呼出し
- Independent review: Architecture／Safety／Verificationを実装担当と分離

## 8. Next Task

`ADF-WORKPLANE-CANDIDATE-REVIEW-001`でcandidateの意味的妥当性、diff、検証、採用／差し戻しをOwnerが判断する。Canonical Integrationはさらに別Taskとする。

## 9. Implementation Log

2026-08-15: 実装完了。

- `src/shared/implementationTypes.ts`にparent／source Aggregate・Result・Evidence・Capability bindingと`candidate-file-set`型を追加。
- `src/main/frontdoor/implementationRun.ts`に、最新の親Result ReviewのLedgerペア確認、Result／Evidence／Job／Thread binding、親Scope内の1 child Implementation Run、明示fake Adapter Packet生成を追加。
- `src/main/frontdoor/candidateArtifact.ts`に相対path、allowlist、サイズ上限、secret sentinel、本文hash、候補全体hashの検証を追加。
- `src/main/frontdoor/ownerGates.ts`にImplementation Resultのcandidate検証と、親Run／Aggregate／source bindingを含むWork Plane manifest exportを追加。Result Review前にもcandidateを検証する。
- `src/main/frontdoor/implementationBinding.ts`にsource Result／Evidence／Thread／Jobの実体hash・参照・Frontdoor binding再検証を共通化。child Packet生成前とWork Plane export前に実行する。
- `adapterRegistry.ts`の`fake-implementation`は明示指定専用（`autoSelectable: false`）。既存Main／Rendererへの実Provider登録は行っていない。
- `relay.ts`／`runtime.ts`／`thread.ts`／`orchestrator.ts`／`runIntegrity.ts`でImplementation bindingをJob／Thread／Runへ伝播し、再読込・Replay時に検証するようにした。Job／Thread再利用時もPacket bindingとinput hashを照合し、Evidence LinksにはResult envelope hashを保存する。
- Fake Adapterはファイル、Canonical repo、Obsidian、worktreeへ書き込まず、候補payloadだけを返す。

実Claude Code CLI、実Ollama、Anthropic API、API key、外部送信、commit、push、mergeは実施していない。

## 10. Verification

2026-08-15: 対象テスト **29/29 Pass**、全体 **365/365 Pass**（32 files）。

- `tsc --noEmit -p tsconfig.node.json`：Pass
- `tsc --noEmit -p tsconfig.web.json`：Pass
- `tsc -p tsconfig.cli.json`：Pass
- `electron-vite build`：Pass（Main 245.36 kB / Preload 2.74 kB / Renderer 589.17 kB）
- `git diff --check`：Pass
- 自動Routing：`fake-implementation`を除外し、明示Planだけを許可するテストがPass。
- 統合：親Result accept → child prepare → Owner Intake／Shape／Decomposition／Dispatch → fake実行 → Result Review前の停止 → accept後のcandidate exportを確認。
- Negative：親Scope外、親Evidence改ざん、親follow-up後の再利用、candidate hash／重複path／secret sentinel、Result改ざんを拒否するテストがPass。
- 実Provider／実CLI／実ファイル書込みは未検証・対象外。

独立レビューを実装担当と分離して実施。P0／P1はなし。レビューで検出された親Result／Evidence／Job／Threadの再検証不足、candidateのReview前検証不足、Decisionペアの部分一致を修正し、再レビューでP0／P1なしを確認した。残るP2は将来のCandidate Review／Canonical Integration Taskに属する追加検証候補であり、本Taskの完了を阻害しない。

## 11. Owner Review

Status: Verifying

設計承認済み。実装・自動検証は完了。独立レビュー、最終Diff確認、検証結果、残存リスクのOwner承認まではDoneにしない。commit・pushは別指示まで行わない。

## ADF Execution Summary

```json
{
  "taskId": "ADF-WORKPLANE-IMPLEMENTATION-AGENT-001",
  "objective": "Create one parent-bound child Implementation Run that returns a validated candidate-file-set and stops at Owner Review.",
  "scope": "Fake/injected propose-only local candidate generation, parent/result/evidence binding, isolated Work Plane export and recovery.",
  "target": { "repository": "/Users/kawakamiatsushishi/GitHub/AI-Development-Framework", "branch": "main", "worktree": "runtime-work-plane-only" },
  "stopConditions": ["canonical-write", "external-send", "api-key", "new-dependency", "capability-escalation", "integrity-mismatch", "repeated-verification-failure"],
  "obsidianContext": "/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/37_ADF_WorkPlane_Implementation_Agent_2026-08-15.md"
}
```
