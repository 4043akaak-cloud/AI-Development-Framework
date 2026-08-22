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

### North Star Goal Alignment Monitor Record

- 2026-08-21: Project Ownerが監視設計を承認し、読み取り専用のGoal Alignment Monitorを追加した。
- 判定層 `src/main/frontdoor/goalAlignment.ts` は、North Starの現在地点、Ledgerから導出した期待Owner Gate、Run投影Gate、完了済みFlow、次に解放されるFlow、Request／Plan／Aggregate／Node Evidence bindingを比較する。
- `FrontdoorInspection.goalAlignment`へ判定結果を付加し、Electron `FrontdoorPanel`、Frontdoor CLI Inspect、`adf_frontdoor` MCP Inspectから同じ判定を参照できる。監視はOwner Decisionを作成せず、Runtime／Canonical repo／Obsidianへ書き込まない。
- Cycle 2 Run `run-47d82f0b99ebfb5f4cac`で、Intake Decision `owner-decision-7a44cac57818e255a6e9`とDecomposition Decision `owner-decision-e8dbf6c6071f4e3235c0`がLedgerに存在する一方、保存Runの`ownerGate`が`awaiting-owner:intake`のまま残る状態を、次のように検知した。
  - status: `drift`
  - currentStep: `plan`
  - expectedOwnerGate: `completion-shape`
  - actualOwnerGate: `intake`
  - signal: `owner-gate-projection-stale`
- このMonitorは不整合を表示するが、自動修復・承認再記録・Dispatchは行わない。Owner Gate投影をLedger Replayと一致させる修正は、別設計・別承認の後続Taskとする。
- 検証: Goal Alignment対象19 tests、全Vitest 394/394、Node／Web／CLI typecheck、Electron build、`git diff --check`がPass。既存の未コミットLive Board／MCP Cursor差分は変更していない。

### Cycle 2 Approval / Packet Record

- Completion Shape `approve`: `owner-decision-a75bd51ae30b35be0715`。target hash `0de456c1682906b07dd9ce6a5543c502de23a08d62d50767cb492a64b7b435e4`。
- Cycle 2 Proposal Packet: `adf-2cycle-20260821-cycle2::proposal`、Packet hash `b395926dd84e16e3688454a13efaedfd0c8f7b6572ef8075d5ad32312d583780`、Fake Adapter `fake-ai-a`、local-only。
- Cycle 2 Critic Packet: `adf-2cycle-20260821-cycle2::critic`、Packet hash `35c450354bfc1ab03a3464741c683a0ce74d79a651e6ba9b0ea2ac39ee5a9a44`、Fake Adapter `fake-ai-b`、local-only。
- 両PacketはRun `run-47d82f0b99ebfb5f4cac`、Request hash `4bc4cc4d9fa3394980431b55a8f18935d66a8820be8e358ccc00161ea839c466`、Plan hash `db661342a5dac4657c51f243ef28f82433bfbdc50391e4a2d9261632df79630e`、各Nodeへ束縛し、既存Packetを上書きしていない。
- Packet-bound Dispatch `dispatch`: `owner-decision-547c7f05b1676ce74ae5`、target hash `8aadff93e978d2cbd7b8b40d57c6b93f57c9a75e80daae5d6c42e85cd92cdd2e`。Proposal／CriticのNode approvalとPacket hashをLedgerで確認した。
- 現在はNode実行前。Job／Thread／Result／EvidenceはCycle 2では未生成。実Dispatchは別のOwner指示を受けるまで実行しない。
- Goal Alignment Monitorは、Dispatch承認後の現在地点を`ai-execution`、状態を`drift`とし、期待される実行開始に対してRun投影`intake`が古いことを検知している。

### Projection / Replay / Dispatch Boundary Repair Record

