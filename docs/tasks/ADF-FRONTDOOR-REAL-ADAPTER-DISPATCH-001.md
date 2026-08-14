# Task — ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001: Frontdoor Real Adapter Dispatch

> Type: Design + Implementation + Local Runtime Verification
> Status: Verifying
> Owner: Codex
> Review: Project Owner + role-separated review
> Branch: `codex/adf-frontdoor-real-adapter-dispatch`
> Related: [ADF-FRONTDOOR-PLANNER-PROPOSAL-001](ADF-FRONTDOOR-PLANNER-PROPOSAL-001.md) / [ADF-OLLAMA-FIRST-CLASS-ADAPTER-001](ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md) / [ADF-FRONTDOOR-OWNER-GATE-001](ADF-FRONTDOOR-OWNER-GATE-001.md)

## 1. Objective

既存のFrontdoor Request／Planner Proposal／Owner Gate／Event Ledgerを、Provider-neutral Adapterの実Dispatchへ接続する。最初の実証Providerには、すでにElectron Main／Relay／Transport経路で実接続済みの`ollama-local`を使うが、FrontdoorとOrchestratorはProvider名を知らない契約を維持する。

## 2. Goal alignment

```text
窓口AI／OwnerのRequest
  → 未承認Planner Proposal
  → Owner: Intake / Completion Shape / Decomposition / Dispatch
  → 明示AdapterのChild Packet
  → Job / Thread / 実Adapter
  → Result / Question / Evidence
  → AggregateResult / FrontdoorReturn
  → Owner: Result Review / Completion
```

本Taskは、最終目標「窓口AI → ADF → 得意分野ごとの複数AI → ADF → 窓口AI」のうち、Fake Adapterでのみ成立していたFrontdoor Nodeから実Adapterへの区間を一度実証する。

## 3. Adopted constraints

- GitHubはTask・実装・検証の正本、Obsidianは理念・判断理由・失敗学の正本。
- `ADF-FRONTDOOR-PLANNER-PROPOSAL-001`、Owner Gate、Event Ledger、Ollama AdapterのDone成果を再利用し、Done済みTaskを再レビューしない。
- FrontdoorのOwner Gate（Intake、Completion Shape、Decomposition、Dispatch、Question、Result Review、Completion）を省略しない。
- AdapterPlan、Node、Approved Task Packet、Job、Thread、Dispatch先、ResultをRun／Plan／Task／Job／Input hashへ束縛する。
- `local-http`は自動Routingせず、明示Adapter指定とOwner Dispatch操作に限る。
- Ollama readinessはRun作成・Planner Proposal・画面表示時には実行せず、OwnerがDispatchを実行する直前に再確認する。
- 実Ollama送信はローカルloopbackのみ。Anthropic API、Claude CLI、APIキー、機外送信、課金は扱わない。

## 4. Scope

### In scope

- Frontdoor Prepare時に、PlanのAdapterが現在の`ConversationRelay`へ登録され、Node roleと一致することを検証する。
- Frontdoor Dispatch直前に、各NodeのAdapter登録・Provider-neutral transport境界・local-http readinessを再検証する。
- `ExternalTransport`へ任意のProvider-neutral readiness契約を追加し、Ollama Transportで`/api/tags`の読み取り専用確認を実装する。
- Direct external send経路にも同じ実Dispatch readiness境界を適用し、古いRenderer状態によるOllama送信を拒否する。
- Fake Adapterの既存Frontdoor一周を維持する。
- Owner承認済みChild Packetを使ったFrontdoor→Ollama 1 Nodeの本番経路検証を行う。
- Result Envelope、Evidence、Job／Thread／Frontdoor Event Ledger、AggregateResultの整合を確認する。

### Out of scope

- 実AI Planner、動的Routing、Auto fallback、無制限並列、無限討論。
- Claude Code CLIのMain登録・認証・実送信、Anthropic APIの実送信。
- Work Plane、repo／worktree、AIによるコード編集、MCP。
- Rendererからの承認ファイル生成、自動承認、自動Answer、自動Retry、自動Completion。
- GitHub／Obsidian正本の自動変更、Taskの自動生成、正本への自動統合。
- 新規依存、APIキー設定、外部送信、commit／push／merge（最終Owner承認前）。

## 5. Contract and flow

1. Planner Proposalは通信せず、未承認Planを表示する。
2. Prepareは静的Registryと現在のRelay登録Adapter／roleを照合し、不一致ならRunを作成しない。
3. OwnerがIntake、Completion Shape、Decomposition、Dispatchを順に承認する。
4. Dispatch入口はRun／Plan／Node／Child Packetのhashを再検証する。
5. local-http Nodeでは、実Transportのloopback確認とreadiness（reachable／model present）をDispatch前に実行する。
6. readiness Pass後だけ既存`startThread`→`continueJob`へ進む。失敗時はRunをready-for-approvalに残し、Job／Thread／送信を作らない。
7. Result／Question／Evidenceを既存Orchestratorへ戻し、Owner Review／Completionで停止する。

## 6. Acceptance criteria

