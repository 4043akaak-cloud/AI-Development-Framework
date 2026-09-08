# Task — ADF-COMPATIBLE-PROVIDER-ADAPTERS-001: Ollama／DeepSeek／Z.ai／Qwen接続

> Status: Implementing — Ollama最小協業MVPは2026-08-26に実行・Project Board表示まで完了。DeepSeek／Z.ai／Qwen／OpenRouterの実Provider送信、APIキー設定、費用確認は未実施。OpenRouterのAdapter準備は2026-08-27に完了。
> Owner: Project Owner
> Implementer: Codex
> Verification: role-separated Codex review（設計／接続／安全／検証観点を再利用）
> Date: 2026-08-25

## 1. Objective

既存のProvider-neutral Adapter契約へ、Ollamaの既存接続を維持したまま、DeepSeek、Z.ai、Qwenを共通OpenAI互換API Transportで追加する。窓口AIや担当AIを固定せず、各Providerは明示選択・Owner承認後にのみ外部送信できる状態にする。

## 2. Final Flow Contribution

```text
窓口AI → ADF → local Ollama／低コスト候補AI → ADF Result／Evidence → 窓口AI
```

最初の実AI参加者をOllamaだけに限定せず、同じADF協業ルーム・Result・Evidence・Ledger・Owner Gateへ複数のProviderを追加できる接続面を作る。

## 3. Connection Decision

| Participant | Adapter | Transport | Data policy | Current status |
|---|---|---|---|---|
| Ollama | `ollama-local` | existing local HTTP | `local-only` | real 2-Node evidence exists |
| DeepSeek | `deepseek-external` | `OpenAICompatibleTransport` | `external-send` | wired; real send not run |
| Z.ai | `zai-external` | `OpenAICompatibleTransport` | `external-send` | wired; real send not run |
| Qwen | `qwen-external` | `OpenAICompatibleTransport` | `external-send` | wired; region endpoint not confirmed |
| OpenRouter | `openrouter-free` | `OpenAICompatibleTransport` | `external-send` | wired; fixed free model and API key not configured |

MCPは窓口AI／AIクライアントのADF入口として使い、モデルAPI自体の接続にはAdapterを使う。今回、ProviderごとのMCP ServerやGUI操作は追加しない。

## 4. Implemented Scope

- `src/main/jobLoop/openAiCompatibleTransport.ts`
  - built-in `fetch`のみでOpenAI互換`/chat/completions`へ接続。
  - synthetic Packetだけを送信し、repo／Vault／Work Plane／会話履歴を読まない。
  - timeout／Owner cancel／HTTP failure／malformed response／empty responseを構造化。
  - `promptTokens`／`completionTokens`／`totalTokens`を数値だけResult metricsへ保持。
  - APIキーは環境変数から送信直前に読むが、ADFへ返却・保存・Ledger記録しない。
- `src/main/jobLoop/adapterRegistry.ts`
  - DeepSeek／Z.ai／Qwenを`available`な明示外部候補として登録。
  - 自動Routingへは入らない。`external-send`のためOwner承認が必要。
- `src/main/liveRelay.ts`
  - Electron Main、Frontdoor MCP、CLIが同じ3 Adapterを登録。
  - モデル／Endpointは環境変数で上書き可能。
- `src/shared/externalAdapterTypes.ts`
  - Token使用量を記録できる数値メトリクスを追加。
- Tests
  - `tests/openAiCompatibleTransport.test.ts`
  - Registry／既存IPC／既存全体テストの回帰確認。

## 5. Configuration Boundary

OwnerはAPIキーの値を会話やGitHubへ貼らず、ADFプロセスが参照できる環境変数へ自分で設定する。

| Provider | Credential variable | Optional endpoint override | Optional model override |
|---|---|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | `DEEPSEEK_MODEL` |
| Z.ai | `ZAI_API_KEY` | `ZAI_BASE_URL` | `ZAI_MODEL` |
| Qwen | `DASHSCOPE_API_KEY` | `QWEN_BASE_URL` or `DASHSCOPE_BASE_URL` | `QWEN_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL` | `OPENROUTER_MODEL` |

Qwenは地域・WorkspaceによりEndpointが異なるため、実送信前にOwnerが公式設定値を選ぶ。既定値は接続コードの動作確認用であり、実運用Endpointの確定を意味しない。

`low`はADFの運用上の予算分類であり、Providerの実価格を保証するものではない。実送信前にOwnerがアカウント／プラン／価格を確認し、必要ならRegistryの費用分類を修正する。

OpenRouterの既定Endpointは`https://openrouter.ai/api/v1`。`OPENROUTER_MODEL`未設定時は準備用に`openrouter/free`を表示・配線するが、これは利用可能な無料モデルを都度選ぶルーターであり、再現性のある実送信には使用しない。実送信前にOwnerが公式一覧から固定した`モデルID:free`を選び、`OPENROUTER_MODEL`へ設定する。ADFは下流モデルを自動選択・自動切替しない。

