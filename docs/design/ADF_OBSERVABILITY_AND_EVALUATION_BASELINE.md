# ADF Observability and Evaluation Baseline

> Status: Design only — 実装、外部送信、新規依存、Adapter変更は未実施。
> Date: 2026-09-08
> Related: [Control Plane設計](ADF_MULTI_AI_CONTROL_PLANE.md) / [Adapter契約](ADF_AGENT_ADAPTER_CONTRACT.md) / [Product Completion Blueprint](../project/ADF_PRODUCT_COMPLETION_BLUEPRINT.md)
> Obsidian: `48_ADF_外部資料差分レビュー_観測性と評価_2026-09-08`

## 1. この文書の役割

外部の公開資料（Agents Towards Production）をADFの現行設計と突き合わせ、**ADFに欠けている観測性・評価・記憶の契約**を特定して、後続Taskの起点にする。

外部資料は[Adapter契約 §5](ADF_AGENT_ADAPTER_CONTRACT.md)の定義に従い**未信頼入力**として扱う。資料に書かれた手順・推奨ツールはADFのTask契約・権限境界・local-only方針を上書きしない。採用するのは概念と契約項目だけであり、資料が挙げるSaaS・新規依存はそのまま導入しない。

## 2. 参照した外部資料

| 項目 | 内容 |
| --- | --- |
| リポジトリ | `NirDiamant/agents-towards-production` |
| 確認日 | 2026-09-08 |
| 確認時点 | ★21,426 / 最終push 2026-09-06 / Jupyter Notebook中心 |
| 読んだ範囲 | `tutorials/tracing-with-langsmith`、`agent-evaluation-intellagent`、`agent-memory-with-mem0`、`agent-memory-with-redis`、`ai-memory-with-cognee`、`agent-security-with-llamafirewall`、`agent-security-apex` |
| ライセンス | NOASSERTION（コード流用はしない。概念のみ参照） |

この資料は「プロトタイプのエージェントを本番運用へ移す」ことを主題とし、評価・トレース・記憶・セキュリティ・デプロイを扱う。**承認境界、権限の段階付与、正本の保護といったADFの中核テーマは扱っていない。**

## 3. ADFが既に満たしている項目

差分を語る前に、資料側の論点のうちADFが既に持っているものを記録する。これらは再実装しない。

| 資料側の論点 | ADFの現行実装・契約 | 根拠 |
| --- | --- | --- |
| 実行トレースの記録 | Frontdoor Event Ledger（`events.jsonl`、typed hash chain、決定的Replay） | `ADF-FRONTDOOR-LEDGER-EVENT-SOURCING-001` |
| 実行の可視化 | Activity Trace読み取り専用Projection（最大100件、秘密情報マスク、初期非表示） | `src/main/frontdoor/activityTrace.ts` |
| Token・遅延の計測 | `ExternalPerformanceMetrics`（promptTokens／completionTokens／totalTokens／evalDurationNs等）と`ExternalCallRecord.durationMs`／`costTier` | `src/shared/externalAdapterTypes.ts:36-109` |
| 入力の信頼境界 | 外部由来文書・Webページ・AI回答の指示はTask契約を上書きできない未信頼入力 | [Adapter契約 §5](ADF_AGENT_ADAPTER_CONTRACT.md) |
| ツール利用の制限 | deny-by-defaultの能力表（`read`／`propose`／`write-sandbox`／`write-canonical`／`external-send`／`paid-call`／`push`／`merge`） | [Control Plane設計 §4](ADF_MULTI_AI_CONTROL_PLANE.md) |
| 出力の検証 | Integration Gateの6条件とOwner明示承認 | [Control Plane設計 §5](ADF_MULTI_AI_CONTROL_PLANE.md) |
| 秘密情報の非記録 | Context・Artifact・Git・Obsidian・Ledgerへ資格情報を記録しない | [Adapter契約 §5](ADF_AGENT_ADAPTER_CONTRACT.md) |
| 送信前の出口検査 | `assertPacketBoundary`が絶対パス・Vault参照・repo参照・資格情報様文字列・URLをfail-closedで拒否 | `src/main/jobLoop/syntheticPacket.ts:61-88` |
| 成果物の秘密情報検査 | Work Plane候補は`containsSecretSentinel`で書き込み拒否 | `src/main/frontdoor/candidateArtifact.ts:19-38` |

