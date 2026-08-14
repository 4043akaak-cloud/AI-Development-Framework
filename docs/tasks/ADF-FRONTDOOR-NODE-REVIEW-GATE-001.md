# Task — ADF-FRONTDOOR-NODE-REVIEW-GATE-001: Node Result Review Gate

> Type: Design + Implementation
> Status: Verifying
> Owner: Codex
> Review: Project Owner + automated architecture/safety/regression verification
> Related: [ADF-FRONTDOOR-OWNER-GATE-001](ADF-FRONTDOOR-OWNER-GATE-001.md) / [ADF-FRONTDOOR-UI-IPC-001](ADF-FRONTDOOR-UI-IPC-001.md) / [ADF-FRONTDOOR-CLI-OWNER-LOOP-001](ADF-FRONTDOOR-CLI-OWNER-LOOP-001.md)

## 1. Objective

Frontdoorの複数Node実行を、Proposal完了からCritic完了まで自動的に走らせず、各NodeのResult／EvidenceをOwnerが確認してから次のNodeへ進める。Ownerが継続または停止を選べる実行境界を、Orchestrator、Event Ledger、CLI、Electron IPC／Rendererで共有する。

## 2. Scope

### In scope

- `node-review` Owner Gateと、`continue`／`stop` Decision。
- 1回のFrontdoor Dispatchで1 Nodeだけを実行するOrchestrator境界。
- Node Resultのbounded projection（status／summary／content／verification／risks／Evidence ref／次Node）。
- Node Review open／continueのhash-bound Event LedgerイベントとReplay。
- CLI `review-node --node-id <id> --decision <continue|stop>`。
- Electron Main／Preload／IPC／FrontdoorPanelでのNode Result確認と継続／停止操作。
- Fake／Ollama／既存Owner Gate／MCP observe経路の回帰確認。

### Out of scope

- token budget、実コスト計測、動的Provider選択。
- Work Plane、repo／worktree書込み、AIによるコード変更、Artifact統合。
- 自動再討論、自動承認、自動Completion、新規外部送信、実Ollama送信。
- MCPからのOwner Decision生成またはNode Review操作。

## 3. Design contract

```text
Dispatch approval
  → Node A実行（1回のDispatchで1 Node）
  → Node Result／EvidenceをLedgerへ固定
  → Owner Gate: node-review
      ├─ continue → 次のNodeを明示実行
      └─ stop     → Runをcancelledへ遷移
  → 最終Nodeのみ既存のResult Review → Completionへ
```

- `OrchestrationRun.nodeReview`は完了Node、Result hash、Evidence ref、bounded Result projection、次Node、target hashを保持する。
- `nodeReviewTargetHash`はRun／Request／Plan／Node／Result hash／次Node集合から導出する。
- 継続Decisionはtarget hashへ束縛され、改ざん・古いReview・別Nodeへの適用を拒否する。
- 継続後のDispatchでも既存Dispatch DecisionとPacket hashを再検証する。
- MCPは既存の読み取り／承認済みDispatch観測契約を維持し、Owner Decisionを生成しない。

## 4. Acceptance criteria

- [x] Proposal完了後、依存Criticを自動実行せず`awaiting-owner:node-review`で停止する。
- [x] Node Review projectionがResult／Evidence／verification／risks／次Nodeを表示する。
- [x] Ownerの`continue`後だけ次Nodeを実行し、最終Node後は既存Result Reviewへ進む。
- [x] Ownerの`stop`で依存NodeのThread／Job／送信を作らずRunを停止する。
- [x] Node Review target hash改ざん・古いNode・不正Decisionをfail-closedで拒否する。
- [x] Event Ledger replay後もNode Review状態、継続、停止が`run.json`と一致する。
- [x] CLIとElectron IPC／Rendererから同じNode Review契約を利用できる。
- [x] Fake／Ollama／MCP／既存Frontdoor Owner Gateに回帰がない。
- [x] Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。

## 5. Implementation log

2026-08-14、Project Ownerの「設計OK、実装お願いします」を受け、承認済みScope内で実装した。

- `frontdoorTypes.ts`へ`node-review` Gate、`FrontdoorNodeReview`、Ledgerイベント型を追加。
- `ownerGates.ts`へNode Review target hashと`continue`／`stop` Decisionを追加。継続後は既存Packet-bound Dispatchを再利用する。
- `orchestrator.ts`を1回のDispatch＝1 Nodeへ変更し、未完了Nodeがある場合にNode Reviewを開く。最終NodeのみAggregate／Result Reviewを生成する。
- `eventLedger.ts`へNode Review open／continueのReplay、Decision binding、停止時のprojection消去を追加。
- `frontdoorService.ts`、Main IPC、Preload、RendererへNode Review操作と表示を追加。
- CLIへ`review-node`を追加。`continue`時は指定Packetを使って次Nodeを実行し、`stop`時は実行しない。
- 既存2 NodeテストをOwner Review挿入後の期待値へ更新し、停止・改ざん拒否テストを追加。

## 6. Verification log

- Frontdoor対象テスト：30/30 Pass。
- 全Vitest：**339/339 Pass（28 files）**。
- `tsc --noEmit -p tsconfig.node.json`：Pass。
- `tsc --noEmit -p tsconfig.web.json`：Pass。
- `tsc -p tsconfig.cli.json`：Pass。
- `electron-vite build`：Pass（Main／Preload／Renderer生成）。
- `git diff --check`：Pass（Task正本同期後の最終確認）。
- 実Ollama送信、Anthropic送信、Claude Code CLI送信、APIキー設定、Work Plane書込み、commit／pushは未実施。

## 7. Remaining review

- Project Ownerによる最終Diff確認と完了承認が残るため、Statusは`Verifying`とする。
- Node Reviewを含む実Ollamaの再送信は本Taskでは行わない。既存の実Ollama証跡は変更しない。
- token budget／実コスト測定は別Taskで扱う。

## ADF Execution Summary

```json
{
  "taskId": "ADF-FRONTDOOR-NODE-REVIEW-GATE-001",
  "objective": "各Frontdoor NodeのResultをOwnerが確認してから次Nodeへ進む安全なNode Review Gateを実装する",
  "scope": {
    "inScope": ["node-review Owner Gate", "one-node dispatch boundary", "Ledger replay", "CLI", "Electron IPC and Renderer"],
    "outOfScope": ["token budget", "dynamic routing", "Work Plane", "external send", "MCP Owner Decision", "real Ollama resend"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "externalSend": false, "newDependencies": false },
  "verification": { "status": "automated-pass-owner-review-pending", "tests": "339 passed / 28 files", "typecheck": "node web cli pass", "electronBuild": "pass", "diffCheck": "pass" }
}
```
