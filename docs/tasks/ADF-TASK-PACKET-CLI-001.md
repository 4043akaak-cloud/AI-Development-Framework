# Task — ADF-TASK-PACKET-CLI-001: 承認済みTask Packet生成CLI（Execution Summary方式）

> Type: Implementation
> Status: Done
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md) / [ADF-RELAY-RECOVERY-001](./ADF-RELAY-RECOVERY-001.md) / [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)

## 1. Objective

- なぜ今このTaskが必要か: 承認済みTask Packet（`approved-tasks/<taskId>.json`）は、これまでAIが都度手作業で作成していた。scope／context／routingPlanのhashを手計算するため、記述ミスがそのまま次工程（Job登録・Thread開始）へ伝播しうる。既存Packetを実際のTask Markdown本文と突き合わせたところ、いずれも本文の逐語抽出ではなく人が要約したfixtureであることが判明した。
- 達成したい結果: Task Markdown内に固定形式の「ADF Execution Summary」ブロックを設け、Ownerが実行するCLIがそのブロックだけを機械的に読み取り、`validateApprovedTask`をPassする検証済みJSONを再現可能に生成できるようにする。
- 対象ユーザー: Project Owner本人。CLIの実行そのものが、Packet生成という操作の主体である。

## 2. Approval

- Approval required?: Yes
- 承認対象: Execution Summary方式（固定見出し＋fenced JSONブロック）、CLIの入力・出力・エラー条件、既存3 TaskへのExecution Summary追加方針（本文非改変・末尾追記のみ）、`--force`を実装しない方針。
- 承認者: Project Owner
- 承認記録: 2026-08-11、Project OwnerがExecution Summary方式（JSON code block形式、固定見出し`## ADF Execution Summary`、fenced block info string `json adf-execution-summary`）を設計OKとし、実装を指示した。
- 実接続（外部AI、認証、外部送信、課金）は本Taskの承認に含まれない。UI・IPC・Board連動も対象外。

## 3. Required Context

### GitHub

- [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)
- [ADF-CONVERSATION-RELAY-001](./ADF-CONVERSATION-RELAY-001.md) / [ADF-RELAY-RECOVERY-001](./ADF-RELAY-RECOVERY-001.md) / [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)

### Obsidian

- `/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md`
- `/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/00_MOC.md`

採用する制約は、GitHub Task Markdownを意味的正本として維持すること、承認そのものをCLIが代行・自動化しないこと、Execution Summary以外のMarkdown本文をCLIが解釈しないこと、既存の要約fixtureであった旧Packetとのhash一致を必須にしないことである。

## 4. Scope

### In scope

- `## ADF Execution Summary`見出しと、直後の`json adf-execution-summary`情報文字列を持つfenced code blockの検出。
- Execution SummaryのJSONスキーマ検証（必須キー、型、未知キー拒否、バージョン値、taskId一致）。
- `scopeHash` / `contextHash`の計算（既存`hashJson`を再利用）。
- 既存`routeAdapters()`による`adapterPlan`生成。
- 既存`validateApprovedTask()`によるドライラン検証。
- 検証済みPacketの標準出力表示。
- `--write`指定時のみの`approved-tasks/`への新規書込み。既存ファイルがあれば常に停止。
- `--compare-existing`による、既存Packetとの非致命的な差分表示。
- CLI単体テスト、typecheck、build。
- 既存3 TaskへのExecution Summary追加（本文非改変・末尾追記のみ。CLI実装とは別の変更として扱う）。

### Out of scope（別Task・別承認）

- UI・Renderer・IPCからの承認済みTask Packet生成・書込み。
- 外部AI接続、認証、APIキー、外部送信、課金。
- `--force`、既存Packetの上書き。
- Board・Foundation panelとの連動。
- 長文Task本文の自動要約。Execution Summary以外のMarkdown本文の解析。
- Task Markdownの見出し統一・再構成（前回設計案から撤回。Execution Summaryは末尾追記のみで完結する）。

### 触れてはいけない部分

- 既存のRelay／Thread／Recovery契約、既存Fake Adapter会話フロー。
- GitHub／Obsidian正本の自動書込み。

## 5. Execution Summary仕様（設計確定）

- 見出し: `## ADF Execution Summary`（完全一致、既存の連番体系に参加しない）。
- 直後（空行のみ許容）に、情報文字列が完全一致で`json adf-execution-summary`のfenced code blockを1個だけ置く。
- 必須フィールド: `adfExecutionSummary`（`"v1"`固定）、`taskId`、`objective`、`scope.inScope[]`、`scope.outOfScope[]`、`context.githubTask`、`context.obsidianContext[]`、`context.adoptedPrinciples[]`、`acceptance[]`、`stopConditions[]`。未知キーは拒否する。
- `scopeHash = hashJson(scope)`、`contextHash = hashJson(context)`。`routingPlanHash`はExecution Summary由来ではなく、CLI `--roles`引数から`routeAdapters()`で算出する。
- approval情報（`approvalId` / `approvedBy` / `approvedAt` / `expiresAt` / `capabilities`）、target情報、rolesはすべてCLI引数としてOwnerが明示する。CLIは推測・自動補完しない。

