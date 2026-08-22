# Task — ADF-MCP-CURSOR-CONNECTION-001: CursorからADF Frontdoor MCPへ接続

Status: Verifying
Owner: Project Owner

## 1. Objective

既存のADF local stdio MCP ServerをCursorへ登録し、CursorをADFの窓口AI候補として利用できる接続境界を確立する。MCP接続はRequest／Plan／Resultの受け渡し入口であり、Owner承認・Dispatch・外部送信を自動化しない。

## 2. Final Flow Contribution

```text
Project Owner → Cursor（窓口AI候補） → ADF Frontdoor MCP → Owner Gate → specialist AI → Result → Cursor
```

- Vertical Slice Outcome：CursorのMCPプロセスがADF CLIを起動し、ADF MCP Serverの`initialize`と`tools/list`を成立させる。
- Next Flow Unlocked：Cursorから`prepare`でFrontdoor Requestを投入するPilot。
- Deferred Details：Cursor以外のMCPクライアント登録、Claude Code CLIをADF Adapterとして実Dispatchすること、外部送信、APIキー設定。

## 3. Scope

### In scope

- 既存`out/cli/cli/bin.js mcp --runtime-root ...`の再利用。
- CursorのユーザーMCP設定への`adf_frontdoor`登録。
- ADF MCP protocol handshakeと`tools/list`確認。
- 固定runtime root、環境変数allowlist、Owner Gate境界の確認。

### Out of scope

- `prepare`による新規Run作成。
- `dispatch_approved`、実Ollama送信、Anthropic／Claude Code CLI送信。
- APIキー、OAuth、課金、認証設定。
- GitHub／Obsidian正本への書込み。
- Codex既存MCP設定の変更。
- Cursor以外のAIクライアント設定変更。

## 4. Implementation

- CLIを`tsc -p tsconfig.cli.json`で再ビルドし、現行MCP Serverを`out/cli/cli/bin.js`へ反映した。
- `/Users/kawakamiatsushishi/.cursor/mcp.json`を新規作成し、既存のADF runtime rootを固定指定した。
- Cursorのウィンドウを再読み込みしてMCP設定を反映した。
- CursorのMCPプロセス配下で、ADF CLIの`mcp`プロセスが起動していることをOSプロセスで確認した。

設定は以下の境界を使用する。

- `HOME`、限定`PATH`、`ELECTRON_RUN_AS_NODE`のみを指定。
- APIキーや任意の親プロセス環境変数を渡さない。
- ADFのruntime rootは固定パスのみ。
- MCP ServerはOwner Decisionを作成しない。

## 5. Verification Log

- CLI typecheck：Pass（`tsc -p tsconfig.cli.json`）。
- MCP handshake：Pass（protocol `2025-03-26`）。
- `tools/list`：Pass、ADF MCP Serverの8 Toolを列挙。
- Cursor設定JSON：Pass（Node JSON parse）。
- Cursor MCPプロセス：Pass。CursorのMCPプロセス配下でADF CLIプロセスを確認。
- Cursor UI認識：Pass。CursorのMCP画面で`adf_frontdoor`が表示され、`8 tools enabled`を確認。
- `git diff --check`：Pass。
- Request作成、Owner承認、Dispatch、Ollama／外部AI送信：未実施。
- 初回のprotocol `2024-11-05`拒否：ADFが未対応仕様をfail-closedで拒否したもの。対応仕様`2025-03-26`で再確認しPass。

## 6. Changed Surfaces

- 新規：`/Users/kawakamiatsushishi/.cursor/mcp.json`（Cursorユーザー設定）
- 新規：本Task正本
- 生成更新：CLIの`out/`ビルド成果物

既存の未コミット差分、ADF Electron UI、Codex MCP設定、Ollama runtime、GitHub／Obsidian正本は変更していない。

## 7. Remaining Review

Project OwnerがCursor上でADF MCP Toolを実際に選択し、`adf_frontdoor_list_runs`または読み取り専用の`inspect`を一度確認すれば、接続のOwner受入が完了する。`prepare`以降のPilotは別の実行承認として扱う。
