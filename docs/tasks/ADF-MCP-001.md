# Task — ADF-MCP-001: Local Frontdoor MCP Ingress

> Type: Design
> Status: Verifying
> Owner: Codex
> Review: Project Owner + role-separated review
> Related: [ADF-FRONTDOOR-OLLAMA-TWO-NODE-E2E-001](ADF-FRONTDOOR-OLLAMA-TWO-NODE-E2E-001.md) / [ADF-FRONTDOOR-REQUEST-INTAKE-001](ADF-FRONTDOOR-REQUEST-INTAKE-001.md) / [ADF-FRONTDOOR-OWNER-GATE-001](ADF-FRONTDOOR-OWNER-GATE-001.md)

## 1. Objective

窓口AI（ChatGPT／Codexなど）からADFへ、ローカルMCP経由でFrontdoor Request／Planを投入し、Owner Gateを迂回せずに承認済みRunの状態とResultを取得できる薄い入口を設計・実装する。

最終目標のうち、今回担う範囲は次の接続である。

```text
窓口AI
  → local stdio MCP
  → ADF Frontdoor Request／Plan
  → Owner Gate（Intake／Completion Shape／Decomposition／Dispatch）
  → 既存Adapter／Run／Result／Evidence／Ledger
  → MCPで状態・Resultを返す
```

MCPは入口であり、Task／Job／Thread／Result／Event Ledgerの正本にはしない。

## 2. Goal alignment

- ADFの中心を特定Providerではなく、Frontdoor／Owner Gate／Provider-neutral Adapter契約に置く。
- 窓口AIの役割を「Request／Plan案の提示」と「Resultの受け取り」に限定する。
- Dispatch、Result採用、Completion、正本変更はProject Ownerの明示Decisionを必要とする。
- Ollama、Anthropic、Claude Code CLIのいずれかをMCPへ固定しない。

## 3. Scope

### In scope

- ローカルstdio MCPサーバーの最小プロトコル入口。
- 既存Frontdoor Service／Orchestrator／Event Ledgerを再利用するTool実装。
- MCP Tool候補：
  - `adf_frontdoor_prepare`：Request／Planを検証し、Intake Gate待ちRunを作成する。Dispatchしない。
  - `adf_frontdoor_inspect`：Run、Decision、Node、Evidence、次のOwner判断を読み取る。
  - `adf_frontdoor_dispatch_approved`：既存のPacket-bound Dispatch DecisionがあるRunだけを実行する。承認を作らない。
  - `adf_frontdoor_get_result`：完了／Result Review対象のAggregateとResult参照を、上限付きで返す。
  - `adf_frontdoor_list_runs`：固定runtime root内のRun概要を返す。
- Tool引数のschema検証、サイズ制限、エラー応答、Run／Plan／Packet hash整合の再確認。
- MCP経由でOwner Decisionを代行しない境界テスト。
- Child Packetが`approved-tasks/`へOwner承認済みとして準備されていない場合は、MCPがPacketを書き込まず`packet-not-ready`で停止する。
- Task正本、CURRENT_STATE、Obsidianマイルストーンの更新。

### Out of scope

- MCPからのOwner承認、Result採用、Completion、正本書込み。
- 自動Plan生成、動的Routing、自動モデル選定、自動Retry、無限討論。
- Work Plane、repo／worktree、GitHub／Obsidian書込み、commit／push／merge。
- APIキー設定、外部送信許可、課金設定、Provider固有認証。
- HTTP公開、LAN公開、クラウドMCP、任意のruntime root／任意ファイル読込。
- MCP接続先アプリへの自動設定変更。設定は別途Owner操作とする。

## 4. Authority and safety boundary

```text
MCP caller (untrusted request/observer)
  ├─ prepare: allowed, creates only an Intake-waiting Run
  ├─ inspect/list/result: read-only
  └─ dispatch_approved: allowed only when existing Owner Dispatch Decision + Packet hash match pass

Owner UI／CLI
  └─ Intake／Completion Shape／Decomposition／Dispatch／Result Review／Completion
```

- MCPプロセス起動時に固定したruntime rootだけを使い、Tool引数からパスを受け取らない。
- `approvedBy`、Owner identity、Decision hashをMCP callerの入力として信用しない。
- `dispatch_approved`は既存Decisionの存在を検証するだけで、Decisionを生成しない。
- `dispatch_approved`は既存Child Packetの存在も要求し、MCPが承認Packetを生成・上書きしない。
- `external-send`は既存のpreflight／credential／Owner approval境界に委譲する。
- Result本文はbounded responseとし、秘密情報・環境変数・任意Ledgerファイルを返さない。
- stdioのみを使用し、TCP listener／HTTP endpoint／LAN公開は作らない。

## 5. Protocol and implementation design

- 安定仕様の`initialize`、`tools/list`、`tools/call`に必要な最小stdio JSON-RPC境界を実装する。`tools/list`／`tools/call`は初期化省略型クライアントにも安全に応答できる。
- 既存の依存関係を増やさず、まずプロトコルfixtureでrequest／response／invalid inputを検証する。
- 公式SDKが必要と判明した場合は、新規依存追加として実装を停止し、別のOwner承認を求める。
- MCP層はAdapter／Orchestratorの判定ロジックを複製せず、既存Serviceへ委譲する。
- CLI／Electron／将来のMCP入口が同じService・Owner Gate・Ledgerを共有する。

