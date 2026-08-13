# Task — ADF-ADAPTER-PROVIDER-NEUTRAL-001: Provider非依存Adapter構成（Ollama候補登録・local-httpゲート）

> Type: Design / Implementation
> Status: Done
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md) / [ADF Agent Adapter Contract](../design/ADF_AGENT_ADAPTER_CONTRACT.md) / [ADF Multi-AI Control Plane](../design/ADF_MULTI_AI_CONTROL_PLANE.md) / [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)

## 1. Objective

ADFのAdapter接続をOllama専用にせず、将来のClaude API・Claude Code CLI・OpenAI API・その他のローカル/外部AIを同じ共通契約へ接続できる構造にする。ADFの中心は特定AIではなく共通Adapter契約であるという原則を、型とRegistryへ反映する。

## 2. Approval

- Approval required?: Yes
- 承認対象: `provider`/`connectionMode`/`authMode`の概念分離、`local-http`接続方式と`local-endpoint-confirmed`ゲート、Ollamaの`planned`候補登録。
- 承認記録: 2026-08-12、Project Ownerが設計OKを明示し、実装を指示した。
- 完了承認: 2026-08-12、Project Ownerが§8・§9の検証記録整理と`electron-builder --dir`除外判断を確認し、次工程への移行を承認した。
- 実接続（Ollama起動確認、モデルpull、Claude Code CLI接続、追加のAPI接続）は本Taskの承認に含まれない。

## 3. Required Context

### GitHub

- [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)
- [ADF Multi-AI Control Plane](../design/ADF_MULTI_AI_CONTROL_PLANE.md) / [ADF Agent Adapter Contract](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md) / [ADF-TASK-PACKET-CLI-001](./ADF-TASK-PACKET-CLI-001.md) / [ADF-BOARD-PROJECTION-001](./ADF-BOARD-PROJECTION-001.md)
- 既存のAdapter / Relay / Recovery関連ソース（`src/main/jobLoop/`）

### Obsidian

- `Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md`
- `Projects/AI-Development-Framework/00_MOC.md`

採用する制約は、ADFの中心を特定AIに固定しないこと、Thread/Relay/Recoveryがproviderを知らない状態を維持すること、local-onlyとexternal-sendを明確に分けること、APIキーの有無だけで安全性を判断しないことである。

## 4. 設計上の発見

実装前に既存ソースを確認したところ、`ExternalConversationAdapter`（`externalAdapter.ts`）は既に`ExternalTransport`インターフェースを注入する形でProvider非依存に実装済みだった。「TransportとAdapterを分離する」という設計原則は本Taskの前から満たされており、本Taskは主に**Registryの語彙拡張**（`provider`/`authMode`の分離、`local-http`接続方式の追加）と、**local-onlyの新しい信頼レベル**（`local-endpoint-confirmed`ゲート）の追加にとどまる。

## 5. Scope

### In scope

- `AdapterConnection`へ`local-http` / `gui-experimental`を追加（既存値は変更しない）。
- `AuthMode`型（`none` / `environment-secret` / `cli-session` / `oauth` / `cloud-credential` / `unknown`）を新設。
- `AdapterProfile`へ`provider` / `authMode`フィールドを追加し、既存6エントリすべてに値を設定。
- `CredentialStatus`へ`authMode`フィールドを追加し、既存3 Transport（Mock / Unconfigured / Anthropic）を更新。
- `ExternalTransport`へ任意の`isLocalEndpoint?(): boolean`を追加。
- `preflightExternalSend`に、`dataPolicy: local-only`かつ`connection: local-http`の場合の分岐を追加。Owner承認ファイルを要求せず、`local-endpoint-confirmed`チェックのみで許可判定する。既存の`external-send`経路は無変更（回帰テストで固定）。
- `routeAdapters`の自動選択から`connection: local-http`を除外（`local-only`であっても自動選択しない）。
- `OllamaLocalHttpTransport`（`ollamaTransport.ts`）を新規実装。`ollama-local`をRegistryへ`status: 'planned'`で登録。

### Out of scope（別Task・別承認）

- Ollamaの起動・インストール・モデルpull。
- Claude Code CLI Transport、OpenAI/Gemini/Mistral API Transportの実装。
- `gui-experimental`の実装。
- `Capability`型への`external-send` / `paid-call`等の拡張（設計文書と実装コードの既知のギャップ、将来課題として記録のみ）。
- Adapter Registry自体のBoard/Renderer表示。
- `ollama-local`の`status`を`available`へ変更すること。

## 6. Acceptance Criteria

