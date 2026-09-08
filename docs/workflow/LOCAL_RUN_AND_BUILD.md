# ADF のローカル起動とビルド

> Status: Active
> Date: 2026-09-09
> 関連Task: [ADF-LOCAL-RUN-SAFETY-001](../tasks/ADF-LOCAL-RUN-SAFETY-001.md)

## 1. アプリはひとつ

ADFのアプリは **`ADF`** ひとつである。起動方法が2通りあるだけで、別のアプリではない。

| 起動方法 | 実体 | ウィンドウ名 | 用途 |
| --- | --- | --- | --- |
| `npm run build` の生成物 | `release/mac-arm64/ADF.app` | `ADF` | 通常の利用 |
| `npm run dev` | `node_modules/electron` が現ソースを実行 | `ADF（開発版）` | コード変更の確認 |

2026-09-08まで、どちらも `ADF Task Board` を名乗り区別がつかなかった。現在は開発版のタイトルに「（開発版）」が付くため、画面上で必ず見分けられる。

## 2. 同時に起動しない

**両者は同じデータを読み書きする。** runtime rootは `~/Library/Application Support/adf-task-board/adf-runtime` に固定されており、どちらの起動方法でも同じ場所を指す。MCPサーバーも `--runtime-root` で同じ場所を渡される。

同時起動は、2プロセスが1つのEvent Ledgerへ書く状態を作る。`npm run dev` と `npm run build` も、どちらも `out/` へ書くため同時に走らせない。

preflightがこれらを検出して停止する。手で気をつける必要はない。

## 3. 通常の手順

```bash
# 開発版で確認する
npm run dev

# パッケージを作り直す（開発版を止めてから）
npm run build
```

`npm run build` は次の順で走る。

```text
preflight  →  backup-release  →  electron-vite build  →  electron-builder
```

## 4. runtime root を移動させない

`src/main/index.ts` の `runtimeRootPath()` は、ディレクトリ名 `adf-task-board` を**リテラルで固定**している。アプリの表示名からは導出しない。

以前は `app.getPath('userData')` を使っていた。これはアプリ名に依存するため、`productName` を変えるだけで全Runが見えなくなり、しかもMCPサーバーは `--runtime-root` で旧パスを渡され続けるので、**2つの入口が別々のデータを見る**状態になりえた。表示名の変更でデータが動いてはならない。

隔離した runtime で動かす場合は環境変数 `ADF_RUNTIME_ROOT` を使う。既定値は変えない。

## 5. パッケージマネージャ

このリポジトリは **pnpm** で管理されている（`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`node_modules/.pnpm`）。

electron-builderはlockfileからpnpmを検出して呼び出す。**pnpmが無いとビルドは失敗するが、失敗するのは `release/` を消したあとである。** preflightがこれを事前に止める。

```bash
npm install -g pnpm
```

## 6. 失敗した場合

`release/.backups/<timestamp>/` に直前のパッケージが最大3世代残っている。ビルドが壊れたら、そこから戻せる。

```bash
ls release/.backups/
cp -R "release/.backups/<timestamp>/ADF.app" release/mac-arm64/
```

`release/` は `.gitignore` 対象なので、Gitからは復元できない。バックアップはこの仕組みだけが持っている。

## 7. この文書ができた理由

2026-09-08、パッケージ版が起動している状態で `npm run dev` を案内し、続けて `npm run build` を実行した。結果として次が同時に起きた。

1. 同名のウィンドウが2つ並び、どちらが何か判別できなくなった
2. `npm run dev` の最中に `npm run build` が `out/` を上書きした
3. electron-builderが `release/mac-arm64/` を消したあと `spawn pnpm ENOENT` で失敗し、**8月27日ビルドの `ADF Task Board.app` が失われた**

3件とも、事前に確認すれば防げた。しかし「事前に確認する」は今回まさに機能しなかった対策である。したがってpreflightとbackupという**機構**に置き換えた。詳細は[ADF-LOCAL-RUN-SAFETY-001](../tasks/ADF-LOCAL-RUN-SAFETY-001.md)。
