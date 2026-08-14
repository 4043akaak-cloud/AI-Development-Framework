# Task — ADF-CLAUDE-CODE-CLI-ADAPTER-001: Claude Code CLI AdapterのProvider-neutral接続設計・最小Transport実装

> Type: Design / Implementation
> Status: Done — 設計・CLI導入・preflight・最小Transport実装・Owner Reviewでのブロッカー2件修正・最終Diffレビューを完了し、Project Ownerが完了承認した（2026-08-13）。実CLI起動・認証・外部送信・Main登録は未実施のまま。§16参照。
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [ADF-ADAPTER-PROVIDER-NEUTRAL-001](./ADF-ADAPTER-PROVIDER-NEUTRAL-001.md)（Done・再変更なし）/ [ADF-OLLAMA-FIRST-CLASS-ADAPTER-001](./ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md)（Done・再変更なし）/ [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)（**Verifying のまま。本Taskは再レビューしない**）/ [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md)

## 1. Objective

ADFからClaude Code CLIを、既存のAdapter契約・Approved Packet・Thread・Relay・Result Envelope・Evidence・Ledgerへ接続する**最小設計**を作る。実装はまだ開始しない。

Claude Code CLIは、既存の`claude-external`（Anthropic API直呼び）・`ollama-local`（Ollama Local HTTP）とは性質が異なる。前二者は「テキストを送り、テキストを受け取るだけ」のtext-completion Providerだが、Claude Code CLIはエージェント型ツールであり、既定でファイル読み書き・bash実行・ツール使用が可能である。本Taskの中心的な設計課題は、この違いをADFのProvider-neutral境界の中でどう吸収するかである。

## 2. Approval

- Approval required?: Yes
- 承認対象: 本ファイルに記載する最小実装案・変更候補ファイル・Stop Conditions・Owner承認事項。
- 本Taskは設計のみ。**「設計OK」が明示されるまで、`src/`コード、設定、依存関係、Claude Code CLIの起動、外部送信、APIキー設定、commit、pushのいずれも行わない。**
- `ADF-EXTERNAL-ADAPTER-001`は再レビューしない。`ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`・`ADF-ADAPTER-PROVIDER-NEUTRAL-001`の成果物は変更しない。
- **設計承認: 2026-08-13、Project Ownerが「設計OK」を明示した。** これを受け、実装着手の最初のStepとして§9-3で定めた実行環境preflightを実施した（§11参照）。結果、Claude Code CLIが本環境に未導入と判明したため、コード実装には未着手のまま`Blocked`とした。

## 3. Required Context（読み取り専用で確認済み）

### GitHub

- [AGENTS.md](../../AGENTS.md) / [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md) / [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Current State](../project/CURRENT_STATE.md)
- [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md)
- [ADF-ADAPTER-PROVIDER-NEUTRAL-001](./ADF-ADAPTER-PROVIDER-NEUTRAL-001.md) / [ADF-OLLAMA-FIRST-CLASS-ADAPTER-001](./ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md) / [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)
- 既存実装：`src/shared/jobLoopTypes.ts` / `src/shared/threadTypes.ts` / `src/shared/externalAdapterTypes.ts` / `src/main/jobLoop/externalTransport.ts` / `src/main/jobLoop/externalAdapter.ts` / `src/main/jobLoop/externalApproval.ts` / `src/main/jobLoop/adapterRegistry.ts` / `src/main/jobLoop/anthropicTransport.ts` / `src/main/jobLoop/ollamaTransport.ts` / `src/main/index.ts` / `src/main/relayService.ts` / `src/renderer/src/ThreadPanel.tsx`

### Obsidian

- `Projects/AI-Development-Framework/17_ADF_Ollama標準Adapter接続マイルストーン_2026-08-13.md`
- `Projects/AI-Development-Framework/18_ADF_Claude_Code_CLI_Adapter設計_2026-08-13.md`（本Taskの判断記録、新規）

採用する制約は、Provider-neutral Adapter契約を壊さないこと、Claude Code CLIをrepo／worktree／Work Planeへ接続しないこと（本Taskの範囲外）、secretsをADFへ渡さないこと、外部送信・費用は既存の`external-send`ゲートに従うこと、新規依存を安易に追加しないことである。

## 4. 設計上の発見（既存契約の再確認）

`src/shared/jobLoopTypes.ts`を確認したところ、Claude Code CLI接続に必要な語彙は**既にすべて型として存在している**。

```ts
export type AdapterConnection = 'fake' | 'cli' | 'api' | 'local-http' | 'gui-experimental' | 'manual' | 'mock' | 'unknown'
export type AuthMode = 'none' | 'environment-secret' | 'cli-session' | 'oauth' | 'cloud-credential' | 'unknown'
export type AdapterDataPolicy = 'local-only' | 'external-send' | 'unknown'
```

