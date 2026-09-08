# Task — ADF-CODEX-CLI-ADAPTER-001: Codex CLI Agent型参加者 Adapter

> Status: `Verifying` — 実装と自動検証は完了。独立レビューと実プロセス確認が残る。
> Owner: Project Owner
> Implementer: Claude Code（Assignment: specialist / implementation）
> Verification: Codex（Assignment: reviewer）による独立レビュー — **未実施**
> Date: 2026-09-08

## 1. Objective

Codex CLI を、ADF の既存 Provider-neutral Adapter 契約へ **Agent型の協業参加者**として登録する準備を整える。Obsidian ノート47 §7 が後続として挙げた「Cursor／Claude Code などの Agent型参加者接続」の最初の一件にあたる。

本Taskは **Registry宣言と Transport 実装までを範囲とし、実送信は行わない**。`ADF-CLAUDE-CODE-CLI-ADAPTER-001` が `claude-code-cli` を `planned` のまま登録した前例と同じ段階に揃える。

## 2. Final Flow Contribution

```text
窓口AI → ADF MCP → Owner承認済みPacket → [将来] Codex CLI Adapter → ADF Result／Evidence → 窓口AI
```

最終フローの「複数AI」区画に、初の Agent型（ツール実行能力を持つ）参加者候補を用意する。本Taskで接続されるのは Registry と Transport までで、フローの実通電は後続Taskとする。

## 3. Vertical Slice Outcome

本Task完了時点で Owner が確認できること。

- `codex-external` の宣言が `connection: 'unknown'` / `authMode: 'unknown'` から実態を反映した値へ確定している。
- Registry上で Codex が何を要求し、何を送信するのかを Owner が読める。
- Transport の隔離境界（sandbox、作業ディレクトリ、環境変数、MCP再入防止）がテストで検証されている。
- `status: 'planned'` のため、自動Routingでも明示Dispatchでも到達できないことが確認できる。

**Owner がまだ体験できないこと**: Codex への実送信、Result生成、Thread表示。これらは後続Taskに分離する。

## 4. 前提となる現状調査（2026-09-08）

実装前の事実確認として記録する。

### 4.1 Registry に枠が既にある

`src/main/jobLoop/adapterRegistry.ts` に `codex-external` が既に存在する。

| 項目 | 現在値 | 本Taskでの扱い |
|---|---|---|
| `adapterId` | `codex-external` | 維持 |
| `provider` | `openai` | 維持 |
| `connection` | `unknown` | `cli` へ確定 |
| `authMode` | `unknown` | 4.4 の結論に従い確定 |
| `status` | `planned` | **維持（変更しない）** |
| `roles` | `proposal` / `critic` / `implementation` | 見直し（§6参照） |
| `dataPolicy` | `external-send` | **維持（変更しない）** |
| `costTier` | `unknown` | 維持 |

### 4.2 Agent型CLI Adapter の前例がある

`src/main/jobLoop/claudeCodeCliTransport.ts` が、Agent型CLIを安全に扱う設計をすでに確立している。

- `--bare --tools ''` で全ツールを無効化
- `mkdtemp` による空の一時ディレクトリを cwd とし、終了時に削除
- 環境変数は `PATH` / `HOME` + 資格情報変数のみのallowlist（`process.env` を素通ししない）
- Registry は `planned` のみ、`index.ts` の Relay へは未登録

本Taskはこの設計をそのまま踏襲する。新しい安全モデルを発明しない。

### 4.3 Frontdoor Node へは現状 Dispatch できない（重要）

`adapterRegistry.ts` の `validateAdapterPlan` と `buildExplicitAdapterPlan` は、いずれも `dataPolicy !== 'local-only'` を例外で拒否する。`AdapterPlan` は `externalSend: false` も必須である。

したがって **`external-send` の Adapter は Frontdoor の AdapterPlan に入れない**。これは運用ルールではなくコード上の境界である。

