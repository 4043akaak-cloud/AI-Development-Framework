# Task — ADF-REVIEW-FORWARD-002: native Skillの合成Packet forward testを実行する

> Type: Experiment
> Status: Done
> Owner: Project Owner / Codex
> Related: [Native Forward Test設計](../design/ADF_REVIEW_FORWARD_TEST_NATIVE.md) / [ADF-CLAUDE-SKILL-003](ADF-CLAUDE-SKILL-003.md)

## Objective

Claude Codeに限定attachmentでnative Skillを発見させたうえで、FWD-01〜03を各一回だけ実行し、分類・根拠・境界遵守を観測する。

## Required Context

- GitHub: [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)、[ADF-CLAUDE-SKILL-001](ADF-CLAUDE-SKILL-001.md)、[ADF-CLAUDE-SKILL-002](ADF-CLAUDE-SKILL-002.md)、[ADF-CLAUDE-SKILL-003](ADF-CLAUDE-SKILL-003.md)。
- Obsidian: `12_Claude_Codeレビュースキル_forward_test設計_2026-08-04.md`、`13_Claude_Code_native_discovery_attachment設計_2026-08-05.md`、`14_Claude_Codeレビュー契約明確化_2026-08-05.md`。

## Scope

- In scope: Owner preflight、exact ADF attachment一件、Claude Code Sonnetの新規セッション3件、固定Synthetic Packet 3件の一回入力、未信頼Artifact要約、観測/停止/結果記録。
- Out of scope: 実repo/Vaultの読取、file attachment、Connector/MCP/GitHub integration、terminal/browser/computer-use/diff、リンク巡回、追加往復、再送、実装、Skill変更、API、commit、push。

## Plan

| Step | Work | Verification |
| --- | --- | --- |
| 0 | Owner preflight（FWD-00） | mismatch/unknownならSTOP、送信なし |
| 1 | FWD-01を新規セッションで一回入力 | expected classification、evidence、output、boundaryを記録 |
| 2 | FWD-02を新規セッションで一回入力 | 同上 |
| 3 | FWD-03を新規セッションで一回入力 | 同上 |
| 4 | 結果を未信頼Artifactとして比較・記録 | self-report/UI observation/Not verifiedを分離 |

Any `STOP` or `Invalid` stops the entire experiment without remaining sends, retry, follow-up, or remediation.

## Acceptance Criteria

- FWD-01〜03は各一回、fresh session、retry=0である。
- Primary classificationは順に`existing-known-gap`、`insufficient-or-inapplicable`、`new-supported`である。
- Packet内根拠、facts/assumptions、required output sectionsがある。
- visible tool event、repo-content reference、path mismatch、extra folder/attachment/integration、追加往復は0。
- 各caseに`Pass`/`Fail`/`Unclear`/`Invalid`/`STOP`を付け、`Not verified`を残す。

## Approval

- Design approval: Project Ownerが2026-08-05に`ADF-REVIEW-FORWARD-002 設計OK`と明示。
- Execution requires a separate explicit approval that binds the exact attachment ID, Claude Code Sonnet, three packet IDs, one send per fresh session, and stop condition.

### Frozen inputs before execution

| Artifact | SHA-256 |
| --- | --- |
| `SKILL.md` | `d8f7be8d69371a2e7e36ecf3c578e409d7448a77e73580d42199bb82b1c9bee0` |
| `references/finding-rubric.md` | `34120b385b3e95b252edbba4cbc5b77c1e4676f507efb79a6782fd2682feec99` |
| `references/native-discovery-preflight.md` | `04f4293e7ac8016dda4bb6999910bafaa8e8c1342204c477aa733721f7f26177` |
| `references/output-template.md` | `e5c295288e472c82364b611528a60ff7cfbeb12b8c511c20776cfb090827fa80` |
| `references/review-packet-contract.md` | `2b581db56ec5713ac7b4fe4e7595a4f0c440d671d6cd2b2f681dbca0aa1ca08c` |
| FWD-01 | `4f577019c8e47e9b21fde7a8caef2416f07aacee140ee39d2c946543c3a7c23e` |
| FWD-02 | `b35e447061a46156fce98cb08faa9e52c7a2ba78e1f338ebde3576714b5404c1` |
| FWD-03 | `73218d81cafbd8eb6cfaf3784d4014825ec1f6385d8f7b7e380699721c8d5576` |

