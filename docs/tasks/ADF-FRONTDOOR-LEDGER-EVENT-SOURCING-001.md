# Task — ADF-FRONTDOOR-LEDGER-EVENT-SOURCING-001: Frontdoor Event-Sourcing Ledger

> Type: Implementation
> Status: Done
> Owner: Codex
> Review: Project Owner + independent Codex review
> Related: [ADF-FRONTDOOR-ORCHESTRATION-001](ADF-FRONTDOOR-ORCHESTRATION-001.md) / [Goal](../project/GOAL.md) / [Current State](../project/CURRENT_STATE.md)

## 1. Objective

`ADF-FRONTDOOR-ORCHESTRATION-001`で残った、Run状態・子Job・Thread・Result・Evidenceの完全な再構築可能性と改ざん検知を実装する。`events.jsonl`をFrontdoor Ledgerの正本とし、`run.json`は再生成可能なSnapshotへ位置付ける。

## 2. Scope

### In scope

- 型付きFrontdoorイベントの共通契約。
- `sequence`、`eventId`、`previousEventHash`、`eventHash`、`runId`によるhash chain。
- Event Ledgerからの決定的Replayと状態遷移検証。
- Request、Plan、Run、Node、Child Job、Thread、Result、Evidenceのprovenance検証。
- Bundle manifest、atomic staging、未完成Bundleのfail-closed処理。
- claim token、Owner Stop、Recovery、stale claimの安全な処理。
- 既存FrontdoorのFake E2Eおよび既存Adapter経路の回帰検証。
- 再利用可能なCodex skill `adf-event-sourcing-ledger`の作成。
- 既存`adf-control-plane-workflow`へのEvent Ledger検証導線の追加。

### Out of scope

- Ollama、Anthropic、Claude CLIの実送信・認証・課金。
- IPC、MCP、HTTP入口、Electron GUI変更。
- Work Plane、repo/worktree書込み、正本自動更新。
- DB、外部依存、常駐Worker、無制限並列。
- 既存Legacy Ledgerの自動Migration・上書き。
- commit、push、merge、公開。

## 3. Design

```text
Event Ledger (events.jsonl)  = canonical source
        │ deterministic replay
        ▼
OrchestrationRun state
        │ regenerated cache
        ▼
run.json / aggregate.json / Live projections
```

イベントは次の種類に限定する。`run-snapshot`は診断用の予約型であり、通常の状態更新では発行しない。

`run-created`、`approval-bound`、`node-started`、`node-completed`、`node-failed`、`question-opened`、`run-recovery-needed`、`run-stopped`、`run-completed`、`run-snapshot`。

各イベントは`schemaVersion`、`sequence`、`eventId`、`runId`、`occurredAt`、`previousEventHash`、`eventHash`、`payload`を持つ。Replayは連番、前hash、event hash、許可状態遷移、payload provenanceを検証し、不一致時は実行・Recoveryとも拒否する。

Bundleは一時DirectoryへRequest／Plan／初期Run／manifestを書き込み、最後に排他的なready markerを作成する。ready markerやmanifestがないBundleは利用しない。旧形式は読み取り専用Legacyとして扱い、自動変換しない。

## 4. Acceptance Criteria

- [ ] `events.jsonl`だけから正常Runの状態を決定的にReplayできる。
- [ ] SnapshotとReplay結果が一致し、不一致を拒否できる。
- [ ] イベント欠落、重複、順序逆転、前hash改ざん、event hash改ざんを拒否できる。
- [ ] Request／Plan／Run／Node／Job／Thread／Result／Evidenceを`runId`・hash・taskId・jobId・inputHashで相互検証できる。
- [ ] 別Run・別Task・別JobのResult参照を拒否できる。
- [ ] 途中Bundle、manifest不一致、ready marker欠落をfail-closedできる。
- [ ] 同一Runの並行実行を一つのclaimに制限できる。
- [ ] 生存中または判定不能なclaimをRecoveryが解放しない。
- [ ] Stop／Recovery後に自動Dispatch・自動Retryが発生しない。
- [ ] 既存284件以上のテスト、node/web/cli typecheck、Electron buildがPassする。
- [ ] 新規skillがvalidatorをPassし、実例で再利用手順が確認できる。

## 5. Verification and Stop Conditions

