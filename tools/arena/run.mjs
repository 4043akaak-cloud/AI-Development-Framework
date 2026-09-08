// Entry point — walks the whole skeleton once.
//
// Each stage reads its input from disk and writes its output to disk. Nothing is
// handed between stages in memory. That is what makes the layers independent: any
// stage can be re-run alone, and a stage that dies leaves the earlier files intact.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { buildContextPack } from './contextpack.mjs'
import { runArena } from './arena.mjs'
import { writeVerdict } from './verdict.mjs'
import { writeObsidianCandidate } from './obsidian.mjs'
import { checkLinks } from './linkcheck.mjs'
import { DEFAULT_OUT_ROOT, DEFAULT_VAULT, parseArgs, runPaths, writeFileEnsured, writeJson } from './common.mjs'

const TASK_ID = 'ADF-THREE-LAYER-SKELETON-001'

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const specPath = args.spec ?? path.join(import.meta.dirname, 'questions', 'pec-issue-051.json')
  const spec = JSON.parse(await readFile(specPath, 'utf8'))

  const vaultRoot = args.vault ?? DEFAULT_VAULT
  const outRoot = args['out-root'] ?? DEFAULT_OUT_ROOT
  const resume = Boolean(args.resume)
  if (resume && !args.run) throw new Error('--resume needs the --run id of the run to continue')
  const runId = args.run ?? `${spec.id}-${stamp()}`
  const paths = runPaths(outRoot, runId)

  process.stderr.write(`run ${runId}${resume ? ' (resume)' : ''}\n  out: ${paths.dir}\n`)

  // Layer 1 — asset. Left untouched on resume: rebuilding it would change the
  // pack's timestamp, and with it the prompt the earlier answers were given.
  if (resume) {
    process.stderr.write('  [1] context-pack.md 再利用（既存を上書きしない）\n')
  } else {
    await writeFileEnsured(paths.contextPack, await buildContextPack(spec, { vaultRoot }))
    process.stderr.write(`  [1] context-pack.md (${spec.notes?.length ?? 0} notes, ${spec.excerpts?.length ?? 0} excerpts)\n`)
  }

  // Layer 2 — judgement. Independent: neither side sees the other's answer.
  const endpoint = args.endpoint ?? 'http://127.0.0.1:11434'
  const timeoutMs = Number(args.timeout ?? 300000)
  const side = (name, defaultAdapter, defaultModel) => ({
    side: name,
    adapterId: args[`adapter-${name}`] ?? defaultAdapter,
    options: {
      endpoint,
      model: args[`model-${name}`] ?? defaultModel,
      timeoutMs,
      promptPath: paths.prompt,
      requestPath: paths.request(name),
      rawPath: paths.raw(name)
    }
  })

  const arena = await runArena({
    contextPackPath: paths.contextPack,
    question: spec.question,
    sides: [side('a', 'ollama-local', 'llama3:latest'), side('b', 'fake-contrarian', undefined)],
    concurrent: Boolean(args.concurrent),
    resume,
    paths
  })
  for (const record of arena.records) {
    process.stderr.write(`  [2] ${record.side}: ${record.adapterLabel} -> ${record.status}\n`)
  }

  // Layer 3 — disagreement extraction. Reads the answers, prompt and pack off disk.
  const log = await writeVerdict({ paths, runId })
  process.stderr.write(`  [3] verdict: ${log.status} (確定 ${log.settled.length} / 未確定 ${log.open.length})\n`)

  // Layer 4 — the execution layer receives the decision log as a plain file, and
  // everything after this point is driven by what came back off disk, not by the
  // in-memory result above.
  const received = JSON.parse(await readFile(paths.decisionLog, 'utf8'))
  process.stderr.write(`  [4] decision-log.json read back: run=${received.runId} status=${received.status}\n`)

  if (received.status === 'awaiting-human') {
    process.stderr.write('  [5] skipped: 手動リレー待ち。未完了の run から書き戻し候補は作らない\n\n')
    for (const participant of received.participants) {
      if (participant.status !== 'awaiting-human') continue
      process.stderr.write(`  ${participant.side} の依頼書: ${paths.request(participant.side)}\n`)
      process.stderr.write(`  回答の保存先:   ${paths.raw(participant.side)}\n`)
    }
    process.stderr.write(`\n  保存したら:\n    ... run.mjs --run ${runId} --resume\n`)
    process.stderr.write(`\n${paths.dir}\n`)
    process.exitCode = 3
    return
  }

  if (received.status === 'blocked') {
    process.stderr.write('  [5] skipped: 両系とも回答なし。書き戻し候補は作らない\n')
    process.stderr.write(`\n${paths.dir}\n`)
    process.exitCode = 2
    return
  }

  // Layer 5 — write-back candidate. Generated, never installed.
  const { target } = await writeObsidianCandidate({ paths, taskId: TASK_ID })
  process.stderr.write(`  [5] ${path.relative(paths.dir, target)} (vaultへは書き込んでいない)\n`)

  const links = await checkLinks({ notePaths: [target], vaultRoot })
  await writeJson(paths.linkReport, links)
  process.stderr.write(`  [6] linkcheck: ${links.pass ? 'PASS' : 'FAIL'} (${links.checked} links, ${links.broken.length} broken)\n`)

  process.stderr.write(`\n${paths.dir}\n`)
  if (!links.pass) process.exitCode = 1
}

await main()
