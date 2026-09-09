# Task — ADF-RUN-TELEMETRY-PROJECTION-001: Run Telemetry読み取り専用投影

> Status: `Verifying` — Owner承認済み（2026-09-09）。実装・検証完了。独立レビューと完了承認が残る。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementer: 未定（Codex または Claude Code）
> Independent Review: 実装担当と分離する（`adf-independent-review`）
> Date: 2026-09-08
> Related: [Observability and Evaluation Baseline](../design/ADF_OBSERVABILITY_AND_EVALUATION_BASELINE.md) / [ADF-ACTIVITY-TRACE-VISUALIZATION-001](ADF-ACTIVITY-TRACE-VISUALIZATION-001.md)

## 1. Objective

既に記録されているAdapter実行の計測値（Token、所要時間、費用区分、終了理由）を、Run単位の**読み取り専用Summary**としてOwnerと窓口AIへ提示する。

計測そのものは`ExternalPerformanceMetrics`／`ExternalCallRecord`として実装済みであり（`src/shared/externalAdapterTypes.ts:36-109`）、本Taskは新しい計測を追加しない。欠けているのは投影だけである。

### 完了条件

Ownerが1つのRunについて、どのNode／role／Adapterがどれだけ時間とTokenを使い、どの終了理由で終わったかを、ADF内で確認できる。

## 2. Background

[Blueprint §5 Step 4](../project/ADF_PRODUCT_COMPLETION_BLUEPRINT.md)は「token, latency, cost, and quality measurement」を後段へ送っている。しかしこの先送りは、計測が未実装だった時点の判断である。

2026-08-25の`ADF-COMPATIBLE-PROVIDER-ADAPTERS-001`でToken数値メトリクスが追加され、`ollamaTransport`／`openAiCompatibleTransport`／`codexCliTransport`はいずれも`durationMs`と`metrics`を返している。`ADF-ACTIVITY-TRACE-VISUALIZATION-001`はActivity Traceを実装したが、Scopeで「Token／費用の推測、Provider telemetryの追加」を明示的に除外したため、計測値は投影に含まれていない。

現在`src/main/frontdoor/`配下に`metrics`への参照は1件も存在しない。記録は残るが、誰も読めない状態である。

## 3. Final Flow Contribution

Blueprint §7の必須4項目。

- **Final Flow Contribution**: North Starの`Result / Question / Evidence / Ledger → Frontdoor aggregate`区間で、Ownerが「この協業は何を消費したか」を判断材料として持てるようにする。
- **Vertical Slice Outcome**: OwnerがRunを1つ選ぶと、Node別のToken・所要時間・終了理由・費用区分が1画面で読める。窓口AIも`inspect`で同じ値を取得できる。
- **Next Flow Unlocked**: Adapter評価（`ADF-SYNTHETIC-POLICY-PROBE-001`）が、推測ではなく実測値を根拠にできる。Provider選択の判断材料が揃う。
- **Deferred Details**: 実価格への換算、Run横断の集計・グラフ、しきい値アラート、Provider telemetryの追加取得、Chain of Thoughtの表示。

## 4. Scope

### In scope

- `ExternalCallRecord`／`ExternalSendOutcome`の既存計測値から、Run単位のTelemetry Summaryを派生する読み取り専用Projection。
- Node別の内訳: `nodeId`、`role`、`adapterId`、`durationMs`、`promptTokens`／`completionTokens`／`totalTokens`、`costTier`、`terminationReason`、`status`。
- Run合計: 総所要時間、総Token、Node件数、失敗／timeout件数。
- `FrontdoorInspection`への追加（Activity Traceと同じ派生方式）。
- Electron `FrontdoorPanel`での表示。**初期非表示・スイッチ切替**とし、Activity Traceの既存パターンに合わせる。
- CLI／MCP `inspect`投影への同一データ公開。
- 計測値が欠落しているAdapter（Fake、CLI系でmetricsを返さない場合）を`未記録`として区別し、0と混同しないこと。
- Task正本、`CURRENT_STATE.md`、Obsidianノートの更新。

