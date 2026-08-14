# Task — ADF-OLLAMA-FIRST-CLASS-ADAPTER-001: Ollama Local HTTPをElectronの標準Adapterとして統合

> Type: Design / Implementation
> Status: Done — 実装・自動検証・実Ollama送信（Main/Relay/Transport本番経路）完了、Project Owner受入・完了承認済み（2026-08-13）。
> Owner: Claude Code
> Monitor / Verification: Codex
> Related: [ADF-ADAPTER-PROVIDER-NEUTRAL-001](./ADF-ADAPTER-PROVIDER-NEUTRAL-001.md)（Done・再変更なし）/ [ADF-OLLAMA-LIVE-CONNECTION-001](./ADF-OLLAMA-LIVE-CONNECTION-001.md)（Done・再変更なし）/ [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)（**Verifying のまま。本Taskはこの状態を変更しない**）/ [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md)

## 1. Objective

`OllamaLocalHttpTransport`と`ollama-local`の実接続は`ADF-OLLAMA-LIVE-CONNECTION-001`でCLIプローブ経由で実証済みだが、Electronアプリの`index.ts`が持つ`ConversationRelay`には登録されておらず、通常のGUI操作からは到達できない。本Taskは、既存のProvider-neutral Adapter契約・Packet/Dispatch境界（`assertExplicitDispatchIsApprovedPlan`等）を一切変更せずに、`ollama-local`をElectronの明示承認付き標準Adapterとして統合する。

ADFの標準接続方式の方向性（標準AI討論 = Ollama Local HTTP、コード実装用 = Claude Code CLI（後続Task）、外部高性能用 = Anthropic API（任意・別承認）、GUI自動操作 = gui-experimental（最後に検討））を前提とするが、本Taskの実装範囲はOllama Local HTTPの統合のみである。

## 2. Approval

- Approval required?: Yes
- 承認対象（Project Ownerが本Taskの設計方針として採用済み。2026-08-13）:
  1. Main（`index.ts`）へ`ollama-local`用の`OllamaLocalHttpTransport` / `ExternalConversationAdapter`を、既存Fake / Anthropicと共存登録する。
  2. Plan一致チェック（Packetの`adapterPlan`とDispatch先の一致）は、**preflight（表示用）とDispatch（実送信）で共通のヘルパー関数を使用する**（重複実装しない）。
  3. RendererのAdapter候補一覧は、**Registry由来の読み取り専用一覧**から表示する（ハードコードした固定候補にしない）。
  4. readiness確認（`/api/tags`）は**Ownerの明示操作時のみ**実行し、起動時・Thread選択時に自動実行しない。
  5. 実Ollama送信（GUI経由）は、本Taskのコード実装承認とは**別の実行直前承認**まで行わない。
  6. `ADF-EXTERNAL-ADAPTER-001`のStatusは`Verifying`のまま変更しない（実送信可否は引き続き別Task・別判断）。
  7. `CURRENT_STATE.md`の更新は本Taskの記録範囲に含める（Task開始・Doneのタイミングで反映する）。
  8. **Ollama readiness確認のPassを、送信ボタン有効化の必須条件にする**（`local-http`のAdapterを選択している場合、preflight Passに加えてreadiness Passも揃わない限り送信ボタンを有効化しない）。
  9. **Plan一致共通ヘルパーは、`adapterId`・`role`に加えて`routingPlanHash`（`adapterPlan`との整合）も検証する。**
- 本ファイルは、上記方針を反映した最終実装計画である。**この計画そのものへの実装開始承認（コード変更の着手可否）は、本ファイル提示後にProject Ownerが判断する。**

## 3. Required Context

### GitHub

- [AGENTS.md](../../AGENTS.md) / [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md) / [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)
- [ADF External Adapter設計](../design/ADF_EXTERNAL_ADAPTER.md)
- [ADF-ADAPTER-PROVIDER-NEUTRAL-001](./ADF-ADAPTER-PROVIDER-NEUTRAL-001.md) / [ADF-OLLAMA-LIVE-CONNECTION-001](./ADF-OLLAMA-LIVE-CONNECTION-001.md) / [ADF-EXTERNAL-ADAPTER-001](./ADF-EXTERNAL-ADAPTER-001.md)
- 既存実装：`src/main/index.ts` / `src/main/relayService.ts` / `src/main/jobLoop/relay.ts` / `src/main/jobLoop/thread.ts` / `src/main/jobLoop/adapterRegistry.ts` / `src/main/jobLoop/externalAdapter.ts` / `src/main/jobLoop/externalApproval.ts` / `src/main/jobLoop/externalTransport.ts` / `src/main/jobLoop/ollamaTransport.ts` / `src/renderer/src/ThreadPanel.tsx` / `src/preload/index.ts` / `src/shared/jobLoopTypes.ts` / `src/shared/threadTypes.ts` / `src/shared/externalAdapterTypes.ts`