この事実は、2026-09-08 の対話で本AIが述べた「Frontdoor Run の `fake-ai-b` を Codex に差し替える」という案が **そのままでは成立しない**ことを意味する。差し替えではなく、次のいずれかの Owner 判断が別途必要になる。

- (a) Frontdoor Node の local-only 境界を external-send へ広げる — MVP境界の変更であり、影響が大きい
- (b) Frontdoor Node とは別の External Conversation Adapter 経路（`ADF-EXTERNAL-ADAPTER-001` と同じ系統）で扱う
- (c) Frontdoor 外の独立レビュー用途に限定する

**本Taskは (a)(b)(c) のいずれも決めない。** 決定は §9 の後続Taskへ分離する。

### 4.4 Codex CLI の隔離手段（実機確認済み）

`codex exec` に以下のオプションが存在することを 2026-09-08 に実機で確認した。

| オプション | 用途 |
|---|---|
| `-s read-only` | モデル生成コマンドを読み取り専用sandboxで実行 |
| `-C <DIR>` | 作業ディレクトリを指定 |
| `--skip-git-repo-check` | git管理外の一時ディレクトリで起動するために必要 |
| `-o <FILE>` | 最終メッセージをファイルへ出力（Result抽出用） |
| `--json` | 構造化出力 |

`--dangerously-bypass-approvals-and-sandbox` は本Taskで使用しない。

### 4.5 MCP再入リスク（本Task固有の新規論点）

`ClaudeCodeCliTransport` には無く、Codex には有る問題を記録する。

このマシンの Codex CLI には既に MCP サーバーが設定されている（2026-09-08 時点で `adf_frontdoor`、`unityMCP`、`computer-use`、`cua_repl`、`node_repl`、`event-stream`）。

ADF が `codex exec` を素朴に spawn すると、**起動された Codex が `adf_frontdoor` MCP 経由で ADF 自身の入口を呼び出せる**。ADF が依頼した子AIが、ADF の Run を読み、Request を作れる状態になる。Owner Gate を迂回するものではないが、参加者と入口の権限分離を崩す。

`--tools ''` に相当する単一の無効化フラグは Codex CLI に確認できていない。2案を 2026-09-08 に実機検証した。

**案A: `-c mcp_servers={}` による設定上書き → 不採用**

```text
codex mcp list                    → adf_frontdoor, unityMCP, computer-use, cua_repl, node_repl, event-stream
codex -c 'mcp_servers={}' mcp list → 同じ6件（変化なし）
```

設定上書きではサーバー一覧が変わらない。バンドルplugin由来のサーバー（`computer-use` 等）が `~/.codex/plugins/` から読まれるため、`mcp_servers` キーの上書きだけでは落ちない。**この経路でMCPを無効化できると仮定してはならない。**

**案B: 隔離した `CODEX_HOME` → 採用**

一時ディレクトリを `CODEX_HOME` とし、その中へ `auth.json` の symlink だけを置いた状態で検証した。

```text
CODEX_HOME=<tmp> codex mcp list    → "No MCP servers configured yet."
CODEX_HOME=<tmp> codex login status → "Logged in using ChatGPT"
```

MCPサーバーは1件も読み込まれず、認証は保持される。`config.toml`、`AGENTS.md`、plugins、session履歴も同時に遮断される。`ClaudeCodeCliTransport` の `--bare`（hooks／plugin／keychain／CLAUDE.md探索の一括スキップ）と同等の効果が得られる。

検証中、資格情報の値は読み取っていない。symlink作成のみで、一時ディレクトリは削除済み。

**実装時の必須事項**

- `CODEX_HOME` は send ごとに `mkdtemp` で作り、終了時に削除する（作業ディレクトリと同じ扱い）。
- `auth.json` は **symlink** とし、内容をコピーも読み取りもしない。
- symlink が張れない、または `login status` が未認証を返す場合は送信を開始しない。
- 環境変数allowlistへ `CODEX_HOME` を追加する（`PATH` / `HOME` / `CODEX_HOME`）。

