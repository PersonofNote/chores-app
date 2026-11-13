/**
 * The Settings sheet: the house's name and size, sound, and backup. It opens from
 * the map and from the editor alike, so it isn't part of either.
 */
import type { HouseStore } from '../state/house-store'
import { LayoutError } from '../state/house-store'
import type { ImportSummary } from '../storage'
import { el } from './components/sheet'
import type { SheetHost } from './components/sheet'
import type { Toaster } from './components/toast'
import { houseSettingsBody } from './panels/editor-panels'
import { backupErrorMessage, backupSection, soundSection } from './panels/settings-panel'
import type { Preferences } from './preferences'

export interface BackupService {
  exportFile(): Promise<void>
  importFile(file: File): Promise<ImportSummary>
}

export interface SettingsDeps {
  store: HouseStore
  sheets: SheetHost
  toaster: Toaster
  backup: BackupService
  prefs: Preferences
  /** After an import; reloads the page by default so every view starts from the merged data. */
  reload?: () => void
}

/** How long the import message shows before the reload. */
const RELOAD_DELAY_MS = 1500

export class Settings {
  constructor(private readonly deps: SettingsDeps) {}

  open(): void {
    const { store, sheets, prefs } = this.deps
    const home = store.house.home
    const house = houseSettingsBody({ name: home.name, width: home.gridSize.w, height: home.gridSize.h }, 'Save', ({ name, width, height }) => {
      store.updateHome({ ...home, name, gridSize: { w: width, h: height } }).then(
        () => sheets.close(),
        (err) => this.failed(err),
      )
    })
    sheets.open({
      title: 'Settings',
      body: el('div', { className: 'sheet-body settings' }, [
        house,
        soundSection(prefs.sound, (on) => (prefs.sound = on)),
        backupSection({ onExport: () => this.exportBackup(), onImport: (file) => this.importBackup(file) }),
      ]),
    })
  }

  private exportBackup(): void {
    this.deps.backup.exportFile().catch((err) => this.failed(err))
  }

  private importBackup(file: File): void {
    const { sheets, toaster, backup } = this.deps
    sheets.close()
    backup.importFile(file).then(
      (s) => {
        toaster.show(`Imported ${s.events.added} new log entr${s.events.added === 1 ? 'y' : 'ies'}. Reloading…`)
        setTimeout(this.deps.reload ?? (() => location.reload()), RELOAD_DELAY_MS)
      },
      (err) => this.failed(err),
    )
  }

  private failed(err: unknown): void {
    if (err instanceof LayoutError) return this.deps.toaster.show(err.message)
    console.error(err)
    this.deps.toaster.show(backupErrorMessage(err))
  }
}
