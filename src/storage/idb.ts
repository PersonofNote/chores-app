/**
 * Thin promise wrapper over IndexedDB. Only what this app needs: open with
 * versioned upgrades, and await a request or a whole transaction.
 *
 * Inside a transaction, only await IDB requests (via `request()`): awaiting anything
 * else lets the transaction auto-commit before later requests are issued.
 */

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Resolves when the transaction commits; rejects if it aborts or errors. */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
    tx.onerror = () => reject(tx.error)
  })
}

export type Upgrade = (db: IDBDatabase, tx: IDBTransaction, fromVersion: number) => void

export interface OpenOptions {
  name: string
  version: number
  upgrade: Upgrade
  /** Injectable for tests; defaults to the global `indexedDB`. */
  factory?: IDBFactory
}

export function openDatabase({ name, version, upgrade, factory = indexedDB }: OpenOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, version)
    req.onupgradeneeded = (event) => {
      // `transaction` is always set during upgradeneeded.
      upgrade(req.result, req.transaction!, event.oldVersion)
    }
    req.onblocked = () =>
      reject(new Error(`Database '${name}' upgrade blocked: close other tabs running this app and reload`))
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      // Let a newer version in another tab upgrade instead of being blocked by us.
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}
