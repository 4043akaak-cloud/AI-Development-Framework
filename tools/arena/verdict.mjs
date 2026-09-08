// Layer 3 — extract the disagreement.
//
// Input:  answer-a.json, answer-b.json (from layer 2).
// Output: verdict.md (for a human) + decision-log.json (for the execution layer).
//
// What this does NOT do: decide who is right, or merge the answers into one.
// Aggregation hides exactly the thing we are trying to see. Free-text claims are
// aligned by a cheap similarity heuristic and every pairing is labelled as a
// candidate, not a fact. The final read is the Owner's.

import { readFile } from 'node:fs/promises'

import { isMain, parseArgs, sha256, writeJson, writeFileEnsured } from './common.mjs'

const PAIR_THRESHOLD = 0.45

function bigrams(text) {
  const normalized = text.replace(/[\s、。・,.:;「」（）()]/g, '').toLowerCase()
  const set = new Set()
  for (let i = 0; i < normalized.length - 1; i += 1) set.add(normalized.slice(i, i + 2))
  return set
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const item of a) if (b.has(item)) shared += 1
  return shared / (a.size + b.size - shared)
}

function normalizeSentence(text) {
  return text.replace(/[\s、。・,.:;]/g, '').toLowerCase()
}

/** Pair claims across the two sides by similarity. Greedy, best-first, one-to-one. */
export function pairClaims(claimsA, claimsB) {
  const scored = []
  for (const a of claimsA) {
    for (const b of claimsB) {
      const score = jaccard(bigrams(a.statement), bigrams(b.statement))
      if (score >= PAIR_THRESHOLD) scored.push({ a, b, score })
    }
  }
  scored.sort((x, y) => y.score - x.score)

  const usedA = new Set()
  const usedB = new Set()
  const pairs = []
  for (const candidate of scored) {
    if (usedA.has(candidate.a.id) || usedB.has(candidate.b.id)) continue
    usedA.add(candidate.a.id)
    usedB.add(candidate.b.id)
    pairs.push(candidate)
  }
  return {
    pairs,
    unpairedA: claimsA.filter((claim) => !usedA.has(claim.id)),
    unpairedB: claimsB.filter((claim) => !usedB.has(claim.id))
  }
}