`'cli'`（connection）と`'cli-session'`（authMode）は、`ADF-ADAPTER-PROVIDER-NEUTRAL-001`の時点で将来のClaude Code CLI接続を見越して既に用意されていた（未使用のまま）。`ExternalTransport`インターフェース（`credentialStatus()` / `isLocalEndpoint?()` / `send(packet, options)`）も、`ExternalConversationAdapter`がAbortController経由のtimeout/cancelを既に汎用的に処理している。

**結論：Provider-neutral契約（`ExternalTransport` / `ConversationAdapter` / `ExternalConversationAdapter` / Thread / Relay / Recovery / Result Envelope）への変更は不要である。** 新しいTransport実装とRegistryエントリを追加するだけで、既存の`ollama-local`・`claude-external`と同じ形で接続できる。

## 5. 接続方式の設計比較

### 5.1 CLI起動方式

`child_process.spawn('claude', [...args], { cwd, env, stdio })`を使う。既存Transport（`fetch`ベース）と異なり、プロセス起動という新しい種類の副作用を持つ。

- 非対話・一回限りの実行モード（例：`-p`/`--print`相当の1回限りプロンプト実行）を前提とする。対話セッション・常駐は対象外。
- 構造化出力（JSON形式の出力オプションがあれば採用）を優先し、無ければplain stdoutをそのまま`content`として扱う。
- **正確なCLIフラグ名・出力形式は、本Taskの設計段階では断定しない。** Claude Code CLIのバージョンによりフラグが変わり得るため、`ADF-EXTERNAL-ADAPTER-001`が実施した「実行環境preflight」（実際にインストール済みCLIのバージョン・フラグを読み取り専用で確認する）を、実装着手前の最初のStepとして必須にする（§9参照）。

### 5.2 stdin/stdout or JSON-RPC

JSON-RPCは採用しない。JSON-RPC/stdio型の双方向プロトコルはMCPの領域であり、`ADF External Adapter設計`はMCPを「Transportではなく上位プロトコル」として明確に区別している。本Adapterは、Synthetic Packetの`instruction`をCLI引数（またはstdin）として渡し、プロセス終了時のstdoutを1回分の回答として受け取る、単純な一往復モデルとする。

### 5.3 timeout / cancel / process終了

既存のAnthropic/Ollama Transportが確立した「`TransportOptions.signal`のabortを、timeout用の内部Symbolと Owner cancel用の`signal.reason`で区別する」パターンをそのまま踏襲できる。相違点はabort時の動作のみ：`fetch`のAbortではなく`ChildProcess.kill()`を呼ぶ。

```text
spawn → stdout/stderr蓄積 → setTimeout(timeoutMs)でkill（timeout） → signal.abortでkill（cancelled） → close イベントでexit code判定
```

stderrは既存の`errorText`200文字切り詰め規約をそのまま適用する。

### 5.4 Work PlaneとRepository境界（本Taskの中心的な新規論点）

Claude Code CLIは既定でファイル読み書き・bash実行が可能なエージェント型ツールであり、これはAnthropic API・Ollamaにはない性質である。ADFの`ExternalTransport`契約はこの違いを吸収しないため、**安全境界はTransportの起動設定そのもので作る必要がある。**

- `spawn`の`cwd`を、実プロジェクト・repo・Vaultを一切含まない空の一時ディレクトリに固定する。
- 可能な限り制限的な権限モード（ツール使用を許可しない、または最小限に制限するフラグ）で起動する。正確なフラグ名は§5.1同様、実行環境preflightで確認する。
- 危険側に倒す既知のフラグ（安全確認を一括スキップする類のオプション）は**採用しない**。
- Work Plane（実repoへの読み書き・実行権限）は本Taskの範囲外とし、`ADF External Adapter設計`が既に定める「no repo / no worktree / no canonical write」境界を、Synthetic Packetのみで一往復するこの最小Adapterでも維持する。

### 5.5 capability grant

ADFの`Capability`型は現状`'read' | 'propose'`のみで、Claude Code CLI固有のツール権限語彙（ファイル書込み・bash実行等）を表現できない。これは`ADF-ADAPTER-PROVIDER-NEUTRAL-001`で既に「未解消のギャップ」として記録済みの制約である。

本Taskでは、この語彙拡張を行わない。代わりに、**ADFの`Capability`はこのAdapterに対して記述的な意味しか持たず、実際の安全境界は§5.4のTransport起動設定（cwd隔離・権限フラグ）が担う**ことを設計上の前提として明記する。

### 5.6 secrets・外部送信・費用

Claude Code CLIは、環境変数のAPIキーまたは既存のログインセッション（`cli-session`）のいずれかで認証される。ADFはいずれの場合も資格情報の値を読まず、`credentialStatus()`は存在確認のみを返す（既存のAnthropic Transportと同じ規約）。

Ollamaと異なり、Claude Code CLIは最終的にAnthropicのサーバーへ実際に送信し、費用が発生する。したがって`dataPolicy: 'external-send'`とし、`preflightExternalSend`の**既存の`external-send`分岐（Owner実行承認ファイル必須）をそのまま使う**。Ollama用に追加した`local-only`/`local-http`分岐は使わない。この点で、Claude Code CLI Adapterは構造的に`claude-external`（Anthropic API）に近く、`ollama-local`とは異なる安全ゲートに属する。

