import path from 'node:path'
import type { ApprovedTaskPacket, BoardProjection, DebateArtifact, DebateResult, DispatchState, JobEvent, JobRecord, JobRequest, JobState } from '../../shared/jobLoopTypes'
import { assertTransition, createDispatchKey, validateApprovedTask } from './contracts'
import { createDispatchPacket, DispatchBlockedError, type DispatchReceiver, FakeDispatchReceiver, validateDispatchAck } from './dispatchAck'
import { validateAdapterPlan } from './adapterRegistry'
import { validateResultEnvelope, type AdapterResultEnvelope } from './resultEnvelope'
import { hashJson } from './hash'
import { appendEvent, ensureDir, listJobIds, readEvents, readJson, writeJsonAtomic } from './ledger'
import { FakeCriticAdapter, FakeProposalAdapter } from './fakeAdapters'

export interface JobRuntimeAdapters {
  proposal: FakeProposalAdapter
  critic: FakeCriticAdapter
}

export interface JobRegistration {
  jobId: string
  directory: string
  inputHash: string
  createdAt: string
  alreadyRegistered: boolean
}

export interface JobRuntimeOptions {
  runtimeRoot?: string
  clock?: () => Date
  adapters?: Partial<JobRuntimeAdapters>
  receiver?: DispatchReceiver
}

export class JobRuntime {
  readonly runtimeRoot: string
  readonly clock: () => Date
  readonly adapters: JobRuntimeAdapters
  readonly receiver: DispatchReceiver

  constructor({ runtimeRoot = '.adf-runtime', clock = () => new Date(), adapters = {} as Partial<JobRuntimeAdapters>, receiver = new FakeDispatchReceiver() }: JobRuntimeOptions = {}) {
    this.runtimeRoot = path.resolve(runtimeRoot)
    this.clock = clock
    this.receiver = receiver
    this.adapters = {
      proposal: adapters.proposal ?? new FakeProposalAdapter(),
      critic: adapters.critic ?? new FakeCriticAdapter()
    }
  }

  jobDirectory(jobId: string): string {
    return path.join(this.runtimeRoot, 'jobs', jobId)
  }

  /**
   * Runs Approval, Dispatch Packet, ACK and Job registration, then stops at `queued`.
   * Callers that drive their own Adapter execution (the Conversation Relay) reuse this gate
   * instead of registering a Job of their own.
   */
  async registerApprovedJob(packet: ApprovedTaskPacket): Promise<JobRegistration> {
    validateApprovedTask(packet, this.clock())
    const dispatchKey = createDispatchKey(packet)
    const jobId = `job-${dispatchKey.slice(0, 16)}`
    const directory = this.jobDirectory(jobId)
    const requestPath = path.join(directory, 'request.json')
    if (await this.exists(requestPath)) {
      const existing = await readJson<JobRequest>(requestPath)
      return { jobId, directory, inputHash: existing.inputHash, createdAt: existing.createdAt, alreadyRegistered: true }
    }

    const dispatchPacket = createDispatchPacket(packet)
    const dispatchAck = this.receiver.receive(dispatchPacket)
    validateDispatchAck(dispatchPacket, dispatchAck)
    if (!dispatchAck) throw new DispatchBlockedError(['ack is missing'])
    validateAdapterPlan(packet.adapterPlan)

    const createdAt = this.clock().toISOString()
    const task: JobRequest['task'] = {
      taskId: packet.taskId,
      objective: packet.objective,
      scope: packet.scope,
      scopeHash: packet.scopeHash,
      context: packet.context,
      contextHash: packet.contextHash,
      acceptance: packet.acceptance,
      stopConditions: packet.stopConditions,
      adapter: packet.adapter,
      fixtureMode: packet.fixtureMode,
      target: packet.target,
      adapterPlan: packet.adapterPlan
    }
    const inputHash = hashJson(task)
    const request: JobRequest = { jobId, dispatchKey, inputHash, createdAt, task }
    await ensureDir(directory)
    await writeJsonAtomic(path.join(directory, 'dispatch-packet.json'), dispatchPacket)
    await writeJsonAtomic(path.join(directory, 'dispatch-ack.json'), dispatchAck)
    await writeJsonAtomic(path.join(directory, 'adapter-plan.json'), packet.adapterPlan)
    await this.record(directory, { type: 'dispatch.sent', dispatchState: 'dispatched', dispatchId: dispatchPacket.dispatchId, packetHash: dispatchPacket.packetHash, taskId: packet.taskId, at: createdAt })
    await this.record(directory, { type: 'dispatch.acknowledged', dispatchState: 'acknowledged', dispatchId: dispatchPacket.dispatchId, packetHash: dispatchPacket.packetHash, taskId: packet.taskId, at: dispatchAck.receivedAt })
    await this.record(directory, { type: 'dispatch.preflight-valid', dispatchState: 'preflight-valid', dispatchId: dispatchPacket.dispatchId, packetHash: dispatchPacket.packetHash, taskId: packet.taskId, at: this.clock().toISOString() })
    await writeJsonAtomic(requestPath, request)
    await writeJsonAtomic(path.join(directory, 'approval.json'), packet.approval)
    await writeJsonAtomic(path.join(directory, 'context-manifest.json'), { taskId: packet.taskId, contextHash: packet.contextHash, references: packet.context })
    await this.record(directory, { type: 'job.registered', jobId, taskId: packet.taskId, state: 'queued', at: createdAt })
    return { jobId, directory, inputHash, createdAt, alreadyRegistered: false }
  }

