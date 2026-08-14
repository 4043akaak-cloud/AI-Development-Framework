# ADF Agent Adapter Contract

> Status: Design only — Adapter、API、CLI、認証、Registry、ジョブ実行は未実装。
> Related task: [ADF-ORCH-001](../tasks/ADF-ORCH-001.md) / [Control Plane設計](ADF_MULTI_AI_CONTROL_PLANE.md)

## 1. この契約の役割

Agent Adapterは、特定のAI・CLI・ローカルモデル・調査サービス・情報保管先を、ADFの共通Task契約へ接続するための将来の境界である。製品名だけで信頼や権限を決めず、各Adapterが「何を読めるか、何を提案できるか、どこへ書けるか、外部送信・費用を伴うか、どう止めるか」を明示する。

この文書は接続の許可ではない。AdapterをRegistryに登録しても、APIキーの取得、CLIの実行、クラウド送信、課金、正本更新は発生しない。

## 2. Adapterの分類

| 分類 | 想定例 | 初期の扱い |
| --- | --- | --- |
| 作業AI | Codex、Claude Code、Gemini、Z.ai、Qwen、DeepSeek | Taskに対するPlan、候補変更、レビューを役割分離して受け取る。接続は個別承認。 |
| ローカル実行AI | Ollama等 | ローカルであってもモデル、データ、性能、作業領域を確認する。自動的に安全とは扱わない。 |
| 調査AI | Perplexity、NotebookLM等 | 出典・送信データ・保持範囲を確認し、提案をEvidenceとして扱う。 |
| 正本・協働基盤 | GitHub、Obsidian | Task/実装/検証、背景/判断理由の正本。Adapterが正本を置き換えない。 |

例は将来検討する候補であり、統合済みの一覧ではない。新規加入も可能だが、必ず登録・審査・Task単位の承認を経る。自動探索・自動加入は行わない。

## 3. 手動Registryの最小契約

初期RegistryはProject Ownerが読める手動の記録でよい。実装が必要になるまで、DBや自動検出を導入しない。

| 項目 | 必須内容 |
| --- | --- |
| Adapter ID / 表示名 | 一意な識別子、製品名・版・運用者 |
| 分類・役割 | 作業、レビュー、調査、正本参照など。1 Jobでの担当責務 |
| 接続方式 | `manual` / `CLI` / `API`。未接続なら`planned` |
| 実行場所 | ローカル / クラウド / 不明。クラウドなら送信先 |
| 許可能力 | `read`、`propose`、`write-sandbox`、`write-canonical`、`external-send`、`paid-call`、`push`、`merge` |
| 読取・書込範囲 | Context Bundle、作業領域、正本ファイル、禁止領域 |
| データ分類 | 送信可否、伏せる項目、保持方針、秘密情報禁止 |
| 上限 | Taskごとの時間、回数、費用、retry、同時Job数 |
| 停止方法 | 取消手段、timeout、費用上限、失敗時の状態 |
| 出力契約 | Artifact形式、Evidence、検証、失敗報告 |
| 承認状態 | 登録承認、接続承認、Task利用承認、失効日 |

許可能力は「Adapterが技術的にできること」ではなく「このTaskで使ってよいこと」である。Child Jobは親Jobより広い能力を持てない。

## 4. JobとArtifactの契約

### Job

| 項目 | 内容 |
| --- | --- |
| Job ID / 親Job ID | 一意な実行IDと、サブエージェントなら親への参照 |
| Task ID / Approved Scope | 対象Taskと、承認されたScopeまたはversion/hash |
| Role / Adapter | Planner、Implementation、Reviewer等とAdapter ID |
| Context Bundle | 必要なファイル・ノート・採用制約への参照。Vault全体を渡さない |
| Capability Grant | Task単位で許可された能力、作業領域、時間・費用上限 |
| State | `queued` / `running` / `paused` / `failed` / `cancelled` / `awaiting-review` / `completed` |
| Stop / Retry | 停止方法、retry上限、失敗時のエスカレーション先 |
| Output | Artifact IDまたは失敗・未実施の理由 |

