# ADF-MCP-FRONTDOOR-2CYCLE-E2E-001

Status: Implementing
Owner: Codex
Type: Integration + E2E Verification

## 1. Objective

窓口AIが、既存の `adf_frontdoor` local stdio MCP入口を離れずに、Owner Gateを経由して複数AI Nodeへ依頼し、統合Resultを受け取り、同じ入口から第2のRequestを投入できることを、ローカル限定で2Cycle実証する。

## 2. Final Flow Contribution

Owner → 窓口AI → ADF → 複数AI参加者 → 統合回答 → 次の指示、のうち、窓口AIとADFの接続から、複数AIのResult取得、統合、次のRequestまでを連続して接続する。

## 3. Vertical Slice Outcome

窓口AIが次の2Cycleを同じMCP入口で実行できる。

```text
Cycle 1: Request → Prepare → Owner Gate → Proposal/Critic → Result/Evidence → 統合回答
Cycle 2: 次のRequest → Prepare → Owner Gate → 複数Node → Result/Evidence
```

最初の実証はFake Adapter・local-onlyに限定する。実Ollama、実外部Provider、APIキー、課金、外部送信は行わない。

## 4. Required Context

### GitHub

- `AGENTS.md`
- `docs/project/ADF_PRODUCT_COMPLETION_BLUEPRINT.md`
- `docs/project/CURRENT_STATE.md`
- `docs/workflow/AI_DELEGATION_CHARTER.md`
- `docs/workflow/TASK_LIFECYCLE.md`
- `docs/tasks/ADF-MCP-001.md`
- `docs/tasks/ADF-MCP-CLIENT-E2E-001.md`
- `docs/tasks/ADF-MCP-FRONTDOOR-CONNECTION-001.md`
- `docs/tasks/ADF-FRONTDOOR-NODE-REVIEW-GATE-001.md`
- `docs/tasks/ADF-MULTI-PARTICIPANT-COLLABORATION-001.md`

### Obsidian

- `40_ADF_最重要原則_新Chat開始時必読_2026-08-19.md`
- `41_ADF_サブエージェント引き継ぎ台帳_2026-08-19.md`
- `42_ADF_メールサービス接続計画_2026-08-20.md`
- `43_ADF_Current_Context_Next_Phase_Handoff_2026-08-20.md`

## 5. Scope

### In scope

- 既存 `adf_frontdoor` MCP入口の読み取り専用Preflight。
- `initialize`、`tools/list`、`list_runs`、`prepare`、`inspect`、`get_context_capsule`、`get_result`の確認。
- Cycle 1のRequest／Plan／Owner Gate／Fake Proposal／Fake Critic／Result／Evidence取得。
- 窓口AIによるCycle 1結果の統合と、Cycle 2 Requestの同一入口投入。
- Cycle 2のOwner Gate、複数Node、Result／Evidence／Ledger確認。
- Request／Plan／Run／Node／Job／Thread／Result／Evidence／Decisionの識別とhash照合。
- Ledger Replay、旧Evidence非変更、Owner Gate迂回拒否の確認。
- 実行結果、Runtime ID、hash、未検証事項、停止条件を本Taskへ記録する。

### Out of scope

- 実Ollamaの新規送信、Anthropic／Claude Code CLI等の実外部Provider送信。
- APIキー、OAuth、課金、モデルpull、外部通信。
- メールProvider、SNS、YouTube、Stripeの接続。
- Candidate Review、Canonical repo／Obsidianへの自動書込み。
- 自動承認、自動質問回答、自動Completion、自動Retry。
- 新規MCP Server、MCP Client、Toolの重複実装。
- UI polish、動的Routing、Token／費用／品質メトリクス。
- commit、push、merge、公開。

## 6. Design Contract

```text
Window AI
  └─ existing adf_frontdoor MCP
       ├─ prepare / inspect / list_runs / get_result: bounded read or preparation
       └─ dispatch_approved: existing Packet-bound Owner Decision only
            └─ Frontdoor Service
                 └─ Fake Proposal → Owner node-review → Fake Critic
```

