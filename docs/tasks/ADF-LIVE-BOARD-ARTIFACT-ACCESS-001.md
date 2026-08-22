# ADF-LIVE-BOARD-ARTIFACT-ACCESS-001

Status: Verifying

## 1. Objective

Live Boardの完了カードから、OwnerがResultとEvidenceを読み取り専用で確認できる導線を追加する。

## 2. Final Flow Contribution

Owner → 窓口AI → ADF → specialist AI → Result / Evidence → Owner確認 → 次の指示、のうち、完了後の証跡確認から次の判断へ進む導線を接続する。

## 3. Vertical Slice Outcome

実Threadが`completed`になったとき、Live Boardの完了カードをクリックすると、Main側でThread・Job・Result hash・Evidence bindingを検証した成果物パネルが開く。承認、送信、Export、正本書込みは発生しない。

## 4. Scope

- 完了した実Threadだけを成果物表示対象にする
- `approved`だがThread未完了のカードは成果物ボタンを表示しない
- Result Envelopeの参照・要約・内容・検証状態・リスクを表示する
- EvidenceリンクのThread/Task/Job bindingとhashを確認して表示する
- Work Planeは通常Conversation Threadの対象外として状態を明示する
- Rendererから任意パスを受け取らず、Thread IDからMainがRuntime参照を解決する

## 5. Out of Scope

- 承認、Dispatch、再送、Export、Completion、Canonical統合
- 任意のRuntime pathをOSで開く機能
- Work Plane artifactの新しいExport機能
- Frontdoor Candidate Reviewの既存挙動変更

## 6. Acceptance Criteria

- [x] 完了した実Threadのカードだけがクリック可能である
- [x] Result EnvelopeはThread/Job/inputHashと保存hashを検証してから表示される
- [x] EvidenceはThread/Task/Job bindingを検証してから表示される
- [x] 欠損、改ざん、path traversalはBrokenとして表示し、開かない
- [x] 承認済みだが未完了のカードに成果物導線を表示しない
- [x] Rendererに任意path読込み・承認書込み・外部送信経路を追加しない
- [x] 既存テスト・typecheck・buildがPassする

## 7. Changed Surfaces

- `src/shared/liveArtifactTypes.ts`
- `src/main/jobLoop/liveArtifacts.ts`
- `src/main/relayService.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/env.d.ts`
- `src/renderer/src/boardProjection.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `tests/liveArtifacts.test.ts`
- `tests/boardProjection.test.ts`
- `tests/externalIpc.test.ts`

## 8. Verification Log

- Independent UI/UX・安全境界レビュー：実施。Live Boardは従来クリック不可であり、Result/EvidenceのMain側検証APIが必要との指摘を採用
- 実装後独立レビュー：P1（completed強制、Evidence各Turn binding）とP2（Result hash欠損、risks未表示、Evidence欠損/重複）を検出。すべて修正し、対象テスト・フル検証を再実施
- `tsc --noEmit -p tsconfig.node.json`：Pass
- `tsc --noEmit -p tsconfig.web.json`：Pass
- `vitest run`：390/390 Pass（実装後レビュー指摘の否定テストを追加）
- `tsc -p tsconfig.cli.json`：Pass
- `electron-vite build`：Pass（Main 264.05 kB / Preload 3.25 kB / Renderer 605.93 kB）
- `git diff --check`：Pass
- `electron-builder --dir`：Pass（同梱NodeをPATHへ追加して実行）。生成物：`release/mac-arm64/ADF Task Board.app`。コード署名は有効なDeveloper ID証明書がないため未署名
- Electron実画面：Pass（2026-08-19、再生成した`release/mac-arm64/ADF Task Board.app`を一時user-dataで再起動）。Live Boardの完了カード「成果物を確認」をネイティブ画面から選択し、Main側検証を通ったResult Envelope／Evidence／Work Planeパネルの表示を確認。旧履歴の不整合証跡は`Broken（参照不可）`として表示され、成功扱いにされないことも確認

## 9. Deferred Details

Work Plane Export済みArtifactの専用閲覧導線と、検証済みRuntime artifactをOSで開く操作は別Taskとする。今回のResult/Evidence確認の縦切りを止めない。
