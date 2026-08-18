# ADF-WORKPLANE-CANDIDATE-REVIEW-001

Status: Implementing

## 1. Objective

`ADF-WORKPLANE-IMPLEMENTATION-AGENT-001` が生成・検証した隔離 Work Plane 内の `candidate-file-set`（候補成果物）に対し、Project Owner が安全に Candidate 本文・hash・binding・影響範囲を確認し、「採用（`accept`）」または「差し戻し（`reject` / `follow-up`）」を決定・記録する評価専用タスク。

## 2. Scope

### In scope

- Candidate Artifact（相対パス、本文、`contentHash`、`candidateHash`、binding metadata）の完全不変（immutable）読取り
- 共通 Candidate Review Application Service (`FrontdoorOwnerGateService`) の 4 API 実装：
  - `listReviewableCandidates()`
  - `inspectCandidate(candidateId)`
  - `startCandidateReview(candidateId)`
  - `reviewCandidate(input)`
- `inspectCandidate` 成功時に `frontdoor.candidate-review-started` イベントを Runtime Ledger へ追記する冪等な状態遷移（`generated` → `owner-review`）
- `events.jsonl` から導出される Review State（`generated` → `owner-review` → `accepted` / `rejected` / `follow-up`）
- `accepted`, `rejected`, `follow-up` の終端状態（Terminal States）と再変更拒否
- `targetHash` 照合、`candidateHash` 照合、`expiresAt` 超過拒否、Binding 不一致拒否、`candidate-review-started` 不在拒否の厳密な検証
- CLI (`src/cli/frontdoorOwnerLoop.ts`) および Electron UI (`src/renderer/src/FrontdoorPanel.tsx`) からの同一 Application Service 利用
- Runtime Ledger 以外への書込み禁止（Canonical repo / Obsidian のゼロ変更比較検証）
- Node/Web/CLI Typecheck、Vitest、`electron-vite build`、実機 UI 表示・操作確認

### Out of scope

- Canonical repo (正本) / Obsidian への自動書込み・自動パッチ適用（`ADF-CANONICAL-INTEGRATION-001` へ延期）
- MVP における `superseded` の自動判定
- 独立 Review AI や実外部 Provider（Anthropic 等）による自動審議・自動採用

## 3. Design

```text
[generated]
    ↓ (startCandidateReview / inspectCandidate -> frontdoor.candidate-review-started)
[owner-review]
    ├──────→ [accepted]  (終端状態: Owner 承認、Canonical 統合待ち)
    ├──────→ [rejected]  (終端状態: 不採用確定)
    └──────→ [follow-up] (終端状態: 指摘・再提案要求)
```

1. **共通 Application Service API**: `FrontdoorOwnerGateService` に 4 メソッドを実装し、CLI / IPC はすべてこれを呼び出す。
2. **Owner Decision Envelope**: `taskId`, `candidateId`, `candidateHash`, `targetHash`, `approvedBy`, `capability: 'candidate-review'`, `decisionId`, `decidedAt`, `expiresAt`, `decision` を含む。
3. **targetHash の定義**: `hashJson({ runId, candidateId, candidateHash, sourceResultHash, parentReviewDecisionId })`
4. **書き込み制限**: 書き込みは `runtime-root/frontdoor-runs/.../events.jsonl` のみとし、Canonical repo 及び Obsidian は変更前後の status / diff / SHA-256 ハッシュを比較検証する。

## 4. Acceptance Criteria

1. `inspectCandidate` の成功により `frontdoor.candidate-review-started` イベントが追記され、`owner-review` 状態へ移行した Candidate のみ判定を受け付ける。
2. `frontdoor.candidate-review-started` イベントが存在しない Candidate に対する Decision を拒否する。
3. Candidate 本文の `contentHash` および `candidateHash` を再計算し、改ざんがある場合は即座に停止する。
4. Candidate / parent Result / Evidence / Job / Thread の Binding 不一致がある Decision を拒否する。
5. `expiresAt` タイムスタンプを超過している Decision を拒否する。
6. Owner の Decision（`accept` / `reject` / `follow-up`）が正確な `targetHash` とバインドされて Event Ledger に追記され、状態が終端状態へ遷移する。
7. `accepted`, `rejected`, `follow-up` に一度達した Candidate に対する二重 Decision や再変更が拒否される。
8. Candidate Review による書き込みが Runtime Ledger のみに限定され、実行前後の status / diff / ファイルハッシュ比較によって Canonical repo および Obsidian が完全無変更であることが検証できる。
9. CLI と Electron UI がともに同一の共通 Application Service の 4 API を使用し、直接の Ledger 操作を行わない。
10. Node/Web/CLI の Typecheck, Vitest がすべて Pass する。
11. `electron-vite build` が成功し、`FrontdoorPanel.tsx` で Candidate 選択・表示・判定操作が正常に動作する。

## 5. Stop Conditions

- Candidate の `candidateHash` または `contentHash` の不一致・改ざん検出
- Runtime Ledger 以外の領域（Canonical repo や Obsidian 正本等）への書き込みが検出された場合
- Candidate / parent Result / Evidence / Job / Thread の Binding 破綻・不一致
- `frontdoor.candidate-review-started` イベント不在、終端状態からの再変更試行、または `expiresAt` 切れが検出された場合
- 外部 AI への送信、認証キーの要求、課金が発生する場合
- 同一の検証失敗が 2 回連続、または異なる検証失敗が 3 回続いた場合

## 6. Implementation Log

- 2026-08-15: 実装開始。
