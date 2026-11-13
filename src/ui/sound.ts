/**
 * Completion sounds, synthesized with Web Audio: no audio files to ship.
 *
 * Restores play one of a few short pentatonic motifs in a randomly chosen key,
 * never the same motif twice in a row, so repeated restores stay pleasant.
 * Skips play a single soft low note.
 *
 * The AudioContext is created on first use, which happens inside a tap handler,
 * so it's allowed to start (iOS requires a user gesture).
 */

/** Semitone offsets from the root; all pentatonic, so any motif in any key sounds fine. */
const MOTIFS: readonly (readonly number[])[] = [
  [0, 4, 7],
  [0, 7, 12],
  [4, 7, 12],
  [0, 2, 7, 12],
  [7, 4, 12],
]
/** Roots in Hz (C5, D5, F5). */
const ROOTS = [523.25, 587.33, 698.46]
const NOTE_GAP_S = 0.075
const MASTER_GAIN = 0.18

export interface SoundOptions {
  random?: () => number
  /** Read on every play, so a setting can mute without rewiring. */
  enabled?: () => boolean
}

export class Chimes {
  private ctx: AudioContext | null = null
  private lastMotif = -1
  private readonly random: () => number
  private readonly enabled: () => boolean

  constructor(opts: SoundOptions = {}) {
    this.random = opts.random ?? Math.random
    this.enabled = opts.enabled ?? (() => true)
  }

  restore(): void {
    const ctx = this.context()
    if (!ctx) return
    let motif = Math.floor(this.random() * MOTIFS.length)
    if (motif === this.lastMotif) motif = (motif + 1) % MOTIFS.length
    this.lastMotif = motif
    const root = ROOTS[Math.floor(this.random() * ROOTS.length)]!
    MOTIFS[motif]!.forEach((semitones, i) => {
      this.note(ctx, root * 2 ** (semitones / 12), ctx.currentTime + i * NOTE_GAP_S, 0.9, 1)
    })
  }

  skip(): void {
    const ctx = this.context()
    if (!ctx) return
    this.note(ctx, ROOTS[0]! / 2, ctx.currentTime, 0.35, 0.5)
  }

  private context(): AudioContext | null {
    if (!this.enabled() || typeof AudioContext === 'undefined') return null
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** A soft bell: sine fundamental plus a quiet octave, quick attack, long decay. */
  private note(ctx: AudioContext, freq: number, at: number, duration: number, loudness: number): void {
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(MASTER_GAIN * loudness, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

    for (const [mult, level, type] of [
      [1, 1, 'sine'],
      [2, 0.25, 'triangle'],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq * mult
      const partial = ctx.createGain()
      partial.gain.value = level
      osc.connect(partial).connect(gain)
      osc.start(at)
      osc.stop(at + duration + 0.05)
    }
  }
}
