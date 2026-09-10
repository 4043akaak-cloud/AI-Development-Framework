# Task — ADF-OWNER-LOOP-CLOSURE-001: Ownerがループを離れずに一周できるようにする

> Status: `Verifying` — 実装・自動検証・実Runtime確認まで完了。独立レビューは中断（下記）。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementation: Claude Code（`92791b1`, `3d39b32`, `4352d94`, `cdbfc47`, `4cdeb60`）
> Independent Review: Codex（2026-09-10、接続エラーにより中断。指摘1件のみ受領し反映済み）
> Date: 2026-09-10

## 1. Objective

Blueprint の進捗指標「Owner が窓口から指示を出し、**ADFのワークフローを離れずに**次の指示を出せるか」に対して No だった3点を塞ぐ。

## 2. 塞いだ3点

### 2.1 Dispatch Gate の手作業 Packet（提案1）

`FrontdoorPanel.tsx` の Dispatch ボタンは `packetsReady` が false の間無効で、ツールチップは「approved-tasks へ配置してください」だった。Owner はアプリを出て `approved-tasks/<childTaskId>.json` を手で書き、4つのhashを自分で計算して戻る必要があった。Cycle 1 が 2026-08-21 に止まった一因でもある（Packet が存在せず停止）。

`deriveChildPackets()` が承認済み Plan から導出する。**新しい権限は与えていない**。Owner が明示するのは approval 封筒（誰が・どの承認IDで・いつまで）だけで、これは Plan のどこにも存在しないため既定値を置かない。導出後に Dispatch Decision がそのバイト列のhashを束縛するため、Owner は「生成されたもの」を承認する。

Plan より狭くした点が2つある。capabilities は Node 自身のもので Request 全体のものではない（Decomposition で承認した以上を子に渡さない）。`allowedFiles` は空（Frontdoor の子は提案するだけで書かない。書く必要があるものは Work Plane export の Gate を通る）。

### 2.2 独立レビューの記録先（提案2）

`reviewRun.ts` は自テスト以外からimportされておらず、レビューが通ったかを計算できても置き場所がなかった。結果としてレビューは Task ヘッダの散文であり、同じ人が端末から書き写していた。**`Verifying` が19件滞留していた原因である。**

`frontdoor-runs/<runId>/reviews/<reviewId>.json` へ保存し、Ledger イベントを併記する。Plan と Result 集合に対する target hash を持つため、**Runが先に進んだ後のレビューは stale として報告され、Runを通さない**。

不合格のレビューも記録する。未再現の所見や実装者=レビュアーのレビューこそ、散文運用で失われていた証拠である。拒否するのは既存レビューの上書きだけ（後からの好意的な読み直しが、何かを見つけた記録を静かに置き換えないため）。

### 2.3 実装Runの入口（提案3 / Blueprint Step 3）

`prepareImplementationRun` と `materializeImplementationPacket` は service 層に存在しながら IPC・CLI・UI・MCP のどれからも呼ばれておらず、**実装Runはテストコードからしか作れなかった**。5経路をIPCとCLIへ接続した。

## 3. Verification

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 54 files / 592 tests**（着手前 568、回帰なし） |
| 自動 | `electron-vite build`、`git diff --check` | Pass |
| 自動 | 変異テスト（generic entrance の guard を削除） | 対応テストが落ちることを確認 |
| 手動 | **実Runtime** `run-46fb83d3a359e5aec308` | prepare → 3 Gate 承認 → derive-packets → Dispatch承認 → dispatch を**手書きPacket0件**で完走。proposal/critic とも `completed` |
| 手動 | 実Runtime での自己レビュー記録 | `doneEligible: false`、`the reviewer and the implementer are both "Claude Code"` を検出 |

## 4. 実装中に自分で見つけた欠陥

導出は当初、既存 Packet を一切上書きしない設計だった。しかし導出した承認は既定24時間で、**Owner が Dispatch を承認する前に失効すると、Packet は dispatch できず（`validateApprovedTask` が期限切れを拒否）再導出もできない**状態になる。これは Cycle 1 で19日間Runを閉じられなくした「1時間で失効する Result Review」と同じ罠であり、それを取り除くために作った経路に書き込んでいた。`cdbfc47` で、**誰にも dispatch できない Packet のときだけ**置き換える形へ修正した。

## 5. レビュー指摘と対応

Codexのレビューは接続エラーで中断し、最終所見は受け取っていない。中断前に1件の指摘があり、これは反映した。

- **generic Thread entrance の権限迂回**: `startApprovedThread` は `approved-tasks/` の Packet を Frontdoor Decision を見ずに実行する。手作業配置しかなかった間は安全だったが、ADFが同じ場所へ Packet を導出するようになると、**Dispatch Gate を通らずに Run の Node を実行できる**。検証したところ現状は塞がっている（`asIdentifier` が `:` を禁じ、子taskIdは `::` を含む）が、**これは偶然であり、識別子の形も childTaskId の規約もこの防御のために書かれていない**。`4cdeb60` で明示的な規則にした。テストも偶然に依存させず、受理される taskId へ同じ Packet を複製して guard 自体を検証している。

## 6. 残るリスク・未検証事項

- **独立レビュー未完了。** 中断のため、`92791b1`〜`4cdeb60` は1件の指摘を除きレビューを受けていない。Charter の Completion Rule 上、本Taskを `Done` にはできない。
- MCP には Candidate 系ツールが無いままである（窓口AIは accepted Candidate を消費できるが、一覧・確認・判定ができない）。
- 実装Run経路は実Runtimeで未実行。自動テストのみ。
