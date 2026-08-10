import type { ApprovedTaskPacket, DebateArtifact } from '../../shared/jobLoopTypes'
import { hashJson } from './hash'

export interface ProposalInput {
  task: ApprovedTaskPacket
  inputHash: string
  createdAt: string
}
export interface CriticInput extends ProposalInput {
  priorArtifact: DebateArtifact
}

export class FakeProposalAdapter {
  readonly id = 'fake-ai-a'
  readonly role = 'proposal' as const

  run({ task, inputHash, createdAt }: ProposalInput): DebateArtifact {
    return {
      artifactId: `artifact-${this.id}-${hashJson(inputHash).slice(0, 10)}`,
      adapter: this.id,
      role: this.role,
      status: task.fixtureMode === 'failed' ? 'failed' : 'success',
      createdAt,
      proposal: `提案: ${task.objective}。承認範囲とhashを検証し、A/BのResultをEvidenceとしてOwner Reviewへ送る。`,
      changes: [],
      verification: [{ name: 'scope-boundary', status: 'pass' }]
    }
  }
}

export class FakeCriticAdapter {
  readonly id = 'fake-ai-b'
  readonly role = 'critic' as const

  run({ task, inputHash, priorArtifact, createdAt }: CriticInput): DebateArtifact {
    return {
      artifactId: `artifact-${this.id}-${hashJson(inputHash).slice(0, 10)}`,
      adapter: this.id,
      role: this.role,
      status: task.fixtureMode === 'invalid' ? 'invalid' : 'success',
      createdAt,
      respondsToArtifact: priorArtifact.artifactId,
      respondsToHash: hashJson(priorArtifact),
      critique: `反論: 提案AはResultをOwner Reviewへ送る点は妥当だが、${task.fixtureMode === 'partial' ? 'partial Resultを成功と混同しない表示' : 'Resultの不正混入と重複dispatchの検証'}を追加すべきである。`,
      changes: [],
      verification: [{ name: 'prior-result-reference', status: 'pass' }]
    }
  }
}
