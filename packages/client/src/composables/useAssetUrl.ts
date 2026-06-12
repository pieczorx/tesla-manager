const urlCache = new Map<string, string>()

export async function resolveAssetUrl(filePath: string): Promise<string | null> {
  const cached = urlCache.get(filePath)
  if (cached) {
    return cached
  }

  if (!window.teslaManager) {
    return null
  }

  const url = await window.teslaManager.assets.toAssetUrl(filePath)
  if (url) {
    urlCache.set(filePath, url)
  }
  return url
}

export async function preloadAssetUrls(filePaths: string[]): Promise<void> {
  const uniquePaths = [...new Set(filePaths)]
  await Promise.all(uniquePaths.map((filePath) => resolveAssetUrl(filePath)))
}

export function clearAssetUrlCache() {
  urlCache.clear()
}

export function invalidateAssetUrl(filePath: string) {
  urlCache.delete(filePath)
}
