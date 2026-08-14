# Codex単独パイロット: 固定依頼文

> 現在はCodexとProject Ownerだけで運用を検証する。別AI、外部API、自動化は使わない。独立AIレビューの代わりに、人間が差分と検証結果を確認する。

以下をコピーし、`[ ]`を埋めてCodexへ渡す。

```text
ADFの正本作業コピーで、次のTaskを扱ってください。

最初に読むもの:
1. AGENTS.md
2. docs/workflow/CODEX_SOLO_PILOT.md
3. [Task URL または Taskファイル]
4. [Required Obsidian Contextのリンク]

Task ID: [例: ADF-PILOT-001]
記入済みAI Task Packet: [Task URL またはパケット本文]
目的: [ ]
今回のStatus: [Context Read / Planned / Waiting Approval / Approved / ...]
今回許可する操作: [Planのみ / 承認済みの文書変更のみ / 承認済みの実装と検証]
完了条件: [ ]
変更してよい範囲: [ ]
変更してはいけない範囲: [ ]

最初に、確認したContext、採用した制約、Plan、影響、検証方法、停止条件を報告してください。
Approvalが確認できない場合は、ファイル変更・commit・pushをせず、Planで停止してください。
作業後は、変更、検証結果、未検証事項、残るリスク、次に必要な人間の判断を報告してください。
```

CodexのPlanを次の状態へ進める場合は、Project OwnerがPlan・承認記録・状態をGitHub Taskへ転記する。チャットだけを唯一の記録にしない。