  async runApprovedTask(packet: ApprovedTaskPacket): Promise<JobRecord> {
    const { jobId, directory, inputHash, createdAt, alreadyRegistered } = await this.registerApprovedJob(packet)
    if (alreadyRegistered) return this.readJob(jobId)
    await this.transition(directory, 'queued', 'running', { type: 'job.started' })

    const proposal = this.adapters.proposal.run({ task: packet, inputHash, createdAt: this.clock().toISOString() })
    await this.recordAdapter(directory, proposal)
    const critique = this.adapters.critic.run({ task: packet, inputHash, priorArtifact: proposal, createdAt: this.clock().toISOString() })
    await this.recordAdapter(directory, critique)

    const result = this.buildResult(packet, jobId, inputHash, proposal, critique, createdAt)
    await writeJsonAtomic(path.join(directory, 'result.json'), result)
    await writeJsonAtomic(path.join(directory, 'adapter-results.json'), result.adapterRuns)
    await writeJsonAtomic(path.join(directory, 'evidence-links.json'), {
      taskId: packet.taskId,
      githubTask: packet.context.githubTask,
      obsidianContext: packet.context.obsidianContext,
      artifacts: [proposal.artifactId, critique.artifactId],
      resultHash: hashJson(result)
    })
    await this.record(directory, { type: 'result.recorded', jobId, taskId: packet.taskId, status: result.status, resultHash: hashJson(result), at: this.clock().toISOString() })
    const terminalState: JobState = result.status === 'success' || result.status === 'partial' ? 'awaiting-review' : 'failed'
    await this.transition(directory, 'running', terminalState, { type: `job.${terminalState}` })
    await this.projectBoard()
    return this.readJob(jobId)
  }

  buildResult(packet: ApprovedTaskPacket, jobId: string, inputHash: string, proposal: DebateArtifact, critique: DebateArtifact, createdAt: string): DebateResult {
    let status = packet.fixtureMode
    const errors: string[] = []
    if (!proposal?.artifactId || !critique?.artifactId) errors.push('artifact id is missing')
    if (proposal?.status === 'invalid' || critique?.status === 'invalid') errors.push('adapter returned invalid status')
    if (errors.length) status = 'invalid'
    for (const artifact of [proposal, critique]) {
      const envelope: AdapterResultEnvelope = {
        resultId: artifact.artifactId,
        jobId,
        taskId: packet.taskId,
        adapterId: artifact.adapter,
        role: artifact.role,
        inputHash,
        scopeHash: packet.scopeHash,
        contextHash: packet.contextHash,
        status: artifact.status,
        content: artifact.proposal ?? artifact.critique ?? `${artifact.role} result`,
        summary: artifact.proposal ?? artifact.critique ?? `${artifact.role} result`,
        artifact: { artifactId: artifact.artifactId, changes: artifact.changes },
        verification: artifact.verification.map((item) => ({ name: item.name, status: item.status })),
        risks: [],
        ownerDecisionRequired: true,
        nextOwnerDecision: 'Review this adapter result',
        createdAt: artifact.createdAt,
        durationMs: 0,
        terminationReason: artifact.status === 'success' ? 'completed' : 'fake-fixture-failure'
      }
      validateResultEnvelope(envelope, { taskId: packet.taskId, jobId, inputHash })
    }
    return {
      resultId: `result-${jobId}`,
      jobId,
      taskId: packet.taskId,
      status,
      inputHash,
      scopeHash: packet.scopeHash,
      contextHash: packet.contextHash,
      adapter: packet.adapter,
      adapterPlan: packet.adapterPlan,
      adapterRuns: [
        {
          resultId: proposal.artifactId,
          adapterId: proposal.adapter,
          role: proposal.role,
          inputHash,
          resultHash: hashJson(proposal),
          status: proposal.status,
          artifactId: proposal.artifactId,
          terminationReason: proposal.status === 'success' ? 'completed' : 'fake-fixture-failure',
          createdAt: proposal.createdAt
        },
        {
          resultId: critique.artifactId,
          adapterId: critique.adapter,
          role: critique.role,
          inputHash,
          resultHash: hashJson(critique),
          status: critique.status,
          artifactId: critique.artifactId,
          terminationReason: critique.status === 'success' ? 'completed' : 'fake-fixture-invalid',
          createdAt: critique.createdAt
        }
      ],
      role: 'debate-run',
      createdAt,
      debate: {
        rounds: 1,
        participants: [
          { adapter: proposal.adapter, role: proposal.role, artifactId: proposal.artifactId, hash: hashJson(proposal) },
          { adapter: critique.adapter, role: critique.role, artifactId: critique.artifactId, hash: hashJson(critique), respondsToHash: critique.respondsToHash }
        ],
        proposal: proposal.proposal,
        critique: critique.critique
      },
      changes: [],
      verification: [
        { name: 'task-scope', status: 'pass', scopeHash: packet.scopeHash },
        { name: 'context-reference', status: 'pass', contextHash: packet.contextHash },
        { name: 'fake-adapter-boundary', status: 'pass', capabilities: ['read', 'propose'] },
        ...(errors.length ? [{ name: 'result-shape', status: 'fail', reason: errors.join('; ') }] : [{ name: 'result-shape', status: 'pass' }])
      ],
      risks: status === 'partial' ? ['partial Resultの採用可否はOwner判断が必要'] : status === 'failed' || status === 'invalid' ? ['Fake討論Resultは採用せず、原因を確認する'] : [],
      ownerDecisionRequired: true,
      nextOwnerDecision: status === 'success' ? 'Aの提案とBの反論を確認し、採用・差し戻し・停止を判断する' : 'Resultと失敗理由を確認し、再実行または停止を判断する'
    }
  }

