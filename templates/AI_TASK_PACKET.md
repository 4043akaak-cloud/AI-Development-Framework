# AI Task Packet

> この文書は、GitHub TaskまたはIssueをAIへ渡す際の最小パケットである。Task本文を置き換えず、担当者が必要な正本と制約を迷わず開けるようにする。

```text
作業開始前に、AGENTS.md、Task本体、以下のRequired Obsidian Contextを読んでください。

Task ID / URL:
Task type: Research / Design / Docs / Implementation / Review
現在のStatus:
今回の役割:

Objective:
完了条件:

Final Flow Contribution:
Vertical Slice Outcome:
Next Flow Unlocked:
Deferred Details:

Required Obsidian Context:
- Vault ID / root:
- [[ノート名]] — 正規パスまたは共有リンク:
  - 最終確認日:
  - 今回採用する制約:

GitHub Context:
- 関連Goal / MVP / Roadmap / Current State:
- 関連Issue / PR / ADR:

In scope:
Out of scope:
変更してよいファイル:

Approval status:
今回許可される操作:
禁止事項:

出力に必ず含めるもの:
- 完成形に対する今回の貢献と、今回つながった縦切り
- 確認したContextと採用した制約
- Plan、影響、検証方法、停止条件
- 実施した変更、検証結果、未検証事項（実装時のみ）
- 次に必要な人間の判断
```

## 運用ルール

- `Approval status`が`Approved`でなければ、変更ではなく調査・Plan作成だけを行う。
- Obsidianノートを渡すときは、Vault全体ではなくTaskに必要なノートだけを列挙する。
- Required Obsidian Contextにアクセスできない、または正規パス・共有リンクを確認できない場合は、`Blocked`で止まる。
- Task本体とこのパケットに矛盾がある場合は、Task本体と最新の人間指示を優先して停止・確認する。
- パケットはTaskの開始時に作り、実際に参照したノートと採用した制約をTaskへ残す。
- `Final Flow Contribution`が空欄、または完成形の利用者フローに結び付かない場合は、実装前にTaskを見直す。
- `Deferred Details`に置いた細部は、現在の縦切りを止める安全・権限・データ整合性問題でない限り、同じTaskへ戻して拡張しない。
