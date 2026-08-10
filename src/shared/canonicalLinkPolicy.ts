import path from 'node:path'
import { adfRepositoryRoot, blockDefenseRepositoryRoot, registeredProjectFor } from './projectRegistry'

export const repositoryRoot = adfRepositoryRoot
export const blockDefenseRoot = blockDefenseRepositoryRoot
export const obsidianRoot = '/Users/kawakamiatsushishi/Desktop/secondbrain'

type CanonicalSourceRoot = 'obsidian' | `project:${string}`

interface CanonicalSource {
  root: CanonicalSourceRoot
  relativePath: string
}

const projectSource = (projectId: string, relativePath: string): CanonicalSource => ({ root: `project:${projectId}`, relativePath })

export const canonicalSources = {
  'task-mvp1': projectSource('adf', 'docs/tasks/ADF-MVP1-001.md'),
  'task-retro': projectSource('adf', 'docs/tasks/ADF-RETRO-001.md'),
  'task-orch': projectSource('adf', 'docs/tasks/ADF-ORCH-001.md'),
  'task-review': projectSource('adf', 'docs/tasks/ADF-REVIEW-001.md'),
  'task-foundation': projectSource('adf', 'docs/tasks/ADF-FOUNDATION-001.md'),
  'project-current-state': projectSource('adf', 'docs/project/CURRENT_STATE.md'),
  'design-board-mvp1': projectSource('adf', 'docs/design/ADF_MVP1_READ_ONLY_BOARD.md'),
  'design-foundation': projectSource('adf', 'docs/design/ADF_CONTROL_PLANE_FOUNDATION.md'),
  'obsidian-airflow': { root: 'obsidian', relativePath: 'Projects/AI-Development-Framework/04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md' },
  'obsidian-retro': { root: 'obsidian', relativePath: 'Projects/AI-Development-Framework/05_Phase0振り返り_2026-08-03.md' },
  'obsidian-orch': { root: 'obsidian', relativePath: 'Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md' },
  'obsidian-review': { root: 'obsidian', relativePath: 'Projects/AI-Development-Framework/08_外部独立レビュー実験設計_2026-08-04.md' },
  'block-defense-adf-bd-001': projectSource('block-defense', 'docs/tasks/ADF-BD-001.md'),
  'block-defense-bd-002': projectSource('block-defense', 'docs/tasks/BD-002.md'),
  'block-defense-core-design': projectSource('block-defense', 'docs/design/BLOCK_DEFENSE_GAME_DESIGN.md'),
  'block-defense-bd-002-design': projectSource('block-defense', 'docs/design/BD-002_INPUT_AND_TWO_TIER_BOARD.md'),
  'block-defense-bd-002-experiment': projectSource('block-defense', 'docs/experiments/BD-002.md'),
  'block-defense-bd-003': projectSource('block-defense', 'docs/tasks/BD-003.md'),
  'block-defense-bd-003-dispatch-prompt': projectSource('block-defense', 'docs/tasks/BD-003-CLAUDE-CODE-DISPATCH-PROMPT.md'),
  'block-defense-bd-003-design': projectSource('block-defense', 'docs/design/BD-003_V2_PLAYABLE_SLICE.md'),
  'block-defense-bd-003-result-template': projectSource('block-defense', 'docs/evidence/BD-003/RESULT_TEMPLATE.md'),
  'block-defense-bd-003-result': projectSource('block-defense', 'docs/evidence/BD-003/RESULT.md'),
  'obsidian-block-defense-moc': { root: 'obsidian', relativePath: 'Projects/Block-Defense/00_MOC.md' },
  'obsidian-block-defense-probe': { root: 'obsidian', relativePath: 'Projects/Block-Defense/02_入力と二層盤面の触感プローブ_2026-08-05.md' },
  'obsidian-block-defense-v2': { root: 'obsidian', relativePath: 'Projects/Block-Defense/03_Block_Defense_v2_設計壁打ち_2026-08-07.md' }
} as const satisfies Record<string, CanonicalSource>

export type CanonicalSourceId = keyof typeof canonicalSources

export function isCanonicalSourceId(value: unknown): value is CanonicalSourceId {
  return typeof value === 'string' && Object.hasOwn(canonicalSources, value)
}

export function isSafeRelativeMarkdownPath(value: string): boolean {
  if (!value || path.isAbsolute(value) || value.includes('\0') || !value.endsWith('.md')) return false
  const normalized = path.posix.normalize(value)
  return normalized === value && !normalized.startsWith('../') && normalized !== '..'
}

export function rootFor(sourceId: CanonicalSourceId): string {
  const root = canonicalSources[sourceId].root
  if (root === 'obsidian') return obsidianRoot

  const project = registeredProjectFor(root.slice('project:'.length))
  if (!project) throw new Error(`Unknown registered project root: ${root}`)
  return project.repositoryRoot
}

export function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}