### 4.6 窓口兼協業の扱い — 既存の Assignment 設計に従う

Obsidian ノート47 §3 は「MCPはAIクライアントがADFへ入る入口、AdapterはADFがAIモデルへ依頼するTransport」と役割を分けている。現在 Codex は `adf_frontdoor` MCP を持つ窓口側の参加者であり、本Taskで Adapter を足すと同一製品が両方に現れる。

**これは既存設計で許容済みである。** Obsidian ノート46「参加者 Role Assignment と柔軟な窓口設計」（2026-08-23）が、この論点を先に解決している。

- ノート46 §結論: 「ADFは、特定のAI、製品、モデルを窓口AIや専門AIへ固定しない。役割はPhase／Task／能力／速度／コスト／接続状態／Owner承認に応じて割り当てる。」
- 実装済み: `src/shared/participantTypes.ts` の `ParticipantRole = 'frontdoor' | 'specialist' | 'reviewer' | 'integrator'`。型定義のコメントに `Role is assigned per Phase/Task; it is never a permanent product identity.` と明記されている。
- `src/main/frontdoor/participantRegistry.ts` の `codex` は既に **4つの role すべて**（`frontdoor` / `specialist` / `reviewer` / `integrator`）を宣言している。ソースコメントも `The same participant may be assigned as frontdoor, ...` としている。

したがって「窓口兼協業AI」は例外運用ではなく、**設計どおりの正常な状態**である。2026-09-08 に Project Owner が「窓口AIはCodexのままでよい。窓口兼共同AI。窓口はいつでも柔軟に変更できる設計が最も好み」と明示指示し、既存設計と一致することを確認した。

本Task初稿にあった「Codex を窓口に使う Run では Codex を協業参加者に選ばない」という制約案は **撤回する**。あれは役割を製品へ固定する案であり、ノート46 §「今後、他プロジェクトでも再発させない制御」の3「Provider名と役割名を同じ設定値にしない」に反していた。ノート46 §「以前、役割を誤って固定しそうになった原因」が記録する失敗の再演にあたる。

#### 二つのPlaneで `dataPolicy` が異なる理由

同じ Codex が、二つのRegistryで異なる `dataPolicy` を持つ。これは矛盾ではない。

| Plane | 宣言 | `dataPolicy` | 意味 |
|---|---|---|---|
| Participant（`participantRegistry.ts`） | `codex` | `local-only` | Codex が自分から ADF へ入ってくる。ADF は外部送信しない |
| Adapter（`adapterRegistry.ts`） | `codex-external` | `external-send` | ADF が Codex を呼び出す。OpenAI への送信が発生する |

方向が逆であり、どちらの宣言も正しい。実装時にこの二つを取り違えないこと。

#### 残る狭いリスク

製品単位の排除は行わないが、**同一Run内で同じ Assignment が proposal と critic を兼ねる**構成は、AI Delegation Charter の「実装AIと最終レビューAIを分ける」に触れる。Charter は同時に「AIの製品名ではなく、担当した成果物と権限で役割を区別する」とも定めているため、判定単位は製品ではなく **Assignment** とする。

これは Adapter Plane の問題ではなく Assignment Plane の問題であり、本Taskの Scope 外とする（§9参照）。

## 5. Scope

- `CodexCliTransport` の実装（`ClaudeCodeCliTransport` と同じ `ExternalTransport` 契約）
- `codex-external` の `connection` / `authMode` の確定
- 隔離境界の実装: `-s read-only`、専用一時ディレクトリ、環境変数allowlist、MCP無効化
- MCP再入防止（§4.5 案A／案B）の検証と、防止できない場合の停止
- 上記のユニットテスト（実プロセスを起動しない注入 `spawnImpl` 方式）
- 本Task正本の作成と、Obsidian ノート47 §7 への追記

## 6. Out of Scope

