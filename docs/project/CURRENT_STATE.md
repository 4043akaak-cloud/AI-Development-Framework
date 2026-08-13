# ADF Current State

> Last updated: 2026-08-13（`ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`のみ反映。それ以前の項目は前回更新時点のまま）

## 現在地

協働憲章、Task Lifecycle、正本作業コピー規約、基本テンプレートは整備済み。Phase 0、振り返り、`ADF-ORCH-001`、`ADF-MVP1-001`を完了した。手動・読み取り専用Task Boardは、Control Planeの閲覧部分として実装・Project Ownerレビュー済みである。`ADF-REVIEW-001`では、最初の外部AIまたは人間による独立レビューを、接続前の手動実験として設計・記録した。

ADFの製品境界は、Project進捗管理とAI間の受け渡しに限定する。PECなど他プロジェクト固有の分析、AIそのものの推論、万能自動実行、無承認の外部送信・課金・正本変更はADFの責務に含めない。

## 現在のMVP到達点

**ADFのローカルMVPコアループは完成している。** このPC内で、承認済みTaskに紐づいたThread上で複数のFake AIが議論し、Ownerが結果を確認・継続・承認できる。送信後のプロセス終了を起動時に検出し、Ownerが再送・失敗記録・停止を選べるRecoveryも完了している。Runtime LedgerのThread状態を読み取り専用でBoardへ反映するLive Board（`ADF-BOARD-PROJECTION-001`）と、Execution Summary方式でOwner承認済みTask Packetを生成するCLI（`ADF-TASK-PACKET-CLI-001`）も実装済みである。`ADF-CONVERSATION-RELAY-001`、`ADF-RELAY-RECOVERY-001`、`ADF-BOARD-PROJECTION-001`をDoneとし、最新commit `932357c`として`origin/codex/adf-pilot-governance`へpush済みである（`ADF-TASK-PACKET-CLI-001`のコード・ドキュメントは同branchのワーキングツリーにあり、未push）。

**完了済み**: `ADF-BOARD-PROJECTION-001`、`ADF-JOB-LOOP-001`（Legacy化を受諾してDone。現行Liveなのは`registerApprovedJob`等の共通登録経路のみで、旧Fake討論・旧`projectBoard`/`readBoard`・`JobRuntime`直接実行経路は現行Electronから到達不能なLegacyコードとして記録）、`ADF-DISPATCH-ACK-001`（Dispatch Packet生成とACK完全照合が`registerApprovedJob`経由で現行アプリのLive機能。JOB-LOOP-001のような広範なLegacy化ではない）、`ADF-CLAUDE-ADAPTER-001`（**複数AI Adapter共通基盤は完成。ただし実AI接続は未実施。** Adapter Registry・Routing plan生成/hash検証・Result Envelope検証はLive、旧`adapter-results.json`/`buildResult`/`runApprovedTask`経由の独立Result記録はLegacy）、`ADF-TASK-PACKET-CLI-001`（**ローカルMVPの入口であるApproved Task Packet生成が完了した。** Execution Summaryは固定JSONブロック方式で確定し、3 Task文書で抽出・hash計算・`validateApprovedTask`がPass。既存Packetは要約fixtureであり、既存hashとの一致は必須にしない。既存Packetの自動上書き・自動再承認は行わない）、およびローカルMVPのThread／Fake AI／Owner Review／Recovery／Live Boardの一連の機能。

**残存Verifying**: `ADF-EXTERNAL-ADAPTER-001`（実送信可否がOwner判断待ち）、`ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`（実Ollama接続はMain/Relay/Transport本番経路で確認済み。GUIのマウスクリック操作そのものの確認とOwnerの`Done`受入判断が残る）。

Anthropic APIキーの取得と外部AIへの実送信は引き続き保留である。External Adapterは接続経路（Electron main／IPC／preload／UI、認証状態preflight）まで実装済みだが、実送信は未実施である。`ADF-BOARD-PROJECTION-001`は、`open + turnCount > 0`の実機表示と`recovery-needed`のLive Board実機表示の2項目を、単体テストで検証済みかつDoneを妨げない残存リスクとして記録している。`ADF-TASK-PACKET-CLI-001`は、Task本文とExecution Summaryの将来的な乖離を検出できないことを残存リスクとして記録している。受信途中の中断と外部Adapter固有の冪等性は引き続き後続Taskで扱う。

## 次のTask

