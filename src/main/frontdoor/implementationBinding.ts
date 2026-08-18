import type { JobRequest } from '../../shared/jobLoopTypes'
import type { ImplementationSourceBinding } from '../../shared/implementationTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import type { AdapterResultEnvelope } from '../jobLoop/resultEnvelope'
import { safeRuntimePath } from './pathIntegrity'

export async function assertImplementationSourceArtifacts(runtimeRoot: string, binding: ImplementationSourceBinding): Promise<void> {
  const result = await readJson<AdapterResultEnvelope>(await safeRuntimePath(runtimeRoot, binding.sourceResultRef))
  if (hashJson(result) !== binding.sourceResultHash || result.taskId !== binding.sourceTaskId || result.jobId !== binding.sourceJobId || result.orchestrationRunId !== binding.parentRunId) throw new Error('Implementation source Result binding changed')

  const evidence = await readJson<Record<string, unknown> & { turns?: Array<Record<string, unknown>> }>(await safeRuntimePath(runtimeRoot, binding.sourceEvidenceRef))
  if (hashJson(evidence) !== binding.sourceEvidenceHash || evidence.threadId !== binding.sourceThreadId || evidence.taskId !== binding.sourceTaskId || evidence.jobId !== binding.sourceJobId || !evidence.turns?.some((turn) => turn.resultEnvelopeRef === binding.sourceResultRef)) throw new Error('Implementation source Evidence binding changed')

  const thread = await readJson<Record<string, unknown> & { turns?: Array<Record<string, unknown>> }>(await safeRuntimePath(runtimeRoot, `threads/${binding.sourceThreadId}/thread.json`))
  if (thread.threadId !== binding.sourceThreadId || thread.taskId !== binding.sourceTaskId || thread.jobId !== binding.sourceJobId || !thread.turns?.some((turn) => turn.resultEnvelopeRef === binding.sourceResultRef && turn.resultEnvelopeHash === binding.sourceResultHash && turn.orchestrationRunId === binding.parentRunId)) throw new Error('Implementation source Thread binding changed')

  const job = await readJson<JobRequest>(await safeRuntimePath(runtimeRoot, `jobs/${binding.sourceJobId}/request.json`))
  if (job.jobId !== binding.sourceJobId || job.task.taskId !== binding.sourceTaskId || job.inputHash !== hashJson(job.task) || job.task.frontdoorBinding?.runId !== binding.parentRunId || job.task.frontdoorBinding?.requestHash !== binding.parentRequestHash || job.task.frontdoorBinding?.planHash !== binding.parentPlanHash || job.task.frontdoorBinding?.nodeId !== binding.sourceNodeId || hashJson(job.task.implementationBinding ?? null) !== hashJson(null)) throw new Error('Implementation source Job binding changed')
}