1. `ExternalConversationAdapter`のコード変更なしに、新しいTransport（`OllamaLocalHttpTransport`）だけで新providerを追加できる。
2. `local-http`のadapterは`routeAdapters`が自動選択しない（`local-only`であっても）。
3. `local-http`のTransportがlocalhost/127.0.0.1/::1以外を申告した場合、`local-endpoint-confirmed`がfailし送信は許可されない。
4. `authMode`の値によらず、資格情報の値そのものはRegistry/Preflight/Ledgerのどこにも保存されない。
5. 既存のFake Adapter、Anthropic API実装、既存テストが回帰しない。
6. 新規依存を追加しない。
7. `ollama-local`は`status: 'planned'`のままで、`validateAdapterPlan`・`routeAdapters`のいずれからも選択されない。

## 7. Implementation Log

| 日時 | 実施者 | 変更 |
|---|---|---|
| 2026-08-12 | Claude Code | `src/shared/jobLoopTypes.ts`: `AdapterConnection`へ`local-http`/`gui-experimental`追加、`AuthMode`新設、`AdapterProfile`へ`provider`/`authMode`追加 |
| 2026-08-12 | Claude Code | `src/main/jobLoop/adapterRegistry.ts`: 既存6エントリへ`provider`/`authMode`を設定、`ollama-local`（`planned`）を追加、`supports()`を`export`化し`local-http`を自動選択から除外 |
| 2026-08-12 | Claude Code | `src/main/jobLoop/externalTransport.ts`: `CredentialStatus`へ`authMode`追加、`ExternalTransport`へ`isLocalEndpoint?()`追加、Mock/Unconfigured Transportを更新 |
| 2026-08-12 | Claude Code | `src/main/jobLoop/anthropicTransport.ts`: `credentialStatus()`へ`authMode: 'environment-secret'`追加 |
| 2026-08-12 | Claude Code | `src/main/jobLoop/externalApproval.ts`: `preflightExternalSend`にlocal-only/local-http分岐を追加。Owner承認ファイル不要、`local-endpoint-confirmed`チェックを追加。既存external-send経路は無変更 |
| 2026-08-12 | Claude Code | `src/main/jobLoop/ollamaTransport.ts`（新規）: `OllamaLocalHttpTransport`。`credentialStatus`・`isLocalEndpoint`・`send`（HTTP POST `/api/generate`、timeout/cancel対応） |
| 2026-08-12 | Claude Code | `tests/adapterRegistry.test.ts`・`tests/ollamaTransport.test.ts`（新規）・`tests/localHttpPreflight.test.ts`（新規）を追加。`tests/externalIpc.test.ts`の既存2アサーションを`authMode`追加に合わせて更新 |

## 8. Verification

| 項目 | 結果 |
|---|---|
| typecheck（`tsc -p tsconfig.node.json` / `tsconfig.web.json`） | Pass |
| Vitest | **195 passed / 14 files**（既存173 → 新規22件。本Taskの正本値。§9参照） |
| `electron-vite build` | Pass。`out/main/index.js`・`out/preload/index.js`・rendererを再生成。 |
| `electron-builder --dir` | **本Taskの完了条件から除外**（2026-08-12、Project Owner判断）。過去に一度Pass記録があったが、本セッションでは`node`/`npm`非搭載環境固有の実行方式の違いにより再現できず、§8と§9で矛盾した記載になっていた。矛盾は本改訂で解消し、以後は完了条件に含めない。詳細経緯は§9参照。 |
| `tsc -p tsconfig.cli.json` | Pass（CLIビルドへの影響なし） |
| 静的 | `ollamaTransport.ts`に`child_process`/`exec`/`spawn`の参照なし。`fetch`のみで、テストはすべて注入した`fetchImpl`を使い実ネットワークへ一切到達しない。redirectも`error`固定。 |
| 回帰確認 | `supports()`の`local-http`除外条件を無効化 → 該当テストのみ失敗を確認後、復元 |
| 回帰確認 | `isLocalEndpoint()`を常時`true`に無効化 → Transport側・Preflight統合側の両テストが失敗を確認後、復元 |
| 静的 | 実送信・API接続・Ollama起動・モデルpullは一切実施していない |

### 8.1 設計改訂後の確認実装

Project Ownerの設計OK後、次の境界を確認実装した。

- `local-http`は`local-only`でも`supports()`から除外し、自動Routingしない。利用は明示`adapterId`に限定する。
- PreflightでRegistryの`connection`とTransportの`connection`を照合し、不一致をfail-closedで拒否する。
- Ollama Transportのendpoint判定は`http:` / `https:`のloopbackだけをlocalとし、外部host、不正scheme、不正URLを拒否する。
- `ollama-local`は`planned`のまま維持し、実接続・モデルpull・自動dispatchを行わない。
- `external-send`のOwner承認、認証、費用Tierの既存経路は変更しない。
- 独立レビューで指摘されたplanned/local-httpの自動Routing・Preflight通過・redirect追従を修正し、対応テストを追加した。