[`ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`](../tasks/ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md): `Verifying`（2026-08-13）。`ADF-OLLAMA-LIVE-CONNECTION-001`でCLIプローブ経由のみ実証されていた`ollama-local`を、Electronアプリの明示承認付き標準Adapterとして統合した。Main（`index.ts`）へ`OllamaLocalHttpTransport`/`ExternalConversationAdapter('ollama-local', ...)`を`claude-external`・Fake二種と共存登録し、Registry由来の読み取り専用Adapter選択UI（`listExternalAdapterProfiles`/`relay:external-adapters`）をRendererへ追加した。Packet承認Planと実Dispatch先の一致検証（`adapterId`・`role`・`routingPlanHash`）を、preflight表示と実Dispatchの両方で共通ヘルパー`checkAdapterPlanMembership`により行う設計とし、Anthropic経路には影響しない。Ollama readiness確認（`/api/tags`）はOwnerの明示操作でのみ実行され、`local-http`のAdapterでは送信ボタン有効化の必須条件とした。typecheck（node/web/cli）、Vitest 254件、`electron-vite build`、`git diff --check`をPass。**2026-08-13、Owner承認のうえ実Ollamaへ1件送信し成功した**（Thread `thread-18399ed229b8f47b` / Job `job-c33f22d42214f89f`、`ollama-local`/proposal、preflight全10項目Pass、Result Envelope・Evidence・Ledger生成、旧証跡は無変更）。ただし、この送信は`index.ts`のIPCハンドラが実際に呼ぶのと同一のMain／Relay／Transport本番経路をスクリプトから直接実行したものであり、**マウスクリックによる実GUI操作そのものの確認ではない**（本環境にElectronネイティブウィンドウを操作するツールが無いため）。GUIクリックでの目視確認はOwner自身に別途推奨する。`ADF-EXTERNAL-ADAPTER-001`のStatusは変更していない。

[`ADF-BOARD-PROJECTION-001`](../tasks/ADF-BOARD-PROJECTION-001.md): `Done`。静的な手作業Snapshot（`boardSnapshot.ts`、2026-08-04/05時点で最終更新）とは別に、ADF Runtime Ledgerに記録された実際のThread状態を、既存の読み取り専用IPC（`listThreads` / `listApprovedTaskIds`）だけを使ってBoardへ反映するLive Boardを実装した。Main／Preload／IPCは無変更（build出力がbyte単位で一致）。Legacy Snapshot（既存4件のADFカード＋Block Defenseカード）はLive Boardと別セクション・別集計に分離し、自動書き換えは行っていない。typecheck、Vitest 173件、build、Electron実機でのlane遷移・手動Refresh・空Runtime表示・Legacy非混在を確認した。`open + turnCount > 0`の実機表示と`recovery-needed`のLive Board実機表示の2件は、単体テストで検証済みかつDoneを妨げない残存リスクとして記録している。

[`ADF-TASK-PACKET-CLI-001`](../tasks/ADF-TASK-PACKET-CLI-001.md): `Done`（2026-08-12）。承認済みTask Packet（`approved-tasks/<taskId>.json`）を、Task Markdown内の固定形式「ADF Execution Summary」ブロックからOwnerが実行するCLIで生成する。既存の`hashJson` / `routeAdapters` / `validateApprovedTask`をそのまま再利用し、承認情報はCLI引数としてOwnerが明示した値のみを使う。書込みは`--write`明示時のみ、既存ファイルがあれば常に停止（`--force`は実装していない）。typecheck、Vitest 156件、CLIのCommonJSビルド、実機実行をPass。実在する3 Task文書へExecution Summaryを末尾追記済み（本文は無編集）。Execution Summaryの内容面をOwnerが確認し、Doneとした。既存Packetは要約fixtureであり、既存hashとの一致は必須にしない。既存Packetの自動上書き・自動再承認は行わない。Task本文とExecution Summaryの将来的な乖離は残存リスクとして記録する。UI・IPC・外部送信・APIキーには触れていない。

[`ADF-EXTERNAL-ADAPTER-001`](../tasks/ADF-EXTERNAL-ADAPTER-001.md): `Verifying`。実AIをADFのThreadへ接続する最小実証。Claudeは最初の接続試験対象とするが、ADF製品をClaude専用にはしない。Synthetic Packet、実行直前承認ゲート、Anthropic Messages APIトランスポート、Result Envelope取込、Ownerレビュー待ち、Owner cancelを実装し、Electronのmain・IPC・preload・Renderer UIまで接続した。実アプリを起動して、承認不在時の停止表示、送信ボタンの無効化と理由表示、Fake Adapter Threadの回帰を確認済みである。送信前に認証状態（環境変数の有無のみ。値は扱わない）をpreflightで確認し、未設定なら送信ボタンを無効化する。typecheck・Vitest 123件・buildをPass。**実送信は0件**で、`ANTHROPIC_API_KEY`とOwner実行承認ファイルはいずれも未配置。repo添付、worktree、正本変更、外部AIによるコード実行は対象外である。

