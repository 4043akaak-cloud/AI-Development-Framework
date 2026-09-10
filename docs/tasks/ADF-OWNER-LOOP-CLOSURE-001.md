# Task — ADF-OWNER-LOOP-CLOSURE-001: Ownerがループを離れずに一周できるようにする

> Status: `Verifying` — 実装・自動検証・実Runtime確認まで完了。独立レビューは中断（下記）。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementation: Claude Code（`92791b1`, `3d39b32`, `4352d94`, `cdbfc47`, `4cdeb60`）
> Independent Review: Codex ×2（2026-09-10。1回目 P1×6・P2×3 → `4cdeb60` `e429cd6`。2回目 P1×2・P2×4 → `b37da51`。**未対応P2が3件残る**）
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
| 自動 | `vitest run` 全体 | **Pass 54 files / 602 tests**（着手前 568、回帰なし） |
| 自動 | `electron-vite build`、`git diff --check` | Pass |
| 自動 | 変異テスト（generic entrance・reviewId検査・レビュー束縛・導出hash照合の各guardを削除） | いずれも対応テストが落ちることを確認 |
| 手動 | **実Runtime** `run-46fb83d3a359e5aec308` | prepare → 3 Gate 承認 → derive-packets → Dispatch承認 → dispatch を**手書きPacket0件**で完走。proposal/critic とも `completed` |
| 手動 | 実Runtime での自己レビュー記録 | `doneEligible: false`、`the reviewer and the implementer are both "Claude Code"` を検出 |

## 4. 実装中に自分で見つけた欠陥

導出は当初、既存 Packet を一切上書きしない設計だった。しかし導出した承認は既定24時間で、**Owner が Dispatch を承認する前に失効すると、Packet は dispatch できず（`validateApprovedTask` が期限切れを拒否）再導出もできない**状態になる。これは Cycle 1 で19日間Runを閉じられなくした「1時間で失効する Result Review」と同じ罠であり、それを取り除くために作った経路に書き込んでいた。`cdbfc47` で、**誰にも dispatch できない Packet のときだけ**置き換える形へ修正した。

## 5. レビュー指摘と対応

Codexは **P1を6件、P2を3件** 指摘した。全件を `4cdeb60` と `e429cd6` で反映した。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | P1 generic Thread entrance が Frontdoor Decision を見ずに Packet を実行できる | `4cdeb60`。現状は塞がっていたが**偶然**（`asIdentifier` が `:` を禁じ子taskIdは `::` を含む）だったため明示的な規則にした |
| 2 | P1 導出と承認の間で Packet を差し替えると、ADF生成物として承認される | 導出時にhashをLedgerへ記録し、Dispatch承認時に不一致を拒否。導出イベントの無いRunは無変更 |
| 3 | P2 導出がNode固有の `scope.outOfScope` を落とす／binding無しの実装Runを通す | 双方修正 |
| 4 | P1 期限切れPacketがUI上「準備済み」に見え、再導出経路が無い | `packetsReady` を「存在するか」から「dispatchできるか」へ変更 |
| 5 | P2 `packetStillUsable` が `nodeId` を見ず、別Node用Packetを保護しうる | nodeIdを binding 判定へ追加 |
| 6 | P1 **見てもいないRunを通すレビューを記録できる** | RunIDと実際に生成されたResult hashの引用を必須化 |
| 7 | P1 **`reviewId` によるパストラバーサル** | 識別子として検証し、解決後パスがRunのreviewsディレクトリ内にあることも別途要求 |
| 8 | P1 完了がCharterの要求する独立レビューを参照しない | ブロックはせず（Ownerの判断であり、既存Runを全て詰まらせる）、**未レビュー完了をDecisionへ明記**する形にした |
| 9 | P2 レビューのファイル書き込みとLedger追記が非原子的 | 追記失敗時に孤児ファイルを削除（残ると再試行が排他書き込みで永久に失敗する） |

指摘なしとされた領域: Dispatch Decision確定後のPacket差し替え拒否、`listReviewRuns` の改ざん検出の整合性、`inspect-reviews`／`prepare-implementation` 自体の権限。

**7番は私が作り込んだ脆弱性である。** `reviewId` は呼び出し側のJSONに入って来る値で、非空文字列としてしか検査せずファイル名へ直接展開していた。`../../../../etc/adf-pwned` は runtime root の外へ解決する。

### 5.2 2回目のレビュー（反映後のコードに対して、`b37da51`）

1回目の対応が入った状態を再レビューし、**P1を2件・P2を4件**指摘した。P1は両方とも修正した。

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | P1 **`dispatch → question → answer → dispatch` が完走できない** | 修正。再現してから直した |
| 2 | P1 **中身の無いReview PacketでRunをclearedにできる** | 修正 |
| 3 | P2 `reviewTargetHash` がレビュー対象そのものを束縛していない | **未対応** |
| 4 | P2 導出がRun claim／atomic batchでない | **未対応** |
| 5 | P2 contextの意味付けが位置依存、Matcherが完全一致でない | **未対応** |
| 6 | P2 実装PacketをDispatch Gate前に active approval として materialize できる | **未対応** |

**1番は既存の欠陥で、私の変更が原因ではない。** ただしQuestionを出した1 Node構成のRunが詰まる以上、「Ownerがループを離れずに一周できる」という本Taskの目的に対する穴であり、範囲内として直した。Questionに回答するとRunとNodeが承認時と同一状態へ戻るため、2回目のDispatchが1回目と同じtarget hashになり、`approveDispatch` は既存Decisionを返し、dispatch はそれを消費済みとして拒否していた。Dispatch承認にLedger由来のepochを持たせ、各試行が独自のDecisionになるようにした（Runへ新フィールドを足すとreplayが完全再現しない限り既存Runが全て読めなくなるため、保存せず導出する。epoch 0 では省略するので既存Decisionのtarget hashは不変）。

**2番も私の作り込みである。** 記録入口は `files`／`claims` が配列であることしか見ておらず、`buildReviewPacket` が非空を要求しているのにIPC経由でそれを迂回できた。さらにRun/Resultの引用がpacket全体に対する部分文字列検索だったため、`revisionRange` にRun IDとResult hashを貼るだけで通った。構造化フィールド（`reviewedRunId`／`reviewedResultHashes`）による厳密照合へ変更し、**Runが生成した全Resultを網羅すること**を要求した。

## 6. 残るリスク・未検証事項

- **未対応のP2が4件ある**（2回目レビューの3〜6番）。いずれも「現状の設計意図に対しては妥当だが、より強くできる」種類の指摘で、Owner判断を要する設計変更を含む。
- **反映後（`b37da51`）のコードは未レビュー。** Charter の Completion Rule 上、本Taskを `Done` にはできない。
- 2回目レビューはテスト実行に失敗している（Vitestが一時ディレクトリ作成の `EPERM` で起動前に停止）。**静的レビューのみである。**
- MCP には Candidate 系ツールが無いままである（窓口AIは accepted Candidate を消費できるが、一覧・確認・判定ができない）。
- 実装Run経路は実Runtimeで未実行。自動テストのみ。
- 8番はブロックではなく記録に留めた。**完了時に独立レビューを必須とするかはOwnerの方針判断**であり、必須化すると既存Runは全て完了できなくなる。
