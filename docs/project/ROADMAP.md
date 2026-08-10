# ADF Roadmap

## 二つの進行軸

- **運用成熟度**: AIをどこまで安全に委任・連携できるかを検証する軸。
- **製品成熟度**: AIRFLOW型司令塔とループコーディングを、どこまでアプリとして可視化・連携できるかを作る軸。

運用成熟度が製品成熟度の安全上限を決める。たとえば外部AIレビューが未検証なら、画面に外部AIの自動実行ボタンを追加しない。

## Phase 0 — Codex単独パイロット（完了）

CodexとProject Ownerで、まず`ADF-PILOT-001`のPreflightを行い、その後、文書Taskまたは可逆な小Taskを3件完走する。自動化・外部API・他AIは導入しない。

**製品の対応地点:** アプリを作る前に、司令塔・Card・ループの設計契約を確定する。

**判断ゲート:** 3件すべてで必須成果物が揃い、無承認変更が0件で、Task記録だけから再開できること。

**記録済み:** `ADF-PILOT-002`、`ADF-PILOT-003`、`ADF-PILOT-004`を完走し、`ADF-RETRO-001`でProduct MVP 1を先行する判断を記録した。次段階は自動で開始しない。

## Phase 0.5 — 役割分離Codexプローブ

同一CodexのサブエージェントをPlanner、Critic、Observerとして使い、読み取り専用でPlan・批判・観測の分離を測る。これは独立AIレビューではなく、Phase 1準備の実験であり、Phase 0の3件完走を置き換えない。

**判断ゲート:** Context不足、承認境界、状態遷移、手戻り、非承認Blockerを測定し、テンプレート改善を記録できること。

## Architecture Gate — 複数AI管制の設計契約（完了）

`ADF-ORCH-001`で、Control / Work / Evidenceの三面、Adapterの手動登録、Artifact、承認、統合、サブエージェント上限を設計する。これは接続や自動化ではなく、Boardが将来の複数AI協働へ安全に接続できるための境界である。

**判断ゲート:** Project Ownerが、正本境界、外部送信・費用・書込みの禁止、統合前のEvidenceと明示承認をレビューすること。

## Phase 1 — Product MVP 1: 手動・読み取り専用Board（完了）

`ADF-ORCH-001`の設計契約に沿い、GitHub・Obsidianを正本のまま、ローカルのBoardでTask、承認待ち、リスク、必要Context、Evidenceリンクを手動表示する。

**製品の対応地点:** 読み取り・可視化だけで、GitHub・Obsidianへ書き込まない。Adapter、Ledger、外部AI、自動実行は追加しない。

**判断ゲート:** Project Ownerが、Taskの正本、必要文脈、止まっている理由、次の安全な一手をBoardから確認できること。

**記録済み:** `ADF-MVP1-001`でローカル読み取り専用Boardを実装し、Project Ownerの差分・実機レビューを完了した。Dock起動、Broken/Stale、3代表ケースの60秒探索、署名は後続検証として残す。

## Phase 1.5 — Local Job Loop MVP

`ADF-JOB-LOOP-001`で、外部AIなしのFake Adapter A/Bによる1ラウンド討論、ファイルLedger、構造化Result、Owner Review待ちProjectionを実装する。これは複数AI共演の搬送路を検証するための最小Runtimeであり、Fakeの成功を実AIの接続性・品質・独立性とは扱わない。

このPhaseが現在のMVPゴールである。完成条件は、このPC内で複数の役割を持つAI Adapterがプロジェクト完遂に向けて議論し、ResultをOwnerレビュー待ちへ返せることである。Fake AdapterはMVPの検証手段であり、ADFの将来を単一のFake AIやClaude Codeだけに固定するものではない。

**対象外:** Claude Code等の実Adapter、MCP、外部送信、認証、課金、DB、worktree、並列Job、複数ラウンド、自動統合、正本自動書込み。

**判断ゲート:** A/Bの入力・出力hash、失敗・不正Result、重複dispatch、Owner Review待ち表示、正本非変更を確認し、Project OwnerがDiff・Verificationをレビューすること。

## Phase 1.6 — ADF上の会話ThreadとRelay

`ADF-CONVERSATION-RELAY-001`で、Jobの最終Result一件ではなく、Task配下のThread（順序付きTurn列）をADF内の会話一次データにする。Fake Adapter A/Bが同じThreadへ複数ターン発言し、Ownerが途中で継続・停止・承認・次Task化を選べる状態を作る。Ownerがプロンプトと結果を手作業でコピーし続けないことが目的である。

Adapter Interfaceは`send_to_adapter` / `receive_from_adapter` / `continue_job` / `get_conversation_state`とし、送信と受信を分離して外部AIの非同期回答へ差し替えられる形にする。外部AI候補はRegistryへ`planned`として登録するだけで、dispatch対象にしない。

**対象外:** 認証、APIキー、実HTTP送信、Claude／Codex CLI起動、外部送信、課金、MCP、worktree、並列Job、自律的な無限会話、正本自動書込み。

**判断ゲート:** Project OwnerがNode.jsのある環境でtypecheck・test・buildを実行し、アプリ上でThread表示とOwner操作を確認すること。実装時点では自動検証・実機確認とも未実施である。

## Phase 2 — 外部AIまたは人間による独立レビューの追加

パイロット結果をもとに、別AIまたは人間によるレビューを1段だけ追加する。実装者と最終レビュー担当を分け、役割別テンプレートを必要最小限で作る。

**製品の対応地点:** Product MVP 1の実際のBoard差分を対象に、手動受け渡しのArtifact比較と独立レビューを1件測る。接続はまだ自動化しない。

**設計済み:** `ADF-REVIEW-001`で、固定Review Packet、二段階承認、構造化Artifact、比較指標、停止条件を定めた。実際の送信・Provider選定・費用発生は、Project Ownerの実行直前承認まで行わない。

**判断ゲート:** 3件以上でレビューが有効に機能し、手戻りと記録負担が許容範囲であること。

## Phase 3 — 読み取り専用の補助自動化

Task作成補助、リンク検査、Issue草案、Current State下書きなど、書き込みの影響が小さい補助を導入する。自動修正・push・公開は行わない。

**製品の対応地点:** 承認済みの読み取り専用連携を追加する。Task・証跡・文脈を表示するが、正本の更新は人間操作を保つ。

**判断ゲート:** ログ、費用、秘密情報、停止条件を設計・承認できること。

## Phase 4 — モデル選定と複数Adapter管制（将来）

OpenRouter等を候補に、承認済みのモデル・予算・データ方針の範囲だけで担当AIを選ぶ。AI同士の討論は、固定回数・構造化出力・人間承認を前提にする。

**製品の対応地点:** 上司AIがTaskを分解・提示し、実装AIとレビューAIを候補選定できるようにする。ただし、費用、外部送信、push、merge、公開は常に人間承認を残す。

**判断ゲート:** Phase 0〜3の記録を評価し、導入価値が手動運用の複雑さ・費用・リスクを上回ること。
