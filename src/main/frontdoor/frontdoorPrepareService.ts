import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterProfile } from '../../shared/jobLoopTypes'
import type { FrontdoorPrepareInput, FrontdoorPrepareResult, FrontdoorRequest, DecompositionPlan, OrchestrationRun } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import { getAdapterProfile } from '../jobLoop/adapterRegistry'
import { createDecompositionPlan } from './decomposition'
import { createFrontdoorRequest } from './intake'
import { FrontdoorOrchestrator } from './orchestrator'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeInput(value: unknown): FrontdoorPrepareInput {
  if (!isRecord(value) || !isRecord(value.request) || !isRecord(value.plan)) {
    throw new Error('prepare input must contain request and plan objects')
  }
  return { request: value.request as unknown as FrontdoorPrepareInput['request'], plan: value.plan as unknown as FrontdoorPrepareInput['plan'] }
}

function requestBody(request: FrontdoorRequest): FrontdoorPrepareInput['request'] {
  const { state: _state, receivedAt: _receivedAt, inputHash: _inputHash, ...body } = request
  return body
}

function planBody(plan: DecompositionPlan): FrontdoorPrepareInput['plan'] {
  const { planHash: _planHash, ...body } = plan
  return body
}

function assertLocalAdapterPlan(plan: FrontdoorPrepareInput['plan']): void {
  for (const node of plan.nodes) {
    let profile: AdapterProfile
    try {
      profile = getAdapterProfile(node.adapterId)
    } catch (error) {
      throw new Error(`plan adapter rejected for ${node.nodeId}: ${(error as Error).message}`)
    }
    if (profile.status !== 'available') throw new Error(`plan adapter is not available: ${node.adapterId}`)
    if (!profile.roles.includes(node.role)) throw new Error(`plan adapter ${node.adapterId} does not support role ${node.role}`)
    if (profile.dataPolicy !== 'local-only') throw new Error(`plan adapter ${node.adapterId} is outside the local-only Intake boundary`)
    if (!node.capabilities.every((capability) => profile.capabilities.includes(capability))) {
      throw new Error(`plan adapter ${node.adapterId} does not support the capabilities for ${node.nodeId}`)
    }
  }
}

interface ExistingRunRecord {
  run: OrchestrationRun
  request: FrontdoorRequest
  plan: DecompositionPlan
}

async function existingRunForRequest(orchestrator: FrontdoorOrchestrator, requestId: string): Promise<ExistingRunRecord | null> {
  let entries
  try {
    entries = await readdir(path.join(orchestrator.runtimeRoot, 'frontdoor-runs'), { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9._:-]{1,240}$/.test(entry.name) || entry.name.includes('..')) continue
    try {
      const request = await readJson<FrontdoorRequest>(path.join(orchestrator.runtimeRoot, 'frontdoor-runs', entry.name, 'request.json'))
      if (request.requestId !== requestId) continue
      const plan = await readJson<DecompositionPlan>(path.join(orchestrator.runtimeRoot, 'frontdoor-runs', entry.name, 'plan.json'))
      return { run: await orchestrator.getRun(entry.name), request, plan }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return null
}

export async function prepareFrontdoorRunOrThrow(orchestrator: FrontdoorOrchestrator, value: unknown): Promise<FrontdoorPrepareResult> {
  const input = normalizeInput(value)
  const request = createFrontdoorRequest(input.request)
  const plan = createDecompositionPlan(request, input.plan)
  assertLocalAdapterPlan(input.plan)

  const existing = await existingRunForRequest(orchestrator, request.requestId)
  if (existing) {
    if (hashJson(requestBody(existing.request)) !== hashJson(input.request)) throw new Error(`requestId already exists with different Request content: ${request.requestId}`)
    if (hashJson(planBody(existing.plan)) !== hashJson(input.plan)) throw new Error(`requestId already exists with different Plan content: ${request.requestId}`)
    return { run: existing.run, reused: true }
  }

  return { run: await orchestrator.createRun(input.request, input.plan), reused: false }
}

export function prepareIdentity(input: FrontdoorPrepareInput): string {
  return hashJson({ request: input.request, plan: input.plan })
}
