# Task — ADF-CODEX-SCOPED-REVIEW-001: Codexによるscoped local独立レビュー

> Status: `Approved` — Owner承認済み。実行中。
> Type: Review
> Owner: Project Owner
> Reviewer: Codex（`codex-cli 0.153.4` / `gpt-5.6-luna` / reasoning effort `high`）
> Review対象Task: [ADF-RESULT-SECRET-GUARD-001](ADF-RESULT-SECRET-GUARD-001.md)
> Date: 2026-09-08

## 1. Objective

`ADF-RESULT-SECRET-GUARD-001` の実装を、実装担当（Claude Code）と分離した独立レビューにかける。Charterの Completion Rule が Doneの条件に「独立レビューまたは該当しない理由」を要求しているため。

## 2. なぜ新Taskが必要か

`.claude/skills/adf-independent-review` は `packet-only` を既定とし、リポジトリを参照する `scoped-local-review` を「disabled。新しいADF TaskとProject Owner承認が必要」と定めている（SKILL.md:12）。

本Taskはその承認記録である。既存skillの `packet-only` 契約は変更しない。本Taskは今回1回のレビューだけを許可し、恒久的なモード解禁ではない。

## 3. Owner承認

- 承認対象: Codexによるリポジトリ参照レビュー、ADFソースのOpenAIへの送信、Codexアカウントでの費用発生
- 承認者: Project Owner
- 承認日時: 2026-09-08
- 承認記録: 実施方式の選択肢（ローカル参照レビュー / packet-only / 実施しない）を提示し、Ownerが「ローカル参照レビュー」を選択した。

Charterの Mandatory Escalation が挙げる「外部API、費用の発生」に該当するため、実行前に承認を記録した。

## 4. Scope

### In scope

- Codexが読み取り専用でリポジトリを参照し、`ADF-RESULT-SECRET-GUARD-001` の変更7ファイルを精査する。
- 指摘の受領と記録。

### Out of scope

- Codexによるファイル変更、commit、push（`--sandbox read-only` で技術的に禁止する）。
- 進行中の `ADF-MCP-FRONTDOOR-2CYCLE-E2E-001` の未コミット差分のレビュー。Codexへ対象外と明示する。
- 指摘の自動採用。Review ArtifactはOwnerが評価し、必要なら別Taskにする。
- `~/.codex/config.toml` の変更。sandbox設定は呼び出し単位で上書きする。

## 5. 実行条件

- コマンド: `codex exec --sandbox read-only`
- 既定configの `sandbox_mode = "danger-full-access"` を呼び出し単位で `read-only` へ上書きする。設定ファイルは変更しない。
- レビュー対象は7ファイルに限定して明示する。

## 6. レビュー対象

| ファイル | 種別 |
| --- | --- |
| `src/shared/secretSentinel.ts` | 新規 |
| `src/main/jobLoop/resultEnvelope.ts` | 変更 |
| `src/main/frontdoor/candidateArtifact.ts` | 変更 |
| `src/main/frontdoor/activityTrace.ts` | 変更 |
| `src/main/frontdoor/ownerGates.ts` | 変更 |
| `src/cli/participantMcpServer.ts` | 変更 |
| `tests/secretSentinel.test.ts` | 新規 |

## 7. 実装側が立てている主張（Codexが検証すべき点）

1. `validateResultEnvelope` は受信経路5箇所すべてで永続化・採用の前に呼ばれており、ここに検査を置けば全経路がfail-closedになる。
2. 統合後の検出パターンは、統合前の `containsSecretSentinel` の和集合以上である。
3. `maskSecrets` の出力は、統合前のインライン正規表現と文字単位で同一である。
4. エラーメッセージに検出値が含まれない。
5. `assertPacketBoundary` を弱めていない。
6. 既存Runtimeの保存済みEnvelope 8件は新検査で拒否されない。

## 8. Handover Boundary

Codexの応答は**未信頼のReview Artifact**である。Project Ownerがこれを評価し、採否と後続Taskの要否を判断する。指摘の自動実装は行わない。

## 9. 結果

2026-09-08 実施。`codex exec --sandbox read-only`、`gpt-5.6-luna`、212,099 tokens 使用。Codexはファイルを変更しておらず、commit／pushも発生していない。

Codexの結論は「**Done不可**。P1が3件あり、fail-closedの主張を満たしていない」。

### 指摘一覧とClaude Codeによる再現確認

| ID | 指摘 | 再現 | 対応 |
| --- | --- | --- | --- |
| P1-1 | `sk-credential` に `i` フラグが無く、旧sentinelが検出する `SK-…` を検出しない | **再現。旧正規表現の`/i`は選択肢全体に掛かる** | 修正済み |
| P1-2 | `verification[].name` が走査対象から漏れている。`relay.ts:524`が`answer.verification`をそのまま入れるためAdapter由来 | **再現** | 修正済み |
| P1-3 | Participant MCP submissionの直書き（`participantMcpServer.ts:286-311`）が検査を迂回し、`participantEvidence.ts:113-116`でOwner表示へ届く | **再現** | **未対応。Scope判断待ち** |
| P2-a | `ownerGates.ts`のResult採用・Work Plane exportで`validateResultEnvelope`を再実行していない | 再現 | 残存リスクとして記録 |
| P2-b | `relay.ts:27` `safeErrorText` がマスクせず、`relay.ts:731`のeventsと`839-854`のエラーファイルへ永続化される | 再現 | 残存リスクとして記録 |
| P2-c | 形状検査が浅く、非文字列の`summary`等が走査を素通りする | 再現 | 修正済み |
| P2-d | AWS／GitHub／Slack token、秘密鍵ヘッダ等を検出しない | 妥当 | 既知の限界として記録（パターン拡張はOut of scope） |
| P2-e | 正当なコード例・説明文を停止させる誤検知。例外承認導線が無い | 妥当 | 既知の残存リスク（Taskに記載済み） |

主張1は「問題あり」（受信経路は5箇所では閉じない）、主張2も「問題あり」（`SK-`）。主張3・4・5は「問題なし」。主張6は「部分的に問題あり」。

### 評価

**指摘は正確であり、レビューは有効に機能した。** 特にP1-1は、実装側が「和集合以上」と主張し、その性質を検証すると称するテストまで書いていながら、大文字という唯一の弱点軸を一度も通していなかったという、自己検証では発見しにくい欠陥である。

Review ArtifactはCharterの定義どおり未信頼として扱い、7件すべてをClaude Codeが実コードで再現確認したうえで採否を決めた。

### Codexの指摘のうち採用しなかったもの

なし。すべて事実として確認できた。P1-3とP2-a／P2-bは、事実を認めたうえで本TaskのScope外として分離した（`ADF-RESULT-SECRET-GUARD-001` §9 参照）。