### Obsidian

- `/Users/kawakamiatsushishi/Desktop/secondbrain/Projects/AI-Development-Framework/17_ADF_Ollama標準Adapter接続マイルストーン_2026-08-13.md`

採用する制約は、Provider-neutral Adapter契約を壊さないこと、`ollama-local`を自動Routingへ追加しないこと、Packet承認Planと実Dispatch先の一致を常に検証すること、loopback以外へ送信しないこと、新規依存を追加しないこと、実送信は別承認まで行わないことである。

## 4. Scope

### In scope

- `src/main/index.ts`：`OllamaLocalHttpTransport`インスタンスと`ExternalConversationAdapter('ollama-local', 'proposal', ...)`を、既存Fake二種・`claude-external`と共存する形で単一`ConversationRelay`へ登録。`externalTransports`へ`'ollama-local'`を追加。起動時にOllamaへの接続確認は行わない。
- Plan一致チェックの共通ヘルパー化：`src/main/jobLoop/adapterRegistry.ts`へ純粋関数を追加し、`relay.ts`の`assertExplicitDispatchIsApprovedPlan`（実Dispatch側）と、`externalApproval.ts`の`preflightExternalSend`（表示用・`isLocalHttpLocalOnly`分岐内）の両方から呼び出す。ロジックの重複実装を作らない。
- `src/main/relayService.ts` / `src/preload/index.ts`：Registry由来の読み取り専用Adapter候補一覧を返す新規IPC（1本）と、Ollama readiness確認用の新規IPC（1本、Owner明示操作でのみ`/api/tags`へ到達）を追加。
- `src/renderer/src/ThreadPanel.tsx`：「外部AI Adapter」パネルを、ハードコードされた`claude-external`固定からAdapter選択可能な形へ変更。選択肢はRegistry由来の読み取り専用一覧から取得する。Ollama選択時のみ、Model / Endpoint / local endpoint確認結果 / readiness確認ボタンを追加表示する。
- `docs/project/CURRENT_STATE.md`：本Task開始時点の状態記録、および完了時点の反映（Task開始・Doneのタイミングで更新。Task Lifecycleの更新ルールに従う）。
- 上記に対応する自動テスト（§7参照）。

### Out of scope（別Task・別承認）

- 実Ollamaへの実送信（GUI経由）。本Taskのコード実装が完了しても、実送信は別の実行直前承認まで行わない。
- Claude Code CLI Transport（後続Task）。
- `gui-experimental`の実装。
- `ollama-local`の自動Routingへの組込み。
- 第2のlocal-httpモデル・複数モデル対応・Ollama Cloud。
- `ADF-EXTERNAL-ADAPTER-001`のStatus変更・実送信可否判断。
- `ADF-ADAPTER-PROVIDER-NEUTRAL-001` / `ADF-OLLAMA-LIVE-CONNECTION-001`の成果物の変更・再レビュー。
- Renderer側でのAdapter次役割（proposal/critic）による候補フィルタリング（§9未確定点2、本Taskでは実装しない — 全登録Adapterを表示し、role不一致は既存のpreflight `adapter-declares-role` / `packet-matches-adapter-role`チェックの表示で示す）。
- APIキー、認証情報、外部送信承認ファイルをOllama Local HTTP経路で要求すること。
- Ollamaの起動、モデルpull、モデル変更の自動実行。
- 新規依存関係の追加。
- GitHub（本Task以外）・Obsidian・他Task正本の変更。
- commit、push、merge。

## 5. Acceptance Criteria