### 5.7 Result Envelope / Evidence / Ledger

変更不要。CLIのstdout（またはJSON出力のテキスト部分）を`ExternalSendOutcome.content`にマッピングし、exit codeとstderrを`terminationReason`/`errorText`にマッピングするだけで、既存のResult Envelope検証・Evidence記録・Ledger記録がそのまま機能する。

### 5.8 Recoveryと冪等性

既存のRecovery設計（`ADF-RELAY-RECOVERY-001`）は「送信されたか未確認のままアプリが終了したTurn」をLedger上のイベントから検出する。HTTPベースのTransportでは、アプリ終了時に未完了のリクエストはサーバー側で自然に終了する。

CLIのサブプロセスは**アプリ（Electron / Node）が終了しても、OSプロセスとして残存し得る**（デタッチされたプロセスの場合）。これは既存のRecovery設計が想定していない新しいリスクであり、既存のLedgerベースの検出だけでは「サブプロセスが実際にまだ動いているか」を判定できない。

本Taskでは、この孤立プロセスのリスクを**未解決の残存リスクとして明記するに留め、解決を本Taskの完了条件にしない**（Ollama Adapterの複数モデル対応を後続課題としたのと同じ扱い）。最小実装では、少なくとも`spawn`をデタッチしない（親プロセス終了時にOSが子プロセスも終了させやすい設定にする）ことを推奨するに留める。

## 6. Provider-neutral契約への影響の分離

### 6.1 既存契約だけで実装できる部分（変更不要）

- `ExternalTransport`インターフェース（`credentialStatus` / `isLocalEndpoint?` / `send`）
- `ConversationAdapter` / `ExternalConversationAdapter`（AbortControllerベースのtimeout/cancelは流用可能）
- `Thread` / `Relay` / `Recovery`の状態遷移
- `Result Envelope` / `Evidence Links` / `Ledger`のスキーマ
- `preflightExternalSend`の`external-send`分岐（Owner承認ファイル・認証状態・費用Tierの既存チェック）
- `AdapterConnection`（`'cli'`）・`AuthMode`（`'cli-session'`）・`AdapterDataPolicy`（`'external-send'`）— いずれも既存の型に値として存在

### 6.2 契約変更が必要な場合（本Taskでは想定しない。発生したら停止）

- `Capability`型へのツール権限語彙の追加（§5.5参照。本Taskでは行わない）
- Recoveryへのプロセス生存確認機構の追加（§5.8参照。本Taskでは行わない）
- `ExternalTransport`インターフェース自体の変更（現時点では不要と判断。実装中に必要性が生じた場合は即座に停止しOwnerへ報告する）

## 7. 最小実装案（設計OK後に着手する内容）

### 変更候補ファイル

| ファイル | 変更 |
|---|---|
| `src/main/jobLoop/claudeCodeCliTransport.ts`（新規） | `ClaudeCodeCliTransport implements ExternalTransport`。`spawn`を注入可能にし（既存の`fetchImpl`注入パターンと同じ形で`spawnImpl`を注入）、テストで実プロセスを起動しない |
| `src/main/jobLoop/adapterRegistry.ts` | `claude-code-cli`エントリを`status: 'planned'`で追加（`connection: 'cli'`, `authMode: 'cli-session'`, `dataPolicy: 'external-send'`）。`Ollama-local`が`planned`から始まったのと同じ手順 |

### 非変更ファイル（本Taskでは一切触れない）

- `src/main/index.ts`（Main登録は別Task・別承認 — Registryが`planned`のままなら`routeAdapters`にも影響しない）
- `src/main/relayService.ts` / `src/preload/index.ts` / `src/renderer/src/ThreadPanel.tsx`（Ollama統合で既にAdapter非依存の設計になっているため、Registry登録だけでは変更不要）
- `src/main/jobLoop/relay.ts` / `src/main/jobLoop/thread.ts` / `src/main/jobLoop/externalApproval.ts` / `src/main/jobLoop/externalAdapter.ts`
- `src/shared/jobLoopTypes.ts` / `src/shared/threadTypes.ts` / `src/shared/externalAdapterTypes.ts`（§6.1のとおり、既存の型で足りる）

### テスト計画（実装着手後、実ネットワーク・実CLI起動を使わない）

1. `spawnImpl`注入により、実際に`claude`コマンドを起動せずに`send()`を検証できる。
2. 正常応答（exit code 0、stdoutあり）が`status: 'success'`として`content`に反映される。
3. exit code非0、またはstderrのみの場合が`status: 'failed'`または`'invalid'`として区別される。
4. `options.signal`のabortで、実行中の`spawnImpl`が返すモックプロセスに対し`kill()`相当が呼ばれ、`status: 'cancelled'`になる。
5. `timeoutMs`経過で`status: 'timeout'`になる。
6. `credentialStatus()`が値を一切含まず、存在確認のみを返す。
7. `claude-code-cli`は`status: 'planned'`のままで、`routeAdapters`・`validateAdapterPlan`のいずれからも自動選択されない（既存の`Ollama-local`planned期と同じ回帰パターン）。
8. 既存のFake Adapter・Anthropic・Ollama経路のテストが回帰しない。

