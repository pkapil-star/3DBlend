import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router'
import { useMissionClock } from '../clock/useMissionClock.ts'
import { DemoPanel } from '../features/demo/DemoPanel.tsx'
import { useBootstrapScenario } from '../store/bootstrap.ts'
import { AppFooter } from './AppFooter.tsx'
import { AppHeader } from './AppHeader.tsx'
import { BottomNav } from './BottomNav.tsx'

function ScenarioGate() {
  const { status, retry } = useBootstrapScenario()
  if (status === 'ready') return <Outlet />
  if (status === 'loading') {
    return <p role="status">Loading the simulated scenario…</p>
  }
  return (
    <div role="alert" className="space-y-3">
      <p>The simulated scenario could not be loaded.</p>
      <button
        type="button"
        onClick={retry}
        className="min-h-11 rounded-lg border-2 border-slate-700 px-4 font-semibold"
      >
        Try again
      </button>
    </div>
  )
}

/** Shift+D must not fire while someone types a capital D into a field. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

/**
 * The presenter tools drawer: Shift+D or the footer link opens it. While it
 * is open the page behind is inert, and closing it returns focus to where it
 * was.
 */
function usePresenterTools() {
  const [open, setOpen] = useState(false)
  const opener = useRef<Element | null>(null)
  const wasOpen = useRef(false)

  const show = useCallback(() => {
    opener.current = document.activeElement
    setOpen(true)
  }, [])
  const hide = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'D' || !event.shiftKey) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      show()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, show])

  // Focus can only return once the page is no longer inert, after the render.
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    const target = opener.current
    if (target instanceof HTMLElement && target.isConnected) target.focus()
  }, [open])

  return { open, show, hide }
}

export function AppLayout() {
  useMissionClock()
  const presenter = usePresenterTools()
  return (
    <>
      <div className="flex min-h-screen flex-col" inert={presenter.open}>
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          <ScenarioGate />
        </main>
        <AppFooter onOpenPresenterTools={presenter.show} />
        <BottomNav />
      </div>
      {presenter.open && <DemoPanel onClose={presenter.hide} />}
    </>
  )
}
