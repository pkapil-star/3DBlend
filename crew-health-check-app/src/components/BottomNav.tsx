import {
  ClipboardList,
  House,
  PersonStanding,
  SatelliteDish,
} from 'lucide-react'
import { NavLink } from 'react-router'

// Body joined in milestone B1. The standalone Library screen was cut on
// 14 November 2026 (ARCHITECTURE.md section 32).
const navItems = [
  { to: '/', label: 'Home', Icon: House },
  { to: '/check-in', label: 'Check-in', Icon: ClipboardList },
  { to: '/body', label: 'Body', Icon: PersonStanding },
  { to: '/earth-link', label: 'Earth link', Icon: SatelliteDish },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  // The active item is marked by weight and a top bar, not by colour alone.
  const state = isActive
    ? 'border-blue-800 font-semibold text-blue-800'
    : 'border-transparent text-slate-700 hover:text-slate-900'
  return `flex min-h-14 flex-col items-center justify-center gap-1 border-t-4 px-2 py-2 ${state}`
}

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 border-t border-slate-200 bg-white"
    >
      <ul className="mx-auto flex max-w-5xl">
        {navItems.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end className={navLinkClass}>
              <Icon aria-hidden="true" size={24} />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
