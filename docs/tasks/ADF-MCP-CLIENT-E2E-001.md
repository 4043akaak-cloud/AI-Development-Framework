# Task — ADF-MCP-CLIENT-E2E-001: Local MCP Client E2E

> Type: Implementation + Verification
> Status: Verifying
> Owner: Codex
> Related: [ADF-MCP-001](ADF-MCP-001.md) / [ADF-FRONTDOOR-NODE-REVIEW-GATE-001](ADF-FRONTDOOR-NODE-REVIEW-GATE-001.md)

## 1. Objective

既存のlocal stdio MCP Serverへ、実際の子プロセスとして接続する最小MCP Clientを追加し、MCP入口からFrontdoorへRequestを投入し、Owner承認後だけFake AdapterのResultをMCP経由で取得できることを実証する。

窓口AIへの接続設定そのものではなく、窓口AIが利用するClient側のstdio JSON-RPC契約と、ADFのOwner Gate・Packet・Ledgerを跨ぐ実接続境界を検証するTaskである。

## 2. Scope

### In scope

- 依存追加なしのstdio JSON-RPC Client。
- `initialize`、`tools/list`、`tools/call`のRequest送信とResponse照合。
- JSON行の分割、JSON-RPC形式検証、未知Response ID拒否、stdout非JSON拒否、stderr分離。
- Request timeout、子プロセス異常終了、Client close時のfail-closed終了処理。
- `mcp-client-probe` CLIによるprepare／inspect／listの実プロセス接続確認。
- テスト側の明示Owner harnessでGateを承認したFake Runについて、Clientからdispatch／get_resultするE2E。
- Task正本、CURRENT_STATE、Obsidianマイルストーンの更新。

### Out of scope

- Codex／Claude等の窓口AIへのMCP設定登録・設定ファイル変更。
- MCPからのOwner Decision、Result Review、Completion、Packet作成・上書き。
- 実Ollama／Anthropic／Claude Code CLI送信、APIキー、OAuth、課金。
- Work Plane、repo／worktree、GitHub／Obsidian正本への書込み。
- HTTP／TCP／LAN公開、任意runtime root、公式MCP SDKや新規依存の導入。

## 3. Design contract

```text
MCP Client process
  └─ stdio JSON-RPC
       └─ ADF MCP Server (fixed runtime root)
            ├─ prepare / inspect / list / get_result: allowed by existing service contract
            └─ dispatch_approved: existing Owner Dispatch Decision + Packet hash required

Owner UI／CLI／test harness
  └─ Intake／Completion Shape／Decomposition／Dispatch Decision
```

- ClientはOwner承認を作らず、MCP ServerもOwner承認を作らない。
- ClientはMCP ServerのstdoutをJSON-RPC専用として扱い、非JSON出力を回答として解釈しない。
- stderrは診断情報として分離し、stdoutプロトコルへ混入させない。
- `dispatch_approved`は、MCP Server側のPacket-bound検証へ委譲する。
- 実プロセスE2EはFake Adapter・一時runtime rootに限定する。

## 4. Acceptance criteria

- [x] 実MCP Server子プロセスへのstdio接続で`initialize`と`tools/list`が成立する。
- [x] Client経由の`prepare`がIntake待ちRunを作成し、Owner Decision／Thread／Jobを自動生成しない。
- [x] Owner承認前のClient dispatchが拒否される。
- [x] テスト側Owner harnessで4 GateとPacketを準備した後だけ、Client dispatchがFake Adapterを実行する。
- [x] Client経由の`inspect`／`get_result`／`list_runs`でRun、Result、Evidence参照を取得できる。
- [x] stdout非JSON、JSON-RPC不正、応答timeout、子プロセス終了をfail-closedで扱う。
- [x] 外部送信、APIキー、Work Plane／正本書込み、MCP自動承認、TCP／HTTP listenerが発生しない。
- [x] 既存Frontdoor／Owner Gate／Fake経路とMCP Serverの回帰がない。
- [x] Node/Web/CLI typecheck、Vitest、Electron build、compiled CLI probe、`git diff --check`がPassする。

