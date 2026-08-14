# Task — ADF-ACTIVITY-TRACE-VISUALIZATION-001: Activity Trace Visualization

> Type: Implementation + Verification
> Status: Done
> Owner: Codex
> Related: [ADF-FRONTDOOR-NODE-REVIEW-GATE-001](ADF-FRONTDOOR-NODE-REVIEW-GATE-001.md) / [ADF-MCP-CLIENT-E2E-001](ADF-MCP-CLIENT-E2E-001.md)

## 1. Objective

ADFが観測できるAI Node、Adapter、Owner Gate、Verificationの活動を、既存Frontdoor Event Ledgerから読み取り専用のTimelineへ派生し、Project Ownerが待機中の状態・理由・次の判断を楽しく確認できるようにする。おまけ機能として、Activity表示／非表示をOwnerがスイッチで選択できるようにする。

## 2. Scope

### In scope

- `FrontdoorInspection.activities`の共有Projection。
- 既存のEvent LedgerからのActivity Trace派生（最大100件）。
- Activityの種別：ADF／Owner Gate／AI Node／Verification。
- NodeのAdapter、role、明示された`skillId`、状態、時刻、待機理由の表示。
- FrontdoorPanelのActivity表示／非表示スイッチ。
- 表示設定のローカル保持（Activity自体は読み取り専用）。
- Activity Projectionの状態・上限・未記録Skillのテスト。
- Task正本、CURRENT_STATE、Obsidianマイルストーン、MOC更新。

### Out of scope

- Codex内部Skill／サブエージェントの自動観測。
- AIの内部思考・Chain of Thoughtの表示。
- Token／費用の推測、Provider telemetryの追加。
- Event Ledgerの新しい権限、Owner承認、自動Dispatch、Result採用。
- Work Plane、repo／worktree、正本、GitHub／Obsidianの自動書込み。
- 実Provider送信、APIキー、外部通信、新規依存。

## 3. Design contract

```text
Existing Frontdoor Event Ledger
  └─ read-only Activity Projection (max 100 newest events)
       ├─ ADF / Owner Gate / AI Node / Verification
       └─ FrontdoorPanel (default hidden, Owner switch)
```

- Activityはcanonical sourceではなく、Event Ledgerから毎回派生する表示Projectionである。
- Eventに明示された情報だけを表示し、Codex内部Skill／サブエージェントを推測しない。
- `skillId`がNodeまたはEventに明示されていない場合は`ADF未記録`と表示する。
- Activityの詳細は上限付き・秘密情報マスク付きとする。
- 表示スイッチはUI表示設定のみを変更し、Run／Decision／Ledgerを書き換えない。

## 4. Acceptance criteria

- [x] Event LedgerからRequest、Owner Gate、AI Node、Verification、停止／完了状態をActivityへ派生できる。
- [x] AI Node ActivityにAdapter、role、状態、時刻を表示できる。
- [x] 明示された`skillId`だけ表示し、未記録Skillを推測しない。
- [x] 最大100件に制限し、古いActivityが無制限にUIへ流れない。
- [x] FrontdoorPanelにActivity表示／非表示スイッチがあり、初期状態は非表示である。
- [x] 待機中のOwner Gate／Node Review／Question／Result Reviewを「判断待ち」として表示できる。
- [x] Activity表示は読み取り専用で、承認・Dispatch・Result採用・正本変更を発生させない。
- [x] Activity詳細の秘密情報マスク、既存Frontdoor／MCP／Owner Gate回帰を確認する。
- [x] Node/Web/CLI typecheck、Vitest、Electron build、`git diff --check`がPassする。

## 5. Implementation log

2026-08-15、Project Ownerの「この提案通りで良いので、実装お願いします。おまけ要素なので、スイッチで表示非表示を選択できるようにして下さい」を受け、承認済みScope内で実装した。

- `src/main/frontdoor/activityTrace.ts`を追加し、既存Event Ledgerからbounded Activity Projectionを生成した。
- `FrontdoorInspection`へ`activities`を追加し、Orchestrator、CLI、MCP projectionへ同じ派生データを公開した。
- `DecompositionNode.skillId?`を追加した。Skillは明示記録された場合だけActivityへ現れる。
- `FrontdoorPanel.tsx`へActivity Timelineと表示／非表示スイッチを追加した。表示設定はlocalStorageへ保存するが、Runtime Ledgerへは書き込まない。
- Activityは初期非表示とし、Ownerが必要なときだけ表示できる。待機理由、経過時刻、Adapter、role、Skill記録状態を表示する。
- `tests/frontdoorActivityTrace.test.ts`を追加し、状態変換、Skill未記録、100件上限を検証した。
- 既存のOwner Gate、Orchestrator、Event Ledgerの権限・実行ロジック、MCP ServerのTool契約、Provider Transportは変更していない。

## 6. Verification log

- Activity対象テスト：**3/3 Pass**。
- 全Vitest：**346/346 Pass（30 files）**。
- `tsc --noEmit -p tsconfig.node.json`：Pass。
- `tsc --noEmit -p tsconfig.web.json`：Pass。
- `tsc -p tsconfig.cli.json`：Pass。
- `electron-vite build`：Pass。
- `git diff --check`：Pass。
- 実Provider送信、APIキー、外部通信、Work Plane、正本書込み、commit／pushは未実施。

## 7. Completion record

- Project Ownerが変更後Electron画面でActivityの表示／非表示を確認し、完了承認した。
- Activity表示は初期非表示、スイッチONでTimeline表示、スイッチOFFでTimeline非表示となることを確認した。
- 本TaskのStatusを`Verifying`から`Done`へ更新した。
- Codex内部Skill／サブエージェントの自動観測と、実Token／費用計測は後続Taskで扱う。

## ADF Execution Summary

```json
{
  "taskId": "ADF-ACTIVITY-TRACE-VISUALIZATION-001",
  "objective": "ADFが観測できるAI活動とOwner待機を読み取り専用Timelineで表示し、スイッチで表示／非表示を選べるようにする",
  "scope": {
    "inScope": ["Event Ledger derived Activity Trace", "FrontdoorPanel timeline", "visibility switch", "skillId disclosure"],
    "outOfScope": ["Codex internal telemetry", "chain of thought", "token cost inference", "approval automation", "external send", "new dependencies"]
  },
  "approval": { "status": "approved", "approvedBy": "Project Owner", "externalSend": false, "newDependencies": false },
  "verification": { "status": "automated-pass-owner-approved", "tests": "346 passed / 30 files", "targetTests": "3 passed", "typecheck": "node web cli pass", "electronBuild": "pass", "diffCheck": "pass", "ownerVisualCheck": "activity visible/hidden confirmed" }
}
```

## 8. Owner completion approval

2026-08-15、Project OwnerがActivity表示／非表示スイッチとTimelineの実画面動作を確認し、Doneを承認した。実Provider送信、外部通信、正本自動書込み、commit／pushは本Taskでは行っていない。
