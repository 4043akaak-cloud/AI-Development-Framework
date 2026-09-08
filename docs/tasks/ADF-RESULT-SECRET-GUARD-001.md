# Task — ADF-RESULT-SECRET-GUARD-001: Result受信経路の秘密情報fail-closed検査

> Status: `Verifying` — Codexの独立レビューでP1を3件検出。うち2件（+P2を1件）は修正済み。**残る1件（Participant MCP submission経路）はScope外のためOwner判断待ちで、この間はDoneにしない。**
> Type: Implementation + Verification
> Owner: Project Owner
> Implementer: Claude Code（2026-09-08）
> Independent Review: **未実施**。実装担当と分離する必要がある（`adf-independent-review`）
> Branch: `codex/adf-mcp-frontdoor-2cycle-e2e`（進行中差分と衝突しないファイルのみを変更）
> Date: 2026-09-08
> Related: [Observability and Evaluation Baseline](../design/ADF_OBSERVABILITY_AND_EVALUATION_BASELINE.md) / [Adapter契約 §5](../design/ADF_AGENT_ADAPTER_CONTRACT.md)

## 1. Objective

Adapterが返した回答本文が、秘密情報を含んだままResult EnvelopeとEvidenceへ永続化されうる経路を塞ぐ。

## 2. Background

[Adapter契約 §5](../design/ADF_AGENT_ADAPTER_CONTRACT.md)は「APIキー、token、個人情報、認証コードをContext・Artifact・Git・Obsidian・Ledgerに記録しない」と定めている。実装状況を経路ごとに確認した結果は次のとおりである。

| 経路 | 現在の検査 | 実装 |
| --- | --- | --- |
| 送信（ADF → Adapter） | `assertPacketBoundary`でfail-closed | `src/main/jobLoop/syntheticPacket.ts:61-88` |
| Work Plane候補 | `containsSecretSentinel`で書き込み拒否 | `src/main/frontdoor/candidateArtifact.ts:19-38` |
| **受信（Adapter回答 → Result Envelope → Evidence）** | **なし** | `src/main/jobLoop/resultEnvelope.ts` |
| 表示 | 正規表現マスク | `activityTrace.ts:5` ほか3箇所 |

受信経路には検査が無い。表示時にマスクされるため画面には出ないが、`events.jsonl`とEvidenceファイルには原文のまま残る。Adapterが自身の環境変数、設定ファイル、エラーログを引用した場合、ADFはそれを検出せずに保存する。

Adapterは外部のAIであり、「Resultに資格情報を含めない」は契約であって保証ではない。[Blueprint §7](../project/ADF_PRODUCT_COMPLETION_BLUEPRINT.md)はcredential exposureを、記録して先送りしてよい微細な指摘から明示的に除外している。

## 3. Final Flow Contribution

- **Final Flow Contribution**: North Starの`specialist AI Nodes → Result / Evidence / Ledger`区間で、Ownerが安全境界を自分で点検しなくてよい状態を保つ。
- **Vertical Slice Outcome**: Adapterが資格情報様の文字列を返した場合、ADFがResultを保存せずに停止し、Ownerへ検出事実だけを提示する。
- **Next Flow Unlocked**: 外部Providerへの実送信範囲を広げる際、受信側の安全網が先に存在している状態で判断できる。
- **Deferred Details**: エントロピーベースの検出、個人情報の検出、既存Ledgerの遡及スキャン、検出パターンの外部設定化。

## 4. Scope

### In scope

- `containsSecretSentinel`（`candidateArtifact.ts`）と表示層マスクのパターンを、共有ユーティリティへ統合する。
- Result Envelope生成時に、Adapter回答本文へ同じ検査を適用する。
- 検出時はResultを保存せず、Nodeを失敗として停止しOwner判断待ちにする（fail-closed）。
- 検出記録は`adapterId`／`role`／`nodeId`／検出パターン名のみとする。**検出された文字列そのものは記録しない。**
- 既存の`candidateArtifact`と表示層の挙動が変わらないことの回帰確認。
- Task正本、`CURRENT_STATE.md`、Obsidianノートの更新。

### Out of scope

- 既存`events.jsonl`の遡及スキャン・書き換え（Ledgerは追記のみの正本である）。
- 検出パターンの拡張（エントロピー判定、個人情報、社内固有語）。
- 自動マスクして保存を続行する挙動。**検出時は止める。**
- 送信経路（`assertPacketBoundary`）とWork Plane候補経路の変更。
- 外部送信、APIキー、新規依存、commit／push。

### 触れてはいけない部分

