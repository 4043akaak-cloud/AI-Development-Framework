import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AggregateResult, FrontdoorLedgerEvent } from '../../src/shared/frontdoorTypes'
import { hashJson } from '../../src/main/jobLoop/hash'
import { readJson, writeJsonAtomic } from '../../src/main/jobLoop/ledger'

/**
 * Test-only fixture surgery. ADF has no production route that rewrites history, and it must not
 * grow one: these helpers exist so a test can stage a state ADF could only have reached in an
 * earlier schema version, then prove the current gates still behave correctly on it.
 */

/** Re-links sequence, eventId, previousEventHash and eventHash so `validateFrontdoorEventChain` accepts a doctored Ledger. */
export function rebuildFrontdoorEventChain(events: readonly FrontdoorLedgerEvent[]): FrontdoorLedgerEvent[] {
  let previousEventHash = 'frontdoor-ledger-genesis-v1'
  return events.map((event, sequence) => {
    const base = {
      ...event,
      sequence,
      eventId: `frontdoor-event-${hashJson([event.runId, sequence, event.type, event.payload, event.occurredAt]).slice(0, 20)}`,
      previousEventHash
    }
    const { eventHash: _oldHash, ...withoutHash } = base
    const updated = { ...withoutHash, eventHash: hashJson(withoutHash) }
    previousEventHash = updated.eventHash
    return updated
  })
}

/**
 * Rewrites the persisted aggregate and re-binds the `completion-proposed` Evidence hash to it, so
 * the aggregate reaches the Owner Gates exactly as a genuinely-written one would.
 */
export async function rewritePersistedAggregate(
  runtimeRoot: string,
  runId: string,
  aggregateResultRef: string,
  transform: (aggregate: AggregateResult) => AggregateResult
): Promise<AggregateResult> {
  const aggregatePath = path.join(runtimeRoot, aggregateResultRef)
  const updated = transform(await readJson<AggregateResult>(aggregatePath))
  await writeJsonAtomic(aggregatePath, updated)

  const eventsPath = path.join(runtimeRoot, 'frontdoor-runs', runId, 'events.jsonl')
  const events = (await readFile(eventsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as FrontdoorLedgerEvent)
  const rebound = events.map((event) => event.type === 'frontdoor.completion-proposed' && event.payload.aggregateRef === aggregateResultRef
    ? { ...event, payload: { ...event.payload, aggregateHash: hashJson(updated) } }
    : event)
  await writeFile(eventsPath, `${rebuildFrontdoorEventChain(rebound).map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
  return updated
}