## 8. Stop Conditions

- `ExternalTransport`インターフェース自体の変更が必要になった場合。
- `Capability`型の拡張が実装に必須になった場合。
- cwd隔離・権限フラグだけでは実repoへの読み書きを防げないと判明した場合。
- 実行環境preflightで、非対話モード・JSON出力・権限制限フラグのいずれかが現在のCLIバージョンに存在しないと判明した場合。
- 新規npm依存の追加が必要になった場合。
- APIキーの生成・保存、Owner承認ファイルの自動生成が必要になった場合。
- 既存のFake Adapter・Anthropic・Ollama経路の既存テストに1件でも影響した場合。
- `ADF-EXTERNAL-ADAPTER-001`のStatus変更が必要になった場合。

## 9. Owner承認事項（設計OKの対象）

1. Claude Code CLI Adapterは`dataPolicy: 'external-send'`とし、既存の`claude-external`と同じOwner承認ファイル・費用Tールゲートに従う（`ollama-local`型の軽量ゲートは使わない）。
2. Work Plane（実repo読み書き・実行権限）は本Taskの範囲外とし、cwd隔離・権限制限フラグによる安全境界を実装の前提とする。
3. 正確なCLI起動フラグ・出力形式は、実装着手前に読み取り専用の実行環境preflightで確認してから決定する（未検証のフラグを前提に実装を始めない）。
4. 本Taskでは`Registry`エントリを`planned`のまま追加するにとどめ、Main登録・実CLI起動・実送信は別Task・別承認とする。
5. 孤立プロセスのRecoveryリスク（§5.8）は、解決せず残存リスクとして記録する。

## 10. 未確定・後続候補

- Claude Code CLIの正確な非対話実行フラグ・JSON出力形式（実行環境preflightで確定）。
- Main登録・Renderer表示・実送信を行う後続Task（`ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`と同じ2段階パターンを踏襲するか）。
- 孤立プロセスRecoveryの恒久対応（Capability語彙拡張と合わせて、将来の契約拡張候補）。
- Work Plane・repository境界の正式設計（別Task・別承認）。

## 11. 実行環境preflight結果（2026-08-13、Blocked）

Project Ownerの「設計OK」を受け、§9-3のとおり実装着手前の最初のStepとして、読み取り専用の実行環境preflightを実施した。**実際のCLI呼び出し（`--version`・`--help`を含む）は一切行っていない**（後述のとおりバイナリ自体が見つからず、呼び出す対象が存在しなかった）。

### 確認方法

| 確認 | コマンド | 結果 |
|---|---|---|
| PATH上の`claude` | `which claude` / `command -v claude` / `type -a claude` | 見つからず |
| 標準インストール先 | `/usr/local/bin/claude`、`/opt/homebrew/bin/claude`、`~/.claude/local/claude`、`~/.local/bin/claude`の存在確認 | いずれも無し |
| Homebrew | `brew list` に`claude`を含むパッケージが無いか | 該当パッケージ無し |
| npmグローバルパッケージ | `npm root -g` 経由で`@anthropic-ai/*`を確認 | `npm`自体がPATHに無く確認不能（本環境はNode/npmが標準導入されておらず、Electron同梱Nodeのみで運用している既存の制約と同じ） |
| `~/.claude`ディレクトリ | 存在確認のみ（中身は開いていない） | 存在する。ただし内容（`agents`/`sessions`/`projects`等）は、本セッション自体が動作しているClaude Codeハーネスの状態ディレクトリであり、**独立したCLIバイナリの存在を意味しない** |

### 結論

**Claude Code CLIの単体バイナリは、本環境のPATH上にも標準インストール先にも存在しない。** `ADF-EXTERNAL-ADAPTER-001`が2026-08-10に行った同種のpreflight（「Claude CLI: 未導入」）と同じ結論である。

これはTask正本§8 Stop Conditionsの「実行環境preflightで、非対話モード・JSON出力・権限制限フラグのいずれかが現在のCLIバージョンに存在しないと判明した場合」に該当する、より根本的な形（フラグ以前にバイナリ自体が無い）。加えて、CLIを新規に導入すること自体が「新規依存の追加」に該当し、本Taskの承認範囲外である。

### Blocked記録（Task Lifecycle所定の記録項目）

- **原因**: Claude Code CLIバイナリが本環境に未導入。
- **影響**: §5.1〜5.3（起動方式・出力形式・timeout/cancel実装）の実装に着手できない。§5.4以降（Work Plane境界・secrets・Result Envelope設計）は設計として有効なまま。
- **必要な判断**: Claude Code CLIを本環境へ新規導入するか（新規依存の追加としてOwner承認が必要）、導入済みの別環境で実装するか、あるいは本Taskを一時停止し他Taskを優先するか。
- **解消条件**: 上記いずれかのOwner判断、またはCLI導入自体の実行直前承認。
- **Owner**: Project Owner。

