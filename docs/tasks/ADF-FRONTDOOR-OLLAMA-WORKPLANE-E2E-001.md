# ADF-FRONTDOOR-OLLAMA-WORKPLANE-E2E-001

Status: Done

## 1. Objective

Window／Frontdoor AIからlocal stdio MCPへRequestを投入し、既存のOwner Gateを経由して明示承認済みの`ollama-local`へDispatchし、Result／Evidence／Job Ledger／Frontdoor Event Ledgerを束ねた成果物を、Canonical repo・Obsidianとは分離したRuntime Work PlaneへOwner操作でExportできる最小縦切りを成立させる。

## 2. Scope

In scope:

- MCPの bounded read surface（Node Reviewの表示、Result binding検証、Work Plane artifact読取）
- Result Review後の明示的なWork Plane Export Gate
- Run／Request／Plan／Node／Job／Thread／Result／Owner Decision hashを束ねるartifact manifest
- per-Run Runtime root下への一回限り・overwrite禁止のJSON artifact生成
- CLI／Electron Owner入口の共通Service接続
- Fake／injected Ollamaによる自動検証
- Skill `adf-ollama-workplane-e2e`の新規作成と`adf-frontdoor-owner-gates`／role contractの更新

Out of scope:

- 実Ollamaへの新規送信（実行直前の別承認まで保留）
- AIへ任意ファイルを書かせるOS sandbox、worktree編集、repo／Obsidian統合
- API key、外部送信、課金、commit、push、merge
- Owner identityの認証基盤

## 3. Acceptance Criteria

1. MCPはOwner Decisionを作成せず、Export済みartifactをread-onlyで返す。
2. MCP Dispatchの返却はResult生成とRun Completionを区別し、Result Review前は`awaiting-owner:result-review`を返す。
3. `get_result`はNode記録のResult hash、Job ID、Task ID、Result refと実ファイルを照合し、不一致を拒否する。
4. Result Reviewのaccept前のExportを拒否する。
5. Export artifactはRunごとのRuntime Work Plane下へ一回だけ生成し、manifestにRun／Plan／Result／Owner Decision／content hashを記録する。
6. Result改ざん、別Run参照、再Export、外部送信Plan、Canonical pathはfail-closedで扱う。
7. Typecheck、Vitest、Electron build、CLI build、diff checkがPassする。
8. 実Ollama送信とWindow AI実画面のtool表示は、本Taskの自動検証証跡と混同せず別の実機受入として記録する。

## 4. Implementation Log

- `WorkPlaneArtifactManifest`と`artifact-export` Owner Gateを追加。
- Result Review accept後だけ`exportWorkPlaneArtifact()`を実行可能にし、CLI `frontdoor export-artifact`とElectron IPC／Rendererボタンへ接続。
- artifactは`frontdoor-runs/<runId>/work-plane/`へ生成し、既存ディレクトリ・既存artifactへの再Exportを拒否。
- artifact本文は専用一時ファイルへ排他的に書き込んでから最終JSONへrenameし、証跡記録に失敗した場合は今回作成した専用Work Planeだけを後始末する。
- MCPに`adf_frontdoor_get_workplane_artifact`を追加。MCPはOwner Decision／artifact生成を行わない。
- MCP `get_result`に実ResultとRun Node記録のhash／Job／Task照合を追加。
- Dispatch返却の`status`をRun状態、Aggregateの旧値を`aggregateStatus`として分離。
- `adf-ollama-workplane-e2e`を新規作成し、`adf-frontdoor-owner-gates`とsubagent role contractへWork Plane／Export／path境界を追記。
- 実機MCP Dispatchで発見した5秒既定タイムアウトを、local model inferenceを待てる120秒へ修正。

## 5. Verification

自動テストはFake／injected経路で実行し、最終実機検証ではMCP経由で`ollama-local`のProposal／Criticを各1回送信した。Run `run-30c7a84186862404fe38`は両Node成功、Result／Evidence／Job／Thread／Event Ledger／Work Plane artifactを生成し、MCPの`get_result`／artifact readで再照合した。Live BoardのRefresh後に両Nodeが表示されることも確認した。accepted ResultのみExport、Result改ざん拒否、MCPからExport artifactを読めること、Result Review前のExport拒否を含む。Vitest **348/348**（30 files）、Node/Web/CLI typecheck、`electron-vite build`、`git diff --check`はPass。

Skill公式validatorはPyYAML未導入のため実行不可。SKILL.mdのfrontmatterと本文は手動確認済み。これは実装コードの検証失敗ではなく、validator依存の環境阻害として記録する。

## 6. Residual Risks / Next Step

- 現在のCodexウィンドウに表示されているMCP tool listは旧接続の5 toolであり、新しいartifact read toolの表示にはMCP接続の再起動が必要。新プロセスの`tools/list`では6 toolを確認済み。
- 初回実機RunはMCPクライアント5秒タイムアウトでProposal実行中に中断し、Run `run-9e156c781b2234515369`をRecovery済み。再送は新Runでのみ実施し、同Runの自動再試行は行っていない。
- Work PlaneはADFがResult-derived JSONを生成する方式であり、AI任意書込みsandboxではない。AI編集Work Planeは別Taskとする。
- Event Ledgerの跨プロセス同時append、Owner identity真正性、古いDispatch Decision再利用は別の安全性Task候補として残す。

## 7. Owner Review

実装・自動検証・MCP経由実機E2E・Live Board確認を完了した。Run `run-30c7a84186862404fe38`でProposal／Criticが`ollama-local`へ各1回成功し、Result Review、Work Plane Export、CompletionまでOwner Decisionを記録した。新しいMCPプロセスでは6 toolを確認し、現在のCodex接続からも同RunのInspectを確認した。Project Owner判断によりStatusを`Done`とする。commit／pushは行わない。

## 8. Closing Evidence

- 正規Run: `run-30c7a84186862404fe38`
- Proposal: Job `job-da046d6081a2319a` / Thread `thread-2975be873e4c2406`
- Critic: Job `job-d6923c14bf077583` / Thread `thread-5da5b949210f94f5`
- Work Plane artifact: `frontdoor-runs/run-30c7a84186862404fe38/work-plane/artifact-826abe7b6b967a88506d.json`
- 初回タイムアウトRun `run-9e156c781b2234515369`はRecovery済みで、自動再送していない。再実行は新Runに限定した。
