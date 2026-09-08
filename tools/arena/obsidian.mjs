// Layer 5 — write-back candidate.
//
// Generates the note that belongs in the vault and then STOPS. Nothing here
// touches the vault: ADF_PRODUCT_COMPLETION_BLUEPRINT.md §6 forbids automatic
// Obsidian writes, so copying the file in is the Owner's action.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { readSourcesFromPack } from './contextpack.mjs'
import { isMain, parseArgs, writeFileEnsured } from './common.mjs'

function positionLine(position) {
  const tag = position.synthetic ? ' ⚠合成' : ''
  return `  - ${position.side}${tag}: ${position.statement}`
}

export function renderNote({ log, sources, taskId }) {
  const date = log.generatedAt.slice(0, 10)
  const lines = [
    `# Arena — ${log.question}`,
    '',
    `**Run**: \`${log.runId}\`  `,
    `**Date**: ${date}  `,
    `**Status**: ${log.status}  `,
    `**Task**: ${taskId}`,
    '',
    '## 確定',
    ''
  ]

  if (log.settled.length === 0) {
    lines.push('なし。両系が一致した点はなかった。')
  } else {
    for (const item of log.settled) {
      // Always render the positions, never the bare statement: the side labels
      // are what tell a reader whether a synthetic participant is in here.
      lines.push(item.kind === 'recommendation' ? '- 結論一致:' : '- 同一の主張・同一の立場:')
      for (const position of item.positions) lines.push(positionLine(position))
    }
  }

  lines.push('', '## 未確定', '')
  if (log.open.length === 0) {
    lines.push('なし。')
  } else {
    for (const item of log.open) {
      if (item.kind === 'recommendation') lines.push('- 結論が割れた:')
      else if (item.kind === 'claim-pair') lines.push('- 立場が対立:')
      else lines.push('- 片系のみの主張:')
      for (const position of item.positions) lines.push(positionLine(position))
    }
  }

  lines.push('', '## 参加者', '')
  for (const participant of log.participants) {
    const mark = participant.synthetic ? '（合成・実意見ではない）' : ''
    lines.push(`- ${participant.side}: ${participant.adapterLabel} → ${participant.status} ${mark}`.trimEnd())
  }

  if (sources.notes.length > 0 || sources.excerpts.length > 0) {
    lines.push('', '## 参照した資産', '')
    for (const note of sources.notes) lines.push(`- [[${note}]]`)
    // Excerpts live outside the vault, so they are cited as plain paths — a
    // wikilink to them would be a link that can never resolve.
    for (const excerpt of sources.excerpts) lines.push(`- ${excerpt.label} — \`${excerpt.where}\``)
  }

  if (log.notes.length > 0) {
    lines.push('', '## 注記', '')
    for (const note of log.notes) lines.push(`- ${note}`)
  }

  lines.push('', `**Prompt sha256**: \`${log.promptSha256}\``, '')
  return lines.join('\n')
}

export async function writeObsidianCandidate({ paths, taskId }) {
  const log = JSON.parse(await readFile(paths.decisionLog, 'utf8'))
  const sources = readSourcesFromPack(await readFile(paths.contextPack, 'utf8'))
  const note = renderNote({ log, sources, taskId })
  const target = path.join(paths.obsidianOut, `Arena_${log.runId}.md`)
  await writeFileEnsured(target, note)
  return { target, sources }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const { runPaths, DEFAULT_OUT_ROOT } = await import('./common.mjs')
  const paths = runPaths(args['out-root'] ?? DEFAULT_OUT_ROOT, args.run)
  const { target } = await writeObsidianCandidate({ paths, taskId: args.task ?? 'ADF-THREE-LAYER-SKELETON-001' })
  process.stderr.write(`wrote ${target} (not copied into the vault)\n`)
}
