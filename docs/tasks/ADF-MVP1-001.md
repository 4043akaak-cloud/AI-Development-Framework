# Task — ADF-MVP1-001: ローカル読み取り専用Task Boardを実装する

> Type: Implementation
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [MVP](../project/MVP.md) / [Current State](../project/CURRENT_STATE.md) / [Board実装設計](../design/ADF_MVP1_READ_ONLY_BOARD.md)

## 1. Objective

- なぜ今このTaskが必要か: Phase 0、振り返り、複数AI管制の設計契約が完了し、Product MVP 1として人間がTaskの判断・根拠・正本へ戻れるローカルBoardを実測する段階になったため。
- 達成したい結果: ADF単一プロジェクトの3〜5件の手動確認済みTaskスナップショットを、書込み・同期・ネットワークなしで表示し、許可済みのローカルGitHub/Obsidian正本Markdownだけを安全に開けるmacOSローカルアプリを作る。
- 完了条件: 設計の受入条件、型検査、unit test、production build、ローカル起動、Project Ownerによる差分・実機レビューを記録する。

## 2. Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [MVP](../project/MVP.md)、[Roadmap](../project/ROADMAP.md)、[Current State](../project/CURRENT_STATE.md)
- [Task Board MVP設計](../design/ADF_TASK_BOARD_MVP.md)
- [複数AI管制エンジン設計](../design/ADF_MULTI_AI_CONTROL_PLANE.md)
- [Adapter契約](../design/ADF_AGENT_ADAPTER_CONTRACT.md)
- 現在のbranch・変更状況: `codex/adf-pilot-governance`、HEAD `3c0eab8`。既存の未コミット変更は本Task開始前から存在する。対象外の差分は編集、stage、commit、pushしない。

### Obsidian

| ノート | Taskで採用する制約・学び | 確認者 |
| --- | --- | --- |
| `Projects/AI-Development-Framework/04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md` | Boardは正本を置換せず、人間の判断を助ける。 | Codex |
| `Projects/AI-Development-Framework/05_Phase0振り返り_2026-08-03.md` | Board先行で、外部AIは別Task・別承認。 | Codex |
| `Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md` | Control Planeの閲覧部分だけを実装し、承認・統合・Adapter接続を実装しない。 | Codex |

## 3. Scope

- In scope: `package.json`、Electron + React + TypeScript + electron-viteの最小構成、静的Boardスナップショット、読み取り専用UI、厳格なローカル正本リンク、unit test、開発・build手順、Task/Current State/Obsidianの実施記録。
- 正本リンクの対象: `/Users/kawakamiatsushishi/GitHub/AI-Development-Framework` と `/Users/kawakamiatsushishi/Desktop/secondbrain` 配下の存在する`.md`のみ。rendererは`sourceId`だけを渡し、main processがallow-list・`realpath`・root・拡張子を検証してから開く。
- 追加依存: `electron`、`electron-vite`、`electron-builder`、`react`、`react-dom`、`typescript`、`vite`、`vitest`、型定義。依存取得のネットワーク通信はこのインストール時だけで、アプリ実行時の外部通信は行わない。
- Out of scope: GitHub/Obsidian API、HTTP通信、認証、DB、ファイル走査、Markdown解析、同期、書込み、Agent/Adapter、Artifact本文比較、通知、telemetry、auto-update、任意URL/任意パス起動、署名・notarization、commit、push、公開。

## 4. Plan

| Step | 行うこと | 検証 |
| --- | --- | --- |
| 1 | Task・設計・Current State・Obsidianに承認済みの実装境界を記録する | Markdownリンク、`git diff --check` |
| 2 | Electron/React/TypeScriptの最小基盤と開発・build scriptsを追加する | install、typecheck、build |
| 3 | 型付き静的スナップショット、Board、Focus panel、Stale/Broken状態を実装する | unit test、手動表示 |
| 4 | preloadの狭いAPIとmain側allow-listで正本Markdownを開く | 正常・拒否・symlink・非`.md`のunit test |
| 5 | 非書込み・非通信・実機導線を検証し、結果と残存リスクを記録する | diff、test、build、起動・Owner review |

## 5. Approval

