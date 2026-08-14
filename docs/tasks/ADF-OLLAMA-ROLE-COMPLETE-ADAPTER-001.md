# Task — ADF-OLLAMA-ROLE-COMPLETE-ADAPTER-001: Ollama Role-Complete Adapter

> Type: Design + Implementation + Automated Verification
> Status: Done
> Owner: Codex
> Review: Project Owner approved
> Branch: `codex/adf-frontdoor-real-adapter-dispatch`
> Related: [ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001](ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001.md) / [ADF-OLLAMA-FIRST-CLASS-ADAPTER-001](ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md)

## 1. Objective

Registryが宣言する`ollama-local`のProposal／Critic両対応を、実際のConversationRelay／Electron Main登録にも一致させる。同一Provider-neutral Adapter IDを使うFrontdoorのProposal → Critic依存グラフを、実Ollama送信なしの自動検証で成立させる。

## 2. Goal alignment

```text
窓口AI／Owner Request
  → Frontdoor Plan（proposal + critic）
  → Owner承認
  → ollama-local / proposal
  → dependency Result
  → ollama-local / critic
  → Result / Evidence / Ledger
  → Owner Review
```

## 3. Required context and adopted constraints

- GitHubはTask・実装・検証の正本、Obsidianは理念・判断理由・学びの正本。
- `ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001`のOwner Gate、Event Ledger、Plan／Packet／Job／Thread束縛を変更しない。
- `ollama-local`はRegistry上の`proposal`／`critic`両対応を維持する。
- `local-http`は自動Routing対象外のまま、明示Plan／明示Dispatchだけを許可する。
- 実Ollama送信、APIキー、外部送信、費用、モデルpull、新規依存、Work Plane書込みは行わない。
- 既存Fake、Anthropic、単独Ollama、Recovery経路を回帰させない。

Required Obsidian Context:

- [[27_ADF_Frontdoor_Real_Adapter_Dispatch_2026-08-14|ADF Frontdoor Real Adapter Dispatch]]
- [[19_ADF_Frontdoor_Orchestration_2026-08-14|ADF Frontdoor Orchestration]]
- [[16_ChatGPT_ADF_各AI自動往復構想_2026-08-07|ChatGPT → ADF → 各AI → ADF 自動往復構想]]

## 4. Scope

### In scope

- `ConversationAdapter`に、既存の単一role実装を壊さず複数role対応を表現する最小契約を追加する。
- `ExternalConversationAdapter`が同一`adapterId`でProposal／Criticを検証・記録できるようにする。
- RelayがAdapterの対応roleを使ってPrepare／明示Dispatch／自動Routing境界を判定する。
- Electron Mainの`ollama-local`登録をProposal／Critic対応へ更新する。
- Provider-neutralな注入Transportで、1 Run内のProposal → Critic 2 NodeとResult／Evidence／Ledger束縛を検証する。
- role不一致、未承認Plan、local-http自動Routing、既存経路の負のテストを追加する。

### Out of scope

- 実Ollamaへの新規送信、readiness実行、APIキー、外部送信、課金。
- Claude Code CLIのMain登録・認証・実送信、Anthropic API送信。
- 動的Routing、Auto fallback、無制限並列、無限討論、自動承認。
- Work Plane、repo／worktree、AIによるコード編集、MCP。
- Rendererの新しい承認操作、Task Packet自動生成、GitHub／Obsidian正本の自動変更。
- commit／push／merge。

## 5. Acceptance criteria

- [x] Registryの`ollama-local`対応roleと、Electron Main／Relayの実登録roleがProposal／Criticで一致する。
- [x] 同じ`ollama-local` adapterIdでProposal／Criticを明示Dispatchでき、Turnのrole・Result・external-call Ledgerが実際のrequest roleに一致する。
- [x] FrontdoorのProposal → Critic依存2 Nodeを、Owner Gate・Plan／Packet／Run束縛を維持したまま注入Transportで完走できる。
- [x] CriticはProposal NodeのResultをdependency provenanceとして受け取る。別Run／別NodeのResultは受理しない既存境界を維持する。
- [x] `ollama-local`は自動Routingに入らず、role未対応・Plan不一致・未登録はfail-closedする。
- [x] Fake／Anthropic／既存Ollama単独経路が回帰しない。
- [x] Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。
- [x] 実Ollama送信は0件である。

## 6. Verification and stop conditions

### Required verification

