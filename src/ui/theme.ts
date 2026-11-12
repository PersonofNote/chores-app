/** Picks the decay palette for the current color scheme and reports changes. */
import { DARK_PALETTE, LIGHT_PALETTE, type DecayPalette } from '../render/decay-style'

export function watchPalette(onChange: (palette: DecayPalette) => void): { palette: () => DecayPalette } {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const palette = () => (query.matches ? DARK_PALETTE : LIGHT_PALETTE)
  query.addEventListener('change', () => onChange(palette()))
  return { palette }
}