1. `ollama-local`は明示Adapter選択でのみ到達可能で、自動Routingには含まれない（Registry由来の選択UIは実装済み。§14のとおり、`index.ts`と同一のMain／Relay／Transport本番経路での到達性は実送信で確認済み。マウスクリックによるGUI操作そのものの確認はOwner自身による目視確認を別途要する — §13/§14参照）。
2. Plan一致チェック（Packetの`adapterPlan`とDispatch先の`adapterId`・`role`の一致、および`adapterPlan`と`routingPlanHash`自体の整合）が、preflight表示と実Dispatchの両方で同一の共通ヘルパーにより検証される（重複実装がない）。
3. fake-ai-a承認Packetからollama-localへの送信は、preflight表示の時点で「不可」として示され、実Dispatchでも拒否される。
4. Anthropic（`claude-external`）承認Packetからollama-localへの送信も同様に拒否される。
5. RoutingHash不一致・role不一致・Registry/Transportのconnection不一致・非loopback endpointは、いずれもpreflight表示とDispatchの両方でfail-closedに拒否される。
6. RendererのAdapter候補一覧は、Registry由来の読み取り専用IPCから取得され、ハードコードされた固定リストではない。
7. readiness確認は、Ownerが明示的にボタンを押した場合にのみ`/api/tags`へ1回到達する。起動時・Thread選択時・自動ポーリングでは到達しない。
8. 送信ボタンは、preflightの全チェックがPassした場合のみ有効になる。**`local-http`のAdapterを選択している場合は、これに加えてreadiness確認がPass（`reachable && modelPresent`）していることも必須条件とする。** readiness未確認・fail・Adapter/Thread切替後の未再確認は、いずれも送信ボタンを無効のままにする。
9. APIキー・認証情報・外部送信承認ファイルは、Ollama Local HTTP経路のどこにも要求されない。
10. 既存Fake Adapter討論・既存Anthropic（`claude-external`）経路が回帰しない。
11. 実Ollamaへの送信は、Ownerの実行直前承認を得てから実施する（**2026-08-13、承認のうえ1件実施し成功**。§14参照。Result Envelope・Evidence・Ledgerが生成され、旧証跡は無変更）。
12. `ADF-EXTERNAL-ADAPTER-001`のStatusが`Verifying`のまま変更されない。
13. `CURRENT_STATE.md`が本Taskの開始・実Ollama接続確認を反映する。

## 6. 最終実装計画

### 6.1 Plan一致チェックの共通ヘルパー（`src/main/jobLoop/adapterRegistry.ts`）

`adapterId`・`role`の一致だけでなく、**`adapterPlan`自体が`routingPlanHash`と整合しているか（改ざん・陳腐化していないか）も同じヘルパーで検証する。** `hashJson`は既存の`hash.ts`から利用する。

```ts
export interface PlanMembershipResult { ok: boolean; detail: string }

export function checkAdapterPlanMembership(adapterPlan: AdapterPlan, routingPlanHash: string, adapterId: string, role: AdapterRole): PlanMembershipResult {
  if (hashJson(adapterPlan) !== routingPlanHash) {
    return { ok: false, detail: 'adapterPlan does not match its routingPlanHash (stale or tampered)' }
  }
  const selection = adapterPlan.selections.find((candidate) => candidate.adapterId === adapterId)
  if (!selection) return { ok: false, detail: `Task Packet adapterPlan does not include ${adapterId}` }
  if (selection.role !== role) return { ok: false, detail: `Task Packet adapterPlan approves ${adapterId} for role ${selection.role}, not ${role}` }
  return { ok: true, detail: `adapterPlan approves ${adapterId} for role ${role}, routingPlanHash verified` }
}
```

`relay.ts`の`assertExplicitDispatchIsApprovedPlan`は、この関数を呼び出すよう置き換える。呼び出し時は`thread.adapterPlan`と`thread.routingPlanHash`（いずれも既存フィールド）をそのまま渡せるため、新しいデータ取得は不要。ロジックの実質は同一のため、実Dispatch側の挙動は変化しない（従来通りadapterId/role不一致は拒否。今回追加でroutingPlanHash不一致も同じ経路で拒否されるようになる）。

### 6.2 Preflightへの統合（`src/main/jobLoop/externalApproval.ts`）

`PreflightInput`へ任意項目`approvedPlanBinding?: { adapterPlan: AdapterPlan; routingPlanHash: string }`を追加する。`isLocalHttpLocalOnly`分岐内でのみ、`approvedPlanBinding`が渡されていれば`checkAdapterPlanMembership`を呼び出し、`adapterPlan-includes-selection`のようなcheck名で`checks[]`へ追加する。`external-send`（Anthropic）経路は`approvedPlanBinding`を渡さないため無変更・無影響。

呼び出し元（`relay.ts`の`preflightExternalSend`メソッドと`externalHooks.authorise`）は、いずれも既に`thread`を取得済みのため、`approvedPlanBinding: { adapterPlan: thread.adapterPlan, routingPlanHash: thread.routingPlanHash }`を渡すだけで済む。

### 6.3 Main（`src/main/index.ts`）

