import type { Prisma, PrismaClient, TrackingMode } from '@prisma/client';
import { Prisma as PrismaRuntime } from '@prisma/client';

/** `GET /api/categories` item (F-02 §4.1). */
export interface CategorySummary {
  id: string;
  name: string;
  templateCount: number;
}

/** Template as returned by the API (F-02 §4.2): decimals as numbers, never `createdById`. */
export interface TemplateRecord {
  id: string;
  category: { id: string; name: string };
  name: string;
  targetBodyPart: string;
  trackingMode: TrackingMode;
  unit: string;
  cardioCategory: string | null;
  metValue: number;
  rangeMin: number;
  rangeMax: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateFilter {
  categoryId?: string;
  trackingMode?: TrackingMode;
}

/** Exercise library storage (F-02): the shared catalog of categories and base templates. */
export interface LibraryRepository {
  listCategories(): Promise<CategorySummary[]>;
  listTemplates(filter: TemplateFilter): Promise<TemplateRecord[]>;
  findTemplate(id: string): Promise<TemplateRecord | null>;
}

const templateSelect = {
  id: true,
  category: { select: { id: true, name: true } },
  name: true,
  targetBodyPart: true,
  trackingMode: true,
  unit: true,
  cardioCategory: true,
  metValue: true,
  rangeMin: true,
  rangeMax: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExerciseTemplateSelect;

type TemplateRow = Prisma.ExerciseTemplateGetPayload<{ select: typeof templateSelect }>;

function toRecord(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    targetBodyPart: row.targetBodyPart,
    trackingMode: row.trackingMode,
    unit: row.unit,
    cardioCategory: row.cardioCategory,
    metValue: row.metValue.toNumber(),
    rangeMin: row.rangeMin.toNumber(),
    rangeMax: row.rangeMax.toNumber(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** PostgreSQL rejects a malformed UUID with P2023; for a lookup that is simply "no such record". */
function isInvalidId(err: unknown): boolean {
  return err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2023';
}

export function createPrismaLibraryRepository(prisma: PrismaClient): LibraryRepository {
  return {
    async listCategories() {
      const rows = await prisma.category.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, _count: { select: { templates: true } } },
      });
      return rows.map((r) => ({ id: r.id, name: r.name, templateCount: r._count.templates }));
    },

    async listTemplates(filter) {
      const rows = await prisma.exerciseTemplate.findMany({
        where: {
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
          ...(filter.trackingMode ? { trackingMode: filter.trackingMode } : {}),
        },
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        select: templateSelect,
      });
      return rows.map(toRecord);
    },

    async findTemplate(id) {
      try {
        const row = await prisma.exerciseTemplate.findUnique({ where: { id }, select: templateSelect });
        return row ? toRecord(row) : null;
      } catch (err) {
        if (isInvalidId(err)) return null;
        throw err;
      }
    },
  };
}
