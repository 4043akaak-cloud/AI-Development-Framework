---
Task ID: ADF-MULTI-PARTICIPANT-COLLABORATION-001
Status: Verifying
Owner: Project Owner
---

# ADF-MULTI-PARTICIPANT-COLLABORATION-001

## 1. Objective

現在の窓口AIであるCodexから、既存ADF Frontdoorを通してOllama等の参加AIへ作業を配分し、Resultを軽量なContext CapsuleとしてCodexへ戻す最小縦切りを実装する。将来のCursor、Antigravity、Claude Code等は同じ参加者契約へ追加できる構造とするが、本TaskではCodexを現在の窓口として扱う。

## 2. North Star Gate

- **Final Flow Contribution**：Codex → ADF → 参加AI → ADF → Codexの情報往復を軽量化する。
- **Vertical Slice Outcome**：既存Runを、全文Ledgerではなく参照と要約を持つContext CapsuleとしてCodexから取得できる。
- **Next Flow Unlocked**：Cursor、Antigravity等を窓口候補・参加者として同じMCP契約へ接続できる。
- **Deferred Details**：全Provider個別Adapter、GUI自動操作、外部API、Obsidian自動確定書込み、全サービス一括接続。

## 3. In Scope

- `FrontdoorContextCapsule`の共有型と決定的生成器
- 既存Frontdoor MCPへの`adf_frontdoor_get_context_capsule`追加
- Context Capsuleの文字数上限、ID・hash・Evidence参照保持
- Codex窓口からの読み取り往復を想定した自動テスト
- 既存Run／Result／Ledgerの非破壊利用

## 4. Out of Scope

- Owner承認の自動生成・代行
- 未承認のOllama実送信、APIキー設定、外部送信、課金
- Cursor／Antigravityのアプリ設定変更
- Obsidianへの自動確定書込み
- GitHub正本の自動変更、commit、push、merge

## 5. Acceptance Criteria

1. Context Capsuleが既存のFrontdoor Inspectionから決定的に生成される。
2. CapsuleがRequest、Phase状態、Owner Gate、Node、Result参照、Evidence参照、Question、次Actionを含む。
3. 指定文字数以内に圧縮され、元Result・Ledgerを削除・変更しない。
4. Request／Plan／AggregateのhashとRun／Node／ResultのIDが保持される。
5. `adf_frontdoor_get_context_capsule`が読み取り専用で利用できる。
6. Owner承認前のDispatch拒否、既存Result検証、既存MCP Toolが回帰しない。
7. typecheck、Vitest、Electron build、diff checkがPassする。

## 6. Stop Conditions

- Context Capsuleが証跡のID・hash・参照を失う場合。
- 既存Ledger／Result／Owner Gateを書き換える必要が生じた場合。
- 外部送信、認証、課金、Canonical書込みが必要になった場合。
- 同一原因の検証失敗が2回連続、または異なる原因の失敗が3回続いた場合。

## 7. Implementation Log

### 2026-08-18

- `FrontdoorContextCapsule`共有型を追加。
- 既存Inspectionから、Request・状態・Owner Gate・Node・Result／Evidence参照・Question・次Actionを決定的に圧縮する生成器を追加。
- 既存MCPへ`adf_frontdoor_get_context_capsule`を追加。読み取り専用で、Runtime Ledger・Result・Evidenceを変更しない。
- 文字数上限、source hash保持、同一入力でのcapsule ID安定性、MCP経由でのLedger無変更をテスト化。
- `adf_frontdoor_propose_obsidian_update`を追加。Owner確認前のMarkdown案をRuntime内の保留箱へ保存し、Obsidian Vaultへは書き込まない。
- 実stdio MCP Client E2EからContext Capsuleを取得し、Codex窓口相当のMCP往復を確認。
- Project Ownerの明示承認を受け、`run-e598a9036a406f405311`を新規作成。intake・completion-shape・decomposition・dispatchの4 Owner Gateを記録。
- `ollama-local`（`http://127.0.0.1:11434`、`llama3:latest`）へ実送信を1回実施。Ollamaの到達性・モデル存在はPassしたが、proposalがADFの60秒応答上限を超過し、criticは依存失敗で未実行となった。
- Ollama応答の`total_duration`、`load_duration`、`prompt_eval_*`、`eval_*`の数値メトリクスを、Provider-neutralなOutcomeからExternal Call Ledgerへ伝播する最小実装を追加。本文・未知フィールド・資格情報はメトリクスとして保存しない。
- 接続確認用の軽量実行条件を追加。既定値は`num_ctx: 2048`、`num_predict: 128`、`temperature: 0`。Timeout（60秒）とモデルは変更せず、明示的なgeneration profileで上書き可能とした。

### 2026-08-19