- **Codex への実送信（1件も行わない）**
- `status` を `planned` から `available` へ変更すること
- `index.ts` の Live Relay への登録
- Frontdoor AdapterPlan の local-only 境界の変更（§4.3 の (a)(b)(c) 判断）
- `roles` に `implementation` を残すか外すかの最終決定（§9へ）
- Participant Plane（`participantRegistry.ts` / Assignment）の変更。窓口の切替は既存機能であり、本Taskは触れない
- Codex CLI 本体のインストール、認証、モデル選定、課金
- commit、push、Canonical／Obsidian自動書込み

## 7. Adopted Constraints

Obsidian ノート47 §8 の記録ルールをそのまま適用する。

- 「Adapterコードがある」「Registryにある」「実送信できる」「実運用で使った」を別状態として記録する。本Taskが到達するのは**2つ目まで**。
- `dataPolicy` を `local-only` と偽らない。Codex CLI はローカルプロセスだが送信先は OpenAI であり、`external-send` が正しい。この値を緩めて `validateAdapterPlan` を通すことは、安全モデルの破壊として禁止する。
- 資格情報は値を読まず、存在確認のみ行う（`AnthropicMessagesTransport` / `ClaudeCodeCliTransport` と同じ）。
- ADF は Codex のモデルを自動選択しない。
- 送信文脈は既存の bounded context 契約（過去最大3 Turn、1 Turn 1200文字、依存Result 1000文字）を使う。

Obsidian ノート46 §「今後、他プロジェクトでも再発させない制御」から、本Taskへ適用する項目。

- **3**: Provider名と役割名を同じ設定値にしない。役割は Phase／Task の Assignment として記録する。Adapter登録が窓口の固定を意味しないことを、Task正本とコードコメントの両方に残す。
- **6**: 参加者を切り替えても同じ契約テストが通ることを確認し、**特定Provider名を期待するテストを作らない**。Codex固有の分岐を Relay／Thread／Recovery へ持ち込まない（`ClaudeCodeCliTransport` が `connection: 'cli'` を特別扱いさせていないのと同じ）。
- **7**: 接続成立と実協働、Result取り込み、Completion を別々の検証項目として記録する。

## 8. Acceptance Criteria

1. `CodexCliTransport` が `ExternalTransport` を実装し、`connection: 'cli'` を宣言する。
2. `send()` が毎回、空の一時ディレクトリを作成し、終了時に削除する。
3. spawn する環境変数が allowlist のみで構成され、`process.env` を素通ししない。
4. `-s read-only` が常に付与され、`--dangerously-bypass-approvals-and-sandbox` が現れない。
5. **起動された Codex から `adf_frontdoor` MCP へ到達できないことを検証する。** 案A／案Bのいずれかで達成できない場合、本Taskは実装を止めて Owner へ差し戻す。
6. `codex-external` の `status` が `planned` のままであり、`supports()` が false を返す。
7. `buildExplicitAdapterPlan('codex-external', ...)` が `outside local-only MVP boundary` で throw することをテストで固定する（§4.3 の境界を回帰で守る）。
8. `index.ts` の Relay に登録されていない。
9. 既存回帰（Vitest 全体、node/web/cli typecheck、Electron build、diff check）が Pass する。

## 9. Next Flow Unlocked

本Task完了後に、はじめて着手可能になる後続Task候補。**いずれも別のOwner承認を要する。**

| 後続Task候補 | 内容 | 前提となるOwner判断 |
|---|---|---|
| `ADF-CODEX-EXTERNAL-SEND-001` | 合成Packet 1件の実送信 | ADF初の外部実送信を行うか |
| `ADF-EXTERNAL-BOUNDARY-DECISION-001` | §4.3 の (a)(b)(c) 決定 | Frontdoor の local-only 境界を動かすか |
| `ADF-ASSIGNMENT-SELF-REVIEW-GUARD-001` | 同一Run内で同じ Assignment が proposal と critic を兼ねることの拒否 | §4.6「残る狭いリスク」を検証で強制するか記録に留めるか |

