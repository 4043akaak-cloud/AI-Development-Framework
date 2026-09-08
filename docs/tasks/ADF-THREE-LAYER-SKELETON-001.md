# Task — ADF-THREE-LAYER-SKELETON-001: 三層ウォーキングスケルトン v0

> Status: `Blocked` — 実装完了、独立レビュー実施済み、指摘12件を修正（selfcheck 24/24）。Acceptance Criteria 1/3/4/5 はPass、**2は未達**。このマシンで実用に足るローカルモデルが1つしかないため。§12.1 参照。
> Owner: Project Owner
> Implementer: Claude Code
> Independent Review: 別サブエージェント（実装担当と分離する。`adf-independent-review` を用いる）
> Branch: `codex/adf-mcp-frontdoor-2cycle-e2e`（現在のブランチ。**新規ファイル追加のみ**で既存の未コミット差分に触れない）
> Date: 2026-09-04

## 1. Objective

AI開発の三層構造（資産層・判断層・実行層）を、最小構成で縦に一本貫通させる。層と層の結合はファイル受け渡しだけに限定し、どれか一層が失敗しても他が死なない構成であることを実証する。

## 2. Background

Project Ownerとブラウザ版Claudeの設計合意を、Claude Codeが引き継いだ。理想形として次の5段を承認済み（2026-09-04）。

```text
Obsidian Vault（正本）
  ─① 抽出→ [資産層] context-pack.md
  ─② 独立分岐→ [判断層] Arena → AI-a / AI-b
  ─③ 差分抽出→ verdict.md（確定／未確定）
  ─④ 決定ログ→ [実行層] ADF
  ─⑤ Owner承認書き戻し→ Obsidian Vault
```

既存ADF資産との照合結果、理想形に対して不足しているのは①の機構と③だけである。②は既存Frontdoorに存在するがトポロジが異なる（Proposal → Critic の逐次依存であり、独立並列ではない）。④は既存。⑤は憲章上禁止のため「生成して停止」で回避する。

## 3. Final Flow Contribution

Blueprint §7 の必須4項目。

- **Final Flow Contribution**: North Star の `specialist AI Nodes → Result` 区間に、**独立並列トポロジ**と**争点抽出**という現行Frontdoorに無い2つの能力を、実験として先行検証する。
- **Vertical Slice Outcome**: Ownerが1つの問いを投入すると、2つのローカルAIが互いを見ずに答え、一致点と不一致点が分離された `verdict.md` と、Obsidianへ貼れるノート候補が得られる。
- **Next Flow Unlocked**: 検証済みの独立並列トポロジと争点抽出を、別Taskで既存 `orchestrator.ts` / Aggregate へ移植できる。
- **Deferred Details**: Frontdoor統合、Owner Gate、Event Ledger、hash binding、TypeScript化、3AI以上への拡張。

## 4. Scope

新規追加のみ。既存ファイルは1つも変更しない。

- `tools/arena/contextpack.mjs` — ① Vaultの指定ノートだけを1ファイルへ集約
- `tools/arena/arena.mjs` — ② 同一プロンプトを2アダプタへ独立・並列送信
- `tools/arena/verdict.mjs` — ③ 2つの回答を突き合わせ、確定／未確定へ分離
- `tools/arena/linkcheck.mjs` — ⑤ 生成ノートのwikilinkがVault内に実在するか検証
- `tools/arena/run.mjs` — 一周を通す入口
- `tools/arena/README.md` — 使い方と層境界の説明
- 本Task正本、`docs/project/CURRENT_STATE.md` への追記

## 5. Out of Scope

- 既存 `src/` 配下の変更、`tsconfig.*` / `package.json` / `.gitignore` の変更
- Frontdoor、Owner Gate、Event Ledger、MCP、Work Plane への接続
- Obsidian Vaultへの自動書き込み（生成して停止する）
- 外部API、APIキー、課金、commit、push
- 数字生成・予測ロジックへの一切の関与
- LM Studio本体のインストール、およびそのモデルのダウンロード・ロード