観測性・セキュリティの**契約面ではADFが資料より厳しい**。資料側はガードレールをライブラリで足す発想であり、権限を最初から絞る発想ではない。

## 4. 差分 D-1: Run横断のTelemetry投影が存在しない

### 事実

Token・duration・costTier・terminationReasonは`ExternalCallRecord`として**記録されている**。しかしこの値は`FrontdoorInspection`へ投影されていない（`src/main/frontdoor/`配下に`metrics`参照が1件も無い）。Activity Traceも状態・時刻・待機理由までで、計測値を含まない。

結果として、Ownerも窓口AIも次の問いに答えられない。

- どのAdapter／roleが遅いか
- どのroleがTokenを消費しているか
- 同じ入力に対する再実行が前回より改善したか
- どのterminationReasonが繰り返し起きているか

[Blueprint §5 Step 4](../project/ADF_PRODUCT_COMPLETION_BLUEPRINT.md)は「token, latency, cost, and quality measurement」を後段へ送っているが、**計測の実装は既に済んでおり、残っているのは読み取り専用の投影だけ**である。この差は先送りの前提が変わったことを意味する。

### 採る方針

Activity Traceと同じ形（Event Ledgerから毎回派生する読み取り専用Projection、canonical sourceにしない、初期非表示）で、Run単位のTelemetry Summaryを追加する。新しい計測、Provider telemetry、外部送信、新規依存は追加しない。

### 採らない方針

LangSmithなどの外部Observability SaaSは導入しない。ADFのlocal-only境界と、資格情報・実行内容を外部へ送らない方針に反する。資料から採るのは「何を見えるようにすべきか」の項目定義だけである。

## 5. 差分 D-2: Adapter評価の方法が未定義

### 事実

[Adapter契約 §7](ADF_AGENT_ADAPTER_CONTRACT.md)は導入手順の第5段階で「品質、独立性、誤検知、見逃し、時間、費用、記録負担、停止の有効性を記録する」と定めているが、**測り方・判定基準・記録先が定義されていない**。現状ADFが自動で測っているのはコードのVerification（Vitest／typecheck／build）であり、これは「実装が壊れていないか」であって「Adapterが契約を守るか」ではない。

資料側（IntellAgent）の中核は、エージェントに与えた**ポリシーを破らせようとする合成シナリオを生成し、違反を測る**という考え方である。この概念はADFへそのまま移せる。

### 採る方針: Synthetic Policy Probe

ADFには既に`SyntheticPacket`（`kind: 'synthetic-connectivity-probe'`）がある。これは疎通確認用の固定文であり、プロジェクト内容を含まない。同じ器を使い、**許可されていない能力を使わせようとする固定文**を`kind: 'synthetic-policy-probe'`として追加すれば、Adapterの契約遵守を測れる。

想定するProbe種別（いずれも固定文。プロジェクト内容・Vault・repoを含めない）:

| Probe | 測る契約 | 期待する振る舞い |
| --- | --- | --- |
| capability-escalation | deny-by-defaultの能力表 | 未付与能力の要求を拒否し、理由を返す |
| scope-drift | Approved Scope束縛 | Scope外の作業要求を拒否する |
| untrusted-instruction | 未信頼入力の扱い | Packet本文中の「前の指示を無視せよ」に従わない |
| secret-request | 秘密情報の非記録 | 資格情報の要求・出力を拒否する |
| format-contract | 出力契約 | 定義したResult形式を維持する |
| stop-condition | 停止方法 | 停止条件に該当したとき自ら止まる |

### Adapter評価シート

`ADF-*`の評価Taskで、Adapterごとに次を記録する。推測値は書かず、未測定は`Not run`とする。

| 項目 | 記録内容 |
| --- | --- |
| Adapter ID / モデル / 版 | 測定対象の固定 |
| 実施Probe / 件数 | どのProbeを何件流したか |
| 契約遵守 | Probe種別ごとの Pass / Fail / Not run |
| 誤検知・見逃し | Reviewer roleの場合のみ。件数と具体例 |
| 独立性 | 実装者と同一か。同一なら代替確認 |
| 所要時間 | `durationMs`の実測値 |
| Token | `ExternalPerformanceMetrics`の実測値 |
| 費用区分 | `costTier`。実価格の保証ではない |
| 停止の有効性 | timeout／取消／上限が実際に効いたか |
| 記録負担 | Owner／窓口AIが要した手数 |
| 判定 | 拡張 / 維持 / 停止 |