- `assertPacketBoundary`の判定内容（本Taskで緩めない）。
- Owner Gate契約、hash binding、Replay、Dispatch境界。
- 進行中の`ADF-MCP-FRONTDOOR-2CYCLE-E2E-001`の未コミット差分。

## 5. Plan（実装前）

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | `src/shared/secretSentinel.ts`を新規追加し、検出パターンと`containsSecret()`／`maskSecrets()`を集約 | 新規ファイルのみ | 単体テスト（検出・非検出・境界） | Yes |
| 2 | `candidateArtifact.ts`と表示層4箇所を新ユーティリティへ差し替え、**挙動を変えない** | 既存4ファイルの内部参照のみ | 既存テストがそのままPassすること | Yes |
| 3 | Result Envelope生成経路へ`containsSecret()`のfail-closed検査を追加 | Result保存経路 | 検出時にResultが保存されずNodeが停止するテスト | Yes |
| 4 | 検出事実の記録がパターン名のみで、値を含まないことを検証 | Ledger記録 | 記録内容のアサーション | Yes |

### 代替案・リスク

- **代替案**: 検出時に自動マスクして保存を続行する。→ 不採用。マスク漏れに気付けず、Ownerが「安全に保存された」と誤認する。ADFの他の安全境界はすべてfail-closedであり、ここだけ挙動を変えない。
- **リスク（誤検知）**: Adapterがコード例として`api_key = ...`を含む正当な回答を返した場合、Resultが停止する。Ownerが内容を確認して再実行または例外承認できる導線を残す。誤検知の実発生率は運用で測る。
- **リスク**: Step 2でパターンを統合する際、`candidateArtifact.ts`側の検出が弱くなると既存の安全性が下がる。統合後のパターンは各元パターンの**和集合**とし、既存テストの全Passを必須にする。
- **ロールバック**: Step 3の検査呼び出しを外せば、Step 1-2はリファクタリングのみとして残せる。
- **停止条件**: 同一原因の検証失敗が2回連続、または別原因で3回連続。既存の安全境界を弱める必要が生じた場合も停止する。

### ブランチ方針

`ADF-RUN-TELEMETRY-PROJECTION-001`と同じく、現在の未コミット差分と競合しないブランチ、または進行中Taskの完了後に着手する。両Taskは独立しており、順序の制約はない。

## 6. Approval

- Approval required?: **Yes**
- 承認対象: Scope、Plan、誤検知時の運用（停止か例外承認か）、ブランチ方針
- 承認者: Project Owner
- 承認記録: 2026-09-08、Project Ownerの「実装お願いします」および「進めて下さい」。Planに記載のfail-closed（検出時は停止、自動マスクして続行しない）を含めて承認された。
- 承認日時: 2026-09-08

## 6.1 Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-09-08 | Claude Code | `src/shared/secretSentinel.ts` 新規追加 | 検出パターンとマスクを1箇所へ集約 | Planどおり |
| 2026-09-08 | Claude Code | `resultEnvelope.ts` へ `assertNoCredentialShapedText` を追加 | 受信経路のfail-closed検査 | `validateResultEnvelope`内に配置（下記参照） |
| 2026-09-08 | Claude Code | `candidateArtifact.ts` を共有モジュールへ差し替え | 重複解消 | 挙動は superset。既存テスト全Pass |
| 2026-09-08 | Claude Code | `activityTrace.ts` / `ownerGates.ts` / `participantMcpServer.ts` を `maskSecrets` へ差し替え | 重複解消 | 挙動は完全同一（テストで担保） |
| 2026-09-08 | Claude Code | `tests/secretSentinel.test.ts` 新規追加 | 検出・マスク同一性・拒否の検証 | 12 tests |

### 設計上の判断: 検査を `validateResultEnvelope` の内部に置いた

当初Planは「Result Envelope生成時に検査を追加する」としていた。実装時に呼び出し元を確認したところ、`validateResultEnvelope` は既に受信経路の隘路であり、5箇所すべてが永続化・採用の**前**に呼んでいた。

- `relay.ts:466` — Adapter回答からEnvelopeを構築した直後、`writeJsonAtomic` の前
- `relay.ts:292` — `verifyStoredEvidence`。Owner採用前のディスク再読込
- `relay.ts:883` — ADF生成のRecovery Envelope
- `runtime.ts:164`、`liveArtifacts.ts:33`

したがって検査を `validateResultEnvelope` の末尾へ置くだけで、呼び出し元を1箇所も変更せずに全経路がfail-closedになる。個別の呼び出し元へ検査を足すより、追加漏れが起きない。

検査は既存の形状チェックが全て通った**後**に走る。壊れた形（`risks` が配列でない等）のEnvelopeを走査しないためで、その場合は形状エラーとして先に拒否される。

