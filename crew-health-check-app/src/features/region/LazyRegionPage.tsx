import { lazy, Suspense } from 'react'

// The region screen carries the chart library, so it loads on its first visit
// and the rest of the app does not wait for it.
const RegionPage = lazy(() =>
  import('./RegionPage.tsx').then((module) => ({
    default: module.RegionPage,
  })),
)

export function LazyRegionPage() {
  return (
    <Suspense fallback={<p>Loading this area…</p>}>
      <RegionPage />
    </Suspense>
  )
}