既存の`AnthropicMessagesTransport` / `ExternalConversationAdapter('claude-external', ...)`の登録パターンと同じ形で、`OllamaLocalHttpTransport`のインスタンス化と`ExternalConversationAdapter('ollama-local', 'proposal', ollamaTransport, {...})`を追加する。コンストラクタ呼び出しはネットワークを開かない。`externalTransports`マップへ`'ollama-local'`を追加する。

### 6.4 Registry由来のAdapter候補一覧（新規IPC）

`ConversationRelay`へ読み取り専用メソッドを追加する（案）。

```ts
listExternalAdapterProfiles(): AdapterProfile[] {
  return [...this.adapters.keys()]
    .map((adapterId) => getAdapterProfile(adapterId))
    .filter((profile) => profile.connection !== 'fake')
}
```

このRelayインスタンスに実際に登録されているAdapterのみを返す（Registry上は`available`でもこのRelayに未登録なら一覧に出さない — 「登録済みだが選ぶと失敗する」という状態を作らない）。`relayService.ts`に薄いラッパー、`preload/index.ts`に1chを追加する。

### 6.5 Readiness確認IPC

`checkOllamaReadiness()`（`ollamaTransport.ts`、実装済み）を呼び出す新規IPC（例：`relay:ollama-readiness`）を追加する。Rendererの明示ボタン押下でのみ呼び出す。既存の`preflightExternal`とは完全に別のアクションとし、`preflightExternal`・Thread一覧取得・自動ポーリングからは呼び出さない。**`preflightExternalSend`（`externalApproval.ts`）自体はこのIPCを呼ばず、readinessチェックを内部に含めない**（既存どおりネットワーク非到達のまま維持し、実送信の内部再検証パスに新しいネットワーク呼び出しを増やさないため）。readinessはRenderer側の状態としてのみ保持する。

### 6.6 Renderer（`src/renderer/src/ThreadPanel.tsx`）

- 「外部AI Adapter」パネルの`const externalAdapterId = 'claude-external'`固定値を廃止し、Registry由来の候補一覧（§6.4のIPC）から選択するセレクタへ変更する。
- 選択したAdapterの`connection === 'local-http'`のときのみ、Model / Endpoint / readiness確認ボタン / readiness結果を追加表示する。
- `preflight.checks[]`は既存表示ロジックをそのまま流用する（Plan一致チェックも同じ配列に含まれるため、表示コードの変更は最小限）。
- readiness結果は`{ reachable, modelPresent, models, detail } | null`のRenderer state（例：`ollamaReadiness`）として保持する。**Adapter選択の変更・Thread切替のたびにこのstateを`null`へリセットし**、古いreadiness結果が別のAdapter/Threadへ引き継がれないようにする。
- 送信ボタンの有効化条件を次のように変更する：`disabled={busy || inFlight || !preflight?.ok || (selectedProfile.connection === 'local-http' && !(ollamaReadiness?.reachable && ollamaReadiness?.modelPresent))}`。`local-http`以外（Anthropic等）は従来どおり`preflight?.ok`のみで判定され、挙動は変化しない。
- 上記の有効化判定はReactコンポーネントから独立した純粋関数（例：`isSendEnabled(preflight, readiness, connection, busy, inFlight)`）として切り出し、DOM描画を伴わないVitestで直接検証できるようにする（既存テスト群と同じ形式に揃える）。

## 7. テスト計画（自動検証、実ネットワーク不使用・`fetchImpl`注入）

1. Main構成に`ollama-local`を明示登録できる（`index.ts`と同じ組み立てを再現するテスト）。
2. Electron起動〜`scanForRecovery`完了までOllamaへの通信が発生しない。
3. `local-http`が自動Routingに入らない（既存テストの回帰確認）。
4. explicit adapterPlanのOllama Packetは受理される。
5. fake-ai-a PacketからOllamaへのDispatchはpreflight表示・実Dispatchの両方で拒否される。
6. Anthropic PacketからOllamaへのDispatchも同様に拒否される。
7. role不一致は拒否される。
8. `routingPlanHash`改ざんは、共通ヘルパー（`checkAdapterPlanMembership`）経由でpreflight表示・実Dispatchの両方から拒否される。
9. Registry / Transportのconnection不一致は拒否される。
10. 外部endpointは拒否される。
11. loopback endpointだけが許可される。
12. APIキーや外部送信承認ファイルを要求しない。
13. Result Envelopeが既存Threadへ取り込まれる（既存Ollama実接続テストの構成を流用）。
14. EvidenceとLedgerが生成される。
15. Ownerレビュー待ちで停止する。
16. Fake Adapter経路が回帰しない。
17. Anthropic経路が回帰しない。
18. cancel / timeout / malformed responseが明確な失敗状態になる。
19. preloadに不要な権限や承認ファイル書込み経路を追加しない。
20. Plan一致チェックの共通ヘルパー自体の単体テスト（`checkAdapterPlanMembership`）。
21. Registry由来Adapter候補一覧IPCが、このRelayに未登録のAdapterを含まないことの確認。
22. readiness確認IPCが、明示呼び出し以外では一切実行されないことの確認（`preflightExternal`呼び出しだけではreadinessチェックが走らないことをテストで固定）。
23. 送信ボタンの有効化判定（`isSendEnabled`相当）が、`local-http`のAdapterではreadiness未確認・fail時に`false`を返し、readiness Pass後に`true`を返すことの単体テスト。Anthropic等`local-http`以外ではreadiness状態に関わらず`preflight.ok`のみで判定されることも合わせて確認する。
24. `checkAdapterPlanMembership`単体テスト：`routingPlanHash`が`adapterPlan`と不一致の場合に拒否され、一致かつadapterId/role一致の場合のみPassすることを確認する（adapterId不一致・role不一致・routingPlanHash不一致の3ケースを個別に検証）。

