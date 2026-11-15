import { Suspense, lazy } from 'react'
import { Link } from 'react-router'
import type { BodyModelEntry, BodyProfile } from '../../bodyview/types.ts'
import { SourceLink } from '../../components/SourceLink.tsx'
import { Tag } from '../../components/Tag.tsx'
import { bodyModels } from '../../data/bodyView.ts'
import { useAppStore } from '../../store/index.ts'
import { NO_3D_COMPARE_TEXT, use3dAvailable } from './body3d.ts'

const Compare3D = lazy(() => import('./viewer/Compare3D.tsx'))

const MEASUREMENTS: [keyof BodyProfile, string][] = [
  ['heightCm', 'Height'],
  ['inseamCm', 'Inseam'],
  ['shoulderBreadthCm', 'Shoulder breadth'],
  ['upperArmCm', 'Upper-arm length'],
  ['forearmCm', 'Forearm length'],
  ['chestCm', 'Chest circumference'],
  ['waistCm', 'Waist circumference'],
  ['hipCm', 'Hip circumference'],
  ['footCm', 'Foot length'],
]

/** Placeholder profiles are the contract's fictional values; a delivered model's are measured on it. */
function measuredWord(model: BodyModelEntry): string {
  return model.profileSource === 'measured'
    ? 'Measured on the delivered model'
    : 'Fictional measurements'
}

function ProfileTable({
  model,
  name,
}: {
  model: BodyModelEntry
  name: string
}) {
  return (
    <section aria-labelledby={`profile-${model.id}`} className="space-y-3">
      <h2 id={`profile-${model.id}`} className="text-xl font-semibold">
        {name}
      </h2>
      <div className="flex flex-wrap gap-2">
        <Tag>{measuredWord(model)}</Tag>
        {model.status === 'placeholder' && <Tag>Placeholder model</Tag>}
        {model.aiAssisted && <Tag>AI-assisted model</Tag>}
      </div>
      <table className="w-full max-w-md border-collapse">
        <caption className="sr-only">
          {measuredWord(model)} of {name}, in centimeters
        </caption>
        <tbody>
          {MEASUREMENTS.map(([key, label]) => (
            <tr key={key} className="border-b border-slate-200">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {label}
              </th>
              <td className="py-2 text-right font-semibold">
                {model.profile[key]} cm
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {model.attribution && (
        <p className="text-slate-700">{model.attribution}</p>
      )}
    </section>
  )
}

/**
 * Both bodies side by side (section 22.7): one scene and one camera when 3D
 * is available, and always the two profile tables.
 */
export function ComparePage() {
  const crew = useAppStore((state) => state.crew)
  const available = use3dAvailable()
  const nameOf = (model: BodyModelEntry) =>
    crew.find((member) => member.id === model.crewId)?.name ?? model.label

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Compare bodies</h1>
        <p className="max-w-3xl text-slate-700">
          The two bodies at the same scale. A placeholder's measurements are
          fictional values chosen only to make the bodies look different; a
          delivered model's are measured on that model. Neither is a copy of any
          astronaut.
        </p>
      </header>
      {available ? (
        <Suspense
          fallback={<p className="text-slate-700">Loading the 3D view…</p>}
        >
          <Compare3D models={bodyModels} />
        </Suspense>
      ) : (
        <p className="text-slate-700">{NO_3D_COMPARE_TEXT}</p>
      )}
      <div className="grid gap-8 md:grid-cols-2">
        {bodyModels.map((model) => (
          <ProfileTable key={model.id} model={model} name={nameOf(model)} />
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-slate-700">
        <span>How real body measurements are taken:</span>
        <SourceLink sourceId="anthropometry-nasa-ntrs-2024" />
      </p>
      <Link
        to="/body"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Back to your body
      </Link>
    </div>
  )
}