### Out of scope

- 新しい計測の追加、Provider telemetryの追加取得。
- 実価格・通貨換算（`costTier`は運用上の区分であり価格保証ではない）。
- Run横断の集計、履歴グラフ、しきい値アラート、通知。
- 計測値にもとづく自動Routing、自動Provider選択、自動停止。
- Event Ledgerの新しい権限、Owner承認、Dispatch、Result採用への影響。
- 外部送信、APIキー、新規依存、Work Plane書込み、正本自動書込み、commit／push。

### 触れてはいけない部分

- Owner Gate契約、Dispatch境界、hash binding、Replay。
- `assertPacketBoundary`、`containsSecretSentinel`などの安全境界。
- 進行中の`ADF-MCP-FRONTDOOR-2CYCLE-E2E-001`の未コミット差分。

## 5. Plan（実装前）

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | `src/main/frontdoor/runTelemetry.ts`を新規追加し、Event Ledger／Job記録から計測値を派生する純関数を実装 | 新規ファイルのみ | 単体テスト（正常、metrics欠落、失敗Node混在） | Yes |
| 2 | `FrontdoorInspection`へ`telemetry`を追加 | 共有型の追加。既存フィールドは変更しない | typecheck 3系統 | Yes |
| 3 | Orchestrator／CLI／MCP projectionへ同じ派生を接続 | 読み取り経路のみ | 既存Frontdoor／MCP回帰テスト | Yes |
| 4 | `FrontdoorPanel`へTelemetry表示と表示／非表示スイッチを追加 | UIのみ。localStorageへ表示設定を保存 | Electron build、実画面確認 | Yes |
| 5 | 秘密情報が数値以外の経路で混入しないことを確認 | なし | `terminationReason`／`errorText`が既存マスクを通ることをテスト | Yes |

### 代替案・リスク

- **代替案**: Activity Traceの`detail`文字列へ計測値を埋める。→ 不採用。文字列に混ぜると機械可読でなくなり、後続の評価Taskで再利用できない。
- **リスク**: `terminationReason`と`errorText`は自由文字列であり、Adapter側の文言に資格情報が混入しうる。既存の表示マスクを必ず経由させる。
- **リスク**: 計測値の欠落を0として表示すると「速い／安い」と誤読される。`未記録`と0を明確に区別する。
- **ロールバック**: 新規ファイルの削除と、追加した型フィールド・UI節の除去で戻せる。
- **停止条件**: 同一原因の検証失敗が2回連続、または別原因で3回連続。Scope拡張、新規依存、外部送信、安全境界の変更が必要になった場合も停止する。

### ブランチ方針

現在のブランチ`codex/adf-mcp-frontdoor-2cycle-e2e`には41件の未コミット差分がある。本Taskは`src/shared/frontdoorTypes.ts`など進行中Taskと同じファイルへ触れるため、**新規ブランチで実施するか、進行中Taskの完了後に着手する**。Ownerがどちらかを指定する。

## 6. Approval

- Approval required?: **Yes**
- 承認対象: Scope、Plan、ブランチ方針
- 承認者: Project Owner
- 承認記録: 未取得
- 承認日時: 未取得

## 7. Acceptance criteria

- [ ] 1つのRunについて、Node別のToken・所要時間・費用区分・終了理由・状態を読み取り専用で取得できる。
- [ ] Run合計（総時間、総Token、Node件数、失敗／timeout件数）を取得できる。
- [ ] metricsを返さないAdapterのNodeが`未記録`として区別され、0と混同されない。
- [ ] `terminationReason`／`errorText`が既存の秘密情報マスクを通る。
- [ ] Electron `FrontdoorPanel`で初期非表示、スイッチONで表示できる。
- [ ] CLIとMCP `inspect`が同一データを返す。
- [ ] 表示・取得が承認、Dispatch、Result採用、Ledger、正本を変更しない。
- [ ] Node／Web／CLI typecheck、Vitest全体、Electron build、`git diff --check`がPass。
- [ ] 外部送信、APIキー、新規依存、commit／pushを行っていない。