> **Scope改訂（2026-09-08、Project Owner承認済み）**: 当初は「モデルのダウンロード・ロード」を全面的にOut of Scopeとしていたが、Acceptance Criteria 2 の達成にはローカルモデルの取得が不可避であることが実測で判明したため、**Ollamaモデルの取得のみ Scope に含める**ものとして Owner の承認を得た。取得したのは `qwen2.5:3b`（1.9GB）と `llama3.2:1b`（1.3GB）の2件。LM Studio については当初どおり Out of Scope のまま。§11 も併せて改訂した。

## 6. Adopted Constraints

| 制約 | 根拠 |
| --- | --- |
| Obsidian正本への自動書き込みを行わない | `ADF_PRODUCT_COMPLETION_BLUEPRINT.md` §6 |
| 外部API・未承認のAI間自動連携を導入しない | `AGENTS.md` L42 |
| Vault全体をAIへ渡さず、指定ノートだけを渡す | `docs/obsidian/OBSIDIAN_INTEGRATION.md` L16 |
| 新規依存を追加しない | `AI_DELEGATION_CHARTER.md` Mandatory Escalation |
| 実装AIと最終レビューAIを分ける | `AI_DELEGATION_CHARTER.md` Delegation Rule |

### 実行環境

このMacには `node` / `npm` / `pnpm` がPATH上に存在しない。ADFが既にMCPで使用している方式を再利用する。

```bash
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tools/arena/run.mjs
```

確認済み: Node v24.18.0、`fetch` 利用可。新規依存ゼロ、設定変更ゼロ。

### 出力先

`$HOME/.adf-arena/<runId>/` を既定とする。リポジトリ内に出力しないため、`.gitignore` 変更が不要で、Codexの未コミット差分（修正26件＋新規9件）と混ざらない。`--out-root` で上書き可能。

### 言語

`tools/` 配下は素のESM（`.mjs`）とする。TypeScriptにすると `tsconfig.cli.json` の `include` 配列の変更が必要になり、承認前の設定変更に該当するため。TypeScript化はDeferred。

## 7. 層境界の契約

各層は隣接層のファイル形式だけを知る。各段の入力はすべてディスクから読み、出力はディスクへ書く。

**この主張の正確な範囲**（2026-09-08 独立レビューを受けて訂正）: プロセス分離はしていない。`run.mjs` は5つのモジュールをimportして単一プロセスで順に呼ぶ。担保されているのは「各段の入出力がファイルで完結し、どの段からでも単独に再実行でき、途中で落ちても手前の成果物が残る」ことであって、「層が別プロセスで動く」ことではない。

| 段 | 入力 | 出力 |
| --- | --- | --- |
| ① | Vault内の指定ノート一覧 | `context-pack.md` |
| ② | `context-pack.md` ＋ 問い | `answer-a.json` / `answer-b.json` |
| ③ | 2つのanswer | `verdict.md` ＋ `decision-log.json` |
| ④ | `decision-log.json` | （ADFが読む。v0では読み取り確認のみ） |
| ⑤ | `decision-log.json` ＋ `context-pack.md` | `obsidian-out/<note>.md`（生成して停止） |

### ② 独立性の保証

- 2アダプタへ**バイト単位で同一のプロンプト**を送る
- 一方の出力を他方へ渡さない
- 各 `answer-*.json` にプロンプトのSHA-256を記録し、2つが一致することを③で検証する。不一致なら停止する

### ③ 争点抽出の方式と限界

各AIに次の最小スキーマでの回答を指示する。

```json
{ "recommendation": "...", "claims": [ { "id": "c1", "statement": "...", "stance": "support|oppose|conditional" } ] }
```

突き合わせは `recommendation` の異同と `claims[].stance` の異同で行う。