窓口の切替そのものは後続Task不要である。`participantRegistry.ts` の `codex` / `cursor` / `claude-code` はいずれも4 role すべてを宣言済みで、Assignment を変えれば窓口は移せる。

## 10. Deferred Details

- `roles` から `implementation` を外すか否か。Agent型は実装能力を持つが、Work Plane 契約との整合が未確認。
- Codex の Token使用量メトリクス取得（`--json` 出力の形状が未調査）。
- タイムアウト値、Retry、Fallback。ADF は自動Retryを行わない方針のため既定は無しとする。
- Codex Cloud、`codex remote-control`、`codex app-server` の利用可否。

## 11. Owner Decision（2026-09-08）

| 確認事項 | Owner判断 |
|---|---|
| 本Taskの範囲（Registry確定 + Transport実装 + 送信しない） | **承認** |
| §4.5 の MCP再入防止が達成できない場合に停止すること | **承認**（Acceptance Criteria 5 を停止条件として維持） |
| §4.6 の窓口兼協業の扱い | **初稿の制約案を却下。** 窓口AIは Codex のままとし、窓口兼共同AIとする。窓口はいつでも柔軟に変更できる設計を最優先とする |

3点目の指示により §4.6 を全面改訂した。指示内容は Obsidian ノート46 の既存設計および `participantTypes.ts` / `participantRegistry.ts` の実装と一致しており、新規の設計変更を必要としない。

## 12. 未検証事項

- ~~案A／案Bの検証~~ → 2026-09-08 に完了（§4.5）。案Aは不採用、案Bを採用。
- 案Bの検証は `codex mcp list` / `codex login status` による設定解決レベルの確認であり、**実際に `codex exec` を起動した状態でMCPが無効であることは未確認**。実プロセスでの再確認を実装時の検証項目とする。
- `codex exec --json` の出力スキーマは未調査。
- Codex CLI のバージョン依存（2026-09-08 時点の実機は Homebrew 経由の npm `@openai/codex`）。
- ADF から起動した Codex の実際の応答品質、遅延、Token消費。

## 13. 2026-09-08 Implementation / Verification Record

### 変更したファイル

| ファイル | 内容 |
|---|---|
| `src/main/jobLoop/codexCliTransport.ts` | 新規。`CodexCliTransport`（`ExternalTransport` 実装） |
| `src/main/jobLoop/adapterRegistry.ts` | `codex-external` の `connection` を `unknown` → `cli`、`authMode` を `unknown` → `cli-session` へ確定。`status`／`dataPolicy`／`roles` は無変更 |
| `tests/codexCliTransport.test.ts` | 新規。18件（Transport 15件、Registry境界 3件） |

`index.ts` の Live Relay へは登録していない。依存関係の追加なし。

### 実装した隔離境界

1. `--sandbox read-only` を常に付与。`--dangerously-bypass-approvals-and-sandbox` はテストで不在を固定。
2. send ごとに `mkdtemp` で作業ディレクトリを作成し、終了時に root ごと削除。
3. send ごとに隔離 `CODEX_HOME` を作成し、`auth.json` の symlink **1件のみ**を配置。`config.toml`／`AGENTS.md`／plugins／session履歴／MCPサーバー設定はすべて遮断される。
4. 環境変数は `PATH`／`HOME`／`CODEX_HOME` のみ。`CODEX_HOME` は**継承しない**（親プロセスの環境変数で実HOMEへ再接続されるのを防ぐ）。
5. 隔離を構築できない場合は `status: 'failed'` / `terminationReason: 'isolation-failed'` を返し、**プロセスを起動しない**。

### 検証で検出・修正した欠陥（2件）

いずれもテスト作成時に検出し、修正済み。