## 8. 実Ollama送信を伴う検証と、ローカル自動検証の分離

- **ローカル自動検証**：typecheck（node/web/cli）、Vitest全体、`electron-vite build`、`git diff --check`、preload/renderer差分確認、`git status --short --branch`。実ネットワークは一切使わない。
- **実Ollama送信を伴う検証（本Taskのコード実装完了後も、別の実行直前承認まで実施しない）**：Electronが停止していること、Ollamaがloopbackで到達可能であること、使用モデル、明示Packetの内容とhash、送信回数、外部送信ではないこと、生成されるThread / Job / Evidence / Ledger、旧証跡（`thread-1330cbb90aaea8d3` / `thread-2de7d930e27a365b` / `thread-d497734c1978f74f`）を変更しないことを、実行前に報告する。

## 9. 未確定点（設計時点）

1. Registry由来Adapter候補一覧の役割フィルタリング（Threadの次のroleに応じて候補を絞るか）は、本Taskでは実装せず、全登録Adapterを表示し既存のrole不一致preflight表示に委ねる（§4 Out of scope参照）。将来の改善候補として記録する。
2. `CURRENT_STATE.md`の更新タイミングは、本Task開始時点（Waiting Approval → Approved移行時）と完了時点（Done）の2箇所を想定していたが、§13のとおり実装・自動検証完了時点（Verifying）で更新することとした。

## 10. Stop Conditions

- Registry Profile・Transportの`connection`が一致しない状態が発生した場合。
- `local-endpoint-confirmed`がfailする状態（loopback以外を指す設定）が発生した場合。
- Plan一致チェックの共通ヘルパー追加が、Anthropic（external-send）経路の既存テストに1件でも影響した場合。
- 新規依存の追加が必要になった場合。
- APIキー・認証情報・外部送信承認ファイルがOllama経路で要求される状態になった場合。
- Ollama起動・モデルpull・モデル変更が実装に必要になった場合。
- 既存の実Ollama証跡（`thread-1330cbb90aaea8d3` / `thread-2de7d930e27a365b` / `thread-d497734c1978f74f`）・旧Packet・旧Jobを変更・削除しないと実装が成立しない場合。
- `ADF-EXTERNAL-ADAPTER-001`のStatus変更が必要になった場合。

## 11. Implementation Log（2026-08-13、Project Owner「実装・自動検証・最終Diffレビューへ進めてください」承認）

