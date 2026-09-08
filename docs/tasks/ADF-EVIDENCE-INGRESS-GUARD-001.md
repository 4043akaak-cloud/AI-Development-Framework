# Task — ADF-EVIDENCE-INGRESS-GUARD-001: 残る受信経路の秘密情報ガード

> Status: `Verifying` — Owner承認済み。実装と自動検証は完了（2026-09-08）。**Codexの設計レビューが実行中で未反映のため、Doneにはしない。**
> Type: Design → Implementation + Verification
> Owner: Project Owner
> Designer: Claude Code
> Design Review: Codex（依頼予定）
> Independent Review: 実装後、実装担当と分離した担当
> Date: 2026-09-08
> 契機: [ADF-CODEX-SCOPED-REVIEW-001](ADF-CODEX-SCOPED-REVIEW-001.md) のP1-3／P2-a／P2-b
> 前提Task: [ADF-RESULT-SECRET-GUARD-001](ADF-RESULT-SECRET-GUARD-001.md)

## 1. Objective

`ADF-RESULT-SECRET-GUARD-001` はResult Envelope経路を閉じたが、外部が書いた自由文字列がEvidence／Ledgerへ永続化される経路は**他に3つ**残っている。それらを同じfail-closed契約の下に置く。

## 2. Background

Codexの独立レビューが、`validateResultEnvelope` の5箇所だけでは受信経路が閉じないことを示した。実コードで再現確認済みの未カバー経路は次のとおりである。

| # | 経路 | 現状 | 外部が書ける内容 |
| --- | --- | --- | --- |
| A | Participant MCP submission | `participantMcpServer.ts:311` が長さ検査のみで `participant-submissions/*.json` へ書き込み、`participantEvidence.ts:113-116` 経由でOwner表示へ届く | `summary`／`content`／`verification[].name`／`verification[].reason`／`risks[]` |
| B | Frontdoor Result採用・Work Plane export | `ownerGates.ts:156-165` の `assertAggregateResultsCurrent` はhashとidentityのみ検査。`reviewResult`（`:402`）とexport（`:503-515`）は `validateResultEnvelope` を呼ばない | ガード導入前に保存されたEnvelope |
| C | Recovery error text | `relay.ts:27` の `safeErrorText` は200文字に切るだけでマスクしない。値は `relay.ts:731` のeventsと `relay.ts:854` のエラーファイルへ永続化される | Adapterの例外メッセージ |

いずれも「Adapterは資格情報を返さない」という**契約への依存**であり、保証ではない。

### この欠陥が生まれた構造

[Observability and Evaluation Baseline](../design/ADF_OBSERVABILITY_AND_EVALUATION_BASELINE.md) が既に指摘しているとおり、ADFは安全境界を**経路ごとに個別実装**してきた。出口（`assertPacketBoundary`）、Work Plane候補（`containsSecretSentinel`）、Result Envelope（今回）はそれぞれ別々に書かれ、互いを知らない。

したがって本Taskの要点は「3箇所に検査を足す」ことではなく、**同じ契約を1つの継ぎ目に集約し、次の追加漏れを検出可能にする**ことである。個別に足すだけなら、4つ目の経路が現れたときに同じことが起きる。

## 3. Final Flow Contribution

- **Final Flow Contribution**: North Starの `specialist AI Nodes → Result / Evidence / Ledger` 区間で、参加者が増えてもOwnerが安全境界を手で点検しなくてよい状態を保つ。
- **Vertical Slice Outcome**: participantが資格情報様の文字列を提出した場合、ADFがディスクへ書かずに拒否し、Ownerへ検出事実だけを提示する。
- **Next Flow Unlocked**: 実Provider・複数参加者へ範囲を広げる際、受信側の安全網が経路によらず一様である状態で判断できる。
- **Deferred Details**: 検出パターンの拡張（AWS／GitHub／Slack token、秘密鍵ヘッダ）、既存Ledgerの遡及スキャン、誤検知時の例外承認導線。

## 4. 設計

### 4.1 継ぎ目の選択

既存コードには**確立した型**がある。`validateResultEnvelope` は生成時（`relay.ts:466`、書き込み直前）と採用時の再読込（`relay.ts:292`）の**両方**で呼ばれている。「書く前に止める」と「採用する前に止める」の二重化である。

