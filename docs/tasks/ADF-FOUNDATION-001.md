# Task — ADF-FOUNDATION-001: 読み取り専用Control Plane Foundationを実装する

> Type: Implementation
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [Foundation設計](../design/ADF_CONTROL_PLANE_FOUNDATION.md) / [Current State](../project/CURRENT_STATE.md)

## Objective

将来の複数AI管制に共通するRegistry、Grant、Job、Artifact、Integration Gateを、外部接続や権限付与なしに固定Snapshotとして可視化する。

## Scope

- In scope: 型、純粋なdeny-by-default policy、固定Snapshot、既存Boardへの読み取り表示、固定sourceId、unit test、Task/設計/Current State/Obsidian記録。
- Out of scope: API/CLI/Adapter接続、認証、秘密情報、外部送信、課金、DB、実行/承認/取消/再試行、正本書込み、commit、push。

## Approval

- Project Ownerは2026-08-04に`ADF-FOUNDATION-001 設計OK`と明示した。本Taskの読み取り専用実装を承認済みと扱う。
- 新規依存、外部送信、認証、費用、実行・書込み機能が必要になれば停止して別承認を求める。

## Plan

1. 既存Electron権限境界を変更せず、Foundation表示型とdeny policyを追加する。
2. 手動確認済みの固定Snapshotを表示し、既存allow-list sourceIdへリンクする。
3. Grant、子Job、外部送信の負のtestを追加し、型検査・test・build・手動表示を実施する。

## Verification

| 種別 | 内容 | 結果 |
| --- | --- | --- |
| 自動 | typecheck / unit test / build | Pass（11 tests） |
| 手動 | packageまたはlocal appでFoundation表示とEvidenceリンクを確認 | Not run |
| 静的 | `git diff --check`、IPC/network/write API追加なしを照合 | Pass（既存`openCanonicalSource`以外のIPC追加なし） |

## Handover

Project Ownerの差分・検証レビューを完了した。package済みアプリのFoundation表示とEvidenceリンクの実機確認、実行時通信のパケット観測、署名・notarizationは未実施である。次の安全な一手は、外部Reviewerを実行するか、Adapterのread-only試験を設計するかを別承認で選ぶ。

## Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 |
| --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-FOUNDATION-001 設計OK` | 2026-08-04 |
| Diff / Verification | Approved | `ADF-FOUNDATION-001 レビューOK` | 2026-08-04 |
| 残存リスク | Accepted | 実機表示、通信観測、署名は後続検証。接続・送信・実行は未導入 | 2026-08-04 |
