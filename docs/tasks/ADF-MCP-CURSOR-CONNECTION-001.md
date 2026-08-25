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

## 8. 2026-08-23 Current Contract Correction: Provider-neutral Role Assignment

このTaskの初期記述にある「Cursorを窓口AI候補」とする表現は、Ownerの最新方針により履歴として残し、現行契約からは除外する。Cursorは固定窓口ではない。

### Current role assignment

- 現在のADF運用：CodexがこのPhaseのFrontdoor参加者、Cursorは専門参加者候補。
- この割当はPhase／Task単位のOwner承認済み設定であり、製品の恒久的な役割ではない。
- 将来はCursor、Claude Code、その他の登録済み参加者をFrontdoor、specialist、reviewer、integratorのいずれにも割り当てられる。
- `adf_frontdoor`は特定Provider名を意味しない汎用Frontdoor契約であり、`adf_participant`は割り当てられた専門参加者が使う制限付き汎用契約である。

### Implemented boundary

- `ParticipantProfile`／`ParticipantAssignmentProposal`を追加し、参加者ID、能力、接続、データ方針と、Phase／Task単位の役割割当を分離した。
- Requestの`sourceParticipantId`／`sourceParticipantRole`とPlan Nodeの`participantAssignment`を検証する。
- CursorのユーザーMCP設定は、旧`adf_frontdoor`設定を`mcp.json.adf-frontdoor-legacy-20260823`へ退避したうえで、初期割当を`adf_participant`／`cursor`／`specialist`へ変更した。
- `adf_participant`は割当一覧、割当取得、OwnerのPacket-bound Dispatch後のlocal-only Result提出だけを公開する。FrontdoorのPrepare、Owner Decision作成、Dispatch、Canonical repo／Obsidian書込み、外部送信は公開しない。
- Result提出はRuntimeの`participant-submissions`へ保存するだけで、Frontdoor Aggregate／Completionを自動変更しない。Frontdoor側の受入・Result Review接続は未完了として扱う。

### Remaining work

- Participant SubmissionをFrontdoorのResult／EvidenceへOwner承認付きで取り込む境界を別Taskとして設計する。
- Cursorを専門参加者として実Adapter実行するE2Eは、接続方式、認証、外部送信、Work Plane書込みを分離した別承認とする。
- CursorをFrontdoorへ切り替える場合は、別のPhase／Taskで`adf_frontdoor`の割当をOwner承認し、専門参加者用設定と混同しない。

## 9. 2026-08-23 Participant Evidence Projection

Owner承認済みの最小縦切りとして、参加者SubmissionをFrontdoorから確認できるEvidence候補へ投影した。

### Implemented

- `participantEvidence.ts`で、SubmissionのParticipant／Assignment／Request／Plan／Node target hash、Event Ledger、Packet-bound Dispatchを再検証する。
- 検証済みSubmissionを`awaiting-owner-review`のEvidence候補として`FrontdoorInspection`へ追加した。
- Frontdoor MCPの`inspect`とAggregate取得結果に、正式Resultとは別の`participantEvidence`を含めた。
- ElectronのProject-first Result／Evidence欄に、Evidence ID、Submission参照、hash、内容、Verification、Riskの確認導線を追加した。
- Submissionの検証失敗はEvidenceとして採用せず、fail-closedで停止する。

### Explicitly not implemented

- Participant Evidenceの正式Aggregateへの自動統合
- Owner Decision／Completionの自動生成・自動更新
- GitHub／Obsidianへの書込み
- 外部送信、資格情報、課金、実Cursorモデル実行

### Verification

- node／web／cli TypeScript：Pass
- Vitest：40 files／406 tests Pass
- CLI build：Pass
- Electron production build：Pass
- `git diff --check`：Pass
- Evidence positive projection、tampered binding拒否、Run filter、未Dispatch Submission拒否：Pass