経路Aはこの型にそのまま乗る。`participantEvidence.ts:53` の `validateSubmissionShape` は、`validateResultEnvelope` と役割・位置が完全に対応する取り込み側の検証関数である。

```text
Result Envelope :  生成 relay.ts:466  ←→  採用 relay.ts:292          （既存・二重）
Participant     :  生成 participantMcpServer.ts:311  ←→  採用 participantEvidence.ts:53
```

したがって新しい継ぎ目を発明せず、**既存の対称性を埋める**。

### 4.2 共有ガード関数

`src/shared/secretSentinel.ts` へ1つ追加する。`resultEnvelope.ts` のプライベート関数 `assertNoCredentialShapedText` を、汎用形として共有モジュールへ移す。

```ts
export class CredentialShapedTextError extends Error {
  readonly code = 'CREDENTIAL_SHAPED_TEXT'
  readonly source: string
  readonly fields: string[]   // "content (api-key-assignment)" 形式。検出値は含まない
}

/** fields は { フィールド名: 値 } 。undefined と非文字列は無視せず呼び出し側で型検査済みにする。 */
export function assertNoCredentialShapedText(source: string, fields: Record<string, string | undefined>): void
```

`resultEnvelope.ts` はこれを呼ぶ形へ置き換える。エラー型は既存の `ResultEnvelopeRejectedError` を維持したいので、`resultEnvelope.ts` 側で捕捉して詰め替える。**既存の呼び出し元とテストの挙動は変えない。**

### 4.3 経路ごとの適用

| # | 適用箇所 | 対象フィールド | 失敗時 |
| --- | --- | --- | --- |
| A-1 | `participantMcpServer.ts` submission構築後、`writeJsonExclusive` の前 | `summary`／`content`／`verification[].name`／`verification[].reason`／`risks[]` | Tool errorを返し**ファイルを作らない**。`safeToolError` が既にマスク済み |
| A-2 | `participantEvidence.ts` `validateSubmissionShape` の末尾 | 同上 | 例外。取り込み拒否 |
| B | `ownerGates.ts` の `assertAggregateResultsCurrent` | 読み込んだEnvelopeへ `validateResultEnvelope` を追加適用 | 例外。採用・export拒否 |
| C | `relay.ts` `safeErrorText` | 戻り値を `maskSecrets` に通す | マスクして継続（**Cのみ停止しない**） |

### 4.4 Cだけ挙動を変える理由

A・Bは**内容がEvidenceとして採用される**ため、fail-closedで止める。

Cはエラーメッセージであり、止めると「エラーが起きたのにエラーを記録できない」状態になる。復旧経路そのものが壊れるため、ここだけマスクして継続する。マスクは既存の表示層と同じ `maskSecrets` を使う。

この非対称は意図的であり、設計判断として記録する。

### 4.5 次の追加漏れを検出する仕組み

`tests/externalTextBoundary.test.ts` を追加し、**外部由来の自由文字列を永続化・採用する検証関数を明示的に列挙**して、それぞれが資格情報様の入力を拒否することを証明する。

| 境界 | 関数 | 期待 |
| --- | --- | --- |
| Adapter回答 | `validateResultEnvelope` | reject |
| Participant提出（生成） | participantMcpServerのsubmission検査 | reject |
| Participant提出（採用） | `validateSubmissionShape` | reject |
| Work Plane候補 | `validateImplementationCandidate` | reject |
| Frontdoor Result採用 | `assertAggregateResultsCurrent` | reject |

この表は**設計上の境界一覧そのもの**である。新しい境界を追加する者は、この表に行を足さない限り、境界が守られている証拠を持てない。

### 4.6 検討して採らなかった案

- **各書き込み箇所に個別に `containsSecret()` を足す** — 今回の欠陥を生んだやり方そのもの。4つ目の経路で再発する。
- **`writeJsonAtomic` / `writeJsonExclusive` の内部で全書き込みを走査する** — 21箇所の書き込みには hash、Packet、Plan、Projection など外部由来でないものが多数含まれ、誤検知と性能の両方で割に合わない。境界は「誰が書いた文字列か」で引くべきで、「どこへ書くか」ではない。
- **`writeJson*` 呼び出し元のallowlistテスト** — 新しい永続化箇所を機械的に検出できるが、外部由来でない箇所まで巻き込み、更新が形骸化しやすい。4.5の明示列挙のほうが読み手に意味が伝わる。**この判断はCodexの意見を聞きたい点である。**