- `ExternalConversationAdapter`の複数role正常系／不一致role拒否テスト。
- Main相当のRelay構成で`ollama-local`のProposal／Critic登録を確認するテスト。
- Frontdoor 2 Nodeの注入Transport実行、dependency Result、Run／Node／Job／Thread／Evidence束縛確認。
- 自動Routing除外、Plan／role不一致、既存Fake／Anthropic回帰テスト。
- Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`。

### Stop conditions

- 同じ原因の検証失敗が2回連続、または別原因の失敗が3回続いた場合。
- Adapter契約をProvider固有分岐で汚染する必要が出た場合。
- Owner Gate、Plan／Dispatch境界、Recoveryを弱める必要が出た場合。
- 実Ollama送信、外部送信、認証、費用、新規依存、Work Plane書込みが必要になった場合。

## 7. Implementation boundary

変更対象は次に限定する。

- `src/main/jobLoop/conversationAdapters.ts`
- `src/main/jobLoop/externalAdapter.ts`
- `src/main/jobLoop/relay.ts`
- `src/main/index.ts`
- Ollama／Frontdoor／Relay関連テスト
- 本Task、`docs/project/CURRENT_STATE.md`、Obsidianマイルストーン、ADF MOC

変更しない契約：Frontdoor Event Ledger、Owner Gateイベント、Thread永続化形式、Anthropic Transportの認証・送信仕様、Claude CLI Transport、Registryの自動Routing除外条件。

## 8. Implementation log

| 日時 | 実施者 | 内容 |
|---|---|---|
| 2026-08-14 | Codex | Git root／branch／remote／status、Goal／MVP／Roadmap／Current State、Frontdoor、Registry、Relay、Main登録、既存テストを確認。Registryは`ollama-local`をProposal／Critic対応と宣言する一方、Main登録はProposalのみである差分を特定。 |
| 2026-08-14 | Project Owner | `設計OK`。本Taskの実装開始を承認。 |
| 2026-08-14 | Codex | `ConversationAdapter.supportedRoles`と`adapterSupportsRole`を追加。`ExternalConversationAdapter`を単一role互換のまま複数role対応へ拡張し、request roleをResult／external-call Ledgerへ記録するよう修正。Relayは実Turn roleでPlan／Dispatch／preflightを判定し、Electron Mainの`ollama-local`をProposal／Critic両対応で登録。 |
| 2026-08-14 | Codex | 注入Transportテストを追加。同一Ollama AdapterのCritic単独Dispatch、Frontdoor Proposal → Critic依存2 Node、Prepare時Critic登録、Main相当登録、既存自動Routing／Fake／Anthropic経路を確認。 |
| 2026-08-14 | Codex | 初回全体テストで既存単一role外部Mockのpost-send preflight互換性差分を検出。複数role Adapterだけ次roleを使い、単一role Adapterは従来roleを使うよう修正。再実行で317/317 Pass。 |
| 2026-08-14 | Codex | Architecture／Safety／Verificationの読み取り専用サブエージェントレビューを実施。preflightのrole不一致表示、multi-role Ledger直接検証、Frontdoor束縛証跡の不足を指摘された。Owner identity認証のP1は既存Owner Gate契約のScope外として受け入れず、残存リスクへ分類。 |
| 2026-08-14 | Codex | レビュー指摘を修正。preflightは次Dispatch roleに未対応なら実Dispatchと同じくfail-closed。未対応role拒否、単一role preflight拒否、Critic external-call Ledger role、Result／Job／Thread／Evidence／Frontdoor Event Ledger束縛のテストを追加。 |
| 2026-08-14 | Codex | Node/Web/CLI typecheck、Vitest **319/319（26 files）**、`electron-vite build`、`git diff --check`をPass。実Ollama送信は0件。 |
| 2026-08-14 | Project Owner | `done`。最終Diff・検証結果・残存リスクを確認し、本Taskの完了を承認。 |

## 9. Current status

`Done`。実装・自動検証・Architecture／Safety／Verificationレビュー対応とProject Ownerの最終Diffレビュー・完了承認まで完了。実Ollama送信は行っていない。

## 10. Review findings and residual risk

- **解消済み**：単一role Adapterで次roleをProposalへフォールバックしていたpreflight表示を廃止し、次Dispatch roleの未対応をfail-closedに統一。
- **解消済み**：multi-role Adapterの未対応role拒否、Criticの`external-calls.jsonl` role、Result／Job／Thread／Evidence／Frontdoor Event Ledgerの束縛をテストで明示。
- **既存Scope外の残存リスク**：`approvedBy`は現在、空でない文字列として検証される。Owner identityの認証・認可を追加するには既存Owner Gate契約を変更する別Taskが必要であり、本Taskでは変更しない。
- **既存設計上の境界**：Frontdoor Orchestratorがdependency ResultのRun／Node／Job／input／hashを検証する。Relayの汎用`dependencyResults`引数を外部IPCへ公開する変更は行っていない。

## ADF Execution Summary

```json
{
  "taskId": "ADF-OLLAMA-ROLE-COMPLETE-ADAPTER-001",
  "objective": "ollama-localのRegistry上のProposal／Critic対応と実Relay／Main登録を一致させ、Frontdoorの2 Node実行契約を固定する",
  "scope": {
    "inScope": ["multi-role ConversationAdapter contract", "Ollama Main registration", "Frontdoor proposal-to-critic injected verification", "negative and regression tests"],
    "outOfScope": ["real Ollama send", "Anthropic send", "Claude CLI", "Work Plane", "dynamic routing", "auto approval", "new dependencies", "canonical writes"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "approvedAt": "2026-08-14", "externalSend": false, "newDependencies": false },
  "verification": { "status": "done", "tests": "319/319 passed", "typecheck": "node/web/cli passed", "electronBuild": "passed", "diffCheck": "passed", "independentReview": "architecture/safety/verification completed; findings addressed", "ownerReview": "approved", "realOllama": "not run" }
}
```