- 2026-08-22: Project Ownerが再設計を承認し、Ledger ReplayをOwner Gateの意味上の正本、`run.json`を再構築可能なProjection Cacheとして扱う実装へ変更した。
- `readProjectedRun`は、Ledger Replayとの差分がOwner Gateだけの場合に限ってRuntimeの`run.json`／bundle manifestを再構築する。Node／Result／State／binding差分は`Frontdoor event replay/projection integrity`としてfail-closedにする。
- Owner DecisionのReplayは、Intake → Completion Shape → Decomposition → Dispatchの承認済み最長地点を決定論的に導出する。既存Ledgerの承認記録順序は変更せず、既存のCycle 2記録も再生可能にした。
- Dispatch target hashへ選択Nodeの実行状態、Result hash、Child input hash、Packet hashを含め、`approval-bound`をDispatch Decision ID／target hashへ束縛した。Node Review後は実行コンテキストが変わるため、旧Dispatch承認を再利用せず、再度の明示Dispatch承認を要求する。
- 検証: 全Vitest `395/395`、Node／Web／CLI typecheck、Electron build、`git diff --check`がPass。Cycle 2 Run `run-47d82f0b99ebfb5f4cac`をLedgerから再読込し、`Goal Alignment = aligned`、`currentStep = dispatch`、`expectedOwnerGate = dispatch`、`actualOwnerGate = dispatch`、eventCount `8`を確認した。
- 現在は、承認済みPacketの実Dispatch前で停止している。Cycle 2のJob／Thread／Result／Evidence／Aggregateは未生成であり、実Node実行には別の明示的Owner指示が必要である。外部送信、資格情報、課金、Canonical repo／Obsidian書込みは行っていない。
- 実装後Safety/Critic読み取りレビュー: P0なし。残存P1は、Cycle 2の実行証跡未生成、Runtime投影修復を読み取り境界で行う設計、下位Fake向けLegacy非Packet-bound経路、Owner identity／期限管理の強化余地、既存dirty差分との最終Diff分離である。現Cycle 2のMCP経路はPacket-bound・local-onlyを強制している。

### Cycle 2 Packet Scope Repair Record