| ファイル | 変更 |
|---|---|
| `src/main/jobLoop/adapterRegistry.ts` | `checkAdapterPlanMembership(adapterPlan, routingPlanHash, adapterId, role)`を追加（§6.1どおり）。`hashJson`をインポート |
| `src/main/jobLoop/relay.ts` | `assertExplicitDispatchIsApprovedPlan`が共通ヘルパーを呼ぶよう置き換え。`listExternalAdapterProfiles()`を追加。`preflightExternalSend`メソッドと`externalHooks.authorise`の両方で`approvedPlanBinding: { adapterPlan: thread.adapterPlan, routingPlanHash: thread.routingPlanHash }`を渡すよう変更 |
| `src/main/jobLoop/externalApproval.ts` | `PreflightInput`へ`approvedPlanBinding?`を追加。`isLocalHttpLocalOnly`分岐内で`checkAdapterPlanMembership`を呼び、`adapterPlan-includes-selection`チェックとして`checks[]`へ追加。`external-send`経路は無変更 |
| `src/main/index.ts` | `OllamaLocalHttpTransport`・`ExternalConversationAdapter('ollama-local', 'proposal', ...)`を追加登録。`externalTransports`へ`ollama-local`を追加。`relay:external-adapters`・`relay:ollama-readiness`のIPCハンドラを追加（後者はOwner明示操作専用） |
| `src/main/relayService.ts` | `listExternalAdapters(relay)`（Registry由来、読み取り専用）と`ollamaReadiness()`（`checkOllamaReadiness`のラッパー）を追加 |
| `src/preload/index.ts` | `listExternalAdapters` / `ollamaReadiness`の2chを`contextBridge`へ追加公開。承認ファイル書込みchは引き続き0 |
| `src/renderer/src/ThreadPanel.tsx` | `claude-external`固定を廃止し、Registry由来の一覧からAdapterを選択するセレクタへ変更。Ollama選択時のみModel/Endpoint/readinessボタンを追加表示。送信ボタンは`isSendEnabled()`で判定 |
| `src/renderer/src/externalSendGate.ts`（新規） | `isSendEnabled(preflight, readiness, connection, busy, inFlight)`をReact非依存の純粋関数として切り出し |
| `src/renderer/src/env.d.ts` | `listExternalAdapters` / `ollamaReadiness`の型を追加 |
| `src/shared/externalAdapterTypes.ts` | `OllamaReadiness`を追加（`baseUrl` / `model`フィールドを含む。preload/rendererが`main/`を直接参照しないための配置）。`ollamaTransport.ts`側の同名ローカル定義は削除し、ここからimport |
| `src/main/jobLoop/ollamaTransport.ts` | `checkOllamaReadiness()`の全戻り値に`baseUrl` / `model`を追加。ローカル`OllamaReadiness`定義を削除し`shared/`からimport。クラスの説明コメントを、Electronの`index.ts`が現在`ollama-local`を登録している事実に合わせて更新 |
| `tsconfig.node.json` | `include`へ`src/renderer/src/externalSendGate.ts`を追加 |
| `tests/adapterRegistry.test.ts` | `checkAdapterPlanMembership`の単体テスト5件 |
| `tests/externalSendGate.test.ts`（新規） | `isSendEnabled`の単体テスト6件 |
| `tests/conversationRelay.test.ts` | `listExternalAdapterProfiles()`のテスト3件、preflight報告に`adapterPlan-includes-selection`チェックが現れる/現れないことのテスト3件 |
| `tests/externalIpc.test.ts` | 既存のpreload chリストテストを更新（2ch追加分）。Main相当構成（Fake×2 + claude-external + ollama-local）を再現する新規describeブロックを追加し、起動時無通信・Adapter一覧IPC・Plan不一致拒否・明示承認Dispatch受理・Fake回帰・Anthropic回帰・readiness呼び出し箇所の静的確認、計7件 |

## 12. Verification（2026-08-13）

| 項目 | コマンド | 結果 |
|---|---|---|
| 型検査（Node/Main/Preload/Shared/CLI/Tests） | `tsc --noEmit -p tsconfig.node.json` | Pass |
| 型検査（Renderer） | `tsc --noEmit -p tsconfig.web.json` | Pass |
| CLIコンパイル | `tsc -p tsconfig.cli.json` | Pass |
| 単体・結合テスト全体 | `vitest run` | Pass — Test Files 16 passed (16) / Tests **254 passed (254)**（実装前230件から+24件） |
| Electronビルド | `electron-vite build` | Pass — `out/main/index.js` 117.92 kB（Ollama登録・共通ヘルパー分の増加）、`out/preload/index.js` 1.65 kB（2ch追加分）、`out/renderer` 550.28 kB（Adapter選択UI分の増加） |
| diff整形チェック | `git diff --check` | Pass |
| Git状態 | `git status --short --branch` | 想定ファイルのみ変更・新規（Task正本を含む）。commit・push未実施 |
| 回帰確認 | 既存Fake Adapter討論・既存Anthropic（`claude-external`）経路のテスト（`tests/externalIpc.test.ts`, `tests/externalAdapter.test.ts`ほか既存分すべて）が無変更でPassし続けることを確認 |
| 静的確認 | `checkOllamaReadiness` / `ollamaReadiness()`の呼び出し箇所が`index.ts`の`relay:ollama-readiness`ハンドラ1箇所のみであること、Rendererでは`runReadinessCheck`（ボタンonClick）内のみで呼ばれ`useEffect`内には現れないことをソース走査で確認 |

## 13. 実Ollama送信・GUI目視確認について（本セクションは§14により更新済み）

