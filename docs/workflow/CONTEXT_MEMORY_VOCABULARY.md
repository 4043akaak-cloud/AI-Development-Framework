# Context の記憶種別

> Status: Active — 記録規約のみ。検索機構・自動収集は導入しない。
> Date: 2026-09-09
> 関連Task: [ADF-CONTEXT-MEMORY-VOCABULARY-001](../tasks/ADF-CONTEXT-MEMORY-VOCABULARY-001.md)

## 1. なぜ区別するか

ADFのContext Bundleは「このTaskで必要な最小情報」という**単一の概念**で、中身の性質を区別してこなかった。区別が無いと、参照先が揃っているかを判断できない。

種別を当てはめると、ADFの現在地は次のようになる。

| 種別 | 何を指すか | ADFでの実体 | 現状 |
| --- | --- | --- | --- |
| 短期 | いま進行中のやりとり | Thread／Turn。過去3 Turn・1 Turn 1200文字・依存Result 1000文字のbounded context | 実装済み。境界も明示されている |
| 長期・semantic | 一般化された知識。理念、判断理由、失敗から得た原則 | Obsidian Vault | 正本として定義済み。参照は手動 |
| 長期・episodic | 個別に何が起きたか。実行結果、失敗、停止理由 | Event Ledger (`events.jsonl`) | **記録はあるが、次のTaskへ持ち込む導線が無い** |

## 2. 欠けているのは保存先ではなく参照規約

episodic memoryは既に完全な形で残っている。追記専用で、hash chainがあり、決定論的にreplayできる。**足りないのは保存ではなく再利用である。**

「前に同じAdapterで同じ失敗をした」という事実はLedgerにあるが、次のTaskのContext Bundleへ入る経路が無い。現状はOwnerと窓口AIの記憶に依存しており、それは2026-09-08に実証された。19日間放置されたRunと、文書に記録されなかった実画面Runは、どちらもepisodicな事実が誰の手元にも渡らなかった結果である。

## 3. 記録規約

Task PacketのContextに、各項目がどの種別かを明示する。

```text
Required Obsidian Context:            ← 長期・semantic
- [[ノート名]] — 正規パス:
  - 今回採用する制約:

Required Episodic Context:            ← 長期・episodic
- Run / Thread / Decision ID:
  - 何が起きたか:
  - 今回効く制約:
```

`Required Episodic Context` が空であることは異常ではない。**空だと明示することが規約である。**「該当なし」と書けるのは、探したうえで無かったときだけである。

## 4. 導入しないもの

mem0、Redis／RedisVL、Neo4j、Cogneeは採用しない。いずれも外部サービスか新規依存を伴い、local-only・依存追加なしという現在の境界と衝突する。

自動検索、ベクトル検索、知識グラフも導入しない。**参照すべきものを human と窓口AIが選ぶ**という現在の設計を変えずに、選んだ結果を書き留める欄だけを設ける。語彙が無いまま検索機構を足すと、何を検索しているのかを説明できない。

## 5. この規約の限界

規約は**書く場所を作るだけ**であり、書かれることを保証しない。Ledgerは自動追記だがPacketは手書きという非対称は変わらない。

`adf task-ledger-drift` が Task文書とLedgerの乖離を検出するので、記録漏れは事後に見つかる。事前に強制する仕組みは無い。