1. **dangling symlink**: `symlink()` は POSIX 上、存在しないターゲットに対しても成功する。認証ファイルが無い状態でも隔離が「成功」し、送信へ進んでいた。`prepareIsolatedRun` の先頭で `existsSync` による明示チェックを追加し、未認証時は隔離段階で停止するよう修正。
2. **否定形の取りこぼし**: readiness 判定の `/logged in/i` が `Not logged in.` にマッチし、未認証を `ready: true` と判定していた。否定パターンを先に評価し、明確な肯定以外はすべて not ready とするよう修正。

### 自動検証の結果

| 検証 | 結果 |
|---|---|
| 対象テスト `tests/codexCliTransport.test.ts` | 18/18 Pass |
| 全体 Vitest | **44 files / 428 tests Pass**（従前 43 files / 410 tests） |
| typecheck node / web | Pass |
| typecheck cli | Pass |
| `electron-vite build` | Pass |
| `git diff --check` | Pass |

### 実施していないこと

- **Codex への実送信は0件。** 実行したのは注入 `spawnImpl` によるテストのみで、実プロセスは一度も起動していない。
- `status` は `planned` のまま。Live Relay 未登録。自動Routing・明示Dispatchのいずれからも到達不能であることをテストで固定。
- commit、push、Canonical／Obsidian自動書込みは行っていない。
- `CURRENT_STATE.md` とObsidian ノート47 §7 の更新は、独立レビュー完了後に行う。

### 残る作業

1. **Codex（reviewer Assignment）による独立レビュー。** Owner が `/codex:review` を実行する。ADFの外部送信ではなく開発ツールとしての利用だが、リポジトリ差分がOpenAIへ送信されるため Owner の実行操作とする。
2. 実 `codex exec` プロセスでMCPが無効であることの確認（§12）。これは実送信を伴うため、`ADF-CODEX-EXTERNAL-SEND-001` へ送る。
3. 上記完了後、`CURRENT_STATE.md` とObsidian ノート47 §7 を更新。

## 14. 2026-09-08 独立レビュー（Codex / reviewer Assignment）と対応

`/codex:adversarial-review` を2ファイル（約570行）に絞って実行。**Verdict: `needs-attention` / No-ship。** 指摘5件はいずれも妥当と判断した。

### 対応済み（3件）

| # | 深刻度 | 指摘 | 対応 |
|---|---|---|---|
| 3 | high | `send()` が `checkReadiness()` を呼ばず、`auth.json` の存在確認だけで `codex exec` を起動する。期限切れセッションでも送信が始まる | `send()` の先頭に readiness ゲートを追加。未認証なら `terminationReason: 'not-authenticated'` を返し **spawnしない**。回帰テスト追加 |
| 4 | medium | `affirmsSession` が部分一致のため `Logged in: false`、`Session expired; last logged in ...` などを ready と判定しうる | `interpretLoginStatus()` として分離し fail-closed 化。単一行であること、否定語（`false`／`expired`／`unknown`／`invalid`／`error` 等）を含まないこと、行頭が肯定であることをすべて要求。10ケースの表テストを追加 |
| 5 | medium | SIGTERM 後 `close` が来ないと Promise が解決せず、`auth.json` symlink を含む隔離ディレクトリが残り続ける | SIGTERM → 猶予後 SIGKILL → さらに猶予後に `process-did-not-exit-after-sigkill` で強制解決するエスカレーションを実装。signalを無視する子プロセスを模したテストで、ディレクトリが確実に削除されることを検証 |

### 未解決 — Owner判断が必要（2件）

**#1 [high] `--sandbox read-only` と `-C` はファイル読み取りを隔離しない**

指摘は正しい。本Task初稿および `codexCliTransport.ts` のコメントで、この構成を `ClaudeCodeCliTransport` の `--bare --tools ''` と「同等」と記述したが、**これは誤りだった**。

