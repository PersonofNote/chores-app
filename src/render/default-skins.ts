import { registerIconSkins } from './icons'
import { SkinRegistry } from './skins'

/** The skins the app ships with: icons for known types, placeholder for the rest. */
export function createDefaultSkins(): SkinRegistry {
  return registerIconSkins(new SkinRegistry())
}
