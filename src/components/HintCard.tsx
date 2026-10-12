import { Button } from './Button'
import { Card } from './Card'

export type HintCardProps = {
  title: string
  body: string
  /** Optional secondary action (« Installer », « Exporter »); the dismiss button then reads « Plus tard ». */
  primary?: { label: string; onClick: () => void }
  onDismiss: () => void
}

function dismissLabel(hasPrimary: boolean): string {
  if (hasPrimary) return 'Plus tard'
  return 'OK'
}

/** Dismissible install / export hint on Classement (spec §3.1, §5, §9). */
export function HintCard({ title, body, primary, onDismiss }: HintCardProps) {
  return (
    <Card className="hint">
      <h3 className="hint-title">{title}</h3>
      <p className="hint-body">{body}</p>
      <div className="hint-actions">
        <Button variant="text" inline onClick={onDismiss}>
          {dismissLabel(primary !== undefined)}
        </Button>
        {primary && (
          <Button variant="secondary" inline onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
      </div>
    </Card>
  )
}
