import type { AdapterRole } from '../../shared/jobLoopTypes'
import type { AdapterDependencyResult, AdapterRunState, ConversationTurn, RelayTurnPayload } from '../../shared/threadTypes'
import { hashJson } from './hash'

export type { AdapterDependencyResult } from '../../shared/threadTypes'

/** What the Relay hands an Adapter. Contains only approved Thread context, never secrets. */
export interface AdapterRequest {
  dispatchId: string
  taskId: string
  threadId: string
  jobId: string
  title: string
  role: AdapterRole
  sequence: number
  priorTurns: readonly ConversationTurn[]
  /** Optional provenance an Adapter may record. Local Fake Adapters ignore these. */
  attempt?: number
  inputHash?: string
  scopeHash?: string
  contextHash?: string
  orchestrationRunId?: string
  /** Evidence references from completed dependency Nodes; content is never injected implicitly. */
  dependencyResults?: readonly AdapterDependencyResult[]
}


/** What an Adapter returns from `send`. An external Adapter may carry its own conversation id. */
export interface AdapterAcceptance {
  dispatchId: string
  adapterId: string
  adapterConversationId: string
  acceptedAt: string
}

/**
 * The Adapter contract. `send` and `receive` are separate so an out-of-process AI can accept a
 * request now and answer later; `getState` lets the Relay poll before an answer exists. A real
 * external Adapter implements these three over CLI/API without changing Thread or Relay code.
 */
export interface ConversationAdapter {
  readonly adapterId: string
  /** Primary role kept for backward compatibility with single-role adapters. */
  readonly role: AdapterRole
  /** Optional additional roles supported by the same provider-neutral Adapter instance. */
  readonly supportedRoles?: readonly AdapterRole[]
  send(request: AdapterRequest): Promise<AdapterAcceptance>
  getState(acceptance: AdapterAcceptance): Promise<AdapterRunState>
  receive(acceptance: AdapterAcceptance): Promise<RelayTurnPayload>
  /** Aborts an in-flight send. Local in-process Adapters have nothing to abort and omit it. */
  cancel?(dispatchId: string, reason?: string): boolean
}

export function adapterSupportsRole(adapter: ConversationAdapter, role: AdapterRole): boolean {
  return (adapter.supportedRoles ?? [adapter.role]).includes(role)
}

export class AdapterProtocolError extends Error {
  readonly code = 'ADAPTER_PROTOCOL_ERROR'
  constructor(message: string) {
    super(message)
  }
}

/** Shared in-process behaviour for the Fake Adapters: answer immediately, keep the 3-step contract. */
abstract class InProcessConversationAdapter implements ConversationAdapter {
  abstract readonly adapterId: string
  abstract readonly role: AdapterRole

  private readonly answers = new Map<string, RelayTurnPayload>()

  protected abstract compose(request: AdapterRequest): RelayTurnPayload

  async send(request: AdapterRequest): Promise<AdapterAcceptance> {
    if (request.role !== this.role) throw new AdapterProtocolError(`adapter ${this.adapterId} cannot take role ${request.role}`)
    const adapterConversationId = `${this.adapterId}:${request.threadId}:${request.sequence}`
    this.answers.set(adapterConversationId, this.compose(request))
    return { dispatchId: request.dispatchId, adapterId: this.adapterId, adapterConversationId, acceptedAt: new Date().toISOString() }
  }

  async getState(acceptance: AdapterAcceptance): Promise<AdapterRunState> {
    return this.answers.has(acceptance.adapterConversationId) ? 'ready' : 'failed'
  }

  async receive(acceptance: AdapterAcceptance): Promise<RelayTurnPayload> {
    const answer = this.answers.get(acceptance.adapterConversationId)
    if (!answer) throw new AdapterProtocolError(`no pending answer for ${acceptance.adapterConversationId}`)
    this.answers.delete(acceptance.adapterConversationId)
    return answer
  }
}

export class FakeProposalConversationAdapter extends InProcessConversationAdapter {
  readonly adapterId = 'fake-ai-a'
  readonly role = 'proposal' as const

  constructor(private readonly fixture: RelayTurnPayload['status'] = 'success') {
    super()
  }

  protected compose({ title, priorTurns }: AdapterRequest): RelayTurnPayload {
    const round = priorTurns.filter((turn) => turn.adapterId === this.adapterId).length + 1
    const critique = [...priorTurns].reverse().find((turn) => turn.role === 'critic')
    const content = critique
      ? `再提案${round}: 反論「${critique.content}」を受け、承認済みScope内で対応方針を絞り込む。`
      : `提案${round}: ${title}について、承認済みScopeとhashを検証したうえで最小の実装方針を出す。`
    return {
      content,
      status: this.fixture,
      summary: `Fake提案 ${round} 件目`,
      verification: [{ name: 'scope-boundary', status: 'pass' }],
      risks: this.fixture === 'partial' ? ['partial Resultの採用可否はOwner判断が必要'] : [],
      ...(this.fixture === 'partial' ? { questions: [{ kind: 'approval-required' as const, text: 'partial Resultを採用して次のNodeへ進めるかOwner判断が必要です。', required: true, blocking: true }] } : {})
    }
  }
}

export class FakeCriticConversationAdapter extends InProcessConversationAdapter {
  readonly adapterId = 'fake-ai-b'
  readonly role = 'critic' as const

  constructor(private readonly fixture: RelayTurnPayload['status'] = 'success') {
    super()
  }

  protected compose({ priorTurns, dependencyResults }: AdapterRequest): RelayTurnPayload {
    const target = [...priorTurns].reverse().find((turn) => turn.role === 'proposal')
    const dependency = dependencyResults?.[0]
    const round = priorTurns.filter((turn) => turn.adapterId === this.adapterId).length + 1
    const content = target
      ? `反論${round}: 提案「${target.content}」は停止条件とResult検証の記述が不足しているため、失敗系の扱いを明示すべきである。`
      : dependency
        ? `反論${round}: 依存Node「${dependency.nodeId}」のResult（${dependency.resultRef}）を受け、停止条件とResult検証を確認した。`
        : `反論${round}: 対象となる提案が存在しないため評価できない。`
    return {
      content,
      status: this.fixture,
      summary: `Fake反論 ${round} 件目`,
      verification: [{ name: 'prior-turn-reference', status: target || dependency ? 'pass' : 'not-run' }],
      risks: target || dependency ? [] : ['評価対象の提案が存在しない']
    }
  }
}

/** Candidate probe used by the Implementation Agent vertical slice; it never writes files. */
export class FakeImplementationConversationAdapter extends InProcessConversationAdapter {
  readonly adapterId = 'fake-implementation'
  readonly role = 'implementation' as const

  protected compose({ title }: AdapterRequest): RelayTurnPayload {
    const sourceFile = { relativePath: 'candidate/README.md', content: `候補: ${title}` }
    const files = [{ ...sourceFile, contentHash: hashJson(sourceFile.content) }]
    const candidate = {
      kind: 'candidate-file-set' as const,
      baseSnapshotHash: hashJson({ title }),
      files,
      candidateHash: hashJson({ kind: 'candidate-file-set', baseSnapshotHash: hashJson({ title }), files })
    }
    return {
      content: JSON.stringify(candidate),
      status: 'success',
      summary: 'Fake implementation candidate',
      artifact: candidate,
      verification: [{ name: 'candidate-schema', status: 'pass' }],
      risks: ['Fake candidate only; semantic implementation review is separate']
    }
  }
}
