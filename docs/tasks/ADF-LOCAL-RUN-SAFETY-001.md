# Task — ADF-LOCAL-RUN-SAFETY-001: ローカル起動・ビルドの再発防止とアプリ統一

> Status: `Verifying` — 実装・検証完了。残るのはProject Ownerの完了承認と独立レビュー。
> Type: Implementation + Verification
> Owner: Project Owner
> Implementer: Claude Code
> Independent Review: 未実施
> Date: 2026-09-09

## 1. Objective

2026-09-08に発生した「案内したコマンドがパッケージ済みアプリを破壊した」事故について、(1) 同じ失敗を機構で止める、(2) ADFを確実に起動できる状態にする、(3) アプリをひとつに統一し `ADF` と名付ける。

## 2. 何が起きたか

Claude Codeが、パッケージ版が起動している状態で `npm run dev` を案内し、続けて `npm run build` を案内した。3つの障害が連鎖した。

| # | 事象 | 原因 |
| --- | --- | --- |
| 1 | 同名ウィンドウが2つ並び判別不能 | パッケージ版も開発版も `productName = 'ADF Task Board'` を名乗る |
| 2 | 開発版が白紙のまま | `npm run dev` の最中に `npm run build` が `out/` を上書きした |
| 3 | **8月27日ビルドの `ADF Task Board.app` が消失** | electron-builderが `release/mac-arm64/` を初期化した**後**に `spawn pnpm ENOENT` で失敗 |

3が最も重い。`release/` は `.gitignore` 対象でGitに無く、CURRENT_STATEが記録していた退避先 `/tmp/adf-legacy-builds-20260825/` も既に消えていたため、復元手段が存在しなかった。

### 根本原因

- **RC1**: electron-builderは、検出したパッケージマネージャの存在を確認する前に出力ディレクトリを消す。失敗が「安全に早く」ではなく「破壊してから」起きる。
- **RC2**: このリポジトリはpnpm管理だが、マシンにpnpmが無かった。
- **RC3**: `dev` と `build` がどちらも `out/` へ書くのに、排他が無かった。
- **RC4**: runtime rootが `app.getPath('userData')` 由来で、アプリ名に依存していた。改名でデータが孤立しうる状態だった。
- **RC5**: 破壊的コマンドを案内する際の確認義務が、どのルール文書にも書かれていなかった。

## 3. 対策

「次から気をつける」は今回まさに機能しなかった対策なので、**機構**に置き換えた。

### 3.1 preflight（`scripts/preflight.mjs`）

`dev` と `build` の**先頭**で走り、失敗条件を実行前に検出して停止する。何も消さずに終わる。

| 検査 | 対応するRC | 挙動 |
| --- | --- | --- |
| lockfileが要求するパッケージマネージャの実在 | RC1/RC2 | 不在なら停止し `npm install -g pnpm` を提示 |
| ポート5173の占有 | RC3 | dev稼働中の `build` を停止 |
| 同リポジトリのElectronウィンドウ | 事象1 | 二重起動を停止 |
| MCPサーバーの検出 | — | 停止せず件数のみ通知（ヘッドレスで正常） |
| `release/` が消える旨の予告 | RC1 | 破壊的操作を無言で行わない |

`pre*` ライフサイクルではなくスクリプト本体に組み込んだ。pnpmは既定でpre/postを実行しないため、パッケージマネージャに依存しない形にする必要があった。

### 3.2 backup-release（`scripts/backup-release.mjs`）

electron-builderが `release/` を消す**前**に、既存の `.app` を `release/.backups/<timestamp>/` へ複製する。最大3世代を保持し、古いものから削除する。

preflightは既知の失敗要因しか止められない。これは未知の失敗要因に対する保険である。

### 3.3 runtime rootの固定

`runtimeRootPath()` を追加し、ディレクトリ名 `adf-task-board` をリテラルで固定した。アプリ名から導出しない。環境変数 `ADF_RUNTIME_ROOT` で上書きできる。

