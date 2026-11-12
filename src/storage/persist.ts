/**
 * Asks the browser not to evict our data under storage pressure. Matters most on
 * iOS, which can clear a site's storage after a period of non-use; installing to
 * the home screen also helps. Safe to call repeatedly.
 */
export type PersistResult = 'persisted' | 'not-persisted' | 'unsupported'

export async function requestPersistentStorage(storage: StorageManager | undefined = navigator.storage): Promise<PersistResult> {
  if (!storage?.persist) return 'unsupported'
  if (await storage.persisted()) return 'persisted'
  return (await storage.persist()) ? 'persisted' : 'not-persisted'
}