### 4.7 派生成果物は入口を閉じれば構成上きれいになる（Claude Codeによる独立確認）

Codexの設計レビューを待つ間に、§7-4（塞ぎ切れない経路が他にないか）を実装側でも独立に確認した。結果は**設計を支持する**ものだった。

書き込み箇所を数えると21あるが、大半は**派生成果物**である。すなわち、既に永続化されたデータを組み替えて作られるもので、外部が新しく書いた文字列が入る入口ではない。

| 派生成果物 | 内容の出所 | 入口での保護 |
| --- | --- | --- |
| `obsidianProposal.ts:68` の `markdown` | `inspection`（Run／Aggregate／Evidence参照／Question本文） | Question本文は `turn.questions` 由来（`questionAggregator.ts:8`）で、`buildResultEnvelope` → `validateResultEnvelope` を通る。**ガード済み** |
| `contextCapsule.ts` の Capsule | 同上。`summary`／`content`／`participantEvidence` を直接参照しない | 同上 |
| `relay.ts:199` の Thread | `turns[].content`。ただし `validateResultEnvelope`（`:466`）が先に throw するとTurnが追加されないため、汚染された内容はThreadへ到達しない | **順序で保護** |
| `relay.ts:625` の evidence-links | 参照とhashのみ。自由文字列を含まない | 該当なし |
| `runtime.ts:96-104` の Packet／Plan／Approval | Owner承認済みPacket由来。外部AIが書いた自由文字列ではない | 該当なし |

つまり**入口を閉じれば、派生側は構成上きれいになる**。これは§4.6で「各書き込み箇所に個別に検査を足す」案と「`writeJson*` の内部で全走査する」案を退けた根拠を、実コードで裏づけている。境界は「どこへ書くか」ではなく「誰が書いた文字列か」で引くのが正しい。

裏を返すと、**入口の列挙が不完全なら派生側も汚染される**。`obsidianProposal` はObsidian Vaultという正本へ向かう提案を作るため、入口の網羅性はここで効いてくる。§4.5の境界一覧テストが重要なのはそのためである。

この確認はClaude Code（設計者と同一）が行ったものであり、独立性は無い。Codexの§7-4への回答と突き合わせて確定させる。

## 5. Scope

### In scope

- `assertNoCredentialShapedText` の共有モジュールへの移動と `CredentialShapedTextError` の追加。
- 経路A（2箇所）、B、Cへの適用。
- `tests/externalTextBoundary.test.ts` の追加。
- Task正本、`CURRENT_STATE.md`、Obsidianの更新。

### Out of scope

- 検出パターンの拡張。
- 既存Ledger／Evidenceの遡及スキャン・書き換え。
- 誤検知時の例外承認導線の実装。
- 表示層2箇所（`frontdoorMcpServer.ts`、`collaborationTrace.ts`）の統合。進行中Taskの差分に含まれる。
- `assertPacketBoundary` の変更。

## 6. 想定されるリスク

- **経路Bで既存Envelopeが拒否される可能性。** 実測では現Runtimeの保存済みEnvelope8件は0件拒否だが、他環境では起こりうる。遡及スキャンはOut of scopeなので、拒否時にOwnerが何をすべきかを残存リスクとして明記する。
- **経路Aの誤検知でparticipantが提出できなくなる。** fail-closed方針として一貫するが、例外承認導線が無いため、Ownerが内容を確認して再提出させる運用になる。
- `resultEnvelope.ts` のエラー型詰め替えで、既存の `ResultEnvelopeRejectedError` を期待するテストが壊れないこと。

## 7. Codexへの設計レビュー依頼事項

1. 4.1の継ぎ目選択（既存の生成／採用の二重化に合わせる）は妥当か。より自然な継ぎ目があるか。
2. 4.4のCだけ停止しない非対称は妥当か。
3. 4.5の明示列挙テストで再発を防げるか。4.6で退けたallowlistテストのほうが良いか。
4. この設計で塞ぎ切れない受信経路がまだあるか。
5. 経路Bを入れることで壊れる既存フローがあるか。