## 6. Plan

| Step | 内容 | Reversible? |
|---|---|---|
| 1 | `src/cli/executionSummary.ts`: 抽出・スキーマ検証・エラー型を実装する | Yes |
| 2 | `src/cli/buildApprovedTaskPacket.ts`: CLI本体（引数解析、Packet組立、dry-run検証、出力、`--write`、`--compare-existing`）を実装する | Yes |
| 3 | `tsconfig.cli.json`を追加し、`package.json`へ`build:cli`スクリプトを追加する | Yes |
| 4 | 単体テストを追加する（抽出・組立・CLI統合・実在3 Task文書での検証） | Yes |
| 5 | 既存3 TaskへExecution Summaryを末尾追記する（本文は無編集） | Yes |
| 6 | typecheck / test / buildを実行する | - |
| 7 | 文書不整合3件を、本実装とは別の訂正として反映する | Yes |

## 7. Acceptance Criteria

1. `## ADF Execution Summary`が0個または2個以上ある場合、CLIは非ゼロ終了しJSONを出力しない。
2. 見出し直後（空行のみ許容）に`json adf-execution-summary`のfenced blockが無い、複数ある、破損している（JSON parse失敗）、未知キーを含む、型が不一致、`adfExecutionSummary`が`"v1"`でない、`taskId`が引数と不一致のいずれかの場合、非ゼロ終了しJSONを出力しない。
3. 生成Packetが既存`validateApprovedTask`をPassする。
4. `scopeHash` / `contextHash`がExecution Summaryの`scope` / `context`から`hashJson`で計算した値と一致する。
5. `--write`なしでは`approved-tasks/`へ一切書き込まない。
6. `--write`ありでも、対象の`approved-tasks/<taskId>.json`が既に存在する場合は常に停止し、上書きしない（`--force`は実装しない）。
7. `--compare-existing`は、既存Packetとの不一致があっても実行そのものを失敗させない。
8. approval情報・target・rolesはCLI引数の値のみを使い、現在時刻・承認者・期限・capabilityを自動補完しない。
9. 既存3 Task（Execution Summary追加後）に対しCLIを実行すると、いずれも正常終了しPacketを生成できる。
10. 新規依存を追加しない。UI・IPC・Board・外部送信・APIキー・認証に触れない。
11. 既存Vitestが回帰しない。typecheck・buildがPassする。
12. テストは一時ディレクトリのみを使用し、実際のruntime／approved-tasksを変更しない。

## 8. Stop Conditions

- Execution Summary以外のMarkdown本文を解釈する必要が生じた場合。
- 承認情報の一部でも自動生成・推測が必要になった場合。
- UI・IPC・Board・外部送信・新規依存が必要になった場合。
- 既存Relay／Thread／Recovery契約の変更が必要になった場合。

## 9. Implementation Log

| 日時 | 実施者 | 変更 |
|---|---|---|
| 2026-08-11 | Claude Code | `src/cli/executionSummary.ts`（抽出・スキーマ検証）、`src/cli/buildApprovedTaskPacket.ts`（CLI本体・`runCli`・`CliIO`）、`src/cli/bin.ts`（実行エントリ）を追加 |
| 2026-08-11 | Claude Code | `tsconfig.cli.json`（CommonJS出力用の独立ビルド設定）を追加。`tsconfig.node.json`の`include`へ`src/cli/**/*.ts`を追加。`package.json`へ`build:cli`スクリプトを追加 |
| 2026-08-11 | Claude Code | `tests/executionSummary.test.ts`（14件）、`tests/taskPacketCli.test.ts`（15件）、`tests/taskPacketCli.realDocs.test.ts`（3件）を追加 |
| 2026-08-11 | Claude Code | 既存3 Task（`ADF-EXTERNAL-ADAPTER-001` / `ADF-RELAY-RECOVERY-001` / `ADF-CONVERSATION-RELAY-001`）へExecution Summaryを末尾追記。既存本文は無編集 |
| 2026-08-11 | Claude Code | 文書不整合3件を本実装とは別に訂正（`ADF_EXTERNAL_ADAPTER.md` Status、`ROADMAP.md` Phase 1.8、`ADF-RELAY-RECOVERY-001.md` §9のUI検証記述を「未確認」へ） |

### 実装中に判明した1件

`ADF-CONVERSATION-RELAY-001.md`にExecution Summaryを追記した際、`stopConditions`の出典を示す注記を見出しとfencedブロックの間に置いたところ、CLI自身の「見出し直後は空行のみ許容」チェックがこれを拒否した（`tests/taskPacketCli.realDocs.test.ts`が検出）。注記をfencedブロックの**後**へ移動して解消した。CLIが自らの文書追加ミスを検出した実例として記録する。