## 6. Acceptance criteria

- [x] MCP stdio handshakeと`tools/list`が固定fixtureで成立する。
- [x] `adf_frontdoor_prepare`がRequest／Planを検証し、Intake待ちRunだけを作成する。
- [x] MCPからOwner DecisionなしにDispatch／Result採用／Completionができない。
- [x] OwnerがCLI／ElectronでGateを承認したRunに限り、`dispatch_approved`が既存Packet／hashを再検証して実行できる。
- [x] `inspect`／`list_runs`／`get_result`がRun／Node／Result／Evidence参照を返し、正本を変更しない。
- [x] 任意runtime root、任意ファイルパス、秘密情報、過大入力、未知Tool、壊れたJSON-RPCを拒否する。
- [x] TCP／HTTP listener、外部送信、APIキー設定、Work Plane書込み、自動承認が発生しない。
- [x] Fake経路、既存Ollama経路、Anthropic未送信経路、Owner Gate／Event Ledgerが回帰しない。
- [x] Node／CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。

## 7. Verification and stop conditions

- MCP protocol fixture、Tool schema、negative boundary、既存Frontdoor Service統合をテストする。
- Owner Gateを通したFake Runで、prepare→Owner approvals→dispatch_approved→inspect／get_resultを一周する。
- 実Ollama送信は本Taskの必須条件にしない。既存の実証証跡を再利用し、必要なら別の実行承認を求める。
- 同じ原因の検証失敗が2回連続、別原因の失敗が3回続いたら停止する。
- MCP clientとの実接続に新規依存、設定変更、外部送信、権限拡大が必要になったら停止し、Ownerへ確認する。

## 8. Change candidates

- `src/mcp/`または`src/cli/`のlocal stdio serverとTool handlers
- `src/main/frontdoor/frontdoorService.ts`の既存契約を再利用する薄いFacade（必要最小限）
- shared MCP input／output types
- MCP／Frontdoor integration tests、Task正本、CURRENT_STATE、Obsidian milestone

既存のOwner Gate、Orchestrator、Event Ledger、Adapter Transport、Rendererの権限判定は変更しない。

## 9. Approval request

このTaskの設計承認対象は、local stdio MCP入口、5つのTool候補、MCPからOwner Decisionを代行しない境界、固定runtime root、TCP／HTTP非公開、既存Service委譲、追加依存なしを前提とする実装計画である。

設計承認後、実装前にMCP client接続環境の読み取り専用preflightを行う。公式SDKが必要な場合は、その時点で停止して別途確認する。

## 10. Implementation Log

2026-08-14、Project Ownerの「実装へ進んでください」を受け、設計範囲内で実装した。

- `src/cli/frontdoorMcpServer.ts`に依存追加なしのlocal stdio JSON-RPC入口を追加した。
- `initialize`／`server/discover`／`ping`／`tools/list`／`tools/call`と、設計済み5 Toolを実装した。
- 起動時に`--runtime-root <path>`を一度だけ受け取り、Tool引数からruntime root・任意ファイルパスを受け取らない。
- `dispatch_approved`は`requirePacketBinding: true`で既存Orchestratorへ委譲し、Packet未配置・Packet hash不一致・旧来の非Packet-bound Dispatch Decisionをfail-closedで拒否する。
- `get_result`は固定root内のrealpathを検証し、Result本文を上限付き・秘密情報マスク付きで返す。`inspect`もallowlist projectionとした。
- `src/cli/bin.ts`に`mcp --runtime-root`分岐を追加した。Electron Main／Renderer／IPC、MCP client設定、Provider認証は変更していない。
- Owner Decisionの生成、Result Review、Completion、canonical／Work Plane書込みはMCPから実行できない。

## 11. Verification Log

- Architecture／Verification／Safetyの役割分離レビューを実施。P0指摘なし。主要P1指摘（Packet-bound dispatch、固定runtime root、出力allowlist／redaction）を実装・テストへ反映した。
- `tests/frontdoorMcpServer.test.ts`：6 tests（handshake、prepare、Owner Gate経由の許可Dispatch、旧Decision拒否、result取得、入力境界）。
- 実装反映後の対象テスト：**25/25 Pass（3 files）**。
- 最終全体テスト：**337/337 Pass（28 files）**。
- `tsc --noEmit -p tsconfig.node.json`：Pass。
- `tsc -p tsconfig.cli.json`：Pass。
- `tsc --noEmit -p tsconfig.web.json`：Pass。
- `electron-vite build`：Pass（main 206.81 kB / preload 2.57 kB / renderer 579.29 kB）。
- compiled CLIのstdio smoke：Pass。initialize／tools/list応答のみがstdoutに出力され、通知は無応答。5 Toolを列挙した。
- `git diff --check`：Pass。
- 実Ollama送信、Anthropic送信、Claude Code CLI実送信、APIキー設定、MCP client設定、commit／pushは未実施。

## 12. Remaining Risk and Next Gate

- 実際の窓口AI（Codex／Claude等）へのMCP client登録と、同一runtime rootを使うprepare→Owner承認→dispatch→result取得の実機接続は未検証。別のOwner確認として残す。
- MCPのstdioプロトコルは安定仕様の最小範囲に限定している。公式SDK導入やHTTP／TCP公開は行わない。
- Statusは、最終DiffレビューとProject Ownerの完了承認まで**Verifying**とする。

Status: **Verifying**