- `--tools ''` は全ツールを無効化するため、子は何も読めない。
- `--sandbox read-only` は**書き込み**を制限するもので、読み取りは制限しない。
- `-C` は作業ディレクトリを変えるだけで chroot でも読み取り許可リストでもない。
- `HOME` を子へ渡しているため、対象ファイルの所在も判明する。

したがって Codex の子プロセスは、絶対パスを指定してこのリポジトリや Obsidian Vault を読み、その内容を最終応答へ含められる。**読み取り境界は確立できていない。**

該当箇所のコメントは、誤りを明記したうえで訂正済み。

**#2 [high] MCP遮断がテストで実証されていない**

指摘は正しい。テストが検証しているのは「ADFが子へ渡すディレクトリの中身」だけで、実 Codex がそこから MCP を解決しないことは証明していない。§4.5 の実機確認は `codex mcp list` によるもので、`codex exec` 起動時の挙動は未確認。テストの表題が過剰主張だったため、この限界をコメントへ明記した。

### Acceptance Criteria の充足状況

| AC | 結果 |
|---|---|
| 1〜4、6〜9 | Pass |
| **5（MCP遮断の検証）** | **未達**。設定解決レベルの確認のみ |

AC5 は「達成できない場合は実装を止めて Owner へ差し戻す」と定めた停止条件である。**本Taskはここで停止し、Owner判断を仰ぐ。**

### Owner判断が必要な事項

1. **#1 の読み取り境界をどうするか。**
   - (a) OS レベルのサンドボックス（macOS `sandbox-exec` 等）を追加する — Scope拡大。新規依存の検討が必要
   - (b) 読み取り境界は確立できないと明記したうえで `planned` のまま凍結し、後続Taskへ送る
   - (c) `HOME` の受け渡しをやめるなど部分的緩和のみ行う — 絶対パス読み取りは防げないため限定的
2. **#2 の実CLI検証をいつ行うか。** 実 `codex exec` の起動は外部送信を伴うため、本Taskの Out of Scope に該当する。`ADF-CODEX-EXTERNAL-SEND-001` へ送るのが整合的。

### 修正後の自動検証

| 検証 | 結果 |
|---|---|
| 対象テスト | 29/29 Pass（従前18件から+11） |
| 全体 Vitest | **44 files / 439 tests Pass**（従前 428） |
| typecheck node / web / cli | Pass |
| `electron-vite build` | Pass |
| `git diff --check` | Pass |

Codex への実送信は引き続き0件。`status` は `planned` のまま、Live Relay 未登録。

### 本Task対象外で検出された指摘（記録のみ）

先行して実行した `/codex:review`（working tree 全体、46ファイル）で、本Taskの変更範囲外に5件の指摘が出た。`AI_COLLABORATION.md`「変更の対象外である問題を見つけた場合は、勝手に修正せず記録または提案する」に従い、修正せず記録する。

| 深刻度 | 箇所 | 内容 |
|---|---|---|
| P1 | `src/main/liveRelay.ts:55` | `OPENROUTER_MODEL` 未設定時に可変ルーター `openrouter/free` へ送信されうる。固定モデル要件（`ADF-COMPATIBLE-PROVIDER-ADAPTERS-001`）と矛盾 |
| P1 | `src/main/frontdoor/collaborationTrace.ts:60-62` | Result を投影する前に `hashJson(result)` と記録済み hash を照合していない。改ざんされた Result が正規の結果として表示されうる |
| P1 | `tools/arena/contextpack.mjs:101` | ノートが symlink の場合、字句的な `assertInside` を通過して Vault 外のファイルを読める |
| P2 | `tools/arena/adapters.mjs:24` | 3〜6件と規定した claim 数の上下限を検証していない |
| P2 | `src/main/jobLoop/openAiCompatibleTransport.ts:94` | 未選択のProviderでも起動時に endpoint 検証が走り、不正値でアプリ／CLI全体が起動不能になる |

いずれも未検証の指摘であり、採否はOwnerが判断する。別Taskとして起票するかは未決。