- Approval required?: Yes。
- 承認対象: 本TaskのScope、上記依存導入、ローカルアプリ実装・テスト。API、外部送信、正本書込み、commit、pushは含まない。
- 承認者: Project Owner。
- 承認記録: 2026-08-04、Project Ownerが「スキルの準備が出来たら実装OK」と明示。`adf-control-plane-workflow` Skillの作成後、このTaskの承認済み設計範囲で実装する。

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-04 | Codex | Electron + React + TypeScript + electron-viteの最小ローカルアプリ、静的Snapshot、Board UI、preload/mainの正本リンクallow-list、unit testを追加 | ADF Taskの判断・正本導線を実機で検証するため | GitHub/Obsidian API、同期、DB、外部AI、正本書込みは追加していない。 |
| 2026-08-04 | Codex | `pnpm-workspace.yaml`で`esbuild`だけの依存buildを許可し、Windows専用`electron-winstaller`は明示拒否 | pnpm v11の依存build安全機構を維持しつつ、ローカルbundlerだけを動かすため | `node`はシェル未導入のため、Codex同梱Nodeを一時PATHで使用。Nodeのシステム導入は行っていない。 |
| 2026-08-04 | Codex | 役割分離Codexレビューで見つかった、package済みアプリの任意renderer URL読込余地を修正し、main側の正本リンク拒否を依存注入可能なserviceへ分離してunit testを追加 | 外部通信なし・allow-list境界を実効的に検証するため | 実在Taskに承認待ち/Blocked/検証中のカードがないため、3代表ケースの実機探索は未検証のまま残す。 |

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- | --- |
| 自動 | `pnpm run typecheck` | Pass | Codex | Codex同梱Nodeを一時PATHで使用 |
| 自動 | `pnpm test`（固定sourceId、相対`.md`、root外・未知ID・不存在・非`.md`拒否、open未呼出、local-only renderer URL、Registry） | Pass（7 tests） | Codex | |
| 自動 | `pnpm run build`、arm64 `.app` package | Pass | Codex | macOS code signingはDeveloper ID不在のため未実施 |
| 静的 | `git diff --check`、rendererに任意network APIがないこと、CSP `connect-src 'none'`、preload APIが1つだけであることを照合 | Pass | Codex | アプリ実行時の通信をパケット監視したわけではない |
| 手動 | package済み`ADF Task Board.app`を起動し、初期Board、Focus panel、Card選択、`ADF-MVP1-001`の許可済みTask Markdownを開く | Pass | Codex | Dockへの配置・Dock起動、Broken表示の実機操作は未実施 |
| 役割分離レビュー | Codex subagentによる差分・安全性監査 | Changes requested → addressed | Codex subagent / Codex | package済みアプリの任意renderer URL読込、main側拒否テスト不足を修正。3代表ケースは実データ不足で未検証として維持。独立外部AIレビューではない。 |
| Review | Project Ownerによる差分・実機導線・残存リスクの確認 | Approved | Project Owner | `ADF-MVP1-001 レビューOK`（2026-08-04） |

- 受入条件の照合:
  - [x] BoardはADF単一プロジェクトの固定手動Snapshotだけを表示する。
  - [x] CardからTask ID、Lifecycle、判断、Risk、停止条件、次の安全な一手、正本・Evidence導線を確認できる。
  - [x] Card選択はFocus panelを切り替えるだけで、編集・状態遷移・承認・同期を行わない。
  - [x] rendererは`sourceId`だけを渡し、mainがallow-list・root・`realpath`・`.md`を検証してから開く。
  - [x] typecheck、unit test、production build、package済みアプリの表示と正常リンクを確認した。
  - [ ] `Stale`/`Broken`の実機表示、3代表ケースの60秒探索、Dock起動、正本のbefore/after hash比較は未実施。Project Ownerはこれらを後続検証として受諾した。
- 残るリスク・未検証事項: Developer ID署名・notarizationなしのためGatekeeper影響があり得る。実機のDock起動、Broken表示、実在する承認待ち/Blocked/検証・レビューの3代表ケースによる60秒探索、ネットワークのパケット観測、Vault/repoの操作前後hashはProject Ownerレビューまたは後続検証で扱う。main serviceの未知ID・不存在・非`.md`・root escape拒否とopen未呼出はunit test済みだが、実機symlink操作は未実施。

## 8. Completion and Handover

- GitHub更新: 本Task、設計、Current State、MVP受入条件を更新した。
- Obsidian更新: Product MVP 1の実装・レビュー状態を更新した。
- 次の安全な一手: 最初のBoard差分を対象に、外部AIまたは人間の独立レビューを設計する。外部接続・API・Adapter導入は自動開始しない。

## 9. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | 「スキルの準備が出来たら実装OK」 | 2026-08-04 | 本Task Approval |
| Diff / Verification | Approved | `ADF-MVP1-001 レビューOK` | 2026-08-04 | この会話 |
| 残存リスク | Accepted | Dock起動、Broken/Stale、60秒探索、hash、通信観測、署名は後続検証とする | 2026-08-04 | 本Task Verification |

### Done checklist

- [x] Required Context、Scope、Plan、Approvalを記録した。
- [x] 承認済みScopeだけを実装した。
- [x] Verification結果と未検証事項を記録した。
- [x] 役割分離CodexレビューとProject Owner Reviewを記録した。
- [x] GitHubと必要なObsidianの記録を更新した。