Status は `Blocked`。commit・pushは未実施。設計そのもの（§1〜10）は無効化されておらず、CLI導入判断後にそのまま実装へ進める。

## 12. CLI導入後のpreflight結果（Owner承認、2026-08-13、Blocked解消）

Project Ownerより「Claude Code CLI本体の導入を承認します」の指示を受け、範囲を厳密に「CLIのインストールと、導入後の`--version`／`--help`による読み取り専用preflightのみ」に限定して実施した。

### 12.1 実施内容

1. `claude`バイナリのインストール：公式インストーラ（`https://claude.ai/install.sh`、Anthropic公式ドメイン）を事前にダウンロードして内容を確認（SHA256チェックサム検証・チェックサムマニフェスト方式であることを確認）したうえで実行した。npmは本環境にPATHが無いため使用していない。
2. `claude --version`：読み取り専用、送信・認証なし。
3. `claude --help`：読み取り専用、送信・認証なし。

**行っていないこと**：APIキー設定、`claude auth`等の認証コマンド、`-p`/`--print`によるプロンプト送信、その他いかなる実送信・課金操作、ADFコード変更、ADF設定変更、commit、push。

### 12.2 確認結果（Owner指定の6項目）

| 項目 | 結果 |
|---|---|
| 実行ファイルの場所 | `~/.local/bin/claude`（`which claude`で確認） |
| バージョン | `2.1.231 (Claude Code)` |
| 非対話モード | `-p, --print`（"Print response and exit"）が存在。§5.1の設計前提どおり |
| 出力形式 | `--output-format <format>`：`text`（既定）／`json`（単一結果）／`stream-json`（ストリーミング）。**いずれも`--print`との併用が条件。** §5.1/5.2の設計前提どおり |
| ツール使用制限 | `--tools <tools...>`：`""`を指定すると全ツール無効化、`"default"`で全ツール、個別指定も可能。加えて`--allowedTools`/`--disallowedTools`（許可・拒否リスト）、`--permission-mode <mode>`（`acceptEdits`/`auto`/`bypassPermissions`/`manual`/`dontAsk`/`plan`）も存在。**`--tools ""`により、§5.4/5.5で設計した「ツール権限をTransport起動設定で構造的に無効化する」がそのまま実現可能と確認** |
| cwd隔離の可否 | 直接の「隔離専用フラグ」は無いが、`--add-dir`（ツールアクセスを許可する追加ディレクトリの明示指定）、`--exclude-dynamic-system-prompt-sections`（cwd・env情報・git状態などをシステムプロンプトから除外）が存在。`--tools ""`と組み合わせれば、ファイルアクセス自体が発生しないため、cwd隔離は`spawn`時に空の一時ディレクトリを指定するだけで設計どおり実現できると判断 |

### 12.3 追加で判明した有用なフラグ（設計の補強材料、未確定・後続候補への追記）

- `--bare`：hooks・LSP・plugin同期・attribution・auto-memory・keychain読み取り・`CLAUDE.md`自動探索をすべて無効化する最小モード。認証は`ANTHROPIC_API_KEY`または`apiKeyHelper`のみに固定（OAuth・keychainは読まない）。Synthetic Packetのみの最小接続確認に適した候補。
- `--max-budget-usd <amount>`（`--print`時のみ）：1回のAPI呼び出しに対する費用上限。ADFの費用Tierゲートと組み合わせられる可能性がある。
- `--no-session-persistence`（`--print`時のみ）：セッションをディスクに残さない。
- `--strict-mcp-config` / `--setting-sources`：MCP・設定の読み込み範囲を絞れる。

これらは実装時の具体的なフラグ選定候補であり、本Task正本§7の実装案そのものは変更しない（設計方針は維持、フラグの実在確認が取れたという事実の追記）。

### 12.4 Blocked解消の記録

§11で記録した`Blocked`（CLIバイナリ未導入）は、Owner承認済みの導入により解消した。設計（§1〜10）はそのまま有効。**ただし、実際のコード実装（`ClaudeCodeCliTransport`の作成、Registryエントリ追加）には、本メッセージのpreflight結果報告とは別の、Owner明示承認が必要である**（本指示は「preflight完了後は停止して報告する」ことのみを許可しており、実装着手は含まれない）。

Status は `Waiting Approval`。commit・pushは未実施。

## 13. 最小Transport実装（Owner承認、2026-08-13）

Project Ownerより「実装着手を承認します」の指示を受け、§7の実装案どおり最小Transportを実装した。

### 13.1 変更ファイル

