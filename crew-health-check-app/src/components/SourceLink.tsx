import { healthData } from '../data/index.ts'
import { Tag } from './Tag.tsx'

/**
 * A link to one entry of the evidence registry. Every health or spaceflight
 * claim in the app points to one (CLAUDE.md: no source, no claim). Sources a
 * team member has not checked yet carry an "Unverified" tag.
 */
export function SourceLink({ sourceId }: { sourceId: string }) {
  const source = healthData.sources.find((entry) => entry.id === sourceId)
  if (!source) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        {source.title}
      </a>
      <span className="text-slate-600">{source.publisher}</span>
      {!source.verified && <Tag>Unverified source</Tag>}
    </span>
  )
}

export function SourceList({ sourceIds }: { sourceIds: readonly string[] }) {
  if (sourceIds.length === 0) {
    return <p className="text-slate-600">No source recorded yet.</p>
  }
  return (
    <ul className="space-y-2">
      {sourceIds.map((id) => (
        <li key={id}>
          <SourceLink sourceId={id} />
        </li>
      ))}
    </ul>
  )
}