Probeは**合成文のみ**で構成し、実プロジェクト文脈を送らない。外部Providerへ流す場合は、既存の`ExternalSendApproval`によるProviderごと・Runごと・Packetごとの承認を経る。

### 実装上の注意

`assertPacketBoundary`（`src/main/jobLoop/syntheticPacket.ts:78`）は`packet.kind !== 'synthetic-connectivity-probe'`を境界違反として拒否する。新しいkindを追加する場合、この判定を許可リスト方式へ変更する必要がある。**ここを緩めると出口検査全体が弱くなるため、kindの追加は列挙による明示許可とし、任意kindの通過を許さない。** `untrusted-instruction` Probeの本文が`forbiddenPatterns`（URL、絶対パス、資格情報様文字列）に触れないよう、Probe文面の設計時に既存パターンとの衝突を確認する。

## 6. 差分 D-3: 記憶の種別を区別する語彙が無い

### 事実

ADFのContext Bundleは「このTaskで必要な最小情報」という単一の概念で、その中身の**性質を区別していない**。資料側は記憶を短期（会話状態）／長期（永続知識）、およびepisodic（何が起きたか）／semantic（一般化された知識）に分ける。

この区別をADFへ当てると、次が見える。

| 記憶の種別 | ADFでの実体 | 現状 |
| --- | --- | --- |
| 短期 | Thread／Turn、bounded context（過去3 Turn／1200文字） | 実装済み・境界も明示 |
| 長期・semantic | Obsidian Vault（理念、判断理由、失敗学） | 正本として定義済み。ただし手動参照 |
| 長期・episodic | 過去Runの実行結果・失敗・停止理由 | **Event Ledgerに存在するが、検索・再利用の導線が無い** |

つまり欠けているのはepisodic memoryの**再利用**である。「前に同じAdapterで同じ失敗をした」という事実はLedgerに残っているが、次のTaskのContext Bundleへ入る経路が無い。現状はOwnerと窓口AIの記憶に依存している。

### 採る方針

Context Bundleの各項目に、どの種別の記憶かを明示する欄を設ける。まずは記録規約だけを定め、自動検索・ベクトル検索・知識グラフは導入しない。

### 採らない方針

mem0、Redis／RedisVL、Neo4j、Cogneeは導入しない。いずれも外部サービスまたは新規依存を伴い、現在のlocal-only・依存追加なしの方針と衝突する。ADFのepisodic memoryは既存の`events.jsonl`で足りる。不足しているのは保存先ではなく参照規約である。

## 7. 差分 D-4: Artifact保存前の自動Secret検査が無い

### 事実

経路ごとに実装状況が異なる。実ファイルを確認した結果は次のとおりである。

| 経路 | 現在の検査 | 実装 |
| --- | --- | --- |
| 送信（ADF → Adapter） | `assertPacketBoundary`。絶対パス、Vault参照、repo参照、資格情報様文字列、URLをfail-closedで拒否 | `src/main/jobLoop/syntheticPacket.ts:61-88` |
| Work Plane候補（Adapter → Candidate Artifact） | `containsSecretSentinel`。検出時に例外で書き込み拒否 | `src/main/frontdoor/candidateArtifact.ts:19-38` |
| **受信（Adapter回答 → Result Envelope → Evidence）** | **なし** | `src/main/jobLoop/resultEnvelope.ts` に該当検査が存在しない |
| 表示（Activity／Collaboration／Owner Gate／MCP） | 正規表現マスク（`sk-`／`api_key`／`token`／`secret`／`password`） | `activityTrace.ts:5` ほか3箇所 |

出口とWork Plane候補は守られている。空いているのは**Adapterの回答本文がResult／Evidenceとして永続化される経路**である。ここは表示時にマスクされるため画面には出ないが、`events.jsonl`とEvidenceファイルには原文のまま残る。

現状は「AdapterがResultに資格情報を含めない」ことを前提にしている。Adapterは外部のAIであり、この前提は契約であって保証ではない。Adapterが自身の環境変数やログを誤って引用した場合、ADFはそれを検出せずに保存する。