| ファイル | 変更 |
|---|---|
| `src/main/jobLoop/claudeCodeCliTransport.ts`（新規） | `ClaudeCodeCliTransport implements ExternalTransport`。`connection: 'cli'`。`spawnImpl`注入（既存の`fetchImpl`注入パターンと同型）。`send()`は`mkdtemp`で空の一時cwdを作成し、`spawn(command, ['--print', '--output-format', 'json', '--tools', '', prompt], { cwd, env: process.env })`を実行、`finally`で一時cwdを削除する |
| `src/main/jobLoop/adapterRegistry.ts` | `claude-code-cli`エントリを`status: 'planned'`で追加（`provider: 'anthropic'`, `connection: 'cli'`, `authMode: 'cli-session'`, `dataPolicy: 'external-send'`, `roles: ['proposal','critic','implementation','review']`） |
| `tests/claudeCodeCliTransport.test.ts`（新規） | `spawnImpl`注入によるテスト12件 |
| `tests/adapterRegistry.test.ts` | Registry登録内容・自動Routing除外のテスト2件 |

**変更していないファイル**：`src/main/index.ts` / `src/main/relayService.ts` / `src/preload/index.ts` / `src/renderer/src/ThreadPanel.tsx` / `src/main/jobLoop/relay.ts` / `src/main/jobLoop/thread.ts` / `src/main/jobLoop/externalApproval.ts` / `src/main/jobLoop/externalAdapter.ts` / `src/shared/*`。`tsconfig.node.json`・`tsconfig.cli.json`も無変更（新規ファイルは既存の`src/main/**/*.ts`・`tests/**/*.ts`glob、および`claude-code-cli`を参照するCLIスクリプトが無いため）。

### 13.2 設計判断の記録

- **`send()`内での認証必須チェックは行わない**：`AnthropicMessagesTransport`は環境変数が無ければ`MissingCredentialError`を投げるが、Claude Code CLIはOAuth/既存ログインセッションでも認証され得るため、`send()`自体はハード拒否しない。実際の送信可否は`preflightExternalSend`の`credential-present`チェック（`credentialStatus()`の`present`値）が担う、という既存の分離をそのまま踏襲した。
- **`--output-format json`のスキーマは未検証**：実際のCLI応答を得ていない（実送信が今回も禁止のため）。`result`フィールド・`is_error`フィールドを想定した解析を実装したが、これは文書化された挙動に基づく設計であり、本セッションで実際に検証したものではない。JSON解析に失敗した場合は生のstdoutをそのまま`content`として使うフォールバックを実装し、スキーマの想定が外れても回答自体を失わないようにした。**初回の実送信（別途承認）で、この想定が正しいか確認する必要がある。**
- **cwd隔離**：`mkdtemp(path.join(tmpdir(), 'adf-claude-cli-'))`で毎回新規の空ディレクトリを作成し、プロセス終了後に削除する。`--tools ''`と組み合わせることで、ファイルツール自体が使えない状態にしている。

## 14. 検証（2026-08-13）

| 項目 | コマンド | 結果 |
|---|---|---|
| 型検査（Node/Main/Preload/Shared/CLI/Tests） | `tsc --noEmit -p tsconfig.node.json` | Pass |
| CLIコンパイル | `tsc -p tsconfig.cli.json` | Pass（無変更のため影響なし） |
| 単体・結合テスト全体 | `vitest run` | Pass — Test Files 17 passed (17) / Tests **268 passed (268)**（実装前254件から+14件） |
| Electronビルド | `electron-vite build` | Pass — `out/main/index.js` 118.28 kB（Registryエントリ追加分のみ増加。`claudeCodeCliTransport.ts`はどこからもimportされないため、Mainバンドルに含まれないことを確認）、`out/preload/index.js` 1.65 kB（無変更）、`out/renderer` 550.28 kB（無変更） |
| diff整形チェック | `git diff --check` | Pass |
| Git状態 | `git status --short --branch` | 想定ファイルのみ変更・新規。commit・push未実施 |
| 回帰確認 | 既存Fake Adapter・Anthropic（`claude-external`）・Ollama（`ollama-local`）経路の既存テストが無変更でPassし続けることを確認 |

### 14.1 実施していないこと（禁止事項の遵守）

`index.ts`への登録、Work Plane／repo／worktreeへの接続、APIキー設定・認証操作、実プロンプト送信、実CLI起動、commit・push——いずれも行っていない。`claude-code-cli`はRegistryに`status: 'planned'`で存在するのみで、`routeAdapters`からは自動選択されず（テストで確認済み）、`index.ts`のRelayにも登録されていないため、稼働中のElectronアプリからは到達不能である。

Status は `Verifying`。commit・pushは未実施。

## 15. Verifyingレビュー指摘と修正（Owner Review、2026-08-13）

Project OwnerのVerifyingレビューで、受入前に修正必須のブロッカー2件の指摘を受けた。Registry追加・`planned`による自動Routing除外・timeout/cancel/一時cwd/JSON処理の基本構造は問題なしと確認された。実CLI起動・認証・外部送信・commit・pushは行わず修正した。

### 15.1 指摘1：`env: process.env`による全環境変数の継承

**指摘**：親プロセス（Electronアプリ全体）の環境変数をそのまま子プロセスへ渡しており、APIキー等の無関係な秘密情報が漏れ得る。

**対応**：`buildChildEnv()`を追加し、`PATH`・`HOME`（OSレベルで必須、秘密情報ではない）と、認証用途の`ANTHROPIC_API_KEY`（設定されている場合のみ）のみを含む新しい環境変数オブジェクトをゼロから構築するよう変更した。`process.env`をそのまま渡す経路は削除した。

