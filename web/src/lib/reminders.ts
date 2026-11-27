import { ApiError, apiFetch, messageForCode, type FieldError } from './api'

// F-09 (Sprint 3): schedule view and reminder settings. Display only: the app never sends a reminder.
export type Reminder = {
  id: string
  timeOfDay: string
  repeatDays: number[]
  label: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type ReminderInput = Pick<Reminder, 'timeOfDay' | 'label' | 'repeatDays' | 'enabled'>

export type ScheduleView = 'week' | 'month'

export type ScheduleItem = {
  planItemId: string
  planKey: string
  version: number
  userExerciseId: string
  name: string
  trackingMode: string
}

export type ScheduleDay = { date: string; isRestDay: boolean; items: ScheduleItem[] }

export type Schedule = { view: ScheduleView; from: string; to: string; today: string; days: ScheduleDay[] }

export const remindersApi = {
  list: async (): Promise<Reminder[]> => (await apiFetch<Reminder[]>('/api/reminders')) ?? [],
  create: async (input: ReminderInput): Promise<Reminder> =>
    (await apiFetch<Reminder>('/api/reminders', { method: 'POST', body: JSON.stringify(input) }))!,
  update: async (id: string, input: Partial<ReminderInput>): Promise<Reminder> =>
    (await apiFetch<Reminder>(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify(input) }))!,
  remove: async (id: string): Promise<void> => {
    await apiFetch<null>(`/api/reminders/${id}`, { method: 'DELETE' })
  },
  schedule: async (view: ScheduleView, date?: string): Promise<Schedule> =>
    (await apiFetch<Schedule>(`/api/schedule?view=${view}${date ? `&date=${date}` : ''}`))!,
}

export function describeReminderError(error: unknown): { code: string; message: string; fields: FieldError[] } {
  if (error instanceof ApiError) {
    return { code: error.code, message: messageForCode(error.code, error.message), fields: error.fields }
  }
  return { code: 'INTERNAL_ERROR', message: messageForCode('INTERNAL_ERROR'), fields: [] }
}