## 8. Verification（未実施）

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- | --- |
| 自動 | | Not run | | 未承認のため未着手 |
| 手動 | | Not run | | 未承認のため未着手 |
| 独立レビュー | | Not applicable | | 実装後に実施 |


## 9. Implementation Log（2026-09-09）

### データの実際の所在

Plan策定時は `ExternalCallRecord` の所在を特定していなかった。実装時に確認したところ、Frontdoorイベント `external.call-recorded`（`relay.ts:621`）には `durationMs`／`costTier`／`terminationReason` しか載っておらず、**Token を含む完全な記録は `threads/<threadId>/external-calls.jsonl`（`relay.ts:620`）にある**。

そのため2つの出所を組み合わせる形にした。

| 出所 | 得られるもの | 対象 |
| --- | --- | --- |
| Result Envelope | `durationMs`／`status`／`terminationReason` | **全Node**（Fake含む） |
| `external-calls.jsonl` | Token／`costTier`／`provider`／モデルロード時間 | 外部送信したNodeのみ |

### Provider ごとの Token 名の違い

実データを確認したところ、Ollama は `promptEvalCount`／`evalCount`、OpenAI互換は `promptTokens`／`completionTokens` を返す。**同じ「入力トークン／出力トークン」に別名が付いている**ため、読み手ごとに分岐させず投影側で正規化した。Provider自身が `totalTokens` を返す場合はそれを優先する。

### モデルロード時間の分離

現Runtimeにある唯一の実外部送信（Ollama、`thread-8c1de8c1fcc5d755`）は、29.3秒のうち**18.9秒（65%）がモデルのロード時間**だった。「モデルが遅い」と「モデルが常駐していなかった」は別の問題なので、`modelLoadMs` として分離した。

### 「未計測」と「0」の区別

実装の中心はこの区別である。Fake Adapterは実際に0msで完了する一方、queued のNodeは計測されていない。後者を0で埋めると**最速のNodeとして表示される**。`durationMs` は未実行時に `undefined` のままとし、Token も `tokensRecorded` フラグで「0と報告された」と「何も報告されなかった」を分けた。

Run合計の `totalTokens` には `tokenReportingNodeCount` を併記する。5Node中2Nodeの合計は Run の合計ではない。

## 10. Verification（2026-09-09）

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 49 files / 501 tests**（実装前 48 files / 488、回帰なし） |
| 自動 | `tests/runTelemetry.test.ts` | Pass 13/13 |
| 自動 | `electron-vite build`、`git diff --check` | Pass |
| 手動 | **実Runtimeの6 Runへコンパイル済み実装を適用** | 下記 |

実測では、queued Nodeを持つ `run-113f864f` が「計測済0」、実行済みの5 Runが「0ms」と正しく区別された。全RunがFake Adapterのため Token報告は0 Nodeである。

実Ollamaの計測値は Frontdoor Run に紐づかない Thread にあるため実Runでは現れない。そのためテストに**実記録と同一の数値**（`promptEvalCount: 164`／`evalCount: 77`／`loadDurationNs: 18967963792`）を固定し、正規化とロード時間分離を証明した。

## 11. 残るリスク・未検証事項

- **Token経路は実Runで未検証。** 現Runtimeの全FrontdoorRunがFake Adapterであるため、実データでの確認はテストの固定値に依存する。実Provider送信を含むRunが生まれた時点で再確認が必要。
- UI表示は未実装。`FrontdoorInspection.telemetry` として公開したのみで、Boardには出していない（Scope内だが、表示設計はOwnerの判断を要すると考え分離した）。
- 実価格への換算、Run横断の集計、しきい値アラートは Out of scope のまま。
- 独立レビュー未実施。
