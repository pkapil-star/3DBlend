import { Check, Eye, Minus, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Status } from '../engine/index.ts'

// Status language (ARCHITECTURE.md section 9): always colour plus icon plus
// word, never colour alone. Class names are written out in full so Tailwind
// can find them.

export interface StatusDisplay {
  word: string
  Icon: LucideIcon
  /** Background, text and border from the status tokens. */
  classes: string
}

export const STATUS_DISPLAY: Record<Status, StatusDisplay> = {
  good: {
    word: 'Good',
    Icon: Check,
    classes: 'bg-status-good-bg text-status-good-fg border-status-good-border',
  },
  watch: {
    word: 'Watch',
    Icon: Eye,
    classes:
      'bg-status-watch-bg text-status-watch-fg border-status-watch-border',
  },
  act: {
    word: 'Act',
    Icon: TriangleAlert,
    classes: 'bg-status-act-bg text-status-act-fg border-status-act-border',
  },
  no_data: {
    word: 'No data',
    Icon: Minus,
    classes: 'bg-status-none-bg text-status-none-fg border-status-none-border',
  },
}
