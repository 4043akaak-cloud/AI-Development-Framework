# ADF Current State

> Last updated: 2026-08-03

## 現在地

協働憲章、Task Lifecycle、正本作業コピー規約、基本テンプレートは整備済み。現在は、CodexとProject Ownerだけで最小の運用ループを検証するPhase 0である。

## 次のTask

[`ADF-PILOT-001`](../tasks/ADF-PILOT-001.md): `Done`。AI Task Packetを使ったPreflightのContext・Plan・停止条件、およびProject Ownerの承認を記録済み。これは3件完走の1件には数えない。

[`ADF-PILOT-002`](../tasks/ADF-PILOT-002.md): `Done`。Phase 0とPhase 1以降のGitHub運用記述を明確に分け、静的・手動検証をPass。Project Ownerの実装差分レビューも承認済み。Codex単独パイロットの実証Taskは3件中1件を完走した。

[`ADF-PILOT-003`](../tasks/ADF-PILOT-003.md): `Done`。READMEの初回導線を現行のProject正本へ修正し、静的・手動検証とProject Ownerの実装差分レビューを承認済み。Codex単独パイロットの実証Taskは3件中2件を完走した。

[`ADF-PROBE-001`](../tasks/ADF-PROBE-001.md): 役割分離Codexプローブの実験記録を提出済み。Phase 0.5は、Phase 0の3件完走を置き換えない。

## 未実施・阻害要因

- Codex単独パイロットは、3件の実証Taskのうち2件を完走した。最後の1件はProject Ownerが別途選定・承認するまで開始しない。
- 独立AIレビュー、外部API、自動モデル選定は未導入である。
- OpenRouterのアカウント、APIキー、予算、データ方針は未設定であり、このPhaseでは不要である。

## 正本と参照先

- GitHub: Task、承認、変更、検証、Current State
- Obsidian: 理念、背景、長い調査、判断理由、学び
- 現行手順: [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