- 任意の無関係な秘密情報（テストでは`ADF_TEST_UNRELATED_SECRET`という架空の値）が子プロセスへ渡らないことをテストで固定した。
- `ANTHROPIC_API_KEY`が未設定の場合、キー自体を子プロセスの環境から完全に省略する（空文字列として渡さない）こともテストで固定した。
- `ANTHROPIC_API_KEY`は認証用途としてのみ子プロセスへ渡り、ログ・Ledger・Resultのいずれにも出力しない（既存のコード経路上、これらへ環境変数の内容を書き込む処理は元々存在しない）。

### 15.2 指摘2：`authMode: 'cli-session'`と`ANTHROPIC_API_KEY`存在確認の不整合

**指摘**：`credentialStatus()`が`authMode: 'cli-session'`を宣言しながら、実際にはAPIキーの存在しか確認しておらず、OAuth／既存CLIログインセッションを認識できないまま「APIキー未設定」としてpreflightを拒否する。

**対応**：**CLIセッションを安全に検知する方法（実CLI起動を伴わない確認手段）を本ラウンドでは確立できないため、MVPはAPIキー方式に限定する方針を採用した。** ただし単純に`authMode`の値だけを変更したのではなく、**実際の認証挙動をその値に合わせて固定する**修正を行った。

- `send()`で子プロセスに常時`--bare`フラグを追加した。`claude --help`で確認済みのとおり、`--bare`モードでは「Anthropic認証は厳密にANTHROPIC_API_KEYまたは`apiKeyHelper`のみ（OAuth・keychainは一切読まない）」とCLI自身が文書化しており、既存のログインセッションが存在してもこのTransportの起動では使われない。
- これにより、`credentialStatus()`の`authMode`を`'environment-secret'`に変更したことは「モデルの簡略化」ではなく「実際にこのTransportが検査・使用する認証方式をそのまま正確に記述した」ことになる。Registry側（`adapterRegistry.ts`の`claude-code-cli`エントリ）の`authMode`も同様に`'environment-secret'`へ修正した。
- `--bare`は副次的に、hooks・LSP・plugin同期・attribution・auto-memory・keychain読み取り・`CLAUDE.md`自動探索も無効化するため、§5.4で設計したcwd隔離・ツール制限の安全境界をさらに補強する。
- 未確認のCLIセッションを`present: true`として扱う経路は存在しない（そもそも`--bare`がセッションを使わないため、確認する必要自体がなくなった）。

**将来のCLIセッション対応**：`--bare`を使わずOAuth／keychainセッションを許可する設計は、安全な認証状態確認方法（実CLI起動を伴わない、値を読まない確認手段）を別途設計してから、別Task・別承認で扱う（§10未確定・後続候補へ記録済み）。

### 15.3 変更ファイル（追加分）

| ファイル | 変更 |
|---|---|
| `src/main/jobLoop/claudeCodeCliTransport.ts` | `inheritedEnvVariables`（`PATH`・`HOME`）定数と`buildChildEnv()`を追加。`credentialStatus()`の`authMode`を`'environment-secret'`へ変更、コメントで`--bare`との整合性を明記。`runProcess`の`args`に`--bare`を追加し、`env: this.buildChildEnv()`を使用するよう変更 |
| `src/main/jobLoop/adapterRegistry.ts` | `claude-code-cli`エントリの`authMode`を`'environment-secret'`へ修正、理由をコメントに追記 |
| `tests/claudeCodeCliTransport.test.ts` | 既存2テストの期待値を`authMode: 'environment-secret'`へ更新、spawn引数テストに`--bare`を追加、環境変数allowlistの新規テスト2件を追加（計+2件） |
| `tests/adapterRegistry.test.ts` | Registry登録テストの期待値を`authMode: 'environment-secret'`へ更新 |

### 15.4 再検証（2026-08-13）

| 項目 | コマンド | 結果 |
|---|---|---|
| 型検査 | `tsc --noEmit -p tsconfig.node.json` | Pass |
| 単体・結合テスト全体 | `vitest run` | Pass — Test Files 17 passed (17) / Tests **270 passed (270)**（修正前268件から+2件） |
| Electronビルド | `electron-vite build` | Pass — main 118.29 kB（誤差程度の増加）、preload/renderer無変更 |
| diff整形チェック | `git diff --check` | Pass |
| Git状態 | `git status --short --branch` | 想定ファイルのみ変更・新規。commit・push未実施 |

実CLI起動、認証、外部送信、APIキー設定、commit、pushはいずれも行っていない。Task StatusはVerifyingを維持する。

Status は `Verifying`。commit・pushは未実施。

## 16. Owner最終Diffレビュー・完了承認・Done（2026-08-13）

Project Ownerより、最終Diffレビュー結果と完了承認を受けた。

### 16.1 Owner最終Diffレビュー結果

