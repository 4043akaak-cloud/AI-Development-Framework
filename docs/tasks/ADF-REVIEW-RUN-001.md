# Task — ADF-REVIEW-RUN-001: 独立レビューを記録型にする

> Status: `Verifying` — 実装・検証完了。**Frontdoor接続と永続化は `ADF-OWNER-LOOP-CLOSURE-001`（2026-09-10）で実装済み**（`frontdoor-runs/<runId>/reviews/` とLedgerイベント、target hashによるstale判定）。独立レビューとOwner完了承認が残る。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementer: Claude Code
> Date: 2026-09-09

## 1. Objective

Charterが `Done` の条件として要求している独立レビューに、記録としての形を与える。

## 2. Background

Charterは当初から独立レビューを要求しているが、コードベースにその形が無い。`ParticipantRole` に `reviewer` はあるが、**Node の role として一度も使われていない**。

2026-09-08/09に手作業で5回レビューを回した。**壊れたのは常にDispatchの前後**であり、Dispatch自体ではなかった。

| 回 | 何が起きたか |
| --- | --- |
| 1 | P1を3件検出。全件再現。1件はScope外で `deferred` |
| 2 | **stdin待ちで2時間ブロック。exit code 0、所見ゼロ** |
| 3 | 再実行して完了。P1相当を4依頼すべてで検出 |
| 4 | 実装を依頼したが**使用量上限で中断**。exit code 0 |
| 5 | Codexが動けず**Claude Codeが自分の実装をレビュー**した |

2・4は「所見なし」と外形が区別できない。5はCharter違反であり、当日は誰も（何も）気づかなかった。

## 3. 設計

### 3.1 Dispatchは含めない

送信はProviderごとのOwner承認を要する。**便利関数の裏に送信を置くと、その承認が飛ばされる。** 本モジュールは記録とその周辺の判定だけを持つ。

### 3.2 再現状態を型に持つ

Review Artifactは未信頼入力である。レビュアーがコードを読んで結論に達したというだけで、誰かが再現するまでそれは主張である。2026-09-08の11件は全件再現したが、**それは結果であって、手順を省く理由ではない**。

`ReproductionStatus`: `not-attempted` / `reproduced` / `not-reproduced`

### 3.3 中断を状態として持つ

`ReviewCompletion`: `complete` / `incomplete` / `not-run`

2回とも exit code 0 で終わった。状態が無ければ「報告なし」と「終わっていない」が同じ形になる。

### 3.4 独立性をコードで検査する

`assertIndependent()` は実装者とレビュアーが同一のレビューを拒否する。5回目でこれが破れたが、**コードは何も気づかなかった**。

### 3.5 Done可否の判定

`assessReview()` が阻害要因を列挙する。各規則は5回のうちどれかで実際に問題になったものだけである。

- 未実行・中断
- 実装者=レビュアー
- 未再現の所見が残る
- 再現済みなのに処置未定
- **再現済みP0/P1が `accepted` でも `rejected` でもない**（`deferred` は通さない）
- `deferred`／`rejected` に理由が無い

最後の1つは、理由なき却下が「読んでいない」と区別できないためである。

## 4. 検証で分かったこと

テストに5回の実履歴を再現させた際、**モデルが私の期待値を否定した**。

第1回レビューについて「3件とも再現・処置済みだからDone可」と書いたが、`assessReview` は不可を返した。P1-3が `deferred` だったためである。**実際、当日 `ADF-RESULT-SECRET-GUARD-001` は Done にせず `Verifying` で保持していた。** モデルの方が履歴に忠実だった。

期待値を実際の判断に合わせて修正した。

## 5. Verification

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 51 files / 559 tests**（実装前535、回帰なし） |
| 自動 | `tests/reviewRun.test.ts` | Pass 24/24 |
| 自動 | `electron-vite build`、`git diff --check` | Pass |
| 手動 | 5回の実履歴をモデルへ再現 | 4件が正しく「Done不可」と判定。うち1件でモデルが期待値を訂正した |

## 6. 残るリスク・未検証事項

- **Frontdoor への接続は未実装。** `reviewRun.ts` は独立したモジュールであり、Runの一部としてDispatchされる `reviewer` role Node はまだ無い。次の縦切りとなる。
- 永続化の形式を決めていない。現状は型と判定のみで、どこに保存するかは未定。
- Task文書への自動反映は無い。`assessReview` の結果を手で書き写す必要がある。
- 独立レビュー未実施。**本Task自身がレビューされていない。**