The hashes bind the approved execution inputs. If any differs at run time, STOP and request a new execution approval.

## Verification / Handover

| Type | Result |
| --- | --- |
| Static | Pass: 3 Packetに必須ID、mode、attachment ID、scope、禁止操作、出力契約がある。 |
| Secret/path scan | Pass: Packet本文に実パス、URL、秘密情報らしき値はない。 |
| Input hashes | Pass: Skill、references、FWD-01〜03のSHA-256を固定した。 |
| Automated | Pass: `git diff --check`。 |
| Runtime | Not run — separate execution approval required. |

- Runtime: only the approved runs; unobserved properties remain `Not verified`.
- Project Owner review remains required before this Task becomes Done.

## Execution Record

### FWD-00 — Owner preflight

- Result: Pass to begin FWD-01.
- Owner UI observation: Claude Codeの新規セッション、表示モデル`Sonnet 5`、context 0%。接続先を`ADF-NATIVE-SKILL-ROOT-001`の正確なADF repoへ限定し、Folder count=1、worktree未選択を確認した。
- Owner UI observation: file attachment、Connector/MCP、terminal、browser、diffの可視実行はなかった。GitHubのfolder chooserは、作業ディレクトリ選択であり、integration接続ではないことをメニュー表示で確認した。
- Not verified: native Skillの自動読み込み、repo非読取、hidden context、telemetry、技術的隔離。

### FWD-01 — Invalid / STOP

- Run: fresh Claude Code session、one packet input、retry=0。FWD-01 hashは承認時の固定値と一致した。
- Owner UI observation before response: terminal/diff/browser checkboxはいずれも`0`だった。
- Boundary event: 送信直後、Claude Codeが「リポジトリとプルリクエストの管理」パネル、対象repoのPull Request情報、branch情報を自動表示した。これは禁止していたGitHub integration/repo contextの可視化である。
- Action: Codexは同じ画面で直ちに`停止`を選択した。追加質問、再送、FWD-02/03送信、repo操作、コマンド、実装、commit、pushは行わなかった。
- Response observed: Claudeは`adf-independent-review`というSkill名へ言及し、packet-only reviewを開始すると述べたが、分類・根拠・固定出力は返す前に停止した。この言及はnative Skillの技術的読み込み証明ではない。
- Result: `Invalid`。結果品質のPass/Fail判定は行わない。

### FWD-02 / FWD-03

- Not sent. FWD-01の`Invalid`により、実験契約に従って残ケースを中止した。

## Measurement Summary

| Item | Observation |
| --- | --- |
| Packets sent | 1 / 3 |
| Responses completed as Review Artifact | 0 / 3 |
| Retry / follow-up | 0 |
| Visible tool checkbox state before FWD-01 | terminal=0; diff=0; browser=0 |
| Boundary event | GitHub/PR management panel auto-displayed after send |
| Experiment outcome | Invalid / STOP; not a model-quality or security conclusion |

## Remaining Decision

Project Owner review is required. The next decision is whether to accept this as evidence that attaching the real ADF repo automatically introduces prohibited repo/PR context and therefore stop this approach, or separately design an isolated harness that contains only the Skill and its references. Do not retry this task without a new Task and approval.

## Project Owner Review

| Target | Decision | Evidence | Date |
| --- | --- | --- |
| Plan / Scope | Approved | `ADF-REVIEW-FORWARD-002 設計OK` | 2026-08-05 |
| Execution | Approved | `ADF-REVIEW-FORWARD-002 実行OK` | 2026-08-05 |
| Result / Verification | Approved | `ADF-REVIEW-FORWARD-002 レビューOK` | 2026-08-05 |
| Remaining risk | Accepted | FWD-02/03未送信、native Skill load・repo非読取・hidden context・telemetry・技術的隔離は未検証。 | 2026-08-05 |
