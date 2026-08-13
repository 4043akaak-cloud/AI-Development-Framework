# Task — ADF-BOARD-PROJECTION-001: Runtime LedgerをBoardへ読み取り専用で反映する

> Type: Implementation
> Status: Done
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md) / [ADF-RELAY-RECOVERY-001](./ADF-RELAY-RECOVERY-001.md) / [ADF-TASK-PACKET-CLI-001](./ADF-TASK-PACKET-CLI-001.md)

## 1. Objective

静的な手作業Snapshot（`src/renderer/src/data/boardSnapshot.ts`、2026-08-04/05時点で最終更新、`projectId: 'adf'`カードは4件のみで`ADF-JOB-LOOP-001`以降が1件も反映されていない）とは別に、ADF Runtime Ledgerに記録された実際のThread状態を、Boardへ読み取り専用で反映する。

## 2. Approval

- 2026-08-11、Project Ownerが設計（Legacy Snapshot分離、laneマッピング規則）を確定し、実装を指示。
- 実装範囲: Renderer内Projectionのみ。Main / Preload / IPCは変更しない。

## 3. 設計確定事項

- lane変換規則: `open`+`turnCount===0`→`context-plan`、`open`+`turnCount>0`→`implementing`、`awaiting-owner`→`verifying-review`、`recovery-needed`/`failed`/`stopped`→`blocked`（`statusLabel`で区別）、`approved`/`completed`→`done`。
- Legacy Snapshot（既存4件のADFカード＋Block Defenseカード）はLive Boardと別セクション・別集計に分離。自動更新・自動書き換えはしない。
- データソースは既存IPC `window.adfRelay.listThreads()` / `listApprovedTaskIds()` のみ。新規IPCなし。

## 4. Scope

### In scope

- `src/renderer/src/boardProjection.ts`（純粋なlane変換ロジック）。
- `App.tsx`へのLive Boardセクション追加、Legacy Snapshotセクションへの改称・分離。
- 手動Refresh、Runtime空／IPCエラー時の明示表示。
- 単体テスト、実機確認。

### Out of scope

- Main / Preload / IPCの変更。Rendererからのファイル直読み。
- Boardからの承認・停止・継続・Packet書込み。
- GitHub / Obsidianへの自動書込み。APIキー、外部AI、外部送信、課金、認証。
- 自動ポーリング。Static Snapshotの自動書き換え。動的Routing、大規模Dashboard化。

## 5. Implementation Log

| 日時 | 実施者 | 変更 |
|---|---|---|
| 2026-08-11 | Claude Code | `src/renderer/src/boardProjection.ts`を新規追加（`laneForThread` / `statusLabelForThread` / `projectLiveBoard` / `liveLaneCounts`） |
| 2026-08-11 | Claude Code | `App.tsx`にLive Boardセクションを追加し、既存静的Board部分を「Legacy Snapshot」セクションへ分離・改称。Owner確認待ち／Recovery件数のサマリ行と手動Refreshボタンを追加 |
| 2026-08-11 | Claude Code | `styles.css`へLive Board / Legacy Snapshot / badge用スタイルを追加 |
| 2026-08-11 | Claude Code | `tsconfig.node.json`へ`boardProjection.ts`のみを追加（typecheck対象化のため。他のrendererファイルは対象外のまま） |
| 2026-08-11 | Claude Code | `tests/boardProjection.test.ts`（17件）を追加 |

## 6. Verification

| 項目 | 結果 |
|---|---|
| typecheck（node／web） | Pass |
| Vitest | 173 passed / 12 files（既存156 → 新規17件） |
| `electron-vite build` | Pass。`out/main/index.js`（104.22 kB）／`out/preload/index.js`（1.48 kB）が本Task着手前と完全一致 — Main／Preload無変更の物的証拠 |
| 実機: Fake Thread開始→`context-plan`表示 | Pass |
| 実機: `sendFirstTurn`後→`verifying-review`へ遷移、Owner確認待ちバッジ表示 | Pass |
| 実機: 手動Refresh | Pass |
| 実機: Runtime空状態（独立`--user-data-dir`で確認） | Pass。「Threadも承認済みTaskもまだありません」を表示 |
| 実機: Legacy SnapshotがLive lane件数に非混在 | Pass。Legacy「完了4」／Live「完了1」が独立して表示され続けた |
| 実機: コンソールエラー | 0件 |
| 回帰確認 | `laneForThread`の`failed`分岐を`blocked`以外へ改変→該当テストのみ失敗を確認後、復元 |

### 未確認事項（Done扱いを妨げない）

- `open`+`turnCount>0`（`implementing`）の実機表示。Fake Adapterが同期的に応答するため実機の1フレームとして観測できなかった。純粋関数の単体テスト（`laneForThread`）では検証済み。
- `recovery-needed`のLive Board実機表示。安全分類器が実行環境への直接的なRuntime状態注入をブロックしたため、実機の新規デモでは確認できなかった。`recovery-needed`→`blocked`のlaneマッピング自体は単体テストで検証済み。Recovery検出機構自体は`ADF-RELAY-RECOVERY-001`で別途実機検証済み。

上記2件は2026-08-11、Project Ownerが「単体テストで検証済みであり、Doneを妨げない」と判断し、残存リスクとして記録した上でStatusを`Done`とした。

- 実行後、デモ用に作成したTask（`ADF-BOARD-PROJECTION-DEMO-001`）とそのThread／Jobは実runtimeから削除し、既存状態（承認済みTask2件、Thread2件、Job2件）へ復元した。

### 残存リスク

- Legacy Snapshotは引き続き手作業更新のみで、`ADF-JOB-LOOP-001`以降のADFタスクはLive Board側でのみ確認できる。
- Job Ledgerを個別に読み直していないため、将来Thread状態とJob状態が乖離した場合、Live Boardはそれを検出できない。