本節作成時点（実装・自動検証完了直後）では実Ollamaへの送信は0件だった。その後、Project Ownerの実行直前承認を得て§14のとおり1件実施し成功した。旧証跡（`thread-1330cbb90aaea8d3` / `thread-2de7d930e27a365b` / `thread-d497734c1978f74f`）・旧Packetは一切変更・削除していない。`ADF-EXTERNAL-ADAPTER-001`のStatusも`Verifying`のまま変更していない。

（本節時点のStatusは`Verifying`だったが、§15のとおり最終的に`Done`。）

## 14. 実Ollama送信（Owner承認、2026-08-13）

Project Ownerより「GUI経由の実Ollama送信を実行直前承認」の指示を受け、実施した。

### 14.1 実施方法についての開示

本環境には、このElectronアプリの実GUI（ネイティブウィンドウ内のボタンクリック）を操作するツールが無い（ブラウザ操作ツールはWebページ専用で、Electronのネイティブウィンドウ・`contextBridge`経由の`ipcRenderer`には使えない）。そのため、`index.ts`のIPCハンドラが実際に呼ぶのと**同一の本番コード**（`ConversationRelay.listExternalAdapterProfiles()` / `checkOllamaReadiness()` / `preflightExternalSend()` / `continueJob()` — それぞれ`relay:external-adapters` / `relay:ollama-readiness` / `relay:preflight-external` / `relay:send-external` IPCの実体）を、`index.ts`と同一のRelay構成（Fake二種＋`claude-external`＋`ollama-local`、実Transport、fetch注入なし）で直接実行する形で送信した。**マウスクリックによるGUI操作そのものではない**が、GUIが内部で呼ぶのと全く同じ本番経路・実ネットワークでの送信である。

### 14.2 事前確認

- Electronアプリ：未起動を確認。
- Ollama到達可能性：`curl /api/tags`（読み取りのみ）で200、`llama3:latest`存在を確認。

### 14.3 正規Packet生成

`--explicit-adapter ollama-local --roles proposal`で`ADF-OLLAMA-FIRST-CLASS-ADAPTER-001`用の新規Packetを生成（`approval-id: approval-adf-ollama-first-class-adapter-001-v1`）。既存Packetとの衝突なし。

### 14.4 実行順序と結果

1. `listExternalAdapterProfiles()`：`claude-external`・`ollama-local`の2件を正しく返す。
2. `checkOllamaReadiness()`：`reachable: true`、`modelPresent: true`、`baseUrl: http://127.0.0.1:11434`、`model: llama3`。
3. `startThread(packet)`：`thread-18399ed229b8f47b`（新規、`state: open`）。
4. `preflightExternalSend(threadId, 'ollama-local')`：`ok: true`。**`adapterPlan-includes-selection`チェックが`pass`**（本Taskの中核機能が実際に動作していることを確認）。全10チェックPass。
5. `continueJob(threadId, 'ollama-local')`：実送信。`turn-0-f434a74ff026`、`status: success`、実際のllama3応答を受信。`durationMs: 21695`（Ledger記録）。

### 14.5 Result / Evidence / Ledger

- **Thread**：`thread-18399ed229b8f47b`（`jobId: job-c33f22d42214f89f`、`state: awaiting-owner`）
- **Job Ledger**：`job-c33f22d42214f89f`の`adapter-plan.json` / `approval.json`とも`ollama-local`/proposal/`approval-adf-ollama-first-class-adapter-001-v1`に正しく束縛（`cat`で直接確認）
- **Result Envelope**：`status: success`、`verification: [{ name: "external-answer-received", status: "pass" }]`
- **Evidence Links**：`evidence-links.json`にTurn 1件、`resultEnvelopeRef`正しく参照
- **Ledger**：`external-calls.jsonl`に`provider: ollama-local-http`、`status: success`、資格情報なし

### 14.6 旧証跡の無変更確認

`jobs/job-a974bd6e81682131/adapter-plan.json`は`fake-ai-a`のまま。Thread数6件・Job数5件（新規1件ずつ増加、既存分は無変更）を確認した。`thread-1330cbb90aaea8d3` / `thread-2de7d930e27a365b` / `thread-d497734c1978f74f`・旧Packetはいずれも無変更。

### 14.7 未実施

- 実際のマウス操作によるGUIクリックセッションでの確認（§14.1の理由により未実施）。ご希望であれば、Owner自身がElectronアプリを起動し、`thread-18399ed229b8f47b`がThreadPanelで表示され、Adapter選択・readinessボタン・送信ボタンの実際の挙動を目視確認いただくことを推奨する。