[`ADF-RELAY-RECOVERY-001`](../tasks/ADF-RELAY-RECOVERY-001.md): `Done`。実装担当はClaude Code、監視・検証・差分レビューはCodex。Turn送信後・受信前にプロセスが終了したThreadを、起動時の一度きりの走査とOwner判断による復旧（再送 / 失敗記録 / Thread停止）で解消した。Case A（`answer-unavailable`）とCase B（`send-unconfirmed`）を区別し、`attempt`込みの新しい`dispatchId`、専用Recovery Turn、Job同期を実装した。typecheck、Vitest 77件、build、別プロセス復旧、Recovery UI表示・失敗記録を確認し、commit `932357c`をpush済み。受信途中の中断と外部AI固有の冪等性は対象外である。

[`ADF-CONVERSATION-RELAY-001`](../tasks/ADF-CONVERSATION-RELAY-001.md): `Done`。実装担当はClaude Code。Task配下のThreadとTurnをADF内の会話一次データとし、Fake Adapter A/Bの複数ターン会話、Ownerの継続・停止・承認・次Task化、Thread表示UI、外部AI候補の`planned`登録を実装した。Project Ownerによる3回のレビューで計12件の欠陥を検出・修正した。ThreadはJob登録（ACK済み）に束縛され、Turnごとに検証済みResult EnvelopeとEvidence linkを残し、Evidenceが無ければ承認できない。Job Ledgerの状態もThreadの進行に追随する。typecheck、Vitest 60件、build / package、既存Job Loop・Dispatch ACK回帰、Electron起動、Thread開始→Proposal→継続→Critic→Result承認→次Task化の実機操作をすべてPass。Project Ownerが最終レビューと残存リスク受諾を完了した。外部AIへの実送信、認証、課金、MCP、worktree、正本自動書込みは未実施である。

[`ADF-CLAUDE-ADAPTER-001`](../tasks/ADF-CLAUDE-ADAPTER-001.md): `Done`（2026-08-12）。複数AIを前提に、Adapter Registry、Owner承認済み固定Routing plan、役割別Adapter選択、Fake A/Bの独立Result記録を実装した。当時のTypeScript node/web、Vitest 28件、production build、arm64 package、diff checkはPass。**複数AI Adapter共通基盤は完成。ただし実AI接続は未実施。** Adapter Registry・Routing plan生成/hash検証・Result Envelope検証は`registerApprovedJob`／`relay.ts`のTurn処理を通じて現行アプリでLiveであり、実runtimeの実Job2件双方で`adapter-plan.json`の実在を確認した。旧`adapter-results.json`・`buildResult`・`runApprovedTask`経由の独立Result記録は`ADF-JOB-LOOP-001`と同じ理由でLegacyコードである。Claude Codeは最初の実Adapter試験例であり、CLI／SDK接続、外部送信、認証、課金、worktree、write、MCP、commit、push、mergeは別承認・別Taskとする。実Claude接続、APIキー取得、外部送信、MCP、実AI品質検証は未実施であり、本Doneの意味には含めない。

[`ADF-DISPATCH-ACK-001`](../tasks/ADF-DISPATCH-ACK-001.md): `Done`（2026-08-12）。`ADF-JOB-LOOP-001`のJob登録・Fake Adapter実行前に、Dispatch PacketとFake Receiver ACKの完全照合を追加した。Task ID、packet hash、scope、capability、repository、branch、worktree、許可ファイル、禁止変更を対象とし、不一致・ACK欠落はJob登録前に停止する。当時のTypeScript、Vitest 24件、production build、arm64 package、diff checkはPass。**本Taskの中核（Dispatch Packet生成とACK完全照合）は`registerApprovedJob`を通じて現行アプリでLiveであり**、実runtimeの実Job双方に実際の`dispatch-packet.json` / `dispatch-ack.json`が存在し、hash・capabilities・targetの一致を確認した。`ADF-JOB-LOOP-001`のような広範なLegacy化ではない。残存リスク: dispatch状態のBoard UI表示は未実装。Receiver区間（Dispatch/ACKからJob登録までの間）のプロセス中断復旧は未検証。実Claude Adapter、実worktree、MCP、署名は対象外または未検証。

