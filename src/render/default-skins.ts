import { bundledArtLooks, registerArtSkins } from './art'
import { registerIconSkins } from './icons'
import { SkinRegistry } from './skins'

/** The skins the app ships with: art looks where drawn, icons for known types, placeholder for the rest. */
export function createDefaultSkins(): SkinRegistry {
  return registerIconSkins(registerArtSkins(new SkinRegistry(), bundledArtLooks()))
}