Status は `Done`（§15参照）。

## 15. Owner完了承認・Done（2026-08-13）

Project Ownerより、以下の判断を受けた。

- §14の本番経路実証（Main／Relay／Transportを`index.ts`と同一構成で直接実行した実Ollama送信）は、GUIのマウスクリック確認を無効にするものではなく、実接続・境界・証跡生成の確認として受入可能と判断。
- マウスクリックによるGUI操作そのものの確認は、Owner自身が代替確認（本番経路実証の受入）を選択したため、本Taskの完了条件として必須にしない。
- Task正本冒頭のStatus説明（「実Ollama送信は別の実行直前承認まで未実施」）を、実送信完了後の状態に合わせて訂正。
- **Project Owner承認によりStatusを`Done`へ更新。**

Status は `Done`。

## ADF Execution Summary

```json adf-execution-summary
{
  "adfExecutionSummary": "v1",
  "taskId": "ADF-OLLAMA-FIRST-CLASS-ADAPTER-001",
  "objective": "既存のProvider-neutral Adapter契約とPacket/Dispatch境界を変更せずに、ollama-localをElectronアプリの明示承認付き標準Adapterとして統合する。",
  "scope": {
    "inScope": [
      "Main（index.ts）へOllamaLocalHttpTransport / ExternalConversationAdapter('ollama-local', ...)を既存Fake/Anthropicと共存登録",
      "Plan一致チェックをpreflightと実Dispatchで共通ヘルパー化（adapterRegistry.tsへ集約）",
      "Registry由来の読み取り専用Adapter候補一覧IPCの追加",
      "Ownerの明示操作時のみ実行されるreadiness確認IPCの追加",
      "RendererのAdapter選択UI（claude-external固定の廃止）",
      "CURRENT_STATE.mdの反映（Task開始・Done）"
    ],
    "outOfScope": [
      "実Ollamaへの実送信（GUI経由、別の実行直前承認まで行わない）",
      "Claude Code CLI Transport、gui-experimental",
      "ollama-localの自動Routingへの組込み",
      "ADF-EXTERNAL-ADAPTER-001のStatus変更・実送信可否判断",
      "ADF-ADAPTER-PROVIDER-NEUTRAL-001 / ADF-OLLAMA-LIVE-CONNECTION-001の成果物の変更",
      "新規依存関係、APIキー、認証情報、Ollama起動・モデルpull"
    ]
  },
  "context": {
    "githubTask": "docs/tasks/ADF-OLLAMA-FIRST-CLASS-ADAPTER-001.md",
    "obsidianContext": [
      "Projects/AI-Development-Framework/17_ADF_Ollama標準Adapter接続マイルストーン_2026-08-13.md"
    ],
    "adoptedPrinciples": ["owner-approval", "provider-neutral-adapter", "local-only-is-not-zero-risk", "separate-approval-for-real-send", "fake-success-is-not-real-ai-proof"]
  },
  "acceptance": [
    "ollama-localはElectron GUIから明示Adapter選択でのみ到達可能で、自動Routingには含まれない",
    "Plan一致チェック（adapterId・role・routingPlanHash）がpreflightと実Dispatchの両方で同一の共通ヘルパーにより検証される",
    "fake-ai-a承認・Anthropic承認PacketからのOllamaへの送信は、preflight表示・実Dispatchの両方で拒否される",
    "RendererのAdapter候補一覧はRegistry由来の読み取り専用IPCから取得される",
    "readiness確認はOwnerの明示操作時のみ実行される",
    "local-httpのAdapterでは、readiness確認のPassが送信ボタン有効化の必須条件になる",
    "既存Fake Adapter討論・既存Anthropic経路が回帰しない",
    "実Ollamaへの送信はOwnerの実行直前承認後に実施し、2026-08-13に1件成功した（Result Envelope・Evidence・Ledger生成、旧証跡は無変更）",
    "ADF-EXTERNAL-ADAPTER-001のStatusがVerifyingのまま変更されない"
  ],
  "stopConditions": [
    "Registry ProfileとTransportのconnectionが一致しない場合",
    "local-endpoint-confirmedがfailする場合",
    "Plan一致チェックの追加がAnthropic経路の既存テストへ影響した場合",
    "新規依存の追加が必要になった場合",
    "APIキー・認証情報・外部送信承認ファイルがOllama経路で要求される場合",
    "Ollama起動・モデルpull・モデル変更が実装に必要になった場合",
    "既存の実Ollama証跡・旧Packet・旧Jobを変更・削除しないと実装が成立しない場合"
  ]
}
```
