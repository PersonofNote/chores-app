/** Chore choices as the UI shows them: worst first, with their decay color. */
import { DEFAULT_DECAY_CONFIG, isFloorItem, itemTypeLabel, type DecayConfig, type DecayStatus, type HouseStatus, type Item, type Room, type Stage, type Task } from '../domain'
import { itemDecayStyle, type DecayPalette } from '../render/decay-style'

export interface ChoreOption {
  task: Task
  status: DecayStatus | null
  stage: Stage | 'unknown'
  /** CSS color for this chore's decay. */
  color: string
}

export function choreOptions(
  tasks: readonly Task[],
  status: HouseStatus,
  palette: DecayPalette,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): ChoreOption[] {
  return tasks
    .map((task) => {
      const s = status.tasks.get(task.id) ?? null
      const style = itemDecayStyle(s, palette, config)
      return { task, status: s, stage: style.stage, color: style.color }
    })
    .sort((a, b) => (b.status?.pressure ?? -1) - (a.status?.pressure ?? -1))
}

/** Chores at or past Due soon. */
export const isDue = (o: ChoreOption, config: DecayConfig = DEFAULT_DECAY_CONFIG) =>
  (o.status?.pressure ?? 0) >= config.thresholds.dueSoon

/** How an item is named in sheets: its type, or "Kitchen floor" for a floor. */
export function itemLabel(item: Item, rooms: readonly Room[]): string {
  return isFloorItem(item) ? `${rooms.find((r) => r.id === item.roomId)?.name ?? ''} floor`.trim() : itemTypeLabel(item.type)
}
