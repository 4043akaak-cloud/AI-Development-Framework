# Task — ADF-AGGREGATE-SCHEMA-MIGRATION-001: 旧Aggregateが採用不能になった問題

> Status: `Planned` — 設計のみ。実装未着手。**Codexの独立レビュー後に実装する。**
> Type: Design → Implementation + Verification
> Owner: Project Owner
> Designer: Claude Code
> Date: 2026-09-09
> 契機: `ADF-MCP-FRONTDOOR-2CYCLE-E2E-001` Cycle 1 のCompletion Gateが閉じられなかったこと

## 1. 何が起きているか

Cycle 1 `run-7987794137baa1041b91` は19日間 `awaiting-owner:completion` で止まっていた。当初これを「Boardのカウンタが壊れていて誰も気づかなかった」と説明したが、**それは半分だった**。

**仮に気づいてクリックしていても、閉じられなかった。**

### 1段目: Decisionの有効期限

Result Review の accept には1時間の有効期限がある。Cycle 1 の accept は `2026-08-21T04:17:23` に記録され `05:17:23` に失効した。`assertDecisionNotExpired`（`ownerGates.ts:212-214`）がCompletionを拒否する。

これ自体は再Reviewで回復できるはずだった。しかし回復しない。

### 2段目: Aggregateのスキーマ変更（本質）

`ownerGates.ts:176` は次を要求する。

```text
record.resultRef !== child.resultRef || record.resultHash !== child.resultHash → stale
```

**保存済みAggregateの `childResults` に `resultHash` を持つものは1件も無い。** `child.resultHash` は常に `undefined` なので、この比較は必ず失敗する。

この検査は `eba10bb`（2026-08-25「最小MVP収束」）で追加された。CURRENT_STATEに「Aggregate child ResultへResult hashを保持し、Result Review時に再検証するfail-closed境界を追加」と記録されている変更である。

**新規生成されるAggregateにはhashが入るが、既存Aggregateへの移行が無かった。** 結果として2026-08-25以前に生成されたRunはすべてResult Reviewを通せない。

`run-791ac671`（2026-08-22完走）も同じ形だが、**検査が入る前に完了していた**ため影響を受けていない。誰も古いRunをレビューしようとしなかったので、2026-09-09まで気づかれなかった。

## 2. 検討して採らない案

| 案 | 却下理由 |
| --- | --- |
| Aggregateに後からhashを書き足す | **Evidenceの改竄。** 追記専用の正本へ事後に値を入れることになる |
| 検査全体を緩める | 2026-08-25に意図をもって追加されたfail-closed境界を、古いデータのために外すことになる |
| `stop` で閉じる | 技術的には可能だが、作業は成功しているのにRunが `cancelled` として残る。履歴として不正確 |

## 3. 採る案: hash欠落だけを旧形式として扱う

### 3.1 何が守られ、何が失われるか

検査の連鎖を分解すると、目的が異なる4段がある。

| 段 | 内容 | 目的 |
| --- | --- | --- |
| 1 | Run recordに `resultRef` と `resultHash` があるか | 束縛の存在 |
| 2 | Aggregateの `resultRef`／`resultHash` がRun recordと一致 | Aggregateの陳腐化検出 |
| 3 | **`hashJson(result) === record.resultHash`** | **改竄検出** |
| 4 | identity（runId／taskId／jobId／inputHash）一致 | 取り違え検出 |

**改竄検出は3段目であり、Run recordのhashを使っている。Aggregateのhashではない。** したがって旧Aggregateに対して2段目のhash比較だけを省いても、改竄検出は一切弱まらない。ファイルは依然Run recordのhashと突き合わされる。

失われるのは2段目が担う**「同じrefだが古い版から作られたAggregate」の検出**である。旧Aggregateはそのフィールドを持たないので原理的に検出できない。**これは緩和ではなく、記録が存在しないという事実である。**

`resultRef` の比較は維持する。別ファイルへの差し替えは引き続き検出される。

### 3.2 黙って通さない

互換経路を無言で通すと境界は腐る。旧形式として扱ったNodeを呼び出し元へ返し、Owner Decisionのnoteに記録する。

Ownerが「この採用は旧形式のAggregateに対するもので、Aggregate陳腐化の検出は効いていない」と読める状態にする。

## 4. Scope

### In scope

- `assertAggregateResultsCurrent` の旧形式対応と、旧形式Nodeの報告
- `reviewResult`／`exportWorkPlaneArtifact` 双方への適用
- テスト（旧形式が通ること、改竄が依然拒否されること、`resultRef` 差し替えが拒否されること）
- Cycle 1 の再ReviewとCompletion

### Out of scope

- 保存済みAggregateの書き換え
- 有効期限そのものの見直し
- 新規Aggregateの形式変更

## 5. 残るリスク

- **旧Aggregateに対するAggregate陳腐化検出は復活しない。** 記録が無いため原理的に不可能。
- 対象は2026-08-25以前に生成されたRunに限られるが、その件数を網羅的に数えていない。
- 本設計は未レビュー。**実装前にCodexのレビューを通す。**
