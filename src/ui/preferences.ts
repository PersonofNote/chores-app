/**
 * Per-device preferences, such as sound. These describe the device, not the house,
 * so they live in localStorage rather than the database and aren't in backups.
 *
 * Storage can be missing or throw (private browsing, blocked site data); every
 * preference then falls back to its default and changes last until reload.
 */

const SOUND_KEY = 'house-monitor:sound'

export class Preferences {
  private soundOn: boolean

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultStorage()) {
    this.soundOn = this.read(SOUND_KEY) !== 'off'
  }

  get sound(): boolean {
    return this.soundOn
  }

  set sound(on: boolean) {
    this.soundOn = on
    this.write(SOUND_KEY, on ? 'on' : 'off')
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value)
    } catch {
      // Keep the in-memory value; it just won't survive a reload.
    }
  }
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