- 2026-08-22: 実DispatchのPreflightで、Proposal／Critic Packetの`outOfScope`にPlan側に存在しない`merge`が含まれ、厳密なscope一致検証により停止した。Job／Thread／Result／Evidenceは生成されていない。
- Project Ownerの修正設計承認後、fail-closedの完全一致検証は維持し、現在のPlan scopeから`merge`だけを除いたReplacement PacketをRuntimeへ配置した。各Packetの`scopeHash`と`approval.scopeHash`の自己整合を確認した。
- 修正後Packet hash: Proposal `512788d1c5c88759d718be413e56628c3efcb7c9650ced95b23613cc9844dfbb`、Critic `83184b5304268230e770ed2b286d2375905271a3ef348557cff779c06a30b03d`。
- 修正後のPacket-bound Dispatch target hashは`173ff0b4d2bcf35d686dcf954e0edf0bcab12673b82c0b03f66ebd6bd0ab41d7`。旧target hashのDispatch承認は再利用せず、現在Packetに対するOwner再承認待ちである。
- 修正前Packetは`approved-tasks/*::scope-mismatch-original.json`として保存し、旧Ledger上のDecision／Node approvalとの再現性を保持した。現在はNode未実行、外部送信・Canonical書込み・commit・pushなし。
- 2026-08-22: Replacement Packetに対するOwner再承認を記録。Decision `owner-decision-03fd752a890a087a9f46`、target hash `173ff0b4d2bcf35d686dcf954e0edf0bcab12673b82c0b03f66ebd6bd0ab41d7`。
- 同target hashへ`frontdoor.approval-bound`を記録し、Proposal Nodeだけを実Dispatchした。Criticは依存Nodeとしてqueuedのまま保持した。
- Proposal Job `job-c6bcbd38e4f96ce6`、Thread `thread-cf32d92a2a4d1a61`、Result ref `threads/thread-cf32d92a2a4d1a61/results/turn-0-83437ab50eaf.json`、Result hash `e6aefcf8fc44e97187293dcf66724054c076cb73f03aed443bbbba73ff32dd1c`、Evidence hash `de0f51fdbf998097859ff853d4b9825eab15521b843ce6a310623f142c673931`を確認した。Result verificationは`scope-boundary: pass`、riskなし。
- 現在のRunは`awaiting-owner:node-review`、Goal Alignmentは`awaiting-owner / node-review`。Aggregateは未生成で、Critic実行にはProposal ResultをOwnerが確認し、Node Review `continue`を明示する必要がある。
- 2026-08-22: Proposal Node Review `continue`を記録。Decision `owner-decision-11e87f884c63657dc5f2`、target hash `7c7e920693dc9815ab324e4b8a0bed5ee24fcf756756f088fa0159952176e1b1`。Proposal Result／Evidenceを承認し、Criticへの依存継続を許可した。
- Node Review後は実行コンテキストが変化したため、Runは`ready-for-approval / awaiting-owner:dispatch`へ戻った。Criticを起動する新Dispatch target hashは`71133bcbf35e5376aac3943619b947021cd57ddf4ab9aba8d6e4914192e706fa`であり、Critic実行前の再Dispatch承認待ちである。
- 2026-08-22: Critic DispatchをOwner承認。Decision `owner-decision-f457f862c56aee508b4f`、target hash `71133bcbf35e5376aac3943619b947021cd57ddf4ab9aba8d6e4914192e706fa`。Proposalは再実行せず、Critic Nodeだけを実行した。
- Critic Job `job-8bf3cc25e7b6aad6`、Thread `thread-b823a20cc5203bc2`、Result ref `threads/thread-b823a20cc5203bc2/results/turn-0-ab8650b8ecba.json`、Result hash `47470e4a021a2e9ec4684c8545639d420df0c51b5170281f511017cf4d0436e2`、Evidence hash `7058fd90af4110aec7500b6e00180c1c4c072247e0cdfc87f1937a04de238545`を確認した。`prior-turn-reference: pass`で、Proposal Result hash `e6aefcf8fc44e97187293dcf66724054c076cb73f03aed443bbbba73ff32dd1c`への依存bindingを確認した。
- Aggregate `aggregate-a6208748ddb02c47fa8d`、Aggregate hash `a1ba6d47d6f025af81a9f872ed717482782863f298abf7f6be4799f8adbdbe80`を生成。両Node success、failed／partial／openQuestions／conflictsなし。Runは`awaiting-owner:result-review`で、Result Review前に停止している。
- 2026-08-22: Cycle 2 Aggregate／EvidenceのResult Review `accept`を記録。Decision `owner-decision-4500a45e453883f1a30d`、target hash `9bd5559219dfc5ffbde4654eb00be130686f636cff8740e02ace1976433f871a`、有効期限は1時間。Runは`awaiting-owner:completion`へ進み、Completion最終承認前で停止している。
- 2026-08-22: Cycle 2 Completion承認を記録。Decision `owner-decision-125bfbe109c685778dab`、target hashはResult Reviewと同じ`9bd5559219dfc5ffbde4654eb00be130686f636cff8740e02ace1976433f871a`。Run `run-47d82f0b99ebfb5f4cac`は`complete / completed`、Goal Alignmentは`aligned / completed`となり、次のRequestが解放された。

## 11. Handover

実行後に、CycleごとのRequest／Plan／Run／Node／Job／Thread／Result／Evidence／Decision ID、hash、Ledger Replay、Owner Gate、画面確認、未検証事項、残存リスク、次の安全なTaskを追記する。

### 2026-08-22 Accepted Candidateから次Requestへの完了記録

Cycle 2の承認済みAggregateから生成したCandidateを根拠に、同じFrontdoor入口から次Requestを作成し、Owner Gateを通過させ、local-only Proposalを実行してCompletionまで記録した。これはRuntime Runの完了記録であり、本Task全体を自動的に`Done`へ変更するものではない。