**限界を明記する**: ローカル7B/8Bクラスのモデルは厳密なJSONを安定して出力しない。パース失敗時は raw 応答を保存したうえで run を `malformed` として停止し、推測による補完は行わない。またv0では「割れているか」の最終判定は機械ではなくProject Ownerが `verdict.md` を読んで行う。機械は候補を出すだけである。これはOwner Gate思想と一致する。

## 8. Required Obsidian Context

| ノート | 採用する制約・背景 |
| --- | --- |
| `Projects/PredictionEngine_Design_Insights.md` | Design Rule #1「最終形を先に設計し、MVPは後から逆算する」。本Taskが理想形を先に確定させた根拠 |
| `Projects/LoopCodingFramework.md` | ループ運用の前提（Context Read 予定） |
| `Projects/PEC_WorkReport.md` | 題材候補の背景（Context Read 予定） |

### Context不足として記録する事実

- `docs/obsidian/OBSIDIAN_INTEGRATION.md` L30 が指す `Projects/AI-Development-Framework/00_MOC.md` は**Vaultに存在しない**
- `docs/project/CURRENT_STATE.md` が参照する `47_ADF_参加者接続容易性と低コストAdapter計画_2026-08-25` も**存在しない**
- `Projects/PredictionEngine_Design_Insights.md` L112 の `[[loop_coding_design_phase1.md]]` は**リンク切れ**（実在は `LoopCodingFramework.md`）

ADFの記録が指すObsidianノートが実在しない状態であり、資産層が解くべき問題そのものが既に発生している。本Taskではこれを修復対象とせず、事実として記録する。

## 9. Acceptance Criteria

引き継ぎ文の成功条件4つに対応する。

1. `context-pack.md` が1ファイルとして生成され、Vault全体ではなく指定ノートだけを含む。含まれるノート名が本文に列挙されている
2. 2アダプタへ同一プロンプトを独立送信し、両 `answer-*.json` のプロンプトhashが一致する。意見が割れた点が1つ以上 `verdict.md` に現れる
3. `verdict.md` が「確定」「未確定」の2見出しに分離され、未確定側に各AIの立場が併記されている
4. `obsidian-out/` に生成したノートのwikilinkが、Vault内の実在ノートを指す（`linkcheck.mjs` がPass）
5. 上記のいずれかが満たせない場合、推測で埋めず `Blocked` として停止し、理由を記録する

## 10. Verification

- `linkcheck.mjs` による生成ノートのリンク解決チェック
- プロンプトhash一致の検証（②の独立性）
- 一方のアダプタを意図的に停止させ、他方とスケルトンが停止せず `partial` として記録されること（層の独立性の確認）
- `git status` で、変更が新規ファイル追加のみであり既存35件（修正26＋新規9）の差分に影響していないこと
- 独立レビュー（実装担当と別のサブエージェント）
- commit / push は行わない

## 11. Human Decision（2026-09-04 Project Owner 決定済み）

1. **題材**: PEC Issue #051「TypeScriptエラー340件を cosmetic として先へ進める判断は妥当か」（`prediction-engine-core/todo.md:281`）を採用。題材は機構に影響しない差し替え可能なペイロードである
2. **AI構成**: LM Studio を取り下げ、**Ollama 2モデル構成**とする。ただし2モデル目は当面 **Fake** とする
   - AI-a = `ollama-local` / `llama3:latest`（実送信）
   - AI-b = `fake-contrarian`（合成・決定的）
3. ~~モデルの追加ダウンロードは行わない~~ → **2026-09-08 改訂**: llama3:8b がこのハードで実用にならないことが実測で判明したため、Project Owner の承認を得て `qwen2.5:3b` と `llama3.2:1b` を取得した。§5 の Scope 改訂を参照

### この構成が検証すること／しないこと

- **検証する**: 独立並列トポロジ、プロンプト同一性、争点抽出機構、確定／未確定の分離、Obsidianリンク解決、片系停止時の生存
- **検証しない**: 「実際に2つのAIの意見が割れる」という現象そのもの。AI-b の不一致は合成であり実意見ではない