追加確認テストは、Profile/Transport接続方式不一致と不正schemeを含む。これにより、Registryの静的宣言と実Transportの設定が異なる場合も、Ollama Cloud等への誤送信経路を自動的に開かない。

### 未検証事項

- 実際のOllamaサーバーに対する動作（起動していない、モデルpullも行っていないため未検証）。
- `ollama-local`を`status: 'available'`へ切り替えた場合の実機preflight表示・実機送信（本Task範囲外）。
- Renderer/Board UIへの`provider`/`authMode`/`local-http`表示（本Task範囲外、`ADF-BOARD-PROJECTION-001`と同様に将来課題）。

### 残存リスク

- `Capability`型（`'read'|'propose'`のみ）と設計文書が想定する能力語彙（`external-send`/`paid-call`等）のギャップは未解消のまま。
- `local-endpoint-confirmed`はTransportの自己申告（`isLocalEndpoint()`の実装）に依存する。Transport実装者が誤って`true`を返すコードを書けば、この設計上のゲートは形骸化する（今回のテストはこの前提の下でのみ有効）。
- `local-endpoint-confirmed`はloopback endpointの確認に限られ、モデルのcloud fallback、telemetry、外部検索、Ollama側の保持・転送までは検証しない。
- Claude Code CLI・OpenAI等の追加Transportは未実装であり、本Taskは「型とRegistryの受け皿」を用意したのみで、複数provider実運用の実測はまだない。

## 9. 本セッションでの再検証・追加（2026-08-12）

作業開始時にcwd・Git root・branch・remote・statusを確認し、既存の未コミット差分（本Task以外のものを含む）はすべて保持した。cwdは別リポジトリ（`unity-game-project`）だったため、Git操作は`-C`で対象repoを明示して実行した。branch `codex/adf-pilot-governance`、remote `origin`は`4043akaak-cloud/AI-Development-Framework`。

§1〜5の実装要件（型/Registry、Transport契約、Ollama Transport、Preflight境界、Relay自動Routing）を精査した結果、**いずれも既に実装済み**であることを確認した（`adapter-available`・`profile-transport-connection-matches`チェック、`redirect: 'error'`、`http:`/`https:`のみ許可、`relay.ts`の`adapterForRole`によるlocal-http除外を含む）。再実装は行わず、次の不足分のみを追加した。

- `tests/anthropicTransport.test.ts`: `AnthropicMessagesTransport.credentialStatus()`が`authMode: 'environment-secret'`を返し、資格情報の値がレポートに一切現れないことを直接検証するテストを追加（従来は`externalIpc.test.ts`経由の間接検証のみだった）。
- `tests/ollamaTransport.test.ts`: `redirect: 'error'`によりfetchがredirectを拒否した場合（`TypeError`）に、`send()`がその例外をもみ消さず正しく伝播することを検証するテストを追加。

### 検証結果（本セッション）

| 項目 | 結果 |
|---|---|
| `tsc -p tsconfig.node.json --noEmit` | Pass |
| `tsc -p tsconfig.web.json --noEmit` | Pass |
| `tsc -p tsconfig.cli.json` | Pass |
| Vitest（全体） | **195 passed / 14 files**（既存193 → 追加2件） |
| `electron-vite build` | Pass。`out/main/index.js`（105.84 kB）／`out/preload/index.js`（1.48 kB、無変更）／renderer（無変更）。 |
| `electron-builder --dir` | 未実施（環境要因）。本環境は`node`/`npm`がPATHに無く、`ELECTRON_RUN_AS_NODE=1`経由でElectron同梱Node（v24）を使う運用のため、electron-builderのyargsベースCLI（`cli.js`）がargvを正しく解釈できず`Unknown argument`で失敗する。3通りの起動方法を試したがいずれも同じ結果。ダウンロード等は発生させていない。**2026-08-12、Project Ownerが本Taskの完了条件から`electron-builder --dir`を除外すると判断し、§8の記載と統一した。** |
| `git diff --check` | Pass（終了コード0） |
| 回帰確認 | `adapter-available`チェックを無効化 → 該当テストのみ失敗を確認後、復元 |
| 回帰確認 | `profile-transport-connection-matches`チェックを無効化 → 該当テストのみ失敗を確認後、復元 |
| 静的 | 実ネットワーク接続・APIキー設定・Ollama起動・モデルpull・Claude Code CLI接続は一切行っていない |
| 静的 | `git status`で本Task以外の既存差分（前セッションまでの未コミット変更）がすべて保持されていることを確認 |

### Statusについて

§8・§9の検証記録整理、`electron-builder --dir`の完了条件からの除外、195テスト・typecheck・`electron-vite build`・`git diff --check`の確認をもって、Project Ownerが完了承認したため`Done`とする。技術的な未検証事項と残存リスクは本Taskに残し、実AI接続は別Taskで扱う。