- Node間の停止を通常動作のたびにOwnerへ戻さないため、`DecompositionPlan.nodeReviewPolicy`を追加。既定値は`auto-continue-safe`、従来の逐次確認は`owner-each-node`で明示選択できる。
- `auto-continue-safe`は、同一の承認済みPlan内で、Result statusが`success`、検証項目が1件以上かつ全Pass、リスクなし、未解決Questionなしの場合だけ次の依存Nodeへ自動継続する。
- 失敗、partial、verification未通過、リスク、Question、readiness失敗では自動継続せず、既存のNode Review／Question／Failure経路へ戻る。
- 自動継続の事実は既存の`frontdoor.node-completed`イベントに`autoContinued`として記録し、Activity Traceにも表示する。Owner承認・Dispatch境界・Plan hashは省略しない。
- Deterministic PlannerとOllama 2 Node E2E入力は`auto-continue-safe`を明示。既存の手動Reviewテストは`owner-each-node`を明示して従来挙動を固定した。

## 8. Verification

- `pnpm test`：**378/378 Pass**（35 files）
- メトリクス実装後の`pnpm test`：**381/381 Pass**（35 files、+3 tests）
- 軽量実行条件実装後の`pnpm test`：**382/382 Pass**（35 files、+1 test）
- `tsc --noEmit -p tsconfig.node.json`：Pass
- `tsc --noEmit -p tsconfig.web.json`：Pass
- `tsc -p tsconfig.cli.json`：Pass
- `electron-vite build`：Pass
- `git diff --check`：Pass
- MCP Client E2E：実stdioプロセス経由のContext Capsule取得 Pass
- 実Ollama送信：1回実施。ただし成功ではなく、proposalは`timeout`（`no answer within 60000ms`）、criticは`dependency failed`。
- 失敗Result／Evidence／External Call Ledger：生成・読み取り確認済み。Runは`awaiting-owner:result-review`で、既存証跡・既存Runは変更なし。
- 実行証跡：`frontdoor-runs/run-e598a9036a406f405311/`、proposal Thread `thread-48c0bc1d8012e9cf`、Job `job-c73247b0630cee4d`。
- メトリクス実装後の実Ollama送信：未実施。Timeout、`num_ctx`、`num_predict`、モデル変更は今回の範囲外。
- 軽量条件反映後の実Ollama診断送信：未実施。実行直前のOwner承認待ち。
- 軽量条件反映後の実Ollama診断送信：Owner承認後に1回実施。proposalは`success`、ADF計測`durationMs: 22370`、Ollama計測`totalDurationNs: 22245011917`、`loadDurationNs: 12631218334`、`promptEvalDurationNs: 1998526000`、`evalDurationNs: 7423163000`、`evalCount: 77`を記録した。
- 診断Run `run-657fbad20b7a6861d18d` はproposal完了後、ADFの`awaiting-owner:node-review`で停止。criticはOwnerのproposal結果確認前に実行されていない。プローブの最終検証が`result-review`を期待して終了コード1となったが、Ollama応答失敗ではなく、現行Owner Gateの停止位置との差分である。
- Ownerの`node-review: continue`後、criticも実Ollamaへ1回送信し成功。criticのADF計測は`durationMs: 24399`、Ollama計測は`totalDurationNs: 24275905792`、`loadDurationNs: 13118026958`、`promptEvalDurationNs: 3489535000`、`evalDurationNs: 7462762000`、`evalCount: 77`。2 NodeのResult／Evidence／Job／Thread／依存Result hash検証はPassし、Runは`awaiting-owner:result-review`で停止した。
- Cursor／Antigravity設定変更：未実施
- Obsidian自動書込み：未実施
- commit／push：未実施
- Node Reviewポリシー実装後の`vitest run`：**383/383 Pass**（35 files）。自動継続、明示Owner Review、危険Resultでの停止、Prepare再利用を確認した。
- Node Reviewポリシー実装後のtypecheck（node/web/cli）：Pass、`electron-vite build`：Pass、`git diff --check`：Pass。
- Node Reviewポリシー実装後の実Ollama送信：未実施。実行済みの診断Run・外部送信証跡は変更していない。

## 9. Current Boundary

今回の実装は、現在の窓口AIであるCodexがADFから軽量なContext Capsuleを取得し、Owner Gate後にlocal Ollamaへ実送信できるかを実証するControl／Evidence Planeの縦切りである。通常の承認済みPlanは、安全条件を満たすNode間を自動継続し、OwnerはResult Review・Question・異常時の方向修正に集中できる。自動継続はPlan内の許可範囲を超えず、危険条件では従来どおり停止する。実Ollamaの成功2 Node証跡は既に別Runで確認済みであり、今回のコード変更では再送信していない。Obsidian自動確定書込み、将来のCursor／Antigravity接続は別段階で扱う。既存の未コミット差分は保持している。
