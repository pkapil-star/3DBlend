import type { RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout.tsx'
import { NotFoundPage } from './components/NotFoundPage.tsx'
import { AlertPage } from './features/alerts/AlertPage.tsx'
import { BodyPage } from './features/body/BodyPage.tsx'
import { ComparePage } from './features/body/ComparePage.tsx'
import { CheckinPage } from './features/checkin/CheckinPage.tsx'
import { EarthLinkPage } from './features/earthlink/EarthLinkPage.tsx'
import { HomePage } from './features/home/HomePage.tsx'
import { ModelCardPage } from './features/model/ModelCardPage.tsx'
import { LazyRegionPage } from './features/region/LazyRegionPage.tsx'

// Shared by the app's hash router and the tests' memory router.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'check-in', element: <CheckinPage /> },
      { path: 'alert/:alertKey', element: <AlertPage /> },
      { path: 'region/:regionId', element: <LazyRegionPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'body/compare', element: <ComparePage /> },
      { path: 'earth-link', element: <EarthLinkPage /> },
      { path: 'model/:modelId', element: <ModelCardPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
