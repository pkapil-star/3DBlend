import type { RegionId, Status } from '../engine/index.ts'
import { regionLabel } from '../lib/labels.ts'
import { STATUS_DISPLAY } from './statusDisplay.ts'

interface BodyMapProps {
  regionStatus: Record<RegionId, Status>
  /** Opens the region's detail screen (section 19.3). */
  onSelect: (region: RegionId) => void
}

interface RegionButtonProps extends BodyMapProps {
  region: RegionId
  /** Size and corner classes that give the button its place in the figure. */
  shape: string
  chip?: boolean
}

/** One body region: a real button named like "Head: Watch", with icon and word. */
function RegionButton({
  region,
  shape,
  chip = false,
  regionStatus,
  onSelect,
}: RegionButtonProps) {
  const { word, Icon, classes } = STATUS_DISPLAY[regionStatus[region]]
  const label = regionLabel(region)
  return (
    <button
      type="button"
      aria-label={`${label}: ${word}`}
      onClick={() => onSelect(region)}
      className={`flex min-h-11 min-w-11 items-center justify-center border-2 px-2 py-1 text-center leading-tight ${
        chip ? 'flex-row gap-2 rounded-lg px-3' : 'flex-col gap-0.5'
      } ${classes} ${shape}`}
    >
      <Icon aria-hidden="true" size={20} className="shrink-0" />
      <span className="font-semibold">{label}</span>
      <span>{word}</span>
    </button>
  )
}

/**
 * The 2D body map (ARCHITECTURE.md section 19.1): a simple figure built from
 * buttons, so every region works by keyboard and screen reader. Skin and
 * Environment are chips under the figure.
 */
export function BodyMap2D(props: BodyMapProps) {
  const arm = (
    <span aria-hidden="true" className="w-5 rounded-full bg-slate-300" />
  )
  return (
    <div
      role="group"
      aria-label="Body map"
      className="flex flex-col items-center gap-1.5"
    >
      <div className="flex items-center gap-2">
        <RegionButton {...props} region="eyes" shape="w-24 rounded-full" />
        <RegionButton {...props} region="head" shape="h-28 w-28 rounded-full" />
        {/* Keeps the head centred over the torso. */}
        <span aria-hidden="true" className="w-24" />
      </div>
      <div className="flex items-stretch gap-1.5">
        {arm}
        <div className="flex flex-col gap-1.5">
          <RegionButton
            {...props}
            region="heart"
            shape="h-20 w-44 rounded-t-3xl"
          />
          <RegionButton
            {...props}
            region="core"
            shape="h-20 w-44 rounded-b-xl"
          />
        </div>
        {arm}
      </div>
      <RegionButton
        {...props}
        region="bones_muscle"
        shape="h-24 w-44 rounded-b-3xl"
      />
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <RegionButton {...props} region="skin" shape="" chip />
        <RegionButton {...props} region="whole_body" shape="" chip />
      </div>
    </div>
  )
}