したがって成功条件2は「機構として割れを検出できる」ことの達成であり、現象の実証は AI-b を実モデルへ差し替える後続作業に残る。`verdict.md` および `decision-log.json` は合成側を明示ラベルし、実意見と混同できない形にする。

## 12. Stop Conditions

`AI_DELEGATION_CHARTER.md` および `EXPERIMENT_PROTOCOL.md` に従う。同一原因の検証失敗が2回連続、または別原因で3回続いた場合は停止してProject Ownerへ確認する。Scope拡張、新規依存、外部送信、認証、費用、既存ファイル変更が必要になった場合も停止する。

## 12.1 検証記録（2026-09-07／09-08）

### 実装したもの

`tools/arena/` に新規追加のみ。既存ファイルは1つも変更していない（`git status`: 修正26件はCodexのもので不変、追加は `tools/` と本Taskのみ）。

| ファイル | 段 |
| --- | --- |
| `contextpack.mjs` | ① 資産層。指定ノートのみ収録し、文字数予算で切り詰める |
| `arena.mjs` | ② 判断層。同一プロンプトを独立・並列送信 |
| `adapters.mjs` | 実Ollama／合成Fakeのアダプタ |
| `verdict.mjs` | ③ 争点抽出。確定／未確定へ分離 |
| `obsidian.mjs` | ⑤ 書き戻し候補の生成（Vaultへは書かない） |
| `linkcheck.mjs` | wikilink解決の検証 |
| `run.mjs` | 一周の入口 |
| `questions/pec-issue-051.json` | 題材（差し替え可能なペイロード） |

### Acceptance Criteria の到達状況

| # | 判定 | 根拠 |
| --- | --- | --- |
| 1 | Pass（ただし内容価値は劣化） | `context-pack.md` が1ファイルで生成され、収録元を列挙。ただし後述のハード制約により予算を1ソース300文字まで落とさざるを得ず、資産としての情報量は乏しい |
| 2 | **未達** | プロンプト同一性（両系のsha256一致）は検証済み。しかし実AI側が一度も回答に成功しておらず、二者間の「割れ」は観測できていない |
| 3 | Pass（構造のみ） | `verdict.md` が「確定」「未確定」に分離され、各主張に side／adapter／stance／合成ラベルが併記される |
| 4 | Pass | `linkcheck.mjs` がPASS。生成ノートの `[[PredictionEngine_Design_Insights]]` はVault内に実在 |
| 5 | Pass | 停止条件に到達したため `Blocked` として停止し、本節に記録した |

### 副次的に確認できたこと

- **層の独立性は実証された**。a系が failed でもスケルトンは停止せず、`partial` として③④⑤⑥を完走した。これは設計の中心的主張の裏付けになる
- 実行層への受け渡し（④）は `decision-log.json` をディスクから読み直す形で成立している

### 実装上の不具合を1件発見・修正

Nodeの `fetch`（undici）は `headersTimeout` が既定300秒である。Ollamaを非ストリーミングで呼ぶと完了までヘッダが返らないため、**生成に5分以上かかる呼び出しは、こちらのtimeout設定に関わらず必ず `fetch failed` になる**。`adapters.mjs` をストリーミング受信へ変更して解消した。

### Blocker: このマシンでは llama3:8b が実用にならない

実測値。

| 測定 | 結果 |
| --- | --- |
| ハードウェア | Apple A18 Pro / RAM **8 GB** |
| モデル常駐 | llama3:latest = **6.0 GB**、23% CPU / 77% GPU |
| システム空きメモリ | **8%**、ページアウト57,032回 |
| 小プロンプト（約1.4KB） | 32秒で妥当な日本語JSONを生成（成功例） |
| 実プロンプト（3.8KB） | **9分08秒**で完走。ただし内容が空（`"recommendation": ""`、`stance` 欠落） |
| 実プロンプト（3.0KB、ストリーミング） | **22分経過しても未完了**。900秒のtimeoutで打ち切り |

