# Task — ADF-FRONTDOOR-OLLAMA-TWO-NODE-E2E-001: Frontdoor Ollama Two-Node E2E

> Type: Design + Implementation + Local Runtime Verification
> Status: Done
> Owner: Codex
> Review: Project Owner + role-separated review
> Branch: `codex/adf-frontdoor-ollama-two-node-e2e`
> Related: [ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001](ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001.md) / [ADF-OLLAMA-ROLE-COMPLETE-ADAPTER-001](ADF-OLLAMA-ROLE-COMPLETE-ADAPTER-001.md)

## 1. Objective

既存のFrontdoor／Owner Gate／Event Ledger／Provider-neutral Adapter契約を使い、実OllamaでProposal → Criticの依存2 Nodeを一度だけ実行する。実装済みの注入Transport検証を、ローカルloopbackの実Runtime証跡へ拡張する。

## 2. Goal alignment

```text
窓口Request
  → Owner: Intake / Completion Shape / Decomposition / Dispatch
  → Ollama Proposal
  → Ollama Critic（Proposal Resultへ依存）
  → Aggregate Result / Evidence / Event Ledger
  → Owner: Result Review
```

本Taskは、最終目標「窓口AI → ADF → 得意分野ごとの複数AI → ADF → 窓口AI」のうち、実Providerによる複数Node会話と依存Resultの実証だけを担う。窓口AI接続、Work Plane、正本統合は後続Taskとする。

## 3. Required context and adopted constraints

- GitHubはTask・実装・検証の正本、Obsidianは判断理由・長期設計・失敗学の正本とする。
- `ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001`の1 Node実送信証跡と、`ADF-OLLAMA-ROLE-COMPLETE-ADAPTER-001`のmulti-role自動検証を再利用する。
- FrontdoorのOwner Gate（Intake、Completion Shape、Decomposition、Dispatch、Result Review、Completion）を省略しない。
- `ollama-local`はProposal／Criticとも明示Planで指定し、自動Routingでは使用しない。
- `routingPlanHash`、Run／Plan／Node／Child Packet／Job／Thread／Result／Evidence／Event Ledgerを相互に束縛する。
- readinessはNodeごとのDispatch直前に実行し、Proposal成功後にCritic直前で停止・モデル欠落が起きてもCriticのJob／Thread／POSTを作らずfail-closedする。loopback以外、URL userinfo／query／fragmentも拒否する。
- 実Ollama送信はlocalhostの一回のRun、2 Nodeに限定する。APIキー、外部送信、課金は扱わない。

## 4. Scope

### In scope

- FrontdoorのProposal／Critic 2 Node用に、Owner承認済みChild PacketをNode ID単位で準備する経路。
- Electron Mainと同じProvider-neutral Relay登録（`ollama-local`のProposal／Critic）を使う実行検証入口。
- 実OllamaのProposal → Critic依存実行を一回だけ行う。
- Result Envelope、dependency Result、Job／Thread／Evidence／Frontdoor Event Ledger、Aggregateの整合確認。
- 実行後のRun再読込・Replay・Thread／Boardの読み取り確認。
- 実Ollama送信前のreadiness／Plan／Packet／endpoint確認と、送信失敗時の停止記録。
- Frontdoor／Ollama関連の最小テスト、Task正本、CURRENT_STATE、Obsidianマイルストーン更新。

### Out of scope

- Anthropic API、Claude Code CLI、APIキー、機外送信、課金。
- 窓口AIからのMCP／API接続、動的Routing、自動モデル選定。
- Work Plane、repo／worktree、AIによるコード編集、Artifact統合、正本自動書込み。
- 自動承認、自動Completion、自動Retry、無限討論、並列Run。
- 新規依存関係、DB移行、既存Owner Gate／Event Ledger契約の弱体化。
- `main`へのmerge、公開、次Taskの実装。

## 5. Execution flow

1. Electronアプリが停止していることを確認する。
2. `/api/tags`を読み取り、Ollama到達性と承認対象モデルを確認する。
3. Proposal／Criticの2 Nodeを持つFrontdoor Request／Planを作成する。
4. Nodeごとに`ollama-local`／role／Run binding付きChild Packetを生成する。
5. OwnerがIntake → Completion Shape → Decomposition → Dispatchを既存CLI／UIで明示承認する。
6. Dispatch直前にreadiness、local endpoint、Plan／Packet hash、Adapter／roleを再検証する。
7. Proposalを実行し、ResultをCriticのdependency inputとしてCriticを実行する。
8. Aggregate／Evidence／Event Ledgerを確認し、Result Review待ちで停止する。
9. Runtime再読込・Replay・Thread／Board表示を読み取り確認する。

## 6. Acceptance criteria

- [x] Proposal／Criticの2 Nodeが同一Run／Planに束縛され、両方が`ollama-local`を明示指定する。
- [x] Owner Gateが全段階で記録され、承認なしDispatch・自動Completionが発生しない。
- [x] 実OllamaのProposal ResultがCriticのdependency Resultとして渡され、Run／Node／Result hashが一致する。
- [x] 2 Node分のJob／Thread／Result Envelope／Evidence／Job Ledger／Frontdoor Event Ledger／Aggregateが生成される。
- [x] 実行後の再読込・ReplayでRun状態とNode状態が壊れず、Result Review待ちとして再現される。
- [x] Ollama停止、モデル欠落、非loopback endpoint、Plan／Packet改ざんは送信前に拒否される。
- [x] Fake経路、既存Ollama 1 Node経路、Anthropic未送信経路が回帰しない。
- [x] Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。

