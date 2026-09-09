# Task — ADF-CONTEXT-MEMORY-VOCABULARY-001: Contextの記憶種別の語彙

> Status: `Verifying` — Owner承認済み（2026-09-09）。文書のみ。独立レビューと完了承認が残る。
> Type: Docs
> Owner: Project Owner
> Implementer: Claude Code
> Date: 2026-09-09
> Related: [Observability and Evaluation Baseline §6](../design/ADF_OBSERVABILITY_AND_EVALUATION_BASELINE.md)

## 1. Objective

Context Bundleの各項目がどの種別の記憶かを区別する語彙を定め、Task Packetに記録欄を設ける。

## 2. Background

ADFのContext Bundleは「このTaskで必要な最小情報」という単一概念で、中身の性質を区別していない。種別を当てると次が見える。

| 種別 | ADFでの実体 | 現状 |
| --- | --- | --- |
| 短期 | Thread／Turn の bounded context | 実装済み・境界明示 |
| 長期・semantic | Obsidian Vault | 正本として定義済み・参照は手動 |
| 長期・episodic | Event Ledger | **記録はあるが再利用の導線が無い** |

欠けているのは**保存先ではなく参照規約**である。episodic memoryは追記専用・hash chain付き・決定論的replay可能な形で完全に残っている。足りないのは、それを次のTaskへ持ち込む経路である。

2026-09-08はその不在が実際に現れた日だった。19日間放置されたRunも、文書に記録されなかった実画面Runも、**episodicな事実が誰の手元にも渡らなかった**結果である。

## 3. 変更

- `docs/workflow/CONTEXT_MEMORY_VOCABULARY.md`（新規）— 3種別の定義、記録規約、採らない選択肢とその理由
- `templates/AI_TASK_PACKET.md` — `Required Episodic Context` 欄を追加。**該当なしの場合は「探したが無し」と明記する**規約を含む
- `docs/obsidian/OBSIDIAN_INTEGRATION.md` — Task開始時の手順から語彙文書へ参照を張る

## 4. 採らない選択肢

mem0／Redis／Neo4j／Cognee、自動検索、ベクトル検索、知識グラフはいずれも不採用。外部サービスまたは新規依存を伴い、local-only・依存追加なしの境界と衝突する。

**語彙が無いまま検索機構を足すと、何を検索しているのかを説明できない。** 参照すべきものを人間と窓口AIが選ぶという現在の設計は変えず、選んだ結果を書き留める欄だけを設ける。

## 5. Verification

文書のみの変更でコードに触れていない。

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | `vitest run` 全体 | Pass（コード無変更のため回帰なし） |
| 自動 | `git diff --check` | Pass |
| 手動 | 内部リンクの解決確認 | Pass |

## 6. 残るリスク

- **規約は書く場所を作るだけで、書かれることを保証しない。** Ledgerは自動追記だがPacketは手書きという非対称は変わらない。
- 事前強制の仕組みは無い。記録漏れは `adf task-ledger-drift` により事後に検出される。
- 既存のTask文書には遡及適用していない。
- 独立レビュー未実施。
