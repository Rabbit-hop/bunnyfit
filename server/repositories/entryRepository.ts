import type { EntryKind, Prisma, PrismaClient } from '@prisma/client';

/**
 * `LedgerEntry` as returned by the API (F-04 §4.2): never `userId` — the row is
 * always addressed through the caller's own id (SDS §5.1 identity rule).
 * `logDate` is a `YYYY-MM-DD` string, `createdAt` an ISO-8601 UTC timestamp.
 */
export interface EntryRecord {
  id: string;
  userExerciseId: string;
  logDate: string;
  sets: number | null;
  totalReps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  kind: EntryKind;
  createdAt: string;
}

export interface InsertEntry {
  userId: string;
  userExerciseId: string;
  /** Always the Clock's business "today" (F-04 R3: the stored logDate is today). */
  logDate: string;
  sets: number | null;
  totalReps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  kind: EntryKind;
  /** From the injectable Clock (R15: F-05 reads it back to enforce BR-09). */
  createdAt: Date;
}

/** Ledger storage (F-04): owner-scoped read/insert of `LedgerEntry` rows. */
export interface EntryRepository {
  /** One user's entries of one calendar date, ordered by `createdAt` (creation order, §4.1). */
  listDayEntries(userId: string, date: string): Promise<EntryRecord[]>;
  /** One entry by id (`GET /api/entries/:id`). */
  findEntry(id: string): Promise<EntryRecord | null>;
  /** Owner of an entry, or null when it does not exist (route ownership check, §4.6). */
  findEntryOwner(id: string): Promise<string | null>;
  /** Inserts one row; the caller supplies `createdAt` from the Clock. */
  insert(input: InsertEntry): Promise<EntryRecord>;
  /**
   * F-04 R14: runs `fn` in one transaction that first locks the `UserExercise` row
   * (`SELECT ... FOR UPDATE`), so concurrent requests for the same exercise are
   * serialized — a second Quick Complete reads the sums only after the first commits.
   * An error thrown by `fn` rolls the transaction back (nothing is stored).
   */
  withExerciseLock<T>(userExerciseId: string, fn: (scope: EntryScope) => Promise<T>): Promise<T>;
}

/** The reads/writes available while an exercise row is locked. */
export interface EntryScope {
  listDayEntries(userId: string, date: string): Promise<EntryRecord[]>;
  insert(input: InsertEntry): Promise<EntryRecord>;
}

const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const toDay = (date: Date): string => date.toISOString().slice(0, 10);

export function toEntryRecord(row: Prisma.LedgerEntryGetPayload<object>): EntryRecord {
  return {
    id: row.id,
    userExerciseId: row.userExerciseId,
    logDate: toDay(row.logDate),
    sets: row.sets,
    totalReps: row.totalReps,
    durationSec: row.durationSec,
    distanceKm: row.distanceKm?.toNumber() ?? null,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
  };
}

type EntryClient = Pick<PrismaClient, 'ledgerEntry'> | Prisma.TransactionClient;

function createScope(client: EntryClient): EntryScope {
  return {
    async listDayEntries(userId, date) {
      const rows = await client.ledgerEntry.findMany({
        where: { userId, logDate: toDate(date) },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toEntryRecord);
    },

    async insert(input) {
      const row = await client.ledgerEntry.create({
        data: {
          userId: input.userId,
          userExerciseId: input.userExerciseId,
          logDate: toDate(input.logDate),
          sets: input.sets,
          totalReps: input.totalReps,
          durationSec: input.durationSec,
          distanceKm: input.distanceKm,
          kind: input.kind,
          createdAt: input.createdAt,
        },
      });
      return toEntryRecord(row);
    },
  };
}

export function createPrismaEntryRepository(prisma: PrismaClient): EntryRepository {
  const scope = createScope(prisma);
  return {
    ...scope,

    async findEntry(id) {
      const row = await prisma.ledgerEntry.findUnique({ where: { id } });
      return row ? toEntryRecord(row) : null;
    },

    async findEntryOwner(id) {
      const row = await prisma.ledgerEntry.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    },

    async withExerciseLock(userExerciseId, fn) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "UserExercise" WHERE "id" = ${userExerciseId}::uuid FOR UPDATE`;
        return fn(createScope(tx));
      });
    },
  };
}
