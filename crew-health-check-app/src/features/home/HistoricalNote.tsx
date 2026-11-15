import { Tag } from '../../components/Tag.tsx'
import { useAppStore } from '../../store/index.ts'

/**
 * Says so when the loaded scenario replays real solar flares from NASA's
 * DONKI catalog (section 24.6), and that the crew data is still simulated.
 */
export function HistoricalNote() {
  const flares = useAppStore((state) => state.spaceWeather)
  if (flares.length === 0) return null
  return (
    <p>
      <Tag>Historical solar event</Tag>{' '}
      <span>
        This scenario replays{' '}
        {flares.length === 1 ? 'a real solar flare' : 'real solar flares'} from
        NASA&rsquo;s DONKI catalog (
        <span className="break-all">
          {flares.map((flare) => flare.donkiId).join(', ')}
        </span>
        ). The crew and their health readings are simulated.
      </span>
    </p>
  )
}
