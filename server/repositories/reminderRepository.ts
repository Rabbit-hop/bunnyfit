import type { PrismaClient, ReminderSetting } from '@prisma/client';
import type { ReminderFields } from '../domain/reminderValidation.js';
import { isoDaysToMask, maskToIsoDays } from '../domain/planValidation.js';

/** A reminder as the API returns it (F-09 §4.2): never `userId` (R14); `repeatDays` as ISO weekdays. */
export interface ReminderRecord extends ReminderFields {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderRepository {
  /** The caller's reminders, `timeOfDay` then `createdAt` ascending (R12). */
  list(userId: string): Promise<ReminderRecord[]>;
  create(userId: string, fields: ReminderFields): Promise<ReminderRecord>;
  /** Null when the row no longer exists. */
  update(id: string, fields: Partial<ReminderFields>): Promise<ReminderRecord | null>;
  /** False when the row no longer exists. */
  remove(id: string): Promise<boolean>;
  /** Owner lookup for the resource-owner policy: the owner's id, or null if unknown. */
  ownerOf(id: string): Promise<string | null>;
}

function toRecord(row: ReminderSetting): ReminderRecord {
  return {
    id: row.id,
    timeOfDay: row.timeOfDay,
    repeatDays: maskToIsoDays(row.repeatDays),
    label: row.label,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The bitmask conversion happens here only (F-03 R11 convention). */
function toData(fields: Partial<ReminderFields>) {
  const { repeatDays, ...rest } = fields;
  return { ...rest, ...(repeatDays ? { repeatDays: isoDaysToMask(repeatDays) } : {}) };
}

export function createPrismaReminderRepository(prisma: PrismaClient): ReminderRepository {
  return {
    async list(userId) {
      const rows = await prisma.reminderSetting.findMany({
        where: { userId },
        orderBy: [{ timeOfDay: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toRecord);
    },

    async create(userId, fields) {
      const row = await prisma.reminderSetting.create({
        data: {
          userId,
          timeOfDay: fields.timeOfDay,
          label: fields.label,
          repeatDays: isoDaysToMask(fields.repeatDays),
          enabled: fields.enabled,
        },
      });
      return toRecord(row);
    },

    async update(id, fields) {
      const result = await prisma.reminderSetting.updateMany({ where: { id }, data: toData(fields) });
      if (result.count === 0) return null;
      const row = await prisma.reminderSetting.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async remove(id) {
      const result = await prisma.reminderSetting.deleteMany({ where: { id } });
      return result.count > 0;
    },

    async ownerOf(id) {
      const row = await prisma.reminderSetting.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    },
  };
}
