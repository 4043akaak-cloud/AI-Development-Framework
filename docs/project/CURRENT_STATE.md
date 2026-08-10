# ADF Current State

> Last updated: 2026-08-10

## 現在地

協働憲章、Task Lifecycle、正本作業コピー規約、基本テンプレートは整備済み。Phase 0、振り返り、`ADF-ORCH-001`、`ADF-MVP1-001`を完了した。手動・読み取り専用Task Boardは、Control Planeの閲覧部分として実装・Project Ownerレビュー済みである。`ADF-REVIEW-001`では、最初の外部AIまたは人間による独立レビューを、接続前の手動実験として設計・記録した。

ADFの製品境界は、Project進捗管理とAI間の受け渡しに限定する。PECなど他プロジェクト固有の分析、AIそのものの推論、万能自動実行、無承認の外部送信・課金・正本変更はADFの責務に含めない。

## 次のTask

[`ADF-CONVERSATION-RELAY-001`](../tasks/ADF-CONVERSATION-RELAY-001.md): `Verifying`。実装担当はClaude Code。Task配下のThreadとTurnをADF内の会話一次データとし、Fake Adapter A/Bの複数ターン会話、Ownerの継続・停止・承認・次Task化、Thread表示UI、外部AI候補の`planned`登録を実装した。Project Ownerによる2回のレビューで計8件の欠陥が見つかり、いずれも修正済みである。1次では承認境界の迂回（P1）、Adapter Interfaceの不一致、受信Handleの未照合、Adapter roleの未検証。2次では既存Job Runtime／Dispatch ACKとの未接続、Result Envelope／Evidenceとの未接続、Owner「継続」の二操作化、同時dispatchの競合。ThreadはいまJob登録（ACK済み）に束縛され、Turnごとに検証済みResult EnvelopeとEvidence linkを残し、Evidenceが無ければ承認できない。**2次修正後のtypecheck / test / buildと既存Job Loop・Dispatch ACKの回帰は未実行である（実装環境にNode.jsが無いため）。** UI実機確認も`Error: Electron uninstall`により未了。Project Ownerが再検証するまで`Done`にしない。外部AIへの実送信、認証、課金、MCP、worktree、正本自動書込みは未実施である。

[`ADF-CLAUDE-ADAPTER-001`](../tasks/ADF-CLAUDE-ADAPTER-001.md): `Verifying`。複数AIを前提に、Adapter Registry、Owner承認済み固定Routing plan、役割別Adapter選択、Fake A/Bの独立Result記録を実装した。TypeScript node/web、Vitest 28件、production build、arm64 package、diff checkをPass。Claude Codeは最初の実Adapter試験例であり、CLI／SDK接続、外部送信、認証、課金、worktree、write、MCP、commit、push、mergeは別承認・別Taskとする。Project OwnerのDiff / Verification Review待ち。

[`ADF-DISPATCH-ACK-001`](../tasks/ADF-DISPATCH-ACK-001.md): `Verifying`。`ADF-JOB-LOOP-001`のJob登録・Fake Adapter実行前に、Dispatch PacketとFake Receiver ACKの完全照合を追加した。Task ID、packet hash、scope、capability、repository、branch、worktree、許可ファイル、禁止変更を対象とし、不一致・ACK欠落はJob登録前に停止する。TypeScript、Vitest 24件、production build、arm64 package、diff checkはPass。Project OwnerのDiff / Verification Review待ち。外部AI、MCP、認証、外部送信、worktree作成、正本自動書込みは対象外。

[`ADF-JOB-LOOP-001`](../tasks/ADF-JOB-LOOP-001.md): `Verifying`。Fake Adapter A/Bによる1ラウンド討論、ローカルJob Ledger、構造化Result、Owner Review待ちProjectionを実装した。TypeScript typecheck、Vitest 20件、production build、arm64 packageをPass。Project OwnerのDiff / Verification Review待ち。外部AI、MCP、認証、外部送信、DB、worktree、正本自動書込みは対象外。

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

- Product MVP 1の読み取り専用UIと共通管制Foundationは実装・Project Ownerレビュー済みである。次は、最初の外部Reviewerを手動で一件実行する。実際の外部送信はReviewer選定とPacket確認後の実行直前承認まで開始しない。
- 独立AIレビュー、外部API、自動モデル選定は未導入である。
- Claude Code向けpacket-only Skillは構造を作成したが、実際にSkillが指示へ従うかを示すforward testと、技術的に隔離したReviewer環境は未検証である。
- OpenRouterのアカウント、APIキー、予算、データ方針は未設定であり、このPhaseでは不要である。
- `ADF-PILOT-002`〜`004`の開始・終了時刻と承認待ち時間は未記録である。`ADF-RETRO-001`では推測で補完せず、後続Taskの測定項目として扱う。

## 正本と参照先

- GitHub: Task、承認、変更、検証、Current State
- Obsidian: 理念、背景、長い調査、判断理由、学び
- 現行手順: [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
