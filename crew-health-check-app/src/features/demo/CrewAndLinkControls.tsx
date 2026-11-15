import { SECONDARY_BUTTON } from '../../components/buttonStyles.ts'
import { EnvironmentControls } from '../../components/EnvironmentControls.tsx'
import { crewLabel } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'

/** Switch crew member, environment and delay, and the link (section 16). */
export function CrewAndLinkControls() {
  const crew = useAppStore((state) => state.crew)
  const activeCrewId = useAppStore((state) => state.mission.activeCrewId)
  const linkUp = useAppStore((state) => state.mission.link.linkUp)
  const switchCrew = useAppStore((state) => state.switchCrew)
  const setLinkUp = useAppStore((state) => state.setLinkUp)

  return (
    <section aria-labelledby="crew-link-title" className="space-y-3">
      <h3 id="crew-link-title" className="text-lg font-semibold">
        Crew, environment and link
      </h3>
      <div>
        <label htmlFor="demo-crew" className="block text-slate-600">
          Crew member
        </label>
        <select
          id="demo-crew"
          value={activeCrewId}
          onChange={(event) => switchCrew(event.target.value)}
          className="mt-0.5 min-h-11 max-w-full rounded-lg border-2 border-slate-500 bg-white px-2 font-medium"
        >
          {crew.map((member) => (
            <option key={member.id} value={member.id}>
              {crewLabel(member)}
            </option>
          ))}
        </select>
      </div>
      <EnvironmentControls idPrefix="demo-" />
      <div className="flex flex-wrap items-center gap-3">
        <p>Earth link: {linkUp ? 'up' : 'down'}</p>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => setLinkUp(!linkUp)}
        >
          {linkUp ? 'Take the link down' : 'Bring the link back up'}
        </button>
      </div>
    </section>
  )
}