[`ADF-JOB-LOOP-001`](../tasks/ADF-JOB-LOOP-001.md): `Done`（2026-08-11、Legacy化を受諾）。Fake Adapter A/Bによる1ラウンド討論、ローカルJob Ledger、構造化Result、Owner Review待ちProjectionを実装し、当時のtypecheck・Vitest 20件・build・packageをPassした。ただし`ADF-CONVERSATION-RELAY-001`以降のアーキテクチャへ移行済みであり、現行Live範囲は`JobRuntime.registerApprovedJob()`等の共通登録経路のみである。旧Fake討論の実行（`fakeAdapters.ts`）、旧`projectBoard` / `readBoard`（Job単位のBoard投影）、`JobRuntime`の直接実行経路は、現行Electronアプリのどこからも参照されない**Legacyコード**として記録した（`tests/jobLoop.test.ts`13件は本日再実行しPass）。旧Taskを復活させるコード変更は行っていない。視覚的Job Board表示、旧Job Loop固有のプロセス中断復旧、実AI接続、MCP、worktree、配布用コード署名は対象外・未検証のまま。

[`ADF-PILOT-001`](../tasks/ADF-PILOT-001.md): `Done`。AI Task Packetを使ったPreflightのContext・Plan・停止条件、およびProject Ownerの承認を記録済み。これは3件完走の1件には数えない。

[`ADF-PILOT-002`](../tasks/ADF-PILOT-002.md): `Done`。Phase 0とPhase 1以降のGitHub運用記述を明確に分け、静的・手動検証をPass。Project Ownerの実装差分レビューも承認済み。Codex単独パイロットの実証Taskは3件中1件を完走した。

[`ADF-PILOT-003`](../tasks/ADF-PILOT-003.md): `Done`。READMEの初回導線を現行のProject正本へ修正し、静的・手動検証とProject Ownerの実装差分レビューを承認済み。Codex単独パイロットの実証Taskは3件中2件を完走した。

[`ADF-PILOT-004`](../tasks/ADF-PILOT-004.md): `Done`。最終ゴールをAIRFLOW型司令塔 × ループコーディング型ADFアプリとしてGoal・MVP・Roadmapへ反映し、最小設計を追加。静的・手動検証とProject Owner Reviewを承認済み。Codex単独パイロットの実証Taskは3件中3件を完走した。

[`ADF-PROBE-001`](../tasks/ADF-PROBE-001.md): 役割分離Codexプローブの実験記録を提出済み。Phase 0.5は、Phase 0の3件完走を置き換えない。

[`ADF-RETRO-001`](../tasks/ADF-RETRO-001.md): `Done`。Phase 0の記録を照合し、Product MVP 1を先行する判断と未検証事項を記録した。Project Ownerの差分・検証レビューと残存リスク受諾を完了した。

[`ADF-ORCH-001`](../tasks/ADF-ORCH-001.md): `Done`。複数AI管制エンジンの設計契約を追加し、Project Ownerの差分・検証レビューと残存リスク受諾を完了した。接続・APIキー・UI・DB・外部操作は行っていない。

[`ADF-MVP1-001`](../tasks/ADF-MVP1-001.md): `Done`。ADF単一プロジェクトの手動スナップショットを表示するローカル読み取り専用Boardを実装し、typecheck・7 unit tests・production build・package済みアプリの表示と正常リンクを確認した。Project Ownerの差分・実機レビューと残存リスク受諾を完了した。

[`ADF-REVIEW-001`](../tasks/ADF-REVIEW-001.md): `Done`。MVP1差分を対象に、手動・一回・最小共有の外部AIまたは人間レビュー実験を設計し、Project Ownerの差分・検証レビューを完了した。外部送信、Provider選定、認証、費用、Adapter、UI実装は未実施である。

[`ADF-FOUNDATION-001`](../tasks/ADF-FOUNDATION-001.md): `Done`。Registry、Grant、Job、Artifact、Integration Gateを、手動確認済みの読み取り専用SnapshotとしてBoardに追加した。typecheck・11 unit tests・production buildとProject Ownerレビューを完了した。外部接続、権限付与、実行、送信、DB、書込みは未実装である。