  async record(directory: string, event: JobEvent): Promise<void> {
    await appendEvent(path.join(directory, 'events.jsonl'), event)
  }

  async recordAdapter(directory: string, artifact: DebateArtifact): Promise<void> {
    await this.record(directory, { type: 'adapter.result', adapter: artifact.adapter, role: artifact.role, artifactId: artifact.artifactId, resultHash: hashJson(artifact), at: this.clock().toISOString() })
  }

  async transition(directory: string, from: JobState, to: JobState, details: Pick<JobEvent, 'type'>): Promise<void> {
    assertTransition(from, to)
    await this.record(directory, { ...details, from, to, at: this.clock().toISOString() })
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await readJson(filePath)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  async readJob(jobId: string): Promise<JobRecord> {
    const directory = this.jobDirectory(jobId)
    const events = await readEvents(path.join(directory, 'events.jsonl'))
    const request = await readJson<JobRequest>(path.join(directory, 'request.json'))
    const result = await this.exists(path.join(directory, 'result.json')) ? await readJson<DebateResult>(path.join(directory, 'result.json')) : null
    const transition = [...events].reverse().find((event) => event.to)
    const state = (transition?.to ?? [...events].reverse().find((event) => event.state)?.state ?? 'queued') as JobState
    const dispatchState = ([...events].reverse().find((event) => event.dispatchState)?.dispatchState ?? 'preflight-valid') as DispatchState
    const packetHash = ([...events].reverse().find((event) => event.packetHash)?.packetHash as string | undefined) ?? hashJson(request.task)
    return { jobId, state, request, events, result, dispatchState, packetHash }
  }

  async projectBoard(): Promise<BoardProjection> {
    const jobs: JobRecord[] = []
    for (const jobId of await listJobIds(this.runtimeRoot)) jobs.push(await this.readJob(jobId))
    const cards = jobs.map((job) => ({
      taskId: job.request.task.taskId,
      jobId: job.jobId,
      objective: job.request.task.objective,
      boardLane: job.state === 'awaiting-review' ? 'owner-review' as const : job.state,
      formalLifecycle: 'Approved / implementation result not yet adopted',
      ownerDecision: job.result?.nextOwnerDecision ?? 'Job状態と停止理由を確認する',
      resultStatus: job.result?.status ?? null,
      evidence: job.result ? `jobs/${job.jobId}/evidence-links.json` : null,
      taskReference: job.request.task.context.githubTask,
      contextReferences: job.request.task.context.obsidianContext,
      lastUpdated: job.events.at(-1)?.at ?? null,
      sourceState: 'Current' as const,
      dispatchState: job.dispatchState,
      packetHash: job.packetHash
    }))
    const projection: BoardProjection = { generatedAt: this.clock().toISOString(), source: 'ADF Local Ledger', readOnly: true, cards }
    await writeJsonAtomic(path.join(this.runtimeRoot, 'projection', 'board.json'), projection)
    return projection
  }

  async readBoard(): Promise<BoardProjection> {
    return readJson<BoardProjection>(path.join(this.runtimeRoot, 'projection', 'board.json'))
  }
}
