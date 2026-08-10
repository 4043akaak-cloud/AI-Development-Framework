import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { JobEvent } from '../../shared/jobLoopTypes'

export async function ensureDir(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath))
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

/** Creates a file only if it does not exist yet, so two concurrent claims cannot both succeed. */
export async function writeJsonExclusive(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
}

export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true })
}

export async function appendEvent(filePath: string, event: JobEvent): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await writeFile(filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' })
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

export async function readEvents(filePath: string): Promise<JobEvent[]> {
  try {
    const text = await readFile(filePath, 'utf8')
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as JobEvent)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function listJobIds(runtimeRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(runtimeRoot, 'jobs'), { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