[`ADF-REVIEW-EXEC-001`](../tasks/ADF-REVIEW-EXEC-001.md): `Verifying / Review`。Claude Desktopへ匿名化Packetを一回送信し、回答を受領した。ファイル添付・Folder/Connector接続・追加送信は行っていない。通常チャットを意図したがCowork表示へ切り替わった方式逸脱を記録し、Project Ownerの結果レビュー待ちである。

[`ADF-CLAUDE-SKILL-001`](../tasks/ADF-CLAUDE-SKILL-001.md): `Done`。Claude Code native Skillとして、固定Packetだけを根拠にする外部レビュー手順を追加し、Project Ownerの差分・検証レビューを完了した。モデルの訓練や技術的sandboxではなく、Folder/Vault/添付/Connector/MCP/ツールを使わない`packet-only`の行動契約である。Claude Desktopへの導入、外部送信、forward testは未実施である。

[`ADF-REVIEW-FORWARD-001`](../tasks/ADF-REVIEW-FORWARD-001.md): `Deferred`。FWD-00で検出したnative Skill discovery不可のブロックを記録した。限定attachment契約と実行前の文言整理は後続Taskで完了し、実行実験は`ADF-REVIEW-FORWARD-002`へ移した。

[`ADF-CLAUDE-SKILL-002`](../tasks/ADF-CLAUDE-SKILL-002.md): `Done`。Skill発見だけを目的に、正確なADF repo一つのattachmentを許す`native-discovery-packet-only`契約を追加し、Project Ownerレビューを完了した。repo本文をReview根拠に使うこと、ツール利用、技術的隔離の主張は許可しない。Claude Code接続とforward testは別Task・別実行承認である。

[`ADF-CLAUDE-SKILL-003`](../tasks/ADF-CLAUDE-SKILL-003.md): `Done`。native discovery実験のmode表示、attachment ID、Ownerによる一回入力、Reviewerの二次送信禁止を明確化し、Project Ownerレビューを完了した。Claude Code接続、repo attachment、Packet送信、runtime testは別Task・別実行承認である。

[`ADF-REVIEW-FORWARD-002`](../tasks/ADF-REVIEW-FORWARD-002.md): `Done`。FWD-00を通過してFWD-01を一回送信したが、Claude Codeが対象repoのPull Request管理パネルとbranch情報を自動表示した。禁止repo contextの可視化として`Invalid / STOP`にし、FWD-02/03は送信しなかった。Project Ownerが実験結果レビューと残存リスクを受諾した。

## 未実施・阻害要因

- 次は[`ADF-EXTERNAL-ADAPTER-001`](../tasks/ADF-EXTERNAL-ADAPTER-001.md)の実送信可否である。実装とElectron接続は完了し、Project Ownerの「外部送信OK」指示、`ANTHROPIC_API_KEY`の設定、実行承認ファイルの配置を待つ。ADFはこの3つをいずれも自分では用意しない。
- [`ADF-BOARD-PROJECTION-001`](../tasks/ADF-BOARD-PROJECTION-001.md)は、`open + turnCount > 0`の実機表示と`recovery-needed`のLive Board実機表示の2項目が未確認のまま残っている。単体テストで検証済みであり、Doneの判断は妨げないとProject Ownerが2026-08-11に受諾した。
- [`ADF-TASK-PACKET-CLI-001`](../tasks/ADF-TASK-PACKET-CLI-001.md)は、Execution Summaryの内容面（要約の妥当性）のOwner確認が残っている。
- 外部AIは受理と回答の間隔が長いため、既存Recoveryを共通基盤として使う。Providerごとの冪等性、費用、保持、telemetryは実測して記録する。
- `ADF-REVIEW-001`で設計した手動の外部Reviewer実験は、`ADF-REVIEW-FORWARD-002`が`Invalid / STOP`で終了して以降、再開していない。Relay上の外部Adapterとして扱うか、手動実験として続けるかは未決である。
- 独立AIレビュー、外部API、自動モデル選定は未導入である。
- Claude Code向けpacket-only Skillは構造を作成したが、実際にSkillが指示へ従うかを示すforward testと、技術的に隔離したReviewer環境は未検証である。
- OpenRouterのアカウント、APIキー、予算、データ方針は未設定であり、このPhaseでは不要である。
- `ADF-PILOT-002`〜`004`の開始・終了時刻と承認待ち時間は未記録である。`ADF-RETRO-001`では推測で補完せず、後続Taskの測定項目として扱う。

## 正本と参照先

- GitHub: Task、承認、変更、検証、Current State
- Obsidian: 理念、背景、長い調査、判断理由、学び
- 現行手順: [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