- 失敗が同一原因で2回連続、または異なる原因で3回続いたら停止する。
- 新規依存、外部送信、認証、費用、不可逆Migrationが必要になったら停止する。
- Event Ledgerを第三の意味的正本にせず、GitHub Task・実装・検証の正本境界を維持する。

必須negative tests：イベント改ざん、途中Bundle、manifest不一致、別Run Result、claim競合、active claim Recovery、Replay非決定性、Legacy自動Migrationの発生なし。

## 6. Approval

- 承認者: Project Owner
- 承認: 2026-08-14「スキルの改造と創造も一緒にできるのなら設計OK」
- 許可: 本Taskのコード、テスト、Skill作成・既存Skillの最小改修、Task/Obsidian記録。
- 禁止: 外部送信、認証、課金、commit、push。

## 7. Implementation Log

| 日時 | 実施者 | 内容 |
| --- | --- | --- |
| 2026-08-14 | Codex | 設計承認を受領。新規Skill `adf-event-sourcing-ledger`を初期化し、Task正本を作成。 |
| 2026-08-14 | Codex | `FrontdoorLedgerEvent`、sequence／前hash／event hash検証、typed event append、決定的Replayを実装。`run.json`からの自動snapshotイベント依存を除去し、domain eventのpayloadでNode／Run状態を再構築する方式へ変更。 |
| 2026-08-14 | Codex | Bundleをstaging Directoryへ構築してmanifest→ready marker→renameする方式へ変更。`bundle.ready`も現行Request／Plan／Runのhashを検証対象に追加。Claimへtoken／PID／hostnameを追加し、token一致しないreleaseと判定不能claimの解放を拒否。 |
| 2026-08-14 | Codex | 既存FrontdoorテストのLegacy event書込みをtyped event APIへ移行。Ledger chain／tamper／reorder／invalid transition／deterministic replay／claim tokenのnegative testsを追加。 |

## 8. Verification Log

### 実装結果

- 変更: `src/main/frontdoor/eventLedger.ts`新規、`ledger.ts`／`orchestrator.ts`、`frontdoorTypes.ts`、Frontdoorテスト、Task／Current State。
- `events.jsonl`は型付きhash chainの正本。`run.json`は派生snapshotで、`getRun`／Recovery時にReplayとのprojection一致を確認する。
- 依存Resultは従来の`runId`／child task／child job／input hash／result hash／safe relative ref検証を維持し、Event payloadには検証済みNode recordを記録する。
- Bundleはstaging Directoryからfinal Directoryへrenameする。manifestとready markerの両方を現行ファイルhashと照合する。
- Claimはexclusive file、token、PID、hostnameを使用し、activeまたは判定不能claimはRecoveryで解放しない。

### 検証結果

- Vitest: **288/288 Pass**（実装開始時287件からLedger negative test +1）。
- `tsc --noEmit -p tsconfig.node.json`: Pass。
- `tsc --noEmit -p tsconfig.web.json`: Pass。
- `tsc -p tsconfig.cli.json`: Pass。
- `electron-vite build`: Pass（Preload／Rendererの既存出力は維持、MainのみFrontdoorコード分増加）。
- `git diff --check`: Pass。
- 新規Skillの`quick_validate.py`: **環境未実施**（実行環境にPyYAMLが無く`ModuleNotFoundError: yaml`）。Rubyによるfrontmatter必須項目の手動検証はPass。依存追加・ネットワーク取得は行っていない。
- 実Provider送信、認証、課金、Ollama／Anthropic／Claude CLI起動、commit、push: 未実施。

### 残存確認事項

- Skill公式validatorを実行できるPython環境での再確認。
- 公式validator未実行は環境制約として受諾し、frontmatter手動検証Passを最終証跡とする。

## 10. Completion

2026-08-14、Project Ownerの「Doneとプッシュ、コミットお願いします」を受領。最終検証結果、未コミット差分の対象範囲、公式Skill validatorの環境制約を確認したうえで、本Taskを`Done`とする。実Provider送信、認証、課金、commit対象外の外部Skill配置変更は行わない。

## 9. Handover

本Task完了後、Frontdoor Orchestration Taskの残存Ledgerリスクを再評価する。Provider接続、Work Plane、MCP入口は別Taskで扱う。
