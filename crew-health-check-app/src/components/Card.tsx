import { useId, type ReactNode } from 'react'

/** A titled panel. The title is a real heading that names the section. */
export function Card({
  title,
  children,
  aside,
}: {
  title: string
  children: ReactNode
  /** Shown to the right of the title, for example a tag. */
  aside?: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
