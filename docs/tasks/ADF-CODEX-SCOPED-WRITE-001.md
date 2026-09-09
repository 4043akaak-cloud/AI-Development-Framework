# Task — ADF-CODEX-SCOPED-WRITE-001: Codexによる実装（書き込み権限の限定付与）

> Status: `Approved` — Owner承認済み（2026-09-09）。実行中。
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

（実行後に追記）
