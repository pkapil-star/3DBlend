import type { Status } from '../engine/index.ts'
import { STATUS_DISPLAY } from './statusDisplay.ts'

/** Good, Watch, Act or No data: colour, icon and word together. */
export function StatusBadge({ status }: { status: Status }) {
  const { word, Icon, classes } = STATUS_DISPLAY[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold ${classes}`}
    >
      <Icon aria-hidden="true" size={18} />
      {word}
    </span>
  )
}