## 10. Verification

| 種別 | 実施内容 | 結果 |
|---|---|---|
| 自動 | TypeScript typecheck（node / web） | Pass |
| 自動 | Vitest 全体 | **156 passed / 11 files**（既存123 → 新規33件: 抽出14 / CLI統合15 / 実在3 Task文書4件） |
| 自動 | `tsc -p tsconfig.cli.json`によるCommonJS出力 | Pass |
| 実機 | コンパイル済みCLI（`out/cli/cli/bin.js`）を一時ディレクトリの実Markdownに対して実行（`--write --confirm --compare-existing`） | Pass。抽出表示・stdout JSON・書込み・比較表示すべて確認 |
| 自動 | `electron-vite build` | Pass。`out/main/index.js`（104.22 kB）／`out/preload/index.js`（1.48 kB）／`out/renderer`のJSファイルハッシュが本Task着手前と同一で、Renderer・Preload・Main側に一切差分が無いことを確認 |
| 回帰確認 | 「見出し直後は空行のみ」チェックを一時的に無効化 → 該当テストのみ失敗（1 failed / 14 passed）を確認後、復元 | Pass |
| 回帰確認 | 既存Packet上書き拒否（EEXIST処理）を一時的に無効化 → 該当テストのみ失敗（1 failed / 14 passed、未捕捉例外で検出）を確認後、復元 | Pass |
| 静的 | 実runtime（`~/Library/Application Support/adf-task-board/adf-runtime/approved-tasks/`）にCLIテスト由来のファイルが増えていないことを確認 | Pass |
| 静的 | Git状態: branch `codex/adf-pilot-governance` / HEAD `932357c`のまま。add・commit・push・merge・reset・checkoutなし | Pass |

### 未検証事項

- 実運用環境（`node`/`npm`が通常のPATHにある環境）での`build:cli`実行と`node out/cli/cli/bin.js`起動は未確認。本環境では`ELECTRON_RUN_AS_NODE=1`経由のNode v24で確認した。
- Electron画面（Renderer）からのCLI呼び出し導線は本Taskの対象外であり、存在しない。
- 3 Task文書へ追記したExecution Summaryの`scope`/`context`/`acceptance`/`stopConditions`は要約であり、Project Ownerによる内容面のレビューは未実施。

### 残存リスク

- Execution Summaryと周囲の本文が将来乖離（本文だけ更新されてブロックが古いまま）しても、CLIはそれを検出できない。
- `--runtime-root`の既定値は`.adf-runtime`（相対パス）であり、実アプリの実際のデータディレクトリ（`app.getPath('userData')/adf-runtime`）とは異なる。実アプリ向けに書き込む場合、Ownerが正しい`--runtime-root`を明示する必要がある。
- `ADF-CONVERSATION-RELAY-001`の`stopConditions`は独立した見出しが無い文書から編成したものであり、他2文書に比べて一次資料との対応が弱い。

## 11. Project Owner Review（2026-08-12）

| 対象 | 決定 | 根拠・確認内容 | 日時 |
|---|---|---|---|
| Plan / Scope | Approved | Execution Summary方式（JSON code block形式）を設計OK | 2026-08-11 |
| Diff / Verification | Approved / Done | Execution Summary補記、3 Taskでの抽出・検証Passを受領し、Owner確認済みとしてDone | 2026-08-12 |

- **Execution Summaryは固定JSONブロック方式で確定した。** `## ADF Execution Summary`見出し＋`json adf-execution-summary`fenced blockのみをCLIが読み取る唯一の実行用入力とする。
- 実在する3 Task文書（`ADF-EXTERNAL-ADAPTER-001` / `ADF-RELAY-RECOVERY-001` / `ADF-CONVERSATION-RELAY-001`）で、抽出・hash計算（`scopeHash` / `contextHash`）・`validateApprovedTask`がPassすることを確認した。
- 外部送信・APIキー・UI・IPCは対象外のまま維持した。CLIはOwnerが実行するスタンドアロンツールであり、Renderer・Main・Preloadには一切変更を加えていない。
- **既存Packet（`approved-tasks/`の実ファイル）は本文の逐語抽出ではなく人が書いた要約fixtureであるため、既存hashとの一致は必須にしない。** `--compare-existing`は差分を報告するのみで、実行を失敗させない。
- 既存Packetの自動上書き・自動再承認は行わない。`--write`は既存ファイルがあれば常に停止し、`--force`は実装していない。
- **残存リスク（継続記録）**: Task本文とExecution Summaryが将来乖離（本文だけ更新されてブロックが古いまま）しても、CLIはそれを検出できない。この乖離検出は本Taskの対象外であり、将来必要になれば別Taskで扱う。