小プロンプトでのみ成立するが、その水準まで資産を削ると資産層が意味を失う。モデルとハードの組み合わせが律速であり、機構側の問題ではない。

### 追記（2026-09-08）: qwen2.5:3b 取得後の再検証

Project Owner 承認のもと `qwen2.5:3b`（1.9GB）を取得した。

| 測定 | llama3:latest (8B) | qwen2.5:3b |
| --- | --- | --- |
| 同一プロンプト（2,389文字 / 876 tokens） | **27分48秒でも未完了**（メモリ空き状態でも同じ） | **16.7秒で完了** |
| 出力の中身 | 空文字列、`stance` 欠落 | 妥当な日本語JSON、スキーマ準拠 |

llama3:8b の不成立はメモリ逼迫の副作用ではなく、このハードでの根本的な性能不足である。したがって「a=llama3 / b=qwen」の構成は成立しない。

`a = ollama-local/qwen2.5:3b`、`b = fake-contrarian` で再実行し、**status `full` で一周した**（Run `pec-issue-051-2026-09-07T21-20-22`）。実AI側と合成側で結論が割れ、`verdict.md` の全該当行に ⚠合成 ラベルが付与されている。

### 設計変更（2026-09-08）

- **逐次実行を既定にした**。独立性は情報の流れ（相手の回答を渡さない）で担保されるものであり、同時実行は要件ではない。8GBのマシンで2モデルを同時ロードするとスラッシングするため、既定を逐次に変更し `--concurrent` で明示的に並列化できるようにした
- **資産予算を実測に合わせた**。1ソース900文字 / 総量2000文字。Vaultノート2件＋Issue抜粋を収録して876 tokens、qwenで16.7秒

### 自己検証

`tools/arena/selfcheck.mjs` を追加し **13/13 Pass**。検証項目は、スキーマ違反の拒否、争点の確定／未確定分離、プロンプト不一致時の比較拒否、片系停止時の `partial` 化、合成参加者のラベル付与、予算切り詰めの記録、リンク切れ検出。

`tests/` 配下には置いていない。同ブランチで進行中の別Taskが Vitest の件数を追跡しているため、その数値を動かさない。

### 追記（2026-09-08）: 実モデル2系での最終実行

Project Owner 承認のもと `llama3.2:1b`（1.3GB）を追加取得し、両系を実モデルにした。

```bash
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  tools/arena/run.mjs --model-a qwen2.5:3b --adapter-b ollama-local --model-b llama3.2:1b
```

Run `pec-issue-051-2026-09-07T21-30-59`、status **`full`**、所要約25秒（逐次）。

| 系 | モデル | 結果 | 結論 |
| --- | --- | --- | --- |
| a | `qwen2.5:3b`（Alibaba系） | `ok` | 合否判定は**妥当である** |
| b | `llama3.2:1b`（Meta系） | `ok` | 予測パイプラインの**動作を確認する必要がある** |

系統の異なる2モデルが同一プロンプトを独立に受け取り、**結論が割れた**。`promptSha256` は `dd6d3bdd3c77f7a29cee75cebe10b9c0d45e096390089621d6099cd3f83c0639` で両系一致。合成参加者はゼロ。

これにより成功条件2は、機構としてだけでなく現象としても達成された。

**品質上の留保**: `llama3.2:1b` の回答は問いに対する判断というより入力の言い換えに近く、推論の質は低い。「割れ」は実在するが、b系の主張内容を根拠として採用できる水準にはない。より大きいモデルが載るマシンでの再実行が望ましい。

### 更新後の Acceptance Criteria