- Vitest：270/270 Pass
- Node／Web／CLI typecheck：Pass
- Electron build：Pass
- `git diff --check`：Pass
- Obsidianマイルストーン（`18_ADF_Claude_Code_CLI_Adapter設計_2026-08-13.md`）とTask正本の同期：完了
- MOC・既存Obsidianリンク：無変更
- 実CLI起動・認証・外部送信：未実施
- 変更ファイルが想定範囲のみであること：確認済み

### 16.2 確認事項（Owner）

- `--bare`固定と`authMode: 'environment-secret'`の整合
- 環境変数allowlist（`PATH`／`HOME`／`ANTHROPIC_API_KEY`のみ）
- `claude-code-cli`が`status: 'planned'`のまま維持されていること
- 自動Routing・`index.ts`のMain登録のいずれからも除外されていること

### 16.3 残存リスク（本Taskの範囲外として記録）

- `--output-format json`の実応答スキーマ（`result`／`is_error`フィールド）は未確認。初回の実送信（別Task・別承認）で確認する。
- 実CLI起動・認証・外部送信は未実施（Main登録・実送信は後続Task）。

### 16.4 完了承認

**Project Owner承認によりStatusを`Done`へ更新する。**

## ADF Execution Summary

```json adf-execution-summary
{
  "adfExecutionSummary": "v1",
  "taskId": "ADF-CLAUDE-CODE-CLI-ADAPTER-001",
  "objective": "ADFからClaude Code CLIを、既存のAdapter契約・Approved Packet・Thread・Relay・Result Envelope・Evidence・Ledgerへ接続する最小設計を作る。実装は設計OK後の別ステップとする。",
  "scope": {
    "inScope": [
      "CLI起動方式（非対話・一回限りの実行モード）の設計比較",
      "stdin/stdout方式の採用とJSON-RPC/MCPとの区別",
      "timeout / cancel / process終了のTransport内設計",
      "Work PlaneとRepository境界（cwd隔離・権限制限フラグ）の設計",
      "capability grantの限界とTransport起動設定による代替",
      "secrets・外部送信・費用ゲート（既存external-send分岐の再利用）",
      "Result Envelope / Evidence / Ledgerへのマッピング設計",
      "Recoveryと孤立プロセスリスクの分離",
      "Provider-neutral契約変更の要否判定（不要と結論）",
      "変更候補ファイル・非変更ファイル・テスト計画・Stop Conditionsの作成",
      "Obsidianマイルストーンの新規記録"
    ],
    "outOfScope": [
      "コード実装、依存追加、Claude Code CLIの起動",
      "外部送信、APIキー設定、費用発生",
      "Main（index.ts）登録、Renderer UI変更",
      "Work Plane・repository境界の正式実装",
      "ADF-EXTERNAL-ADAPTER-001の再レビュー・Status変更",
      "ADF-ADAPTER-PROVIDER-NEUTRAL-001 / ADF-OLLAMA-FIRST-CLASS-ADAPTER-001の成果物の変更",
      "commit、push、merge"
    ]
  },
  "context": {
    "githubTask": "docs/tasks/ADF-CLAUDE-CODE-CLI-ADAPTER-001.md",
    "obsidianContext": [
      "Projects/AI-Development-Framework/17_ADF_Ollama標準Adapter接続マイルストーン_2026-08-13.md",
      "Projects/AI-Development-Framework/18_ADF_Claude_Code_CLI_Adapter設計_2026-08-13.md"
    ],
    "adoptedPrinciples": ["owner-approval", "provider-neutral-adapter", "work-plane-not-yet-authorized", "no-repo-no-worktree-no-canonical-write", "fake-success-is-not-real-ai-proof"]
  },
  "acceptance": [
    "Provider-neutral契約（ExternalTransport / ConversationAdapter / Thread / Relay / Recovery / Result Envelope）への変更が不要であることを確認した",
    "Work PlaneとRepository境界の安全設計（cwd隔離・権限制限フラグ）を明記した",
    "Claude Code CLI Adapterがexternal-send分岐（Owner承認ファイル必須）に属することを明記した",
    "変更候補ファイル・非変更ファイル・テスト計画・Stop Conditions・Owner承認事項を作成した",
    "GitHubに次Task正本を1件作成し、StatusをWaiting Approvalにした",
    "Obsidianに新規マイルストーンを記録した（既存ノートを破壊しない）"
  ],
  "stopConditions": [
    "ExternalTransportインターフェース自体の変更が必要になった場合",
    "Capability型の拡張が実装に必須になった場合",
    "cwd隔離・権限フラグだけでは実repoへの読み書きを防げないと判明した場合",
    "実行環境preflightで非対話モード・JSON出力・権限制限フラグが現行CLIに存在しないと判明した場合",
    "新規依存の追加が必要になった場合",
    "APIキーの生成・保存、Owner承認ファイルの自動生成が必要になった場合",
    "既存のFake Adapter・Anthropic・Ollama経路の既存テストに影響した場合",
    "ADF-EXTERNAL-ADAPTER-001のStatus変更が必要になった場合"
  ]
}
```