## 6. Approval and External-send Boundary

- 外部Providerは自動Routingしない。
- `prepare`、Plan、Thread、Packet、Result、Evidenceは既存契約を使用する。
- 実送信には、環境変数の存在、Adapter／role／Packet／Scope／Context hash、Owner-issued external-send approval、期限、送信回数、費用Tierが必要。
- APIキー設定、実外部送信、課金、公開、Canonical repo／Obsidian書込み、commit、pushは別のOwner操作とする。
- 送信失敗時に自動Retry、Provider切替、別Providerへのフォールバックを行わない。

## 7. Verification

- Node／Web／CLI typecheck: Pass
- Focused tests: 53/53 Pass
- Full Vitest: 41 files / 400 tests Pass
- `electron-vite build`: Pass
- `git diff --check`: Pass
- External network calls in this implementation verification: 0
- API keys read or configured: 0
- Real DeepSeek／Z.ai／Qwen calls: not run
- OpenRouter Adapter preparation: registered and wired; API key/model not configured; no external call run
- Real Ollama call in this change: not run; prior Ollama evidence remains unchanged

## 8. Owner Actions Needed Before Real Send

1. DeepSeek／Z.ai／Qwenの利用Providerと最初のモデルを選ぶ。
2. APIキーを各Providerの公式管理画面で用意し、値をADFへ渡さず環境変数へ設定する。
3. Qwenを使う場合は地域／Workspaceに対応する公式Endpointを`QWEN_BASE_URL`へ設定する。
4. まず1Provider・1回・synthetic Packetのみの外部送信を明示承認する。
5. Result／Token使用量／費用を確認してから、他Providerへ広げる。

OpenRouterを試す場合は、公式の無料モデル一覧から固定モデルを1つ選び、`OPENROUTER_MODEL`へ設定する。APIキーの値は会話・GitHub・Obsidianへ貼らず、ADFプロセスの環境変数へOwnerが設定する。

## 9. Stop Conditions

- Credential値がログ、Result、Ledger、Task、Obsidianへ出る場合。
- EndpointがHTTPSでない、または認証情報をURLへ含む場合。
- Owner approvalとPacket／Scope／Context／roleが一致しない場合。
- Providerの実価格・利用規約・データ方針が確認できない場合。
- 自動Fallback、無断Retry、正本書込み、外部送信範囲の拡大が必要になる場合。

## 10. Deferred

- 実Provider各1回の外部送信受入。
- OpenRouterで固定した無料モデルを1回だけ実送信する受入。
- Provider別の価格・遅延・Token・品質比較。
- 外部AIの自動選択や自動Fallback。
- Cursor／Claude CodeなどAgent／MCPクライアント型参加者の実Adapter化。
- GUI操作、repoアクセス、Work Plane書込み、Canonical統合。

## 11. 2026-08-26 Ollama最小協業MVP完了

Project Ownerの設計承認に基づき、Ollama接続の完成条件を「送信できること」から、窓口AIがResultを受け取り、ADFが最小記録を保持し、OwnerがProject Boardで協業状態とResultを確認できることへ更新した。

### 実装

- `src/renderer/src/FrontdoorPanel.tsx` のProject Boardへ、既存Runtime Threadを読む`協業の実行とResult`表示を追加。
- Threadカードをクリックすると、参加AI、役割、Result状態、Evidence有無、Thread／Job、最新Result、次のActionを確認できる。
- Rendererは既存の読み取り専用IPC（`relay:list`／`relay:get`）を再利用し、承認・正本書込み・自動判断の新しい経路を追加していない。
- 窓口AIが通常のResult確認を担当し、ADF画面はOwnerの必要時の監視・証拠確認に限定した。

### 実Ollama証跡

- 合成Packet 1件を`ollama-local`／`proposal`へ明示送信。
- Result status: `success`。
- Thread: `thread-8c1de8c1fcc5d755`。
- Job: `job-b8dd869eec3de7f4`。
- 成功Call 1件、Result Envelope 1件、Evidence link 1件、Job証跡5ファイルを確認。
- Threadは`awaiting-owner`で停止し、Result自動採用・次のProvider実行は行っていない。
- APIキー、外部Provider、GitHub正本、Obsidian正本へのアクセス・書込みは行っていない。

### 検証

- Node／Web／CLI typecheck: Pass
- Focused tests: 34/34 Pass
- Full Vitest: 42 files / 402 tests Pass
- `electron-vite build`: Pass
- `git diff --check`: Pass
- 追加テスト: `tests/mvpCollaborationSnapshot.test.ts`

### Owner向け完了判定

Ollamaの「最小協業MVP接続」は、Runtime記録・窓口AI受け取り・Project Boardからのクリック確認の3点が揃ったため実装完了とする。実際の画面目視は、この環境でElectronネイティブウィンドウ操作ツールがないため未実施であり、Ownerの起動後確認を残す。DeepSeek／Z.ai／Qwenは別の実送信承認・別の受入とする。