- MCPはOwner Decisionを作成しない。
- `dispatch_approved`は既存のPacket-bound DecisionとPlan／Node hash検証へ委譲する。
- Node ReviewではProposal Result／EvidenceをOwnerへ提示し、`continue`後だけCriticを実行する。
- Result／Evidenceは同一Run、Task、Job、Thread、input／result hashへ束縛する。
- Cycle 2は新しいRequest／Plan／Run／Decisionとして記録し、Cycle 1の履歴を変更しない。
- Runtime書込みは既存の承認済みFrontdoor実行が生成する範囲に限定する。

## 7. Acceptance Criteria

- [ ] 窓口AIから同じMCP入口の `initialize` と `tools/list` が確認できる。
- [ ] `prepare` がRequest／Planを作成するが、Owner Decision／Dispatch／Job／Threadを自動生成しない。
- [ ] Cycle 1でOwnerのIntake、Completion Shape、Decomposition、Dispatch境界が確認できる。
- [ ] Cycle 1でFake Proposal／Criticの複数Nodeを実行し、Result／Evidenceを取得できる。
- [ ] Node Reviewの `continue` 前に依存Criticが実行されない。
- [ ] 窓口AIがCycle 1のResultを統合し、同じMCP入口からCycle 2のRequestを投入できる。
- [ ] Cycle 2がCycle 1と異なるRequest／Plan／Run／Decisionとして識別できる。
- [ ] Cycle 1／2のResult、Evidence、Job、Thread、Ledger bindingとhashが検証できる。
- [ ] Ledger Replayが両Cycleで成立し、旧Evidenceが変更されていない。
- [ ] Owner承認前Dispatch、古いDecision再利用、別Run Result混入がfail-closedになる。
- [ ] 外部送信、資格情報、課金、Canonical repo／Obsidian書込みが発生しない。
- [ ] 自動検証、手動／実画面確認、未実施確認を分けて記録する。

## 8. Verification Plan

1. Git root、branch、remote、既存差分を再確認する。
2. MCP入口の読み取り専用Preflightを実施する。
3. Fake Adapter限定でCycle 1を実行する。
4. Result／Evidence／Context CapsuleをMCPから取得し、窓口AIの統合結果を記録する。
5. 同じMCP入口からCycle 2を実行する。
6. Runtime fresh read、Ledger Replay、binding、hash、旧Evidence非変更を確認する。
7. Owner Gate・Safety・Verificationの役割を分けた読み取りレビューを行う。
8. Electron／窓口AIの実画面で、Tool入口、Owner待ち、Result取得、次Request投入を確認する。
9. Task、Current State、必要なObsidian handoverへ結果を記録する。

## 9. Stop Conditions

- Owner Gateを迂回する経路が必要になった場合。
- 外部送信、資格情報、課金、外部API、新規依存が必要になった場合。
- Runtime Ledgerのsequence、hash、binding、Replayに不整合がある場合。
- Cycle 1とCycle 2のRequest／Run／Decisionが混線する場合。
- 既存の未コミット差分を安全に分離できない場合。
- 同じ原因の検証失敗が2回連続、または異なる原因の失敗が3回続いた場合。

## 10. Initial Execution Record

- 2026-08-21: Project Ownerが設計を承認し、Task実行を開始。
- 既存GitHub差分は既存作業として保持する。
- 新規MCP Server／Client、APIキー、外部送信、commit／pushは行わない。

### Phase 0.5 / Cycle 1 Intake Preflight

- `adf_frontdoor` MCPの読み取り入口を確認した。`list_runs`は空配列を返し、既存Runはなかった。
- Cycle 1の `prepare` を実行し、Run `run-7987794137baa1041b91` を作成した。
- Request hash: `be857d9eb352ee8d70cf2c9e3e5a2498b4f0551e01152ee1507007ddf20c6a9b`
- Plan hash: `4833fc22db5d2d0bf91b7ce0e99b459b930f89cc7c28d4f5d03a2b36c1fcb257`
- `inspect` と deterministic Context Capsule取得がPassした。eventCountは2、Owner Decisionは0件、Node／Job／Thread／Result／Evidenceは未実行・未生成。
- 現在状態は `ready-for-approval` / `awaiting-owner:intake`。設計承認だけではRunのIntake／Decomposition／Dispatch承認を代行しないため、ここで停止している。
- 入力検証で、`source: codex-window-ai` は拒否され、既存契約の `source: codex` で再実行した。また子NodeのcontextReferencesを親Requestへ一致させる必要があった。これはコード変更なしで入力を修正した。
- 観測上、MCP呼び出しは初回起動時に遅延した（`list_runs`約312秒、成功した`prepare`約161秒、`inspect`約32秒、Context Capsule約112秒）。外部送信ではないが、速度ボトルネックとして記録する。

