import { Card } from '../../components/Card.tsx'
import type { Environment, Rule } from '../../engine/index.ts'
import { useAppStore } from '../../store/index.ts'
import { selectEnvironment } from '../../store/selectors.ts'

const GRAVITY_WORDS: Record<Environment['gravity'], string | null> = {
  micro: null,
  lunar: 'Moon',
  mars: 'Mars',
}

/** Section 3 of the alert screen: the rule's own explanation. */
export function WhyItMatters({ rule }: { rule: Rule }) {
  const environment = useAppStore(selectEnvironment)
  const gravity = environment ? GRAVITY_WORDS[environment.gravity] : null
  return (
    <Card title="Why it matters">
      <p>{rule.explain.what}</p>
      <p className="mt-2">{rule.explain.whySpace}</p>
      {gravity && (
        // A statement about the app, not about the body: thresholds do not
        // change with the environment in v1 (section 14).
        <p className="mt-2 text-slate-700">
          This check uses the same limits in every environment. The app has no
          separate values for {gravity} gravity.
        </p>
      )}
    </Card>
  )
}
