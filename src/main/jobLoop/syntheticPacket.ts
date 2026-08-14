import type { AdapterRole } from '../../shared/jobLoopTypes'
import type { SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { ConversationThread } from '../../shared/threadTypes'
import { hashJson } from './hash'

export class PacketBoundaryError extends Error {
  readonly code = 'PACKET_BOUNDARY_VIOLATION'
  readonly details: string[]
  constructor(details: string[]) {
    super(`Synthetic packet boundary violated: ${details.join('; ')}`)
    this.details = details
  }
}

const instruction = [
  'これはAI開発運用基盤(ADF)の接続確認用の合成パケットである。実プロジェクトの作業依頼ではない。',
  '次の3点だけを日本語200文字以内で答えること。',
  '1) このパケットを受信したこと',
  '2) 与えられた役割名',
  '3) 追加の文脈を要求せずに応答を終えること',
  'ファイル、リポジトリ、URL、コマンド実行、外部参照を要求してはならない。'
].join('\n')

const resultFormat = 'プレーンテキスト。200文字以内。コードブロック・ツール呼び出し・追加質問を含めない。'

const stopConditions = [
  '追加の文脈やファイルを要求された場合は停止する',
  '応答が200文字を超える場合は切り詰めて記録する',
  '所定の時間内に応答が無い場合はtimeoutとして停止する'
]

/**
 * Builds the one payload an external Adapter may receive. Derived only from identifiers and
 * fixed text: no Turn content, no repo, no Vault, no approved-Task body.
 */
export function buildSyntheticPacket(thread: ConversationThread, role: AdapterRole, attempt: number, createdAt: string): SyntheticPacket {
  const body = {
    kind: 'synthetic-connectivity-probe' as const,
    taskId: thread.taskId,
    threadId: thread.threadId,
    jobId: thread.jobId,
    role,
    sequence: thread.turns.length,
    attempt,
    scopeHash: thread.scopeHash,
    contextHash: thread.contextHash,
    instruction,
    resultFormat,
    stopConditions
  }
  const packetHash = hashJson(body)
  return { ...body, packetId: `synthetic-${packetHash.slice(0, 16)}`, packetHash, createdAt }
}

/** Anything that could smuggle project content, a filesystem path, or a credential out of ADF. */
const forbiddenPatterns: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'absolute-path', pattern: /(^|[^A-Za-z0-9])\/(Users|home|var|etc|private)\// },
  { name: 'home-shortcut', pattern: /(^|\s)~\// },
  { name: 'vault-reference', pattern: /secondbrain|Obsidian|\.md\b/i },
  { name: 'repo-reference', pattern: /\.git\b|github\.com|worktree/i },
  { name: 'credential-like', pattern: /sk-[A-Za-z0-9-]{8,}|ANTHROPIC_API_KEY|api[_-]?key|bearer\s|authorization/i },
  { name: 'url', pattern: /https?:\/\//i }
]

/**
 * Fails closed before any transport sees the packet. The packet is fixed text, so a hit here means
 * something started assembling it from real content and the send must not happen.
 */
export function assertPacketBoundary(packet: SyntheticPacket): void {
  const serialised = JSON.stringify(packet)
  const details = forbiddenPatterns.filter((rule) => rule.pattern.test(serialised)).map((rule) => `packet contains ${rule.name}`)
  if (packet.kind !== 'synthetic-connectivity-probe') details.push('packet is not a synthetic connectivity probe')
  if (packet.packetHash !== hashJson({ kind: packet.kind, taskId: packet.taskId, threadId: packet.threadId, jobId: packet.jobId, role: packet.role, sequence: packet.sequence, attempt: packet.attempt, scopeHash: packet.scopeHash, contextHash: packet.contextHash, instruction: packet.instruction, resultFormat: packet.resultFormat, stopConditions: packet.stopConditions })) {
    details.push('packet hash does not match its content')
  }
  if (serialised.length > 4000) details.push(`packet is larger than the 4000 character probe limit: ${serialised.length}`)
  if (details.length) throw new PacketBoundaryError(details)
}