### 逸脱1: 表示層2箇所を変更していない

Planの Step 2 は表示層4箇所の差し替えを含んでいたが、次の2ファイルは進行中の他Taskの作業対象であり、本Taskの「触れてはいけない部分」に該当するため変更していない。

- `src/cli/frontdoorMcpServer.ts` — `ADF-MCP-FRONTDOOR-2CYCLE-E2E-001` の未コミット差分に含まれる
- `src/main/frontdoor/collaborationTrace.ts` — 未追跡の新規ファイル（別Task由来）

両ファイルは従来のインラインマスクをそのまま保持しており、挙動は変わっていない。共有モジュールへの統合は、当該Taskの差分が確定した後の後続作業とする。**この2箇所は表示層であり、本Taskの安全目的（受信経路のfail-closed）には影響しない。**

### 逸脱2: 既知の検出限界を記録する

`api[_-]?key\s*[:=]` や `credential-assignment` は、キーと値の間に引用符が入るJSON形（`"api_key": "..."`）を検出しない。`\s*[:=]` が `"` に阻まれるためである。この性質は統合前の `containsSecretSentinel` にもあった。

`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `sk-` / `Bearer` の各パターンは引用符に影響されないため、代表的な資格情報は引き続き検出される。

パターンの拡張は本Taskの Out of scope に明記されているため、**意図的に修正していない**。後続Task候補として記録する。

## 6.2 既存Runtimeデータへの影響調査

`verifyStoredEvidence` も同じ検査を通るため、既存の保存済みEnvelopeが新たに拒否されると、完了済みRunのOwner採用が失敗しうる。読み取り専用で影響を確認した。

- 対象: `~/Library/Application Support/adf-task-board/adf-runtime` 配下の保存済みResult Envelope
- 走査件数: **8件**
- 新検査で拒否されるもの: **0件**

既存Runへの回帰は発生しない。なお、Ledgerの遡及スキャン・書き換えは Out of scope であり、本調査は読み取りのみで、1バイトも変更していない。

## 7. Acceptance criteria

- [~] 資格情報様の文字列を含むAdapter回答が、Result Envelope／Evidenceへ保存されない。 — **Result Envelope経路のみ充足。** `validateResultEnvelope` は `relay.ts:466` で `writeJsonAtomic` の前に走り、content／summary／terminationReason／nextOwnerDecision／risks／verification.name／verification.reason／artifact／dependencyResults を拒否する。ただしParticipant MCP submissionは別経路でEvidenceへ届く（§8.1）。**受入条件としては未充足。**
- [x] 検出時にNodeが停止し、Ownerが検出事実を確認できる。 — `ResultEnvelopeRejectedError` を送出。既存のThread失敗経路に乗り、Owner判断待ちになる。
- [x] 検出記録に検出された文字列そのものが含まれない。 — メッセージはフィールド名とパターン名のみ。`hunter2` が含まれないことをテストで固定。
- [x] `candidateArtifact`と表示層の既存挙動が変わっていない（既存テスト全Pass）。 — 439件の既存テストが全Pass。`maskSecrets` が統合前の正規表現と文字単位で同一の出力を返すことをテストで固定。
- [x] 統合後の検出パターンが、統合前の各パターンの和集合以上である。 — 統合前の `containsSecretSentinel` が真を返す入力で `containsSecret` も真になることをテストで固定。
- [x] `assertPacketBoundary`を変更していない。 — `src/main/jobLoop/syntheticPacket.ts` は無変更。
- [x] Node／Web／CLI typecheck、Vitest全体、Electron build、`git diff --check`がPass。 — 下記Verification参照。
- [x] 外部送信、APIキー、新規依存、commit／pushを行っていない。 — `package.json` 無変更。

## 8. Verification

| 種別 | 実施内容 | 結果 | 実施者 |
| --- | --- | --- | --- |
| 自動 | `tsc --noEmit -p tsconfig.node.json` | Pass | Claude Code |
| 自動 | `tsc --noEmit -p tsconfig.web.json` | Pass | Claude Code |
| 自動 | `tsc -p tsconfig.cli.json` | Pass | Claude Code |
| 自動 | `vitest run`（全体） | **Pass 45 files / 451 tests**（変更前 44 files / 439 tests、回帰なし） | Claude Code |
| 自動 | `vitest run tests/secretSentinel.test.ts`（対象） | Pass 12/12 | Claude Code |
| 自動 | `electron-vite build` | Pass | Claude Code |
| 自動 | `git diff --check` | Pass | Claude Code |
| 手動 | 既存Runtime保存済みEnvelope 8件の影響走査（読み取り専用） | Pass 拒否0件 | Claude Code |
| 独立レビュー | Codexによるscoped local review（[ADF-CODEX-SCOPED-REVIEW-001](ADF-CODEX-SCOPED-REVIEW-001.md)） | **Changes requested → P1修正済み。再レビュー未実施** | Codex |

## 8.1 独立レビューの結果と対応（2026-09-08）

Codexが**P1を3件**検出した。3件とも実コードで再現確認し、事実と認めた。

### 修正したもの

| ID | 欠陥 | 修正 |
| --- | --- | --- |
| P1-1 | `sk-credential` に `i` フラグが無く、旧sentinelが検出する `SK-…` を検出しなかった。**「和集合以上」という受入条件が実際には満たされていなかった** | `secretSentinel.ts:28` に `i` を付与 |
| P1-2 | `verification[].name` を走査していなかった。`relay.ts:524` が `answer.verification` をそのまま格納するためAdapter由来の自由文字列である | `resultEnvelope.ts` の `secretScanTargets` へ `name` を追加 |
| P2-c | 形状検査が浅く、非文字列の `summary` 等が走査を素通りしていた（主張6が不成立） | `summary`／`terminationReason`／`nextOwnerDecision` の文字列型、`verification` 各要素と `risks` 各要素の形状を検査へ追加 |

テストも強化した。P1-1を通した原因は、「和集合以上」を検証すると称するテストが小文字入力しか与えておらず、**唯一の弱点軸である大文字を一度も通していなかった**ことである。現在は入力コーパスから大文字・小文字変種を機械的に生成し、旧sentinelが検出して新実装が検出しない入力が1件でもあれば失敗する形にした。この形なら同じ盲点は再発しない。

`i` フラグを外した状態でこのテストが実際に3件の検出漏れを報告することを確認済みである（テストが落ちない検証は検証ではない）。

### 修正しなかったもの — 主張1の撤回

**受入条件と主張1を訂正する。** 「`validateResultEnvelope` の5箇所で受信経路が閉じる」は**誤りだった**。Codexが第2の受信経路を示した。

- `src/cli/participantMcpServer.ts:286-311` が、participantの `summary`／`content`／`verification`／`risks` を長さ検査だけで `participant-submissions/*.json` へ書き込む。
- その内容は `src/main/frontdoor/participantEvidence.ts:113-116` 経由でOwner表示へ届く。
- `validateResultEnvelope` を通らないため、本Taskのガードが効かない。

この経路は本Task §4 In scope の「Result Envelope生成時に、Adapter回答本文へ同じ検査を適用する」に含まれない。Charterは Scope外の変更を Mandatory Escalation としているため、**実装せずProject Ownerの判断を待つ**。

同様に、次の2件も事実として確認したうえでScope外とする。

- `ownerGates.ts` のResult採用・Work Plane exportが `validateResultEnvelope` を再実行しない（ガード導入前のEnvelopeを採用しうる）。
- `relay.ts:27` の `safeErrorText` がマスクせず、Adapterのエラーメッセージが `relay.ts:731` のeventsと `839-854` のエラーファイルへ永続化される。

したがって本Taskが主張できる範囲は「**Result Envelope経由の受信経路**を閉じた」であり、「events.jsonlへの秘密情報永続化を塞いだ」という広い主張は成立しない。

### 変更ファイル

| ファイル | 種別 |
| --- | --- |
| `src/shared/secretSentinel.ts` | 新規 |
| `src/main/jobLoop/resultEnvelope.ts` | 変更（検査追加） |
| `src/main/frontdoor/candidateArtifact.ts` | 変更（共有モジュールへ差し替え） |
| `src/main/frontdoor/activityTrace.ts` | 変更（同上） |
| `src/main/frontdoor/ownerGates.ts` | 変更（同上） |
| `src/cli/participantMcpServer.ts` | 変更（同上） |
| `tests/secretSentinel.test.ts` | 新規 |

### 残るリスク・未検証事項

- **独立レビューが未実施。** Charterの Completion Rule により、Doneには実装担当と分離したレビューが必要である。
- **誤検知率は未測定。** コード例として `api_key: ...` を含む正当なAdapter回答は停止させられる。実運用で測る。停止時の例外承認導線は本Taskでは実装していない（Ownerが内容を確認して再実行する運用）。
- 引用符を挟むJSON形の資格情報を検出しない（§6.2 逸脱2）。パターン拡張は Out of scope。
- 表示層2箇所（`frontdoorMcpServer.ts`、`collaborationTrace.ts`）が未統合（§6.2 逸脱1）。安全目的には影響しない。
- commit／pushは未実施。