| # | 判定 | 根拠 |
| --- | --- | --- |
| 1 | Pass | `context-pack.md` 1ファイル、Vaultノート2件＋抜粋1件を収録元として列挙 |
| 2 | **未達**（2026-09-08 訂正） | 機構は正しく動く（独立送信、`prompt.txt` との hash 照合、否定を確定に入れない判定）。しかし二者の実AIによる争点は未実証。`llama3.2:1b` が繰り返しループで `malformed` となり、このマシンで実用に足るモデルは `qwen2.5:3b` 1つのみ。詳細は「独立レビューと、その結果の訂正」節 |
| 3 | Pass | 確定／未確定に分離、各主張に side／adapter／stance／合成ラベルを併記 |
| 4 | Pass | `linkcheck` PASS（2 links, 0 broken） |
| 5 | Pass | llama3 の件は停止条件に従い停止し、記録した |

### 追記（2026-09-08）: 独立レビューと、その結果の訂正

`AI_DELEGATION_CHARTER.md` の「同一Taskでは実装AIと最終レビューAIを分ける」に従い、実装していない別サブエージェントに読み取り専用レビューを依頼した。P0該当なし、P1が7件、P2が13件。実装者側で主要な指摘を再現確認し、修正した。

#### 前回報告の訂正

**2026-09-08 に「Acceptance Criteria 2 = Pass」と報告したが、これは誤りだったので撤回する。** 理由は2つ。

1. **判定対象の一文がプロンプトに入っていなかった**。資産層の予算配分が「Vaultノート→抜粋」の先着順だったため、背景ノートが予算を食い尽くし、問いの当事者である `prediction-engine-core/todo.md:281-295` は892文字中144文字（`Add ` の途中で切断）しか収録されなかった。判定対象そのものである `**Status:** ... Type errors are cosmetic (union type property access).` は一度もモデルに渡っていない。両モデルは、判断すべき主張を見ないまま合否を答えていた
2. **争点抽出が否定を検出できず、真逆の主張を「確定（一致）」に入れる欠陥があった**。日本語の否定は文字bigramをほとんど変えないため、「この判定は妥当である」と「この判定は妥当ではない」が類似度0.583でペアになり、`stance` ラベルが両方 `support` のまま「立場が一致」として `settled` に入る。実行して再現を確認した

したがって当時観測された「割れ」は、二者の見解の相違ではなく、片方が問いに答えられなかったことの副産物である可能性が高い。

#### 修正した欠陥

| 指摘 | 修正内容 |
| --- | --- |
| P1-4 否定を検出できず誤った確定 | 類似度による確定を廃止。`normalizeSentence` が完全一致し、かつ `stance` も一致する場合のみ確定。それ以外は `similar-unverified` として未確定へ送り「否定の有無を目で確かめること」と明示 |
| P1-5 抜粋の飢餓 | 抜粋を先に、Vaultノートを後に処理するよう既定を変更（`spec.order` で切替可）。抜粋は行範囲で意図的に選ばれた判定対象そのものであり、背景ノートより優先する |
| P1-2 ③④のメモリ渡し | `writeVerdict` の入力を全てディスク由来に変更。問いは `prompt.txt` の `## QUESTION` から復元し、hashは実ファイルから計算する。④以降の分岐も `decision-log.json` の読み戻し値で駆動する |
| P1-3 hash検証の自己参照 | `prompt.txt` の実ハッシュと各レコードの `promptSha256` を照合するチェックを追加。不一致なら比較を拒否 |
| P2-2 合成ラベルの欠落 | 結論一致パスに `positions` を持たせ、`verdict.md`／生成ノートの双方で必ず side と ⚠合成 を描画 |
| P2-4 予算超過 | 切り詰め注記を予算に計上していたため `2027 / 2000` と自ら上限を超えていた。原文の収録文字数のみ計上するよう修正 |
| P2-5 抜粋の出典欠落 | `readSourcesFromPack` が抜粋も返すようにし、生成ノートの「参照した資産」に出典パスを併記（Vault外なのでwikilinkにはしない） |
| P2-6 安全境界違反の降格 | ループバック違反とパス脱出を `fatal` とし、`runAdapter` の「片系が死んでも継続」の握り潰しから除外して即停止 |
| P2-7 blocked でも書き戻し生成 | 両系失敗時は⑤⑥を実行せず終了 |
| P2-9 パストラバーサル | `assertInside` を追加。`spec.id` 由来の runId が出力ルートを、`notes` がVaultを脱出できないことを検査 |
| P2-12 リダイレクト追従 | `redirect: 'error'` を指定。ループバック検査通過後にプロンプトが外部へ転送される経路を閉じた |
| P2-10 文書と実装の不一致 | `arena.mjs` 単独実行時のtimeout既定を300000msへ統一し、`--model-a`／`--model-b`／`--concurrent` を受けるよう修正 |
| P2-8 selfcheckの空虚さ | 13件→**24件**へ拡張。追加分は、否定ツインが確定に入らないこと、合成ラベルが描画物に残ること、`assertLoopback` の許可/拒否、パス脱出の拒否、予算不変条件、抜粋優先、`runArena` が実際に同一文字列を両系へ渡すこと、`prompt.txt` との hash 照合、抜粋出典の記載 |

