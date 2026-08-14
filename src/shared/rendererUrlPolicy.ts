export function safeDevelopmentRendererUrl(candidate: string | undefined, isPackaged: boolean): string | undefined {
  if (isPackaged || !candidate) return undefined

  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost') ? url.toString() : undefined
  } catch {
    return undefined
  }
}