## 5. Implementation log

2026-08-14、Project Ownerの「設計OK。実装して下さい」を受け、承認済みScope内で実装した。

- `src/cli/frontdoorMcpClient.ts`を追加。子プロセスstdioのJSON-RPC Client、Request ID管理、Response検証、timeout、stderr分離、異常終了処理、close処理を実装した。
- MCP Server子プロセスへ渡す環境変数は`PATH`／`HOME`／一時ディレクトリ・locale／`ELECTRON_RUN_AS_NODE`のallowlistに限定し、APIキー等の全環境継承を行わない。
- `src/cli/frontdoorMcpClientProbe.ts`を追加。コンパイル済みADF MCP Serverへ実接続し、`initialize`／`tools/list`／`prepare`／`inspect`／`list_runs`を一周する`mcp-client-probe`を実装した。
- `src/cli/bin.ts`へ`mcp-client-probe`分岐を追加し、CLIのCommonJSビルドへ新Clientを含めた。
- `tests/frontdoorMcpClient.test.ts`を追加。実Electron Node子プロセスで、Owner承認前拒否→テスト側Owner Gate／Packet準備→Fake dispatch→Result取得を一周した。
- 同テストでstdout非JSONと応答timeoutのfail-closedを固定した。
- 子プロセス環境のallowlistもテストで固定した。
- MCP Server、Frontdoor Orchestrator、Owner Gate、Adapter Registry、Renderer、IPC、Provider認証、実Ollama経路は変更していない。

## 6. Verification log

- 対象テスト：**4/4 Pass**（実プロセスRoundtrip、stdout非JSON拒否、timeout／終了処理、子プロセス環境allowlist）。
- 全Vitest：**343/343 Pass（29 files）**。
- `tsc --noEmit -p tsconfig.node.json`：Pass。
- `tsc --noEmit -p tsconfig.web.json`：Pass。
- `tsc -p tsconfig.cli.json`：Pass。
- `electron-vite build`：Pass（Main 214.42 kB / Preload 2.65 kB / Renderer 582.62 kB）。
- compiled CLI `mcp-client-probe`：Pass。実MCP子プロセスで5 Tool列挙、prepare／inspect／listを確認。stderrは空、DispatchはOwner承認外として実行していない。
- `git diff --check`：Pass。
- 実Ollama／Anthropic／Claude Code CLI送信、APIキー設定、窓口AIへのMCP登録、Work Plane書込み、commit／push／merge：未実施。

## 7. Remaining review and next gate

- 実装と自動検証は完了したが、Project Ownerによる最終Diff確認と完了承認が残るためStatusは`Verifying`とする。
- 本TaskのE2Eは、窓口AIアプリへの設定登録ではなく、ADF MCP ClientとMCP Serverの実プロセス接続を対象とする。
- 窓口AIの実MCP設定登録、実Ollama／実AIの送信、複数AIの実運用、Work Plane統合は別Task・別承認とする。

## ADF Execution Summary

```json
{
  "taskId": "ADF-MCP-CLIENT-E2E-001",
  "objective": "実MCP ClientからADF MCP Serverへstdio接続し、Owner Gate後のFake Frontdoor Runを往復取得する",
  "scope": {
    "inScope": ["stdio JSON-RPC client", "compiled MCP process E2E", "Owner-gated Fake roundtrip", "fail-closed protocol handling"],
    "outOfScope": ["window AI registration", "real provider send", "API keys", "Work Plane", "canonical writes", "new dependencies"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "externalSend": false, "newDependencies": false },
  "verification": { "status": "automated-pass-owner-review-pending", "tests": "343 passed / 29 files", "targetTests": "4 passed", "typecheck": "node web cli pass", "electronBuild": "pass", "compiledClientProbe": "pass", "diffCheck": "pass" }
}
```
