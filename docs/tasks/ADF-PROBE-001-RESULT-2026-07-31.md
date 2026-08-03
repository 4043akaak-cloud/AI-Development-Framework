# ADF-PROBE-001 実験記録 — 2026-07-31

> Phase: 0.5（Codex役割分離）
> Status: Result submitted; Project Owner review pending
> Source Task: [ADF-PROBE-001](ADF-PROBE-001.md)

## Identity

- 目的: CodexサブエージェントをPlanner、Critic、Observerとして分け、ADFのTask運用における記録・承認・評価の抜けを読み取り専用で探す。
- 実施範囲: ADFのTask、協働憲章、Task Lifecycle、Current State、Task Packet、指定Obsidianノート。
- 実施しなかったこと: 実装、外部AI製品、外部API、テスト、commit、push、秘密情報の利用。

## Roles and Outputs

| 役割 | 権限 | 実施結果 |
| --- | --- | --- |
| Planner | 読み取り・Planのみ | Preflightと役割分離プローブを、正式な独立AIレビューと区別する必要を指摘した。 |
| Critic | 読み取り・批判のみ | Plan永続記録、Approval遷移、Task Packet接続、Obsidian参照再現性、測定可能性の不足を検出した。 |
| Observer | 読み取り・観測のみ | Context、Scope、手戻り、Blocker、役割境界を比較できる最小指標を定義した。 |
| Coordinator | 結果比較のみ | 意見をConsensus / Disagreement / Required human decisionへ整理した。 |

## Evidence

### Consensus

- 同一Codexの役割分離は、独立AIレビューではない。
- `ADF-PILOT-001`は3件の実証Taskではなく、Plan記録のPreflightとして扱うべきである。
- GitHub TaskにPlanを永続記録する責任者と保存時点が必要である。
- Task Packetは固定依頼文から必ず参照でき、Vault ID、正規パス、採用制約、停止条件を含む必要がある。

### Disagreement / limitation

- 同一モデル由来の共通盲点を測れない。Phase 1では外部AIまたは人間によるレビューが必要になる。
- 実プロダクトへの変更を伴うTaskはまだ試していないため、実装・テスト・差分レビューの有効性は未検証である。

### Required Human Decision

1. Preflightの記録方法と、`ADF-PILOT-001`を完了扱いにするかを確認する。
2. 最初の3件に数える可逆な小Taskの対象を選ぶ。
3. 3件完走後に外部AIレビューを追加するかを判断する。

## Measurements

| Signal | Observation | Evidence |
| --- | --- | --- |
| Context completeness | 指定GitHub資料と指定Obsidianノートを読み、Taskの目的・制約を確認できた。 | Planner / Critic / Observerの各出力 |
| Scope clarity | 読み取り専用に限定できた。Phase名と独立レビュー表記には修正が必要だった。 | Roadmap、Pilot、Taskの比較 |
| Rework / handoffs | 実装上の手戻りは0件。運用設計の手戻りとして、Task PacketとPlan記録責任の補強が必要になった。 | Critic findings |
| Non-owner bottleneck | Planの記録者、Task状態の更新者、Contextの正規参照先が曖昧だった。 | Critic findings |
| Safety stop | 変更・外部操作をせず、権限不明な操作で停止できた。 | 実験ログ |

## Improvements Applied

- [Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)を追加し、Phase 0 / 0.5 / 1の境界を明文化した。
- [AI Task Packet](../../templates/AI_TASK_PACKET.md)へVault識別、正規パス、最終確認日、停止条件を追加した。
- [Codex Solo Request](../../templates/CODEX_SOLO_REQUEST.md)から、記入済みTask PacketとPlan転記責任を明示した。
- [Task Template](../../templates/TASK.md)へProject Owner Reviewを追加した。
- [ADF Pilot Orchestration Skill](../../skills/adf-pilot-orchestration/SKILL.md)を追加し、Codexランタイムにも同一内容を配置した。

## Outcome

- 実験由来のプロダクト・コード変更: なし。
- 検証: Markdown差分、スキルのYAMLメタデータ、GitHub追跡版とローカル実行版の一致を確認した。
- 未検証: 3件の可逆Task、外部AIレビュー、実装差分、テスト、commit・push。
- 次の一手: Project Ownerのレビュー後、最初の可逆な小Taskを別Taskとして作成する。自動開始しない。
