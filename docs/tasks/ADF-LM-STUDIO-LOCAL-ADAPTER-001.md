# Task — ADF-LM-STUDIO-LOCAL-ADAPTER-001: LM Studio local Adapter

> Status: Verifying — Adapter／readiness／UI入口の実装と自動検証は完了。ローカルLM Studio Serverは未起動のため、実サーバーreadinessと実送信は未完了。
> Owner: Project Owner
> Implementer: Codex
> Verification: role-separated Adapter／Owner Gate／検証観点の再利用
> Date: 2026-08-27

## 1. Objective

LM Studioを、ADFの既存Provider-neutral Adapter契約へlocal-httpの協業参加者として追加する。Ollamaと同じく、窓口AIや担当AIを固定せず、Ownerが選択したモデルへ合成Packetを送信し、Result／Evidence／Ledgerを既存のADF経路で確認できる準備を整える。

## 2. Final Flow Contribution

```text
窓口AI → ADF MCP → Owner承認済みlocal Packet → LM Studio → ADF Result／Evidence → 窓口AI
```

協業参加者を低コストなローカルモデルへ拡張し、Ollamaだけに依存しない最小協業フローの選択肢を増やす。

## 3. Vertical Slice Outcome

- LM StudioのDeveloper ServerをOwnerが起動し、モデルIDを選択できる。
- ADFが`/v1/models`でループバック到達性と選択モデルの存在を確認する。
- Owner承認済みPlan／Packetの明示Adapterとして`lmstudio-local`を選べる。
- `/v1/chat/completions`へ合成Packetを1件送信し、既存のResult／Evidence／Thread／Ledgerで確認できる。
- ADFはモデルを自動選択・自動ダウンロード・自動切替しない。

## 4. Scope

- `LocalOpenAICompatibleTransport`の追加
- `lmstudio-local` Registry／Live Relay登録
- local readinessの共通読み取り入口とProject Board／Thread表示への接続
- `/v1/models`、`/v1/chat/completions`の安全なローカル通信
- モデル未選択、非ループバック、応答異常、送信前停止のテスト
- 本TaskのTask正本、Current State、関連Obsidian記録の更新

## 5. Out of Scope

- LM Studioのインストール、モデルダウンロード、モデルロード、自動起動
- LM StudioのMCP設定、Tool Calling、Streaming、stateful chat
- リモートEndpoint、クラウド送信、APIキー設定
- ADFによるモデル選定、Retry、Fallback、自動Completion
- GitHub／Obsidianへの自動書込み、commit、push

## 6. Adopted Constraints

- LM Studioの既定local serverは`http://127.0.0.1:1234`とする。
- Base URLは`localhost`／`127.0.0.1`／`::1`のループバックだけを許可する。
- モデルは`LM_STUDIO_MODEL`でOwnerが明示し、未設定ならreadinessと送信を停止する。
- ADFのMCPは窓口AIの入口、LM StudioはADFが呼び出すlocal Adapterとして分離する。
- local-httpは外部送信Approvalではなく、Owner-approved Plan bindingと直前readinessで保護する。

## 7. Acceptance Criteria

- RegistryとLive Relayに`lmstudio-local`が登録され、`local-http`／`local-only`／`free`／`authMode:none`を宣言する。
- local readinessは明示操作または明示Dispatch直前だけ実行され、起動・画面表示・Pollingでは実行されない。
- `/v1/models`の応答からモデル一覧を読み、指定モデル以外を自動選択しない。
- readiness未通過時はJob／Thread生成または送信を開始しない。
- Packet／Plan／role／scope／context bindingは既存Relay契約で検証される。
- 応答本文は既存のbounded Result契約へ入り、資格情報・ファイルパス・会話履歴を送信しない。
- 非ループバックEndpoint、モデル未選択、HTTP異常、malformed response、空応答をfail-closedで扱う。
- 既存Ollama／OpenRouter／Frontdoor／Owner Gateの回帰テストがPassする。

## 8. Verification

- Node／Web／CLI typecheck
- LM Studio Transport focused tests（network stubのみ）
- local readiness／IPC／既存Ollama回帰テスト
- Full Vitest
- production build／canonical app package／起動プロセス確認
- `git diff --check`
- 実LM Studioへの送信は別のOwner明示承認まで実施しない

## 9. Next Flow Unlocked

LM Studioを使った1件のlocal synthetic Packet送信を、Ownerが別途承認できる。Result確認後に、窓口AIが次の依頼を判断する流れへ接続できる。

## 10. Deferred Details

- LM StudioのAPI token認証対応
- LM Studio固有のnative REST API、MCP via API、Tool Calling、Streaming
- モデル性能、Token／秒、品質、メモリ使用量の比較
- LM StudioをProposal／Criticのどちらへ割り当てるかの実験
- 複数local Adapter間の自動選択

## 11. 2026-08-27 Verification Record

- Node／Web／CLI typecheck: Pass
- LM Studio／Registry／IPC／Owner Gate focused tests: 66/66 Pass
- Full Vitest: 43 files / 410 tests Pass
- Production build／canonical app package／canonical app relaunch: Pass
- `git diff --check`: Pass
- Read-only `GET http://127.0.0.1:1234/v1/models`: not reachable（LM Studio local server未起動）
- LM Studio API token、外部Endpoint、モデルdownload/load、実LM Studio送信: 未実施
- commit／push: 未実施
