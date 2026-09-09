# Task — ADF-CODEX-SCOPED-WRITE-001: Codexによる実装（書き込み権限の限定付与）

> Status: `Verifying` — 実施済み。**Codexが途中で停止し、Claude Codeが引き継いだため役割分離は成立していない。**
> Type: Authority Grant + Implementation
> Owner: Project Owner
> Implementer: **Codex**（`gpt-6-astra` / `--sandbox workspace-write`）
> Independent Review: **Claude Code**（実装者と分離）
> Date: 2026-09-09
> 前提: [ADF-CODEX-SCOPED-REVIEW-001](ADF-CODEX-SCOPED-REVIEW-001.md)（読み取り権限の付与）

## 1. なぜ役割を入れ替えるか

`ADF-CODEX-REVIEW-RESPONSE-001` で反映したCodexの指摘11件を分類すると、内訳は次のとおりだった。

| 分類 | 件数 |
| --- | ---: |
| **既存コードの不変条件を知らなかった** | **7** |
| 新規に書いたコード自体の穴 | 2 |
| 方法論（テストが実配線を検証していない等） | 2 |

7件が既存コードへの無知に起因する。Task文書上 `Owner: Codex` は28件あり、Frontdoor／Ledger／relay／orchestratorの中核はCodexが実装している。**Claude Codeの失敗は新参者の失敗であり、その文脈はCodexが持っている。**

一方、Claude Codeが新規に書いた独立モジュール（preflight、policyProbe、taskLedgerDriftの中核）ではP1が出ていない。

したがって役割は固定せず、**作業の性質で振り分ける**。

| 作業の性質 | 実装 | レビュー |
| --- | --- | --- |
| 既存の不変条件に深く触れる | **Codex** | Claude Code |
| 新規の独立モジュール・文書 | Claude Code | Codex |

どちらの向きでもCharterの「実装AIと最終レビューAIを分ける」を満たす。

## 2. 権限の範囲

- `codex exec --sandbox workspace-write`。ワークスペース外への書き込みは不可。
- **commit / push はCodexに行わせない。**
- 既定の `sandbox_mode = danger-full-access` は使わず、呼び出し単位で上書きする。設定ファイルは変更しない。
- 対象Taskを明示し、範囲外のファイルへ触れさせない。

### 監査手段

**起動前に作業ツリーをクリーンにする。** これによりCodexが行った変更はすべて `git diff` として可視化され、1行残らず追跡できる。追加の仕組みを要さない。

## 3. 独立性を守る運用規則

Claude CodeはCodexの成果物を**受け入れるか、指摘を差し戻すか**のいずれかとする。**黙って書き換えない。**

黙って直すと実装者が2人になり、どちらの成果物をレビューしたのかが不明になる。レビュー体制が形だけになるため、この規則を明文化する。

## 4. 最初の対象

`ADF-CODEX-REVIEW-RESPONSE-001` で未対応として残した **依頼2-P2**。

> 境界一覧テストは共有関数を直接呼ぶだけで、実際の入口との接続を検証していない。MCP生成側・採用側のガード呼出しを削除しても、このテストは落ちない。

まさに「既存の入口を実際に通す」作業であり、§1の分類で言えばCodex側の領域である。範囲が小さく、失敗しても影響が限定的なため最初の対象として適切である。

## 5. 結果

### 5.1 Codexは途中で停止した

`gpt-6-astra` / `--sandbox workspace-write` で実行し、**使用量上限に達して中断**した（復帰は15:20）。exit codeは0だが、出力末尾に上限エラーが記録されている。

到達範囲は6入口中4つ。

| 入口 | Codexの到達 |
| --- | --- |
| Adapter回答 → `receiveFromAdapter` → Result Envelope | 到達 |
| Participant 生成側（`adf_participant_submit_result`） | 到達 |
| Participant 採用側（`listParticipantEvidence`） | 到達 |
| Recovery → `safeErrorText` | 到達 |
| Frontdoor Result採用（`assertAggregateResultsCurrent`） | **未着手** |
| Work Plane export | **未着手** |

残りの単体テストを `supporting guard unit contracts (not entrance coverage)` と自ら区別してラベル付けしており、「書けないことを書けたことにしない」という依頼条件は守られていた。

### 5.2 Claude Codeが引き継いだ

Ownerの指示により、待たずにClaude Codeが完成させた。**したがって本Taskでは実装者とレビュー担当が同一であり、§3の運用規則は成立していない。** 記録として明示する。

Claude Codeが行った修正は4点。

| 箇所 | 内容 |
| --- | --- |
| `approveDispatch` の呼び出し | 5引数で呼んでいたが実シグネチャは4引数。packets引数は存在しない |
| fixture が Dispatch していなかった | participant submitは `frontdoor.approval-bound` を要求する。これは承認ではなく**実Dispatch実行時**に記録されるため、`executeApprovedRun` を通すよう変更した |
| マスク文字列 | `[REDACTED]` を期待していたが実装は `<redacted>` |
| イベントファイル名 | `events.jsonl` を参照していたが実体は `thread-events.jsonl` |

4件とも既存APIの事実誤認であり、設計判断ではない。Codexは orchestrator のソースを読んでいる最中に上限へ達しており、確認が完了していなかった。

### 5.3 目的の性質を変異テストで実証した

本Taskの目的は「**ガード呼び出しを1箇所削除したら必ずテストが落ちる**」ことだった。実際に削除して確認した。

| 削除したガード | 結果 |
| --- | --- |
| `participantMcpServer` 生成側 | **5件失敗** |
| `participantEvidence` 採用側 | **5件失敗** |
| `resultEnvelope` の Envelope 検査 | **8件失敗** |
| `relay` の `safeErrorText` マスク | **1件失敗** |
| （復元後） | 26件全通過 |

以前の在庫表テストは、これらを削除しても1件も落ちなかった。性質は満たされた。

### 5.4 検証

typecheck 3系統、`vitest run` **535 tests / 50 files**（実施前518、回帰なし）、`electron-vite build`、`git diff --check` すべてPass。

### 5.5 残る課題

- **未着手2入口**（Frontdoor Result採用、Work Plane export）。Codexの復帰後に差し戻す。
- **本Taskの成果を誰も独立レビューしていない。** 実装者=レビュー担当となったため。
- モデル指定を変更した。**実装は `gpt-5.6-luna`、レビューは `gpt-6-astra`。** Astraは消費が激しく、実装用途では上限に達する。
