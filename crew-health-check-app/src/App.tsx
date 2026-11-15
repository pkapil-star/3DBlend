import { createHashRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from './routes.tsx'

// Hash routing works on any static host with no rewrite rules (decision D7).
// The router is created once, outside the React tree, as React Router advises.
const router = createHashRouter(routes)

export function App() {
  return <RouterProvider router={router} />
}
