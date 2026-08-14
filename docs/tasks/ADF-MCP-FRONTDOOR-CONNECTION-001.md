# Task — ADF-MCP-FRONTDOOR-CONNECTION-001: Frontdoor AI MCP Connection

> Type: Integration + Verification
> Status: Verifying
> Owner: Codex
> Related: [ADF-MCP-001](ADF-MCP-001.md) / [ADF-MCP-CLIENT-E2E-001](ADF-MCP-CLIENT-E2E-001.md) / [ADF-FRONTDOOR-NODE-REVIEW-GATE-001](ADF-FRONTDOOR-NODE-REVIEW-GATE-001.md)

## 1. Objective

窓口AIがADFのlocal stdio MCP入口を実際に利用できる状態にし、窓口AI → ADF → Owner Gate → AI Node → ADFという受け渡し境界を固定する。MCP Server／Clientの重複実装は行わず、既存の5 ToolとFrontdoor ServiceをCodexのMCP設定へ登録する。

## 2. Scope

### In scope

- Codexのlocal stdio MCP設定への`adf_frontdoor`登録。
- 固定runtime root（`adf-runtime`）への束縛。
- `/usr/bin/env -i`による`HOME`／`PATH`／`ELECTRON_RUN_AS_NODE`だけの子プロセス環境。
- 既存MCPの`prepare`／`inspect`／`dispatch_approved`／`get_result`／`list_runs`の窓口AI公開。
- MCP登録後のinitialize／tools/list読み取り確認。
- Owner承認前Dispatch拒否の確認。
- Task正本、CURRENT_STATE、Obsidianマイルストーン、MOCの更新。

### Out of scope

- MCPからのOwner Decision生成、自動承認、自動Completion。
- 実Ollama／Anthropic／Claude Code CLIへの新規送信。
- APIキー、OAuth、費用、課金、外部通信。
- Work Plane、repo／worktree、GitHub／Obsidian正本の自動書込み。
- HTTP／TCP／LAN公開、任意runtime root、動的Routing、自動Retry。
- Codex内部のSkill／サブエージェントの自動Telemetry。

## 3. Design contract

```text
Codex window AI
  └─ local stdio MCP: adf_frontdoor
       └─ fixed ADF MCP Server / fixed runtime root
            ├─ prepare / inspect / list / get_result: bounded access
            └─ dispatch_approved: existing Owner Decision + Packet hash required
```

- MCPは入口であり、Task／Job／Thread／Result／Event Ledgerの正本ではない。
- MCPはOwner Gateを迂回しない。
- MCP登録コマンドは環境変数を全継承せず、秘密情報を子プロセスへ渡さない。
- Codexの設定変更はローカル接続設定だけであり、ADFリポジトリや正本を変更しない。

## 4. Acceptance criteria

- [x] Codex設定に`adf_frontdoor`のlocal stdio serverを登録する。
- [x] runtime rootが固定され、MCP Tool引数から変更できない。
- [x] 子プロセス環境が`HOME`／`PATH`／`ELECTRON_RUN_AS_NODE`に限定される。
- [x] compiled MCP Serverのinitialize／tools/listが成立する。
- [x] MCP登録後もOwner承認前Dispatch拒否の境界が維持される。
- [x] MCPからOwner Decision、Packet、正本、Work Planeを自動生成・変更しない。
- [x] 外部送信、APIキー、課金、HTTP／TCP listenerが発生しない。

## 5. Implementation log

2026-08-15、Project Ownerの「次のステップに進んでください。設計は問題ありません」を受け、既存MCP入口をCodexへ登録した。

- `/Users/kawakamiatsushishi/.codex/config.toml`へ`mcp_servers.adf_frontdoor`を追加した。
- コマンドはElectron同梱Nodeを`ELECTRON_RUN_AS_NODE=1`で使用し、コンパイル済み`out/cli/cli/bin.js mcp`を起動する。
- `/usr/bin/env -i`を使い、子プロセスへ渡す環境を`HOME`／`PATH`／`ELECTRON_RUN_AS_NODE`に限定した。
- ADFの既存MCP Server、Frontdoor Service、Owner Gate、Renderer、Provider Transportは変更していない。

## 6. Verification log

- Codex設定の登録内容を読み取り確認した。
- compiled MCP Serverへ同一設定相当のstdio起動を行い、initialize／tools/listの契約を既存テストで確認済み。
- `ADF-MCP-001`のOwner承認前Dispatch拒否テスト、`ADF-MCP-CLIENT-E2E-001`の実プロセスRoundtripを再利用した。
- 実Ollama／Anthropic／Claude Code CLI送信、APIキー、外部通信は行っていない。

## 7. Remaining review and next gate

- Codexアプリが設定を再読込した後、窓口AIから`adf_frontdoor`が表示されることの実画面確認が残る。
- 実際の窓口AIから`prepare`を呼ぶ確認は、Ownerが会話中に明示操作する読み取り・準備操作として別確認する。
- StatusはProject Ownerの最終確認まで`Verifying`とする。

## ADF Execution Summary

```json
{
  "taskId": "ADF-MCP-FRONTDOOR-CONNECTION-001",
  "objective": "窓口AIから固定runtime rootのlocal stdio MCPを使ってADF Frontdoorへ安全に接続する",
  "scope": {
    "inScope": ["Codex MCP registration", "fixed runtime root", "environment allowlist", "initialize/tools-list verification"],
    "outOfScope": ["owner decision automation", "real provider send", "API keys", "external communication", "Work Plane", "canonical writes"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "externalSend": false, "newDependencies": false },
  "verification": { "status": "registration-complete-owner-runtime-check-pending", "mcpTools": 5, "ownerGateBypass": false, "externalSend": false }
}
```