### Owner Decision Record

- Intake `proceed`: `owner-decision-b2263363aadcf6eb6141`、target hashはRequest hashと一致。
- Decomposition `approve-selected`: `owner-decision-efaa6b532ae826c98694`、target hashはPlan hashと一致。
- Completion Shape `approve`: `owner-decision-ade704679a4347be3704`、target hashはCompletion Shape target hashと一致。
- いずれも `approvedBy: Project Owner` としてLedgerへ記録済み。
- Dispatch、Node実行は未承認・未実施。MCPのPacket-bound Dispatchには `approved-tasks/<childTaskId>.json` が必要だが、現RuntimeにはPacketが存在しないため、自動生成せず停止している。
- `inspect` は3件のOwner Decisionを列挙する一方、保存Runの `ownerGate`／`nextAction` を `awaiting-owner:intake` と表示している。Ledger上の承認証跡は正しいが、Owner向け状態投影が古い残存リスクとして記録する。

### Packet / Dispatch / Node Review Record

- Fake Proposal Packet hash: `c13b4220976e3a0c2b804c7e46a311c10634b252b6c057258cb0586651bb0736`
- Fake Critic Packet hash: `ba7ff1a5ba5264593a7a9700ff4b4e86ca378449b4244c6a85f33176eeb2871e`
- 初回PacketはContext参照が親Requestを超えていたため、Dispatch前検証で拒否された。Job／Thread／Resultは生成されず、Packetを親Request Context内へ修正した。
- 修正後のPacket-bound Dispatch Decision: `owner-decision-ffd6b092efe69e046676`、target hash `8752bf589deae9a0617f87bced70e79a152ba15fbd9398ebaf98b8e89d6f4943`。
- Proposal Node実行：成功。Job `job-a833ec013e0624e8`、Thread `thread-9e3c20695561eabb`、Result ref `threads/thread-9e3c20695561eabb/results/turn-0-d7ccad549e7f.json`、Result hash `9f3c4c9278d2d7f9ad853a37f035a34ec72a6f48c2e3756421baaa5daaa05ad2`。
- Proposal verificationは `scope-boundary: pass`、riskなし。Criticは未実行で、現在は`awaiting-owner:node-review`。
- Criticを実行するには、Proposal Resultのtarget hash `34bc4afcc2cdec00aa31e819ef421c6acd6f6a385beb67e3a1f9a112f9b5187c`へ束縛したNode Review `continue` Decisionが必要。

### Cycle 1 Node Review / Aggregate Record

- Proposal Node Review `continue`: `owner-decision-58331a04d2582e097b3d`。target hashはProposal Node Review target hashと一致。
- Critic Node実行：成功。Job `job-87c4bc441d158dab`、Thread `thread-ced6e9440e723bd5`、Result ref `threads/thread-ced6e9440e723bd5/results/turn-0-86d1d6a53601.json`、Result hash `b32417885f0e306e952206a196e3fbc1d06f468fbd7bd9029c897ce903f51092`。
- Critic verificationは `prior-turn-reference: pass`。Proposal Result hash `9f3c4c9278d2d7f9ad853a37f035a34ec72a6f48c2e3756421baaa5daaa05ad2`への依存bindingを確認した。
- Aggregate `aggregate-b856fc8ab9ee53edb7de` を生成。Aggregate hash `75d6da119e9e260424a02d5f14d3bb0ce85503879d8558a97ad22372d0792323`。
- Cycle 1は `awaiting-owner:result-review`。Proposal／Criticともsuccess、failed／partial／openQuestions／conflictsなし。
- Result Review、Completion、Cycle 2 Requestは未実施。Result ReviewのOwner Decision後にのみ、次のRequestへ進む。

## 11. Handover

実行後に、CycleごとのRequest／Plan／Run／Node／Job／Thread／Result／Evidence／Decision ID、hash、Ledger Replay、Owner Gate、画面確認、未検証事項、残存リスク、次の安全なTaskを追記する。