## 7. Verification and stop conditions

### Required verification

- 2 Nodeの注入Transport回帰テスト。
- Child PacketのNode／Run／Plan／adapter／role／routingPlanHash一致テスト。
- Proposal dependency Resultの実ファイル・hash・Ledger照合。
- readiness失敗時にJob／Thread／Ollama送信が増えないnegative test。
- 実Ollama送信は一回のみ。送信前後のruntime root差分を記録する。
- 再読込・Replay・Thread／Boardの読み取り確認。
- 全テスト、typecheck、Electron build、diff check、独立レビュー。

### Stop conditions

- 同じ原因の検証失敗が2回連続、または別原因の失敗が3回続いた場合。
- loopback以外への接続、外部送信、APIキー、費用、Work Plane書込みが必要になった場合。
- Owner Gate、Plan／Packet／Run／Result／Evidence境界を弱める必要が出た場合。
- 2 Nodeの実行を無制限化、自動Retry、自動Completionする設計が必要になった場合。

## 8. Implementation boundary

変更候補はFrontdoor／Ollama実行検証入口、関連テスト、Task／Current State／Obsidian記録に限定する。既存のOwner Gate、Event Ledger、Planner契約、Anthropic／Claude CLI Transportの仕様は変更しない。実送信は実装・自動検証完了後、別途の実行直前確認を経て行う。

## 9. Approval and implementation log

| 日時 | 実施者 | 内容 |
|---|---|---|
| 2026-08-14 | Codex | Git root／branch／remote／status、Goal／MVP／Roadmap／Current State、Frontdoor、Ollama 1 Node証跡、multi-role自動検証を確認。最小欠落を実Ollama 2 Node E2Eと特定。 |
| 2026-08-14 | Project Owner | 「この設計で進めて下さい」。本Taskの実装開始を承認。 |
| 2026-08-14 | Codex | Electron Main／Frontdoor CLIで共有するlive Relay factory、Ollama Proposal／Critic probe、実Packet hash束縛、Critic依存本文受け渡し、Nodeごとのreadiness再確認、実行証跡検証を実装。実送信は未実施。 |
| 2026-08-14 | Codex | loopback URLのuserinfo／query／fragment／path拒否、直接Transport送信のloopback fail-closed、readiness timeout、CLI prepare-only／confirmation guard、fresh Relay／OrchestratorによるReplay・Evidence再検証を追加。 |
| 2026-08-14 | Architecture／Safety／Verification review | P0なし。Packet hash束縛、Critic直前readiness、依存本文、URL境界、証跡検証、CLI入口について再確認。legacy fake経路互換、Packet準備とDispatch Gateの分離、実Ollama未実施を残存事項として記録。 |
| 2026-08-14 | Project Owner／Codex | Run `run-0cf084773023ec7ae222`を実行。Intake／Completion Shape／Decomposition／Dispatchの4 GateをPacket-boundで承認し、Proposal／Criticを`llama3:latest`へ順次送信。Proposal Job `job-89be27b4cf608952`／Thread `thread-506835efa498c4d4`、Critic Job `job-c465054faa0dca80`／Thread `thread-a8067f27d8d05bd4`、両Result／Evidence／Job Ledger／Event Ledger／Aggregateの再読込・hash検証にPass。自動Completionは行わずResult Review待ちで停止。 |

## 10. Current status

`Done`。実装・注入Transport検証・全自動検証・実OllamaのProposal→Critic 2 Node実行・送信後のRuntime再読込／Replay／Evidence検証・Owner Result Review・Task Completionを完了した。Run `run-0cf084773023ec7ae222`は`complete`である。自動Retry・自動Completionは行っていない。

## ADF Execution Summary

```json
{
  "taskId": "ADF-FRONTDOOR-OLLAMA-TWO-NODE-E2E-001",
  "objective": "実OllamaでFrontdoorのProposal → Critic依存2 Nodeを一度実証し、Result／Evidence／Ledger／Replayを確認する",
  "scope": {
    "inScope": ["Frontdoor two-node live verification", "Ollama Proposal/Critic", "dependency Result binding", "Owner Gate and Replay evidence"],
    "outOfScope": ["Anthropic API", "Claude CLI", "external send", "MCP", "Work Plane", "dynamic routing", "canonical writes", "auto approval", "auto retry"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "approvedAt": "2026-08-14", "externalSend": false, "newDependencies": false },
  "verification": {
    "status": "runtime-evidence-pass-owner-accepted",
    "automatedTests": "331 passed / 27 files",
    "typecheck": "node web cli pass",
    "electronBuild": "pass",
    "diffCheck": "pass",
    "independentReview": "post-fix review: P0 none",
    "realOllama": {
      "status": "pass",
      "runId": "run-0cf084773023ec7ae222",
      "model": "llama3:latest",
      "nodes": ["proposal", "critic"],
      "dependencyBinding": "proposal result content and hash verified in critic input",
      "ownerGate": "intake/completion-shape/decomposition/dispatch recorded",
      "resultReview": "accepted",
      "completion": "approved"
    }
  }
}
```

## 11. Closure

2026-08-14、Project OwnerのResult Review `accept` とCompletion `approve`を記録し、本Taskを`Done`とした。実Ollamaの追加送信、外部送信、APIキー、Work Plane、正本自動書込み、commit、push、mergeは行っていない。次の設計候補は、窓口AIからADFへRequest／Planを投入し、承認済みRunの状態・Resultを取得するローカルMCP入口である。
