import { formatRepeatDays } from '../lib/plan'
import type { Reminder } from '../lib/reminders'

/** F-09 §6: shown above the list at all times. The app has no delivery of any kind (SRS Exclusion 6). */
export const DISPLAY_ONLY_NOTICE = 'Reminders are saved and shown in the app only. Nothing is sent: no email, push or SMS.'

type Props = {
  reminders: Reminder[]
  onEdit: (reminder: Reminder) => void
  onDelete: (reminder: Reminder) => void
  onToggle: (reminder: Reminder) => void
  busyId?: string | null
}

/** Presentational list of the Participant's reminder settings (time, label, days, On/Off). */
export function ReminderList({ reminders, onEdit, onDelete, onToggle, busyId = null }: Props) {
  return (
    <div className="reminder-list-wrap">
      <p className="reminder-notice" role="note" data-testid="reminder-notice">
        {DISPLAY_ONLY_NOTICE}
      </p>
      {reminders.length === 0 ? (
        <p className="muted" data-testid="reminder-empty">
          No reminders yet.
        </p>
      ) : (
        <ul className="reminder-list" data-testid="reminder-list">
          {reminders.map((r) => (
            <li key={r.id} className={r.enabled ? 'reminder-row' : 'reminder-row reminder-off'} data-testid="reminder-row">
              <span className="reminder-time" data-testid="reminder-time">
                {r.timeOfDay}
              </span>
              <span className="reminder-main">
                <span className="reminder-label" data-testid="reminder-label">
                  {r.label}
                </span>
                <span className="muted" data-testid="reminder-days">
                  {formatRepeatDays(r.repeatDays)}
                </span>
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className={r.enabled ? 'chip-toggle chip-toggle-on' : 'chip-toggle'}
                  aria-pressed={r.enabled}
                  aria-label={`${r.label}: ${r.enabled ? 'On' : 'Off'}`}
                  data-testid="reminder-toggle"
                  disabled={busyId === r.id}
                  onClick={() => onToggle(r)}
                >
                  {r.enabled ? 'On' : 'Off'}
                </button>
                <button type="button" className="entry-action" data-testid="reminder-edit" disabled={busyId === r.id} onClick={() => onEdit(r)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="entry-action entry-action-danger"
                  data-testid="reminder-delete"
                  disabled={busyId === r.id}
                  onClick={() => onDelete(r)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