`selfcheck.mjs` は **24/24 Pass**。

#### 未修正として受諾する指摘

- **P1-1（層がimportを持つ）**: 事実。`run.mjs` は5層を単一プロセスでimportして呼ぶ。層の独立性は「別プロセス」ではなく「各段の入出力がファイルで完結し、途中から再実行できる」ことでのみ担保されている。§7 の契約文言を実態に合わせて訂正する
- **P2-3（結論の完全一致は事実上到達不能）**: 事実。異なるLLMが1文をバイト一致で出すことはまず無いため「結論が一致」は恒常的に空になる。これは意味的合意の判定を機械がやらないという設計判断の帰結であり、v0では受諾する
- **P2-1（linkcheckがトートロジー）**: 事実。生成ノートのwikilinkは収録に成功した実在ノートのbasenameのみなので、解決しないことがありえない。AC4が意味を持つのはAI生成文中に `[[...]]` が現れるようになってから
- **P2-11／P2-13**: claim数の下限未強制、同一モデル同士を2系に指定した場合の警告なし。いずれも後続へ

#### 修正後の再実行

Run `pec-issue-051-2026-09-07T22-07-33`。判定対象の一文がプロンプトに含まれることを `grep` で確認した（修正前は0件、修正後1件）。

| 系 | モデル | 結果 |
| --- | --- | --- |
| a | `qwen2.5:3b` | `ok` |
| b | `llama3.2:1b` | **`malformed`** |

`llama3.2:1b` は同一の主張を `c1` から `c18` まで生成し続ける繰り返しループに陥り、生成上限で切断された。生成上限を500→900へ引き上げても同じで、上限の問題ではなくモデルの退化である。fail-closed が正しく働き、raw を保存して推測補完せずに停止した。

**したがって Acceptance Criteria 2 は現時点で未達である。** このマシンで実用に足るローカルモデルは `qwen2.5:3b` 1つだけであり、二者の実AIによる争点は未実証のまま残る。

### Project Ownerへの確認事項

条件2を満たすには、より小さいローカルモデルの取得が要る（ダウンロードのため承認が必要）。候補は `qwen2.5:3b`（約1.9GB、日本語良好）または `llama3.2:1b`（約1.3GB、最速）。取得しない場合、条件2は未達のまま残る。

## 13. Approval Status

| 段階 | 日付 | 状態 |
| --- | --- | --- |
| 理想形（5段の設計）の承認 | 2026-09-04 | **承認済み**（Project Owner「設計OK」） |
| Plan（本Task）の承認 | 2026-09-04 | **承認済み**。実装開始 |
| Scope変更: モデル取得 | 2026-09-08 | **承認済み**（§5／§11 の改訂を参照） |
| 完了承認 | — | **未取得**。Acceptance Criteria 2 が未達のため |

設計承認と完了承認は分ける。本Taskはまだ完了扱いにしない。