- Source Candidate: `artifact-423713c100377ab3a330`
- Candidate hash: `36c9c09fcf97c86affab2823bcc6fe8165a26dde0fae19af182f72ac41aa29ff`
- Candidate Review Decision: `owner-decision-64e90df43f3e6f0c624a`
- Candidate binding hash: `623d8eee80ff7e3b50e22a859d0749799aef200cffca669230bddac9973c4f6b`
- Next Request: `next-request-from-candidate-20260822-001`
- Run: `run-7bfbb7d37731444a756f`
- Request hash: `07b2f466fff5e0f1a2e591a2a866929c1f2ebeeeefcf821bb2c7cc8901a8e757`
- Plan hash: `42eaa8b870cf85f04c6c336c51a57d92ed793a4da91ca628d54ba1725baacaab`
- Owner Decisions: Intake `owner-decision-31541f26b15b0a359603`、Completion Shape `owner-decision-edaa5148529da0fd1b32`、Decomposition `owner-decision-e2f098811ec518e328ab`
- Final Packet-bound Dispatch Decision: `owner-decision-9464a28926168b31429f`、target hash `adb0f681d57914886bda208fc52b5275fc02e9414a4b6949a9c78bf08c698eda`
- Final Packet hash: `49ba178b17fedb555903e2a90875b99fd29531c4bcee171c46f76f107306c139`
- Executed Node: `proposal` / Fake Adapter `fake-ai-a` / local-only / `success`
- Job: `job-5c008e2c9e6f64b4`
- Thread: `thread-0d9b871ed1c96518`
- Result ref: `threads/thread-0d9b871ed1c96518/results/turn-0-91604e497b30.json`
- Result hash: `ccdc823456476fe22539b85812cc5432d78902eb2edd4ebfbc8f2311410d6bbc`
- Evidence hash: `005058e75b87cdb3852d2c9b4d4309f3e74339baf0dd0d8565d945b9e64fd392`
- Aggregate ref: `frontdoor-runs/run-7bfbb7d37731444a756f/aggregate.json`
- Aggregate hash: `14a94b428a71d698639b58583c89512d4be4d9f69d180024e45bdc6a2ce40cee`
- Result Review Decision: `owner-decision-758b66396655bac9e8e5`、`accept`
- Completion Decision: `owner-decision-495b03d70e2daf11255d`
- Final Runtime state: `complete` / Owner Gate `completed` / Goal Alignment `completed`

#### 検出した不整合と修正

初回PacketはContextが親Requestの許可範囲を超えていたため、Dispatch前検証でfail-closedとなった。Job／Thread／Result／Evidenceは生成されていない。初回Packetは`scope-mismatch`証跡として保持し、親RequestのContext参照だけに一致する修正版Packetを作成し、Packet hashへ再束縛してOwner再承認後にDispatchした。

この結果、承認前の実行、古いPacket hashの再利用、親Contextを超えた参照は許可されなかった。外部送信、資格情報、課金、Canonical GitHub／ObsidianへのRuntime自動書込みは発生していない。

#### GitHub記録と検証

- Live Artifact閲覧とGoal Alignment表示の実装・Task・テストをcommit `28eeffe`（`feat(adf): expose verified live artifacts and goal alignment`）へ記録し、`origin/codex/adf-mcp-frontdoor-2cycle-e2e`へpush済み。
- 全Vitest `398/398`、Node／Web typecheck、対象Live Artifact／IPCテスト `49/49`、`git diff --check`をPassした。
- 既存のFrontdoor Runtime Ledgerは、sequence `0`〜`18`、Run／Request／Plan／Decision／Result／Evidence bindingを保持している。

#### 未完了・次の安全なTask

- このTaskの受入条件のうち、窓口AIの実画面での同一入口操作、実MCP Client設定、複数Provider、外部送信、Canonical統合は未完了または未検証である。
- 次は、窓口AIがこの完了RunのResult／Evidenceへ到達し、Ownerの次指示を同じMCP入口へ投入する実画面確認を、別の明示的なVerification範囲として行う。
