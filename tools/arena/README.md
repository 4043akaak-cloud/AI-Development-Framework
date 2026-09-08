# Arena — 三層ウォーキングスケルトン v0

`ADF-THREE-LAYER-SKELETON-001` の実装。1つの問いを、資産層 → 判断層 → 実行層 → Obsidian の順に、**ファイル受け渡しだけ**で一周させる。

既存の ADF Frontdoor / Owner Gate / Event Ledger には接続していない。新規ファイル追加のみで、`src/` 以下は変更していない。

## 実行

このMacには `node` が PATH 上に無いため、ADF が MCP で使っているのと同じ方式で Electron を Node として起動する。

```bash
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron tools/arena/run.mjs
```

主なオプション。

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `--spec <path>` | `questions/pec-issue-051.json` | 題材。差し替え可能なペイロード |
| `--adapter-a` / `--adapter-b` | `ollama-local` / `fake-contrarian` | 各系のアダプタ |
| `--model-a` / `--model-b` | `llama3:latest` / なし | Ollama のモデル |
| `--timeout <ms>` | `300000` | 1系あたりの上限 |
| `--concurrent` | off | 並列実行。メモリに余裕がある時だけ |
| `--out-root <dir>` | `$HOME/.adf-arena` | 出力先。リポジトリ外 |

各段は個別にも実行できる（`contextpack.mjs` / `arena.mjs` / `verdict.mjs` / `obsidian.mjs` / `linkcheck.mjs`）。

## 層の境界

| 段 | 入力 | 出力 |
| --- | --- | --- |
| ① 資産層 | spec が名指ししたノート | `context-pack.md` |
| ② 判断層 | `context-pack.md` + 問い | `prompt.txt`, `answer-a.json`, `answer-b.json` |
| ③ 争点抽出 | 2つの answer | `verdict.md`, `decision-log.json` |
| ④ 実行層 | `decision-log.json` | （読み取り確認のみ） |
| ⑤ 書き戻し | `decision-log.json` + `context-pack.md` | `obsidian-out/*.md` |

段どうしはメモリで値を渡さない。次の段は必ずディスクから読み直す。だからどの段も単独で再実行でき、途中で落ちても手前の成果物は残る。

ただし**プロセス分離はしていない**。`run.mjs` は5つのモジュールをimportして単一プロセスで順に呼ぶ。担保されるのは「入出力がファイルで完結し、途中から再実行できる」ことであって「層が別プロセスで動く」ことではない。

## 設計上の約束

**独立性は情報の流れの話であり、同時実行の話ではない。** 両系はバイト単位で同一のプロンプトを受け取り、どちらも相手の回答を渡されない。順番に走らせても独立性は損なわれないので、既定は逐次実行にしてある（8GB のマシンで 2つのローカルモデルを同時ロードするとスラッシングするため）。検証は `answer-*.json` の `promptSha256` の一致で行い、不一致なら③が停止する。

これは既存 Frontdoor の Proposal → Critic とは別物である。Critic は Proposal を読んでから答えるため、先行意見に引きずられる。

**合成（Fake）は必ずラベルされる。** `fake-contrarian` はモデルを呼ばない決定的スタブで、争点抽出の機構を動かすために存在する。その主張は `verdict.md`・`decision-log.json`・生成ノートのすべてで ⚠合成 と明示され、実際のAIの意見と混同できないようにしてある。

**Obsidian へは書き込まない。** `ADF_PRODUCT_COMPLETION_BLUEPRINT.md` §6 が正本への自動書込みを禁じているため、⑤は `obsidian-out/` に候補を生成して停止する。Vault へ入れるのは Owner の操作。

**資産パックは有界。** ADF は既にアダプタへ渡す文脈を制限している（`CURRENT_STATE.md` 2026-08-25：1 Turn 最大1200文字）。資産層も同じ規律に従い、`maxCharsPerSource` / `maxCharsTotal` で切り詰め、切り詰めた事実をパックの先頭に明記する。

## 既知の限界

- **争点抽出は候補を出すだけ**。自由文の主張どうしの対応付けは文字bigramのJaccard係数による推定で、`verdict.md` では「突き合わせは推定」と明記される。何を確定として採用するかは Project Owner が決める
- **類似度は確定の根拠にしない**。日本語の否定は文字bigramをほとんど動かさない（「妥当である」対「妥当ではない」で類似度0.58）。そのため確定に入るのは、正規化後の文が完全一致し、かつ `stance` も一致する場合だけである。似ているだけのペアは未確定側に「否定の有無を目で確かめること」と付けて送る
- **結論の一致判定は完全一致**。異なるモデルが同一の1文をバイト一致で出すことはまず無いため、「結論が一致」は実運用でほぼ空になる。意味的な合意判定を機械にさせないという設計判断の帰結
- **`linkcheck` は現状トートロジーに近い**。生成ノートのwikilinkは収録に成功した実在ノートのbasenameだけなので、解決しないことがありえない。AI生成文中に `[[...]]` が現れるようになって初めて意味を持つ
- **JSON の安定性**はモデル依存。パースに失敗した場合は raw を保存して `malformed` で停止し、推測での補完は行わない
- **ローカルモデルの速度**がこのマシンでは律速。実測は `docs/tasks/ADF-THREE-LAYER-SKELETON-001.md` §12.1 を参照

## 注意

Node の `fetch`（undici）は `headersTimeout` が既定300秒である。Ollama を非ストリーミングで呼ぶと完了までヘッダが返らないため、5分を超える生成は timeout 設定に関わらず `fetch failed` になる。`adapters.mjs` はこれを避けるためストリーミングで受信している。