従来は `app.getPath('userData')` を使っていた。実際には `app.setName()` がwhenReady後の呼び出しでuserDataに効いていなかったため、たまたま `package.json` の `name` に解決されていただけである。**Electronの起動順序という暗黙の挙動にデータの所在が依存していた。**改名すればMCPサーバー（`--runtime-root` で旧パスを受け取る）とアプリが別々のデータを見る事故が起こりえた。

### 3.4 アプリの統一と改名

- `productName` を `ADF Task Board` → **`ADF`** に変更（`src/main/index.ts`、`electron-builder.yml`）
- 開発版のウィンドウタイトルを `ADF（開発版）` とし、`app.isPackaged` で分岐
- `appId` は `com.adf.taskboard` のまま（macOS上の同一性を変えない）

「ひとつにまとめる」を、同名2つにするのではなく**正規のアプリを `ADF` ひとつに定め、開発版は明示的に見分けられる**形で実現した。同名2つは今回の混乱の原因そのものであり、再現させない。

### 3.5 ルールの明文化

`guidelines/AI_COLLABORATION.md` に「破壊的コマンドを案内する前に」を追加した。案内も実行と同じ責任範囲であること、`.gitignore` 対象はGitから復元できないこと、再発防止は機構へ変換し**その機構が実際に止めることを確認する**ことを定めた。

運用手順は [ローカル起動とビルド](../workflow/LOCAL_RUN_AND_BUILD.md) に分離した。

## 4. Scope

### In scope

`scripts/preflight.mjs`、`scripts/backup-release.mjs`、`package.json` のscripts、`src/main/index.ts`、`electron-builder.yml`、`guidelines/AI_COLLABORATION.md`、`docs/workflow/LOCAL_RUN_AND_BUILD.md`、本Task、`CURRENT_STATE.md`。

### Out of scope

- 失われた8月27日ビルドの復元（バイナリは存在せず、復元不能。より新しいものを再ビルドした）
- `appId` の変更、アイコン設定、コード署名
- CI導入、Windows/Linux対応
- runtime rootの移行（位置を変えていないため不要）

## 5. Verification

| 種別 | 実施内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck node / web / cli | Pass |
| 自動 | `vitest run` | Pass 46 files / 462 tests（回帰なし） |
| 自動 | `npm run build` 完走 | Pass。`release/mac-arm64/ADF.app` を生成 |
| 手動 | **preflight: pnpm不在の再現**（pnpmだけを隠したPATHで実行） | **停止を確認。exit=1、`release/` に未接触** |
| 手動 | **preflight: dev稼働中のbuild**（5173を占有して実行） | **停止を確認。exit=1** |
| 手動 | preflight: 正常時 | 通過。exit=0 |
| 手動 | パッケージ検査（asar展開） | `CFBundleName: ADF`、実行ファイル `ADF`、`credential-shaped` 2件、`開発版` 1件 |
| 手動 | runtime root一致 | パッケージ内の解決式が `getPath("appData"), "adf-task-board", "adf-runtime"`。実データ・MCP設定と**完全一致** |

### 安全機構が実際に止まることを確認した

今回の教訓に従い、preflightを**失敗条件を再現して**検証した。特にRC2（pnpm不在）は今回の事故そのものであり、`release/` に触れる前に停止することを実測した。落ちない検証は検証ではない。

## 6. 残るリスク・未検証事項

- **実画面での目視確認は未実施。** この環境からElectronのネイティブウィンドウを操作できないため、`ADF.app` が起動して描画されることをOwnerに確認いただく必要がある。ビルド完走とasar内容の検査までが確認範囲である。
- 開発版が白紙になった事象2は、`out/` の同時書き込みが原因という**推定**である。preflightが同時実行を止めるため再現条件は塞いだが、原因そのものを実証はしていない。
- preflightはmacOS前提（`ps` に依存）。
- コード署名なし（証明書が無いため。従来と同じ）。
- pnpmをグローバル導入した（`npm install -g pnpm`、12.3.4）。マシンへの変更である。