## 8. Approval

- Approval required?: **Yes**（実装前）
- 承認記録: 2026-09-08、Project Ownerの「承認します。作業続けて下さい」および「進めて下さい」。
- 承認日時: 2026-09-08

## 9. Implementation Log（2026-09-08、Claude Code）

Codexの設計レビューは実行中だが、Ownerから複数回「進めて下さい」の指示を受けたため、レビュー完了を待たずに実装した。**実装は可逆であり、レビューが戻り次第、指摘を突き合わせてから Done を判断する。**

| 変更 | ファイル | 内容 |
| --- | --- | --- |
| 共有ガード | `src/shared/secretSentinel.ts` | `CredentialShapedTextError` と `assertNoCredentialShapedText(source, fields)` を追加 |
| 走査フィールドの共有化 | `src/shared/participantTypes.ts` | `submissionScanFields()` を追加。**両端が同じフィールドを走査することを1箇所で保証する** |
| Result Envelope | `src/main/jobLoop/resultEnvelope.ts` | 共有ガードを使う形へ置換。既存の `ResultEnvelopeRejectedError` へ詰め替えて呼び出し元の挙動を維持 |
| 経路A-1（生成） | `src/cli/participantMcpServer.ts` | `writeJsonExclusive` の**前**にガード。ファイルを作らずに拒否 |
| 経路A-2（採用） | `src/main/frontdoor/participantEvidence.ts` | `validateSubmissionShape` 末尾にガード |
| 経路B | `src/main/frontdoor/ownerGates.ts` | `assertAggregateResultsCurrent` で `validateResultEnvelope` を再実行。採用・exportを閉じた |
| 経路C | `src/main/jobLoop/relay.ts` | `safeErrorText` を `maskSecrets` に通す。**ここだけ停止せずマスク継続** |
| 境界一覧 | `tests/externalTextBoundary.test.ts` | 新規。境界の在庫表そのもの |

### 設計からの逸脱

**1件。`assertNoCredentialShapedText` は非文字列を無視せず拒否する。**

設計 §4.2 では「型検査済みの値を渡す」前提だったが、実装時に、非文字列を黙って読み飛ばす挙動こそが `ADF-RESULT-SECRET-GUARD-001` のP2-cで指摘された欠陥そのものだと気づいた。呼び出し側のバグを静かに無視するのではなく `(not-a-string)` として報告する。テストで固定した。

### `relay.ts` について

`relay.ts` は進行中の `ADF-MCP-FRONTDOOR-2CYCLE-E2E-001` の未コミット差分に含まれる。経路Cが設計上 In scope のため変更したが、**import 1行と `safeErrorText` の1行のみの加算的変更**で、既存の差分は保持している。設計 §5 で Out of scope とした表示層2箇所（`frontdoorMcpServer.ts`、`collaborationTrace.ts`）には触れていない。

## 10. Verification（2026-09-08）

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` 全体 | **Pass 46 files / 462 tests**（実装前 45 files / 453 tests、回帰なし） |
| 自動 | `electron-vite build` | Pass |
| 自動 | `git diff --check` | Pass |
| 手動 | 既存Runtimeへの影響。**コンパイル済みの実 `validateResultEnvelope`** を保存済みEnvelopeへ直接適用 | **8件中 0件が拒否**。Participant submissionは0件 |

経路Bの影響確認は、前回のようなPythonでの再実装ではなく `out/cli/main/jobLoop/resultEnvelope.js` を読み込んで実施した。再実装の差異による誤った安心を避けるため。

## 11. 残るリスク・未検証事項

- **Codexの設計レビューが未反映。** 実装は完了しているが、設計の妥当性についての独立見解をまだ受け取っていない。Doneにはしない。
- 実装後の独立レビューも未実施。
- 経路Aの誤検知でparticipantが提出できなくなる可能性。例外承認導線は未実装（Out of scope）。
- 経路Bで既存Envelopeが拒否される可能性。現環境では0件だが、他環境では起こりうる。遡及スキャンはOut of scope。
- 検出パターンの限界（引用符付きJSON形、AWS／GitHub／Slack token、秘密鍵ヘッダ）は未対応（Out of scope）。
- commit／pushは未実施。