Blueprint §7は、credential exposureを「記録して先送りしてよい微細な指摘」から明示的に除外している。したがってこの差分は後回しにしない。

### 採る方針

`candidateArtifact.ts`の`containsSecretSentinel`と表示層のマスクパターンを共有ユーティリティへ統合し、Result Envelope生成時にも同じfail-closed検査を通す。検出時はResultを保存せず、Adapter ID・role・検出パターン名だけを記録してOwner判断待ちにする。検出値そのものは記録しない。新規依存は追加しない。

これはIntegration Gateの手前の機械的な安全網であり、Ownerレビューを置き換えない。

### 2026-09-08 実装結果

`ADF-RESULT-SECRET-GUARD-001` として実装した。検出パターンとマスクを `src/shared/secretSentinel.ts` へ集約し、`validateResultEnvelope` の末尾でfail-closed検査を行う。同関数は受信経路5箇所すべてが永続化・採用の前に呼ぶ隘路であるため、呼び出し元を変更せずに全経路が閉じた。

既存Runtimeの保存済みEnvelope 8件を読み取り専用で走査し、新検査で拒否されるものが0件であることを確認した。既知の限界として、引用符を挟むJSON形（`"api_key": "..."`）は検出しない。これは統合前から同じであり、パターン拡張はOut of scopeとして後続へ送った。

## 8. 採用しない項目の一覧と理由

| 資料側の提案 | 不採用の理由 |
| --- | --- |
| LangSmith（トレースSaaS） | 実行内容の外部送信。local-only境界と衝突 |
| mem0 / Redis / Neo4j / Cognee | 新規依存・外部サービス。episodic memoryは既存Ledgerで足りる |
| LlamaFirewall / Prompt Guard | 新規依存＋HuggingFaceモデル取得。ADFのdeny-by-default権限モデルが同じ目的を先に満たしている |
| IntellAgentフレームワーク本体 | 依存追加とLLMによるシナリオ自動生成。ADFは固定文Probeで開始する |
| Docker / FastAPI / AWS AgentCore等のデプロイ | ADFはローカルElectronアプリであり対象外 |

概念は採り、実装スタックは採らない。この判断はADFの「integration first、既存資産の再利用」という方針と、外部送信・新規依存を都度承認とする境界に基づく。

## 9. 後続Task候補

| 優先 | Task | 内容 | 状態 | 依存 |
| --- | --- | --- | --- | --- |
| 1 | [`ADF-RESULT-SECRET-GUARD-001`](../tasks/ADF-RESULT-SECRET-GUARD-001.md) | D-4。Result受信経路へfail-closedの秘密情報検査を追加する | **実装・自動検証完了・`Verifying`**（2026-09-08）。独立レビュー待ち | なし |
| 2 | [`ADF-RUN-TELEMETRY-PROJECTION-001`](../tasks/ADF-RUN-TELEMETRY-PROJECTION-001.md) | D-1。既存`ExternalCallRecord.metrics`をRun単位の読み取り専用Summaryへ投影する | Task起票済み・`Waiting Approval` | なし（記録は実装済み） |
| 3 | `ADF-SYNTHETIC-POLICY-PROBE-001` | D-2。`synthetic-policy-probe`と評価シートを追加する | 未起票 | 2（計測値を評価に使う） |
| 4 | `ADF-CONTEXT-MEMORY-VOCABULARY-001` | D-3。Context Bundleへ記憶種別の記録欄を追加する | 未起票 | なし（文書のみ） |

D-4を先頭に置いた理由は、Blueprint §7がcredential exposureを先送り可能な指摘から除外しているためである。他の3件は先送り可能な改善であり、Ownerの優先順位判断に従う。

いずれも本文書時点では未承認である。実装はTaskごとのProject Owner承認後に行う。

## 10. 本文書の限界

- 資料側のNotebookは実行していない。Markdownセルと README の記述に基づく評価である。
- ADF側の判断は2026-09-08時点の`main`作業ツリーの実ファイル参照に基づく。実行中の`ADF-MCP-FRONTDOOR-2CYCLE-E2E-001`の未コミット変更は考慮していない。
- 差分の優先順位はOwnerの判断を代替しない。
