import path from 'node:path'
import { ConversationRelay } from '../main/jobLoop/relay'
import { ExternalConversationAdapter } from '../main/jobLoop/externalAdapter'
import { getAdapterProfile } from '../main/jobLoop/adapterRegistry'
import { hashJson } from '../main/jobLoop/hash'
import { OllamaLocalHttpTransport, checkOllamaReadiness, defaultOllamaBaseUrl, defaultOllamaModel } from '../main/jobLoop/ollamaTransport'
import type { ExternalTransport } from '../main/jobLoop/externalTransport'
import { readJson } from '../main/jobLoop/ledger'
import type { AdapterProfile, AdapterRole, ApprovedTaskPacket } from '../shared/jobLoopTypes'

export class OllamaDispatchBoundaryError extends Error {
  readonly code = 'OLLAMA_DISPATCH_BOUNDARY_REJECTED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`explicit dispatch rejected: ${details.join('; ')}`)
    this.details = details
  }
}

/**
 * Fail-closed, before any send: proves the Task Packet actually approved this explicit adapterId for
 * this role, that its approval is not stale/tampered, and that the Registry/Transport agree on what
 * kind of connection this is. Defense-in-depth alongside relay.ts's own Plan-membership check — this
 * one runs even earlier, against the raw Packet, before a Thread or Relay instance exists at all.
 */
export function assertExplicitDispatchIsApproved(input: {
  packet: ApprovedTaskPacket
  adapterId: string
  role: AdapterRole
  profile: AdapterProfile
  transport: ExternalTransport
}): void {
  const { packet, adapterId, role, profile, transport } = input
  const errors: string[] = []

  if (packet.approval.routingPlanHash !== hashJson(packet.adapterPlan)) {
    errors.push('approval.routingPlanHash does not match packet.adapterPlan (stale or tampered approval)')
  }
  const selection = packet.adapterPlan.selections.find((candidate) => candidate.adapterId === adapterId)
  if (!selection) errors.push(`Task Packet adapterPlan does not include ${adapterId}`)
  else if (selection.role !== role) errors.push(`Task Packet adapterPlan approves ${adapterId} for role ${selection.role}, not ${role}`)

  if (profile.status !== 'available') errors.push(`adapter status is ${profile.status}`)
  if (profile.connection !== transport.connection) {
    errors.push(`Registry profile connection is ${profile.connection}, Transport connection is ${transport.connection}`)
  }
  if (!transport.isLocalEndpoint || !transport.isLocalEndpoint()) errors.push('transport does not confirm a local endpoint')

  if (errors.length > 0) throw new OllamaDispatchBoundaryError(errors)
}

/**
 * `ADF-OLLAMA-LIVE-CONNECTION-001`: one Owner-run, one-shot connectivity probe to the local Ollama
 * server, through the existing Provider-neutral Adapter contract. Deliberately outside `index.ts` —
 * this script builds its own `ConversationRelay` instance and is the only thing that can reach
 * `ollama-local`. The live Electron app is unmodified and still cannot dispatch to it.
 *
 * Run with the Electron app closed (per Owner instruction), using the same runtimeRoot as the real
 * app so the resulting Thread is visible read-only in ThreadPanel / Live Board afterward.
 */

const adapterId = 'ollama-local'
const role: AdapterRole = 'proposal'
const taskId = 'ADF-OLLAMA-LIVE-CONNECTION-001'

async function main(): Promise<number> {
  const args = new Map<string, string>()
  for (let index = 0; index < process.argv.length - 2; index += 2) {
    const key = process.argv[index + 2]
    const value = process.argv[index + 3]
    if (key?.startsWith('--')) args.set(key.slice(2), value)
  }
  const runtimeRoot = args.get('runtime-root')
  if (!runtimeRoot) {
    process.stderr.write('missing required --runtime-root\n')
    return 1
  }

  const transport = new OllamaLocalHttpTransport({ baseUrl: args.get('base-url') ?? defaultOllamaBaseUrl, model: args.get('model') ?? defaultOllamaModel })

  process.stdout.write('--- readiness check (/api/tags, read-only) ---\n')
  const readiness = await checkOllamaReadiness({ baseUrl: args.get('base-url') ?? defaultOllamaBaseUrl, model: args.get('model') ?? defaultOllamaModel })
  process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`)
  if (!readiness.reachable || !readiness.modelPresent) {
    process.stderr.write('Ollama is not ready (server unreachable or model missing) — stopping before any send.\n')
    return 1
  }

  const packetPath = path.join(runtimeRoot, 'approved-tasks', `${taskId}.json`)
  let packet: ApprovedTaskPacket
  try {
    packet = await readJson<ApprovedTaskPacket>(packetPath)
  } catch (error) {
    process.stderr.write(`could not read approved Task Packet at ${packetPath}: ${(error as Error).message}\n`)
    return 1
  }

  process.stdout.write('\n--- Packet/Dispatch boundary check (fail-closed, before any Relay or send) ---\n')
  try {
    assertExplicitDispatchIsApproved({ packet, adapterId, role, profile: getAdapterProfile(adapterId), transport })
  } catch (error) {
    if (error instanceof OllamaDispatchBoundaryError) {
      process.stderr.write(`${error.message}\n${error.details.map((detail) => `  - ${detail}`).join('\n')}\n`)
      return 1
    }
    throw error
  }
  process.stdout.write('Packet explicitly approves this adapterId/role; Registry and Transport agree; endpoint confirmed local.\n')

  let relay: ConversationRelay
  relay = new ConversationRelay({
    runtimeRoot,
    externalTransports: { [adapterId]: transport },
    adapters: [
      new ExternalConversationAdapter(adapterId, role, transport, {
        authorise: (request) => relay.externalHooks(adapterId, transport).authorise(request),
        recordCall: (record) => relay.externalHooks(adapterId, transport).recordCall(record),
        now: () => new Date()
      })
    ]
  })

  const thread = await relay.startThread(packet)
  process.stdout.write(`\n--- Thread ---\n${thread.threadId} (state: ${thread.state}, turns: ${thread.turns.length})\n`)

  if (thread.turns.length > 0) {
    process.stdout.write('\nThread already has a Turn from a prior run. Not sending again (this script sends at most once per Thread).\n')
    process.stdout.write(`${JSON.stringify(thread.turns.at(-1), null, 2)}\n`)
    return 0
  }

  process.stdout.write('\n--- dispatching one real request to Ollama (explicit adapterId, single send) ---\n')
  const updated = await relay.continueJob(thread.threadId, adapterId)
  const turn = updated.turns.at(-1)
  process.stdout.write(`\n--- result ---\nstate: ${updated.state}\n${JSON.stringify(turn, null, 2)}\n`)
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    process.stderr.write(`${(error as Error).stack ?? String(error)}\n`)
    process.exitCode = 1
  })
