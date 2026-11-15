import { useAppStore } from '../store/index.ts'
import { selectToday } from '../store/selectors.ts'
import { Tag } from './Tag.tsx'

/** Today's habitat feed values. They are simulated, and labeled so. */
export function HabitatFeeds() {
  const today = useAppStore(selectToday)
  const context = useAppStore((state) => state.context)
  const sample = context.find((entry) => entry.day === today)
  const dose = context
    .filter((entry) => entry.day <= today)
    .reduce((sum, entry) => sum + entry.radiation_dose, 0)
  return (
    <div className="space-y-1">
      <Tag>Simulated habitat feed</Tag>
      {sample ? (
        <ul>
          <li>
            Cabin CO2, today&apos;s worst 1-hour average:{' '}
            <strong>{sample.cabin_co2.toFixed(1)} mmHg</strong>
          </li>
          <li>
            Radiation dose, mission total:{' '}
            <strong>{dose.toFixed(1)} mSv</strong>
          </li>
          <li>
            Solar particle event:{' '}
            <strong>
              {sample.solar_event ? 'in progress' : 'none reported'}
            </strong>
          </li>
        </ul>
      ) : (
        <p>No habitat sample for today, so these feeds cannot be checked.</p>
      )}
    </div>
  )
}
