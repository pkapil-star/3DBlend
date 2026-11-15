import { AlertItem } from '../../components/AlertItem.tsx'
import { Card } from '../../components/Card.tsx'
import type { Evaluation } from '../../engine/index.ts'
import { activeAlerts } from '../../lib/alerts.ts'

export function AlertList({ evaluation }: { evaluation: Evaluation }) {
  const alerts = activeAlerts(evaluation)
  return (
    <Card title="Active alerts">
      {alerts.length === 0 ? (
        <p>No active alerts.</p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <AlertItem key={alert.key} alert={alert} />
          ))}
        </ul>
      )}
    </Card>
  )
}