export function buildVerdict({ runId, question, records, contextPackSha256, actualPromptSha256 }) {
  const ok = records.filter((record) => record.status === 'ok')

  const hashes = new Set(records.map((record) => record.promptSha256))
  if (hashes.size !== 1) {
    throw new Error(
      `the two sides did not receive the same prompt (${[...hashes].join(', ')}); refusing to compare`
    )
  }

  // Each record hashes the prompt it was handed, so comparing the records to
  // each other only proves they agree with themselves. Check them against the
  // prompt actually on disk, which is what a later reader can inspect.
  if (actualPromptSha256 && [...hashes][0] !== actualPromptSha256) {
    throw new Error(
      `the recorded prompt hash ${[...hashes][0]} does not match prompt.txt (${actualPromptSha256}); refusing to compare`
    )
  }

  const participants = records.map((record) => ({
    side: record.side,
    adapterId: record.adapterId,
    adapterLabel: record.adapterLabel,
    synthetic: record.synthetic,
    status: record.status
  }))

  const settled = []
  const open = []
  const notes = []

  if (records.some((record) => record.synthetic)) {
    notes.push(
      '参加者に合成（Fake）が含まれる。合成側の主張は実際のAIの意見ではなく、争点抽出の機構を動かすためのスタブである。'
    )
  }

  const waiting = records.filter((record) => record.status === 'awaiting-human')

  let status
  if (waiting.length > 0) {
    // Not a failure and not a result: the arena is simply unfinished. Saying
    // "partial" here would let an incomplete run flow on to a write-back
    // candidate as though a side had genuinely declined to answer.
    status = 'awaiting-human'
    for (const record of waiting) {
      notes.push(`${record.side} (${record.adapterLabel}) は Owner の手動リレー待ちである。この run はまだ完了していない。`)
    }
  } else if (ok.length === records.length) {
    status = 'full'
  } else if (ok.length > 0) {
    status = 'partial'
    for (const record of records) {
      if (record.status !== 'ok') {
        notes.push(
          `${record.side} (${record.adapterLabel}) は ${record.status} で終了した: ${record.error ?? 'schema mismatch'}。片系のみで継続した。`
        )
      }
    }
  } else {
    status = 'blocked'
    notes.push('両系とも有効な回答を返さなかった。推測で補完せず停止する。')
  }

  if (ok.length === records.length) {
    const [a, b] = records
    const sameRecommendation =
      normalizeSentence(a.answer.recommendation) === normalizeSentence(b.answer.recommendation)

    if (sameRecommendation) {
      settled.push({
        kind: 'recommendation',
        statement: a.answer.recommendation,
        positions: [
          { side: 'a', adapterLabel: a.adapterLabel, synthetic: a.synthetic, statement: a.answer.recommendation },
          { side: 'b', adapterLabel: b.adapterLabel, synthetic: b.synthetic, statement: b.answer.recommendation }
        ]
      })
    } else {
      open.push({
        kind: 'recommendation',
        positions: [
          { side: 'a', adapterLabel: a.adapterLabel, synthetic: a.synthetic, statement: a.answer.recommendation },
          { side: 'b', adapterLabel: b.adapterLabel, synthetic: b.synthetic, statement: b.answer.recommendation }
        ]
      })
    }

    const { pairs, unpairedA, unpairedB } = pairClaims(a.answer.claims, b.answer.claims)
    for (const pair of pairs) {
      // Similarity must never buy its way into 確定. A Japanese negation barely
      // moves the character bigrams — 「妥当である」 vs 「妥当ではない」 scores 0.58
      // and carries the same stance label — so a similar pair with matching
      // stances can be two flatly contradictory claims. Only a pair whose
      // statements are literally the same sentence can be called agreement;
      // everything else goes to 未確定 for the Owner to read.
      const identical =
        normalizeSentence(pair.a.statement) === normalizeSentence(pair.b.statement)
      const agreed = identical && pair.a.stance === pair.b.stance
      const conflicting = pair.a.stance !== pair.b.stance

      const entry = {
        kind: 'claim-pair',
        similarity: Number(pair.score.toFixed(3)),
        heuristic: true,
        relation: agreed ? 'identical' : conflicting ? 'stance-conflict' : 'similar-unverified',
        positions: [
          { side: 'a', adapterLabel: a.adapterLabel, synthetic: a.synthetic, statement: pair.a.statement, stance: pair.a.stance },
          { side: 'b', adapterLabel: b.adapterLabel, synthetic: b.synthetic, statement: pair.b.statement, stance: pair.b.stance }
        ]
      }
      if (agreed) settled.push(entry)
      else open.push(entry)
    }

    for (const [side, claims, record] of [['a', unpairedA, a], ['b', unpairedB, b]]) {
      for (const claim of claims) {
        open.push({
          kind: 'unpaired-claim',
          positions: [
            { side, adapterLabel: record.adapterLabel, synthetic: record.synthetic, statement: claim.statement, stance: claim.stance }
          ]
        })
      }
    }
  } else {
    for (const record of ok) {
      for (const claim of record.answer.claims) {
        open.push({
          kind: 'unpaired-claim',
          positions: [
            { side: record.side, adapterLabel: record.adapterLabel, synthetic: record.synthetic, statement: claim.statement, stance: claim.stance }
          ]
        })
      }
    }
  }

  return {
    runId,
    generatedAt: new Date().toISOString(),
    question,
    contextPackSha256,
    promptSha256: [...hashes][0],
    status,
    participants,
    settled,
    open,
    requiresHumanJudgement: true,
    notes
  }
}