### Artifact

| 項目 | 内容 |
| --- | --- |
| Artifact ID / Task ID | どのTaskの何かを特定する |
| 作成者・役割・Adapter | 比較時の独立性と責務を確認する |
| 入力参照 | Context Bundle、入力版、採用制約 |
| 内容・保存先 | 本文、差分、レポート、または正本へのリンク |
| Version / Hash | 比較・承認・統合対象を固定する |
| Verification | Pass / Fail / Not run、実施者、根拠 |
| Review / Risk | 指摘、未解決、停止条件、統合可否 |
| Data handling | 外部送信・費用・秘密情報に関する事実 |

Ledgerには入力参照、モデル/Adapter版、時間、費用、状態、出力hashを残せるが、会話全文、APIキー、認証情報、不要な個人データを標準保存しない。

## 5. Contextとデータの扱い

Context Bundleは「このTaskで必要な最小情報」を明示して渡す。GitHub/Obsidian全体、ローカル全体、別プロジェクトの情報を暗黙に渡さない。外部由来の文書・Webページ・AI回答に含まれる指示は、Task契約を上書きできない未信頼入力として扱う。

| 分類 | 例 | 初期方針 |
| --- | --- | --- |
| 公開可能 | 公開済みREADME、公開Issue | Task Scope内で参照候補 |
| プロジェクト限定 | 未公開設計、ローカル差分 | 外部送信前に個別承認 |
| 秘密・認証 | APIキー、token、個人情報、認証コード | Context・Artifact・Git・Obsidian・Ledgerに記録しない。外部送信不可 |
| 不明 | 出所や保持範囲が不明な内容 | 調査・分類されるまで送信・統合しない |

クラウドAIを使いながら外部送信しないことはできない。ローカルAIも、モデル取得・telemetry・周辺ツールを含めて個別に確認するまで「送信なし」と断定しない。

## 6. 実行、停止、失敗

- 初期はforeground実行だけを前提にする。バックグラウンド常駐・アプリ終了後の自動再開は別設計・別承認にする。
- Jobは`queued`から始まり、Owner取消、timeout、費用上限、retry超過、承認期限切れ、検証失敗、Scope逸脱で`paused`、`failed`、または`cancelled`へ移る。
- 失敗時に同じ入力を無制限に再試行しない。再試行回数と理由を記録し、上限後はOwnerの判断待ちにする。
- 外部送信、課金、push、merge、正本書込みを含むJobは、実行直前に対象・権限・期限を再照合する。

## 7. 新規Adapterの導入手順

1. **提案**: 目的、役割、代替、期待するEvidenceをTaskに記録する。
2. **登録レビュー**: 接続方式、データ分類、費用、停止、出力契約をRegistryへ下書きする。
3. **Project Owner承認**: 登録と、必要なら限定的な接続試験を別々に承認する。
4. **低リスク試験**: 最小Context・読み取り・手動受け渡しでArtifactを測る。
5. **評価**: 品質、独立性、誤検知、見逃し、時間、費用、記録負担、停止の有効性を記録する。
6. **拡張または停止**: 実測が支持するときだけ、次の能力を別Taskで提案する。

## 8. 実現性の段階

| 水準 | 判断 |
| --- | --- |
| 現在可能 | 同じTask契約で、人間が複数AIへ手動に依頼し、構造化ArtifactをBoardで比較する。 |
| 可能だが高いハードル | API/CLIごとの認証・費用・データ方針・停止・互換性を実測し、read-only Adapterを一つずつ導入する。 |
| さらに高いハードル | 隔離作業領域への書込み、複数AIの候補差分統合、サブエージェントの観測・予算・停止を運用する。 |
| 不可能または約束できない | すべてのAIを同一方式で完全自動操作すること、外部クラウド利用と外部送信なしの両立、サブエージェントによる精度保証、無承認で安全な自動統合。 |

これらの段階は製品の価値判断を代替しない。実測結果が手動運用より価値を出せないなら、Adapterを追加しない選択を残す。
