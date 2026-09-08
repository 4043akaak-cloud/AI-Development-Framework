# Task — ADF-OWNER-GATE-STALENESS-001: Owner Gate 滞留の可視化

> Status: `Verifying` — 実装・検証完了。独立レビューとOwner完了承認が残る。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementer: Claude Code
> Independent Review: 未実施
> Date: 2026-09-09

## 1. Objective

Owner の判断待ちで止まった Run が、どの Gate で、いつから止まっているのかを読み取り専用で提示する。

## 2. Background — 実測した滞留

2026-09-09時点で、2件が長期滞留していた。どちらも誰も気づいていなかった。

| Run | Gate | 開始 | 滞留 |
| --- | --- | --- | --- |
| `run-7987794137baa1041b91`（2Cycle Cycle 1） | `awaiting-owner:completion` | 2026-08-21 | **19日** |
| `run-113f864f003c8caaf2cb`（次Request再受付確認） | `awaiting-owner:intake` | 2026-08-22 | **18日** |

Board には既に「判断・確認待ち」のカウンタがある（`FrontdoorPanel.tsx:371`）。**それでも19日間見落とされた。** 件数しか出ておらず、どの Gate が、どれだけ放置され、次に何をすべきかが分からないためである。実際、コード全体を検索しても滞留時間を扱う箇所は1つも無い。

これは細部の改善ではない。North Star は `Owner → 窓口AI → ADF → 複数AI → 統合回答 → 次の指示` のループであり、**Owner が判断待ちに気づかない限りループは止まったままになる**。まさにそれが19日間起きていた。

## 3. Final Flow Contribution

- **Final Flow Contribution**: `Owner decision` の各地点で、ループが止まっていることを Owner に気づかせる。
- **Vertical Slice Outcome**: Owner が Board／CLI／MCP のどれからでも「いま何日、どの Gate で止まっているか」を一覧できる。
- **Next Flow Unlocked**: 滞留が可視化されることで、Cycle 1 のような取り残しが次のPhaseへ持ち越されなくなる。
- **Deferred Details**: 通知・アラート、閾値のUI設定、自動催促、滞留の自動解消。

## 4. 設計

### 4.1 滞留時間の出所

`FrontdoorRunSummary.updatedAt` は使わない。Cycle 1 の `updatedAt` は `2026-08-21T02:59:38`（Run 作成時刻）を返す一方、最後の Owner Decision は `04:17:23` であり、**現在の Gate が開いた時刻を表していない**。

代わりに Event Ledger を読み、`frontdoor.owner-gate-opened` のうち**現在の Gate に対応する最新のもの**を起点とする。Ledger は追記専用の正本なので、この値は再生可能で改変されない。

### 4.2 Projection

```ts
export interface OwnerGateWaitReport {
  runId: string
  gate: OwnerGate
  openedAt: string
  waitingMs: number
  waitingDays: number
  nextAction: string        // 既存の nextAction をそのまま使う
  severity: 'fresh' | 'aging' | 'stale'
}
```

`severity` の境界は `aging` が3日、`stale` が7日。ここは運用で調整する前提の定数とし、UIからは変更させない。

Activity Trace / Goal Alignment と同じく **Event Ledger から毎回派生する読み取り専用 Projection** とし、canonical source にしない。

### 4.3 公開先

- `FrontdoorInspection.ownerGateWait?` — 1 Run 分。Board／CLI／MCP inspect が同じ値を見る。
- 一覧用に、Run 横断で待ち Gate だけを集めた関数を追加する。Board のカウンタを、件数だけでなく**最長滞留日数**を併記する形へ変える。

### 4.4 やらないこと

- 通知・催促・自動解消。ADFは Owner の判断を代行しない。
- 閾値の永続化やUI設定。まず実測を出すことが目的である。
- `updatedAt` の意味変更。既存の互換性を壊さない。

## 5. Scope

### In scope

`src/main/frontdoor/ownerGateWait.ts`（新規）、`src/shared/frontdoorTypes.ts` への型追加、Orchestrator／CLI／MCP の inspect 投影、`FrontdoorPanel` のカウンタ表示、テスト、Task／CURRENT_STATE 更新。

### Out of scope

通知、アラート、自動催促、Owner Decision の生成、Ledger への書込み、外部送信、新規依存。

## 6. 実装中に判明した2つの誤り

### 6.1 Board のカウンタは全Runを数えていた（バグ）

`FrontdoorPanel.tsx:330` は `entry.ownerGate !== null && entry.ownerGate !== undefined` で「判断・確認待ち」を数えていた。`ownerGate` は完了Runでも `'completed'` という値を持つため、**この条件は常に真**である。画面の「協業履歴 6 / 判断・確認待ち 6 / 完了Run 4」がその結果で、6件中6件が待ちと表示されていた。

数が実態と無関係に全件を指し続けたため、この指標は読まれなくなっていた。**19日の見落としの直接原因はここである。** `awaiting-owner:` で始まる状態だけを数えるよう修正した。

### 6.2 `owner-gate-opened` は intake でしか発火しない（設計の誤り）

§4.1で「`frontdoor.owner-gate-opened` の最新を起点にする」と設計したが、実データで検証したところ**Cycle 1に待ち情報が出なかった**。このイベントはintakeでのみ記録され、他のGateは別イベントの副作用として遷移していた。

`eventLedger.ts:173-184` を読むと、Gateを動かすイベントは11種類ある。`completion` は `result-review` の `accept` によって、`result-review` は `completion-proposed` によって、`dispatch` は `node-review-continued` 等によって開く。

**本Taskが捕まえるべき唯一の事例で、初版は何も報告しなかった。** replayと同じ規則でGate遷移を判定する `gateEnteredBy()` へ書き換え、`approval-bound`／`run-stopped`／`run-completed` はGateから離れる遷移として計測を打ち切るようにした。

実データで再確認し、Cycle 1が18日・起点 `2026-08-21T04:17:23.747Z`（Result Review acceptの時刻）と正しく報告されることを確認した。`updatedAt` の `02:59:38` ではない。

## 7. Verification

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 47 files / 476 tests**（実装前 46 files / 462、回帰なし） |
| 自動 | `tests/ownerGateWait.test.ts` | Pass 14/14 |
| 自動 | `electron-vite build` | Pass |
| 自動 | `git diff --check` | Pass |
| 手動 | **実Runtimeの6 Runへコンパイル済み実装を適用** | Cycle 1 = 18日 `stale`、再受付Run = 17日 `stale`、完了4件は報告なし |

テストには実データ由来の回帰を固定した。特に「`owner-gate-opened` だけを見ると19日Runを取りこぼす」ケースは、Gateを開く11イベントすべてを網羅するテストとして残した。

## 8. 残るリスク・未検証事項

- `gateEnteredBy()` は `eventLedger.ts` のreplayを**手で写した**ものであり、replay側にGate遷移が追加されると同期が外れる。両者を1箇所から導く統合は本Taskの範囲外とし、後続候補として記録する。
- 閾値（3日／7日）は定数。運用実績が無いため、妥当性は未検証。
- Board表示の実画面確認は環境上未実施。
- 通知・催促は実装していない（Out of scope）。

