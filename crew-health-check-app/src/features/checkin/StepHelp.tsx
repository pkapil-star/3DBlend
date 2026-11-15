import { SourceList } from '../../components/SourceLink.tsx'
import type { IndicatorDef } from '../../engine/index.ts'

const SUMMARY =
  'flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4'

/** The two collapsible lines under every check-in input (section 19.2). */
export function StepHelp({ def }: { def: IndicatorDef }) {
  return (
    <div className="mt-2">
      <details>
        <summary className={SUMMARY}>How to measure</summary>
        <p className="pb-2">{def.howToMeasure}</p>
      </details>
      <details>
        <summary className={SUMMARY}>Why it matters in space</summary>
        <div className="space-y-2 pb-2">
          <p>{def.whyInSpace}</p>
          <SourceList sourceIds={def.sourceIds} />
        </div>
      </details>
    </div>
  )
}