- [x] Frontdoor PlanのAdapterが現在のRelayに未登録、またはrole不一致の場合、Prepareがfail-closedする。
- [x] `ollama-local`は明示Plan／明示Dispatchでのみ到達し、自動RoutingやPlanner生成では到達しない。
- [x] Dispatch承認なし、Plan／Node／Packet hash不一致、local endpoint不一致を拒否する。
- [x] local-http readinessがPassしない場合、Dispatch前に停止し、Job／Thread／Ollama送信を発生させない。
- [ ] Owner承認済みPlan／Child Packetで、Frontdoorから実Ollamaへ1回送信できる。
- [ ] 実行結果にResult Envelope、Evidence、Job Ledger、Thread Ledger、Frontdoor Event Ledger、AggregateResultが残り、Run／Node／Job／Threadが一致する。
- [x] Fake Frontdoor、既存Ollama standalone、Anthropic未送信経路が回帰しない。
- [x] timeout／cancel／malformed／readiness failureは既存の失敗・停止・Recovery契約を壊さない。
- [x] Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。

## 7. Verification and stop conditions

### Required verification

- Relay登録Adapter／role照合の正常系・未登録・role不一致テスト。
- Generic readiness契約とOllama `/api/tags`のsuccess／unreachable／model missingテスト。
- readiness失敗時にRun state、Thread一覧、Job Ledger、Transport callが増えないnegative test。
- Frontdoor Fake 2 Nodeの既存一周回帰。
- 明示`ollama-local` 1 Nodeの実Transport／Result／Evidence／Aggregate検証。
- Owner Gate、Plan／Packet／Job／Thread／Result／Event hashの再確認。
- 既存全テスト、typecheck、Electron build、diff check。

### Stop conditions

- 同じ原因の検証失敗が2回連続、または別原因の失敗が3回続いた場合。
- Provider-neutral契約を壊すProvider固有分岐がOrchestratorへ必要になった場合。
- Owner Gate、Packet／Dispatch境界、Recoveryを弱める必要が出た場合。
- APIキー、機外送信、課金、Work Plane書込み、新規依存が必要になった場合。
- 実Ollamaのloopback以外への接続が検出された場合。

## 8. Implementation boundary

変更候補は次に限定する。

- `src/main/jobLoop/externalTransport.ts`
- `src/main/jobLoop/ollamaTransport.ts`
- `src/main/jobLoop/relay.ts`
- `src/main/frontdoor/frontdoorPrepareService.ts`
- `src/main/frontdoor/orchestrator.ts`
- `src/main/relayService.ts`
- Frontdoor／Relay／Ollama関連テスト
- 本Task、`docs/project/CURRENT_STATE.md`、Obsidianマイルストーン、ADF MOC

`planner.ts`、既存Event Ledger、Owner GateのDecision契約、Anthropic Transport、Claude CLI Transportの動作仕様は変更しない。

## 9. Implementation log

| 日時 | 実施者 | 内容 |
|---|---|---|
| 2026-08-14 | Codex | Git root／branch／remote／status、正本、Frontdoor、Relay、Registry、Ollama Transport、既存テストを読み取り確認。次の最小欠落区間をFrontdoor→実Adapter Dispatchと確定。 |
| 2026-08-14 | Project Owner | `設計OK`。本Taskの実装開始を承認。 |
| 2026-08-14 | Codex | `ExternalTransport`へProvider-neutralな任意readiness契約を追加。Ollama Transportは`/api/tags`でreachable／model presentをDispatch直前に確認するよう実装。 |
| 2026-08-14 | Codex | PrepareでRelay登録Adapter／roleを照合し、OrchestratorとDirect external sendの両経路で、Owner Dispatch承認後かつChild Job／Thread生成前にAdapter登録・local endpoint・readinessを再検証する境界を追加。 |
| 2026-08-14 | Codex | 未登録Adapter拒否、readiness成功／model missing、Frontdoor Ollama 1 Node成功、readiness失敗時のJob／Thread未生成、既存Planner fixture回帰をテスト。 |
| 2026-08-14 | Codex | Node/Web/CLI typecheck、Vitest **314/314（26 files）**、Electron build、`git diff --check`をPass。実Ollama送信は未実施（別途Owner実行承認待ち）。 |

## 10. Current status

`Verifying`。Adapter登録照合、Dispatch readiness境界、テスト、型検査、Electron buildまで完了。実Ollama送信とResult／Evidence／Ledgerの実ファイル確認は、別途Owner実行承認後に行う。最終Diff／Verificationレビュー後にDone判断を行う。

## ADF Execution Summary

```json
{
  "taskId": "ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001",
  "objective": "FrontdoorのOwner承認済みNodeからProvider-neutralな実Adapterへ安全にDispatchし、Ollama local-httpのResult／Evidence／Ledgerを一周実証する",
  "scope": {
    "inScope": ["Frontdoor adapter registration validation", "provider-neutral dispatch readiness", "Ollama local-http one-node proof", "Result/Evidence/Ledger binding", "negative and regression tests"],
    "outOfScope": ["real planner", "Anthropic API", "Claude CLI", "external send", "Work Plane", "MCP", "auto-approval", "auto-retry", "canonical writes"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "approvedAt": "2026-08-14", "externalSend": false, "newDependencies": false },
  "verification": { "status": "verifying", "tests": "314/314 passed", "typecheck": "node/web/cli passed", "electronBuild": "passed", "diffCheck": "passed", "realOllama": "pending: separate Owner execution approval required" }
}
```