function renderPosition(position) {
  const tag = position.synthetic ? ' ⚠合成' : ''
  const stance = position.stance ? ` \`${position.stance}\`` : ''
  return `  - **${position.side}**${tag} (${position.adapterLabel})${stance}: ${position.statement}`
}

export function renderVerdictMarkdown(log) {
  const lines = [
    `# Verdict — ${log.runId}`,
    '',
    `- generated: ${log.generatedAt}`,
    `- status: \`${log.status}\``,
    `- prompt sha256: \`${log.promptSha256}\` （両系が同一プロンプトを受け取ったことの証跡）`,
    '',
    '## 問い',
    '',
    log.question,
    '',
    '## 参加者',
    ''
  ]

  for (const participant of log.participants) {
    const mark = participant.synthetic ? ' — ⚠**合成（実意見ではない）**' : ''
    lines.push(`- **${participant.side}**: ${participant.adapterLabel} → \`${participant.status}\`${mark}`)
  }

  lines.push('', '## 確定（両系が一致した点）', '')
  if (log.settled.length === 0) {
    lines.push('なし。')
  } else {
    for (const item of log.settled) {
      lines.push(item.kind === 'recommendation' ? '- **結論が一致**' : '- **同一の主張・同一の立場**')
      for (const position of item.positions) lines.push(renderPosition(position))
    }
  }

  lines.push('', '## 未確定（割れた点・突き合わせできなかった点）', '')
  if (log.open.length === 0) {
    lines.push('なし。')
  } else {
    for (const item of log.open) {
      if (item.kind === 'recommendation') lines.push('- **結論が割れた**')
      else if (item.kind === 'claim-pair') {
        lines.push(
          item.relation === 'stance-conflict'
            ? `- **立場が対立**（類似度 ${item.similarity}、突き合わせは推定）`
            : `- 似た主張だが意味の一致は未確認（類似度 ${item.similarity}）。否定の有無を目で確かめること`
        )
      } else lines.push('- 片系のみの主張（対応する相手の主張を特定できず）')
      for (const position of item.positions) lines.push(renderPosition(position))
    }
  }

  if (log.notes.length > 0) {
    lines.push('', '## 注記', '')
    for (const note of log.notes) lines.push(`- ${note}`)
  }

  lines.push(
    '',
    '## 判定',
    '',
    'このファイルは候補を提示するだけである。どれを確定として採用するかはProject Ownerが決める。',
    ''
  )

  return lines.join('\n')
}

export const QUESTION_MARKER = '\n## QUESTION\n'

export function questionFromPrompt(promptText) {
  const index = promptText.indexOf(QUESTION_MARKER)
  if (index === -1) throw new Error('prompt.txt has no ## QUESTION section')
  return promptText.slice(index + QUESTION_MARKER.length).trim()
}

/**
 * Every input comes off disk: the two answers, the prompt that produced them,
 * and the context pack behind it. Nothing is carried in from the caller's
 * memory, so this layer can be re-run on its own and the hashes it reports are
 * checkable against files a reader can open.
 */
export async function writeVerdict({ paths, runId }) {
  const records = [
    JSON.parse(await readFile(paths.answer('a'), 'utf8')),
    JSON.parse(await readFile(paths.answer('b'), 'utf8'))
  ]
  const promptText = await readFile(paths.prompt, 'utf8')
  const log = buildVerdict({
    runId,
    question: questionFromPrompt(promptText),
    records,
    contextPackSha256: sha256(await readFile(paths.contextPack, 'utf8')),
    actualPromptSha256: sha256(promptText)
  })
  await writeFileEnsured(paths.verdict, renderVerdictMarkdown(log))
  await writeJson(paths.decisionLog, log)
  return log
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const { runPaths, DEFAULT_OUT_ROOT } = await import('./common.mjs')
  const paths = runPaths(args['out-root'] ?? DEFAULT_OUT_ROOT, args.run)
  const log = await writeVerdict({ paths, runId: args.run })
  process.stderr.write(`verdict: ${log.status}, settled=${log.settled.length}, open=${log.open.length}\n`)
}
