# Task — ADF-CODEX-REVIEW-RESPONSE-001: Codex独立レビュー(第2回)の反映

> Status: `Verifying` — 指摘の反映完了。再レビューとOwner完了承認が残る。
> Type: Review Response
> Owner: Project Owner
> Reviewer: Codex（`gpt-6-astra` / read-only sandbox）
> Implementer: Claude Code
> Date: 2026-09-09

## 1. 経緯

`ADF-CODEX-SCOPED-REVIEW-001` の承認範囲で、直近5コミットをCodexへレビュー依頼した。**4依頼すべてが「Done不可」**であった。指摘は全件Claude Codeが実コードで再現確認し、事実と認めた。

### 実行時の障害

1回目の再実行は**stdin待ちでブロック**し、2時間何も進めていなかった。`codex exec` はプロンプトを引数で渡してもstdinを読むため、バックグラウンド実行では `< /dev/null` が必要である。出力も末尾一括ではなく逐次ファイルへ書く形へ変更した（前回は中断で全損した）。

## 2. 指摘と対応

| 指摘 | 内容 | 対応 |
| --- | --- | --- |
| 依頼1 P1 | `verification[].reason` がオブジェクトだと形状検査を通り、走査で黙って除外される | 修正 |
| 依頼2 P1 | `maskSecrets` が代入形式しか置換せず、裸の `sk-…`／`Bearer …` を素通しする | 修正 |
| 依頼2 P1 | `ExternalCallRecord.errorText`／`errorRef` がResult検証前に無マスクで永続化される | 修正 |
| 依頼2 P1 | `exportWorkPlaneArtifact` が独自の読込ループを持ち Envelope 検証を呼ばない | 修正 |
| 依頼2 P2 | 境界一覧テストが共有関数を直接呼ぶだけで、実配線を検証していない | **未対応** |
| 依頼3 P2 | `gateEnteredBy` が `owner-decision-recorded` を扱わず、通常のGate進行を取りこぼす | 修正 |
| 依頼3 P2 | 同一Gateの再通知で滞留時間がリセットされる | 修正 |
| 依頼3 P3 | `run-completed` の扱いが replay と厳密には不一致 | **未対応** |
| 依頼4 P2 | `relay.ts:540` が `durationMs: 0` を固定するため実測時間が出ない | 修正 |
| 依頼4 P2 | Envelope作成前に失敗したNodeが失敗件数から漏れる | 修正 |
| 依頼4 P2 | `startsWith('run-')` が `.staging-` を Run と誤検出する | 修正 |
| 依頼4 P2 | 読取失敗を空在庫に変換し「乖離なし」と誤報告する | 修正 |

## 3. 特に重い2件

### 3.1 滞留計測が通常経路を丸ごと取りこぼしていた

`gateEnteredBy()` は `eventLedger.ts:173-184` の明示的なイベントswitchだけを写しており、**`eventLedger.ts:44-49` の `advanceOwnerGate`** を見ていなかった。この関数はOwner Decisionの蓄積から `intake → completion-shape → decomposition → dispatch` を導出する。

つまり**ほぼすべてのRunが通る経路で、待ち時間が `undefined` になっていた**。これは前回の「`owner-gate-opened` はintakeでしか発火しない」と同じ種類の誤りを、一段下の層で繰り返したものである。replayを写す際に、どこまでがreplayなのかを確認していなかった。

### 3.2 Telemetryの実測時間が常に0だった

`relay.ts:540` が `buildResultEnvelope` で `durationMs: 0` をハードコードしている。Telemetryは Envelope の値だけを読んでいたため、**29秒のOllama呼出しも `totalDurationMs: 0` と報告される**。実測値は `ExternalCallRecord.durationMs` にあり、これを入力型から除外していた。

「未計測とゼロを区別する」という本Taskの中心的主張が、実生成経路では成立していなかった。

## 4. 未対応として残すもの

- **依頼2 P2（境界テストの実配線検証）**: 各入口を実際に通すテストが必要。設計変更を伴うため別Taskとする。
- **依頼3 P3（`run-completed` の `status` 分岐）**: 現行の生成側は `complete` のみ発行するため影響が無い。記録に留める。
- 依頼4の「Threadの最終callのみを見ており再試行分の総消費量ではない」点。仕様として明記した。

## 5. Verification

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 50 files / 518 tests**（反映前 512、回帰なし） |
| 自動 | `electron-vite build`、`git diff --check` | Pass |
| 手動 | 実Runtimeでの滞留計測 | Cycle 1 = 18日、再受付Run = 17日（修正前と同値。既存2件は決定駆動経路を通らないため） |
| 手動 | 実リポジトリでの drift 検査 | `undocumented Runs: none`（記録漏れRunは本Task群の文書化で解消） |

テストには指摘由来の回帰を固定した。`durationMs` を外部call記録から取ること、同一Gate再通知で時計が戻らないこと、決定駆動のGate進行を追えること、マスク後に資格情報の値が残らないこと。

## 6. 残るリスク

- 再レビュー未実施。**修正後のコードは誰も独立レビューしていない。**
- `maskSecrets` の出力が旧インラインマスクと同一でなくなった。表示層の出力も変わる（より多く伏せる方向）。
- 依頼2 P2 と 依頼3 P3 が未対応。
