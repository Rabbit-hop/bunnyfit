import type { Prisma, PrismaClient, TrackingMode } from '@prisma/client';
import { Prisma as PrismaRuntime } from '@prisma/client';
import type { TemplateInput } from '../domain/templateValidation.js';

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

/** `duplicate`: name already used in the category; `category_not_found`: `categoryId` has no row. */
export type TemplateWriteFailure = 'duplicate' | 'category_not_found';

export type DeleteCategoryResult = 'deleted' | 'not_found' | 'has_templates';

/** Exercise library storage (F-02): the shared catalog of categories and base templates. */
export interface LibraryRepository {
  listCategories(): Promise<CategorySummary[]>;
  /** Returns null when a category with that name already exists. */
  createCategory(name: string): Promise<{ id: string; name: string } | null>;
  /** `not_found` when the id does not exist; `duplicate` when the name is taken. */
  renameCategory(id: string, name: string): Promise<{ id: string; name: string } | 'not_found' | 'duplicate'>;
  deleteCategory(id: string): Promise<DeleteCategoryResult>;
  createTemplate(input: TemplateInput, createdById: string): Promise<TemplateRecord | TemplateWriteFailure>;
  updateTemplate(id: string, input: TemplateInput): Promise<TemplateRecord | TemplateWriteFailure | 'not_found'>;
  /** False when the id does not exist. */
  deleteTemplate(id: string): Promise<boolean>;
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

function isUniqueViolation(err: unknown): boolean {
  return err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** P2025 = record to update/delete not found. */
function isNotFound(err: unknown): boolean {
  return err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2025';
}

function templateWriteFailure(err: unknown): TemplateWriteFailure | null {
  if (isUniqueViolation(err)) return 'duplicate';
  // P2003: foreign key on categoryId has no matching Category.
  if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2003') return 'category_not_found';
  return null;
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

    async createCategory(name) {
      try {
        const row = await prisma.category.create({ data: { name }, select: { id: true, name: true } });
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) return null;
        throw err;
      }
    },

    async renameCategory(id, name) {
      try {
        return await prisma.category.update({ where: { id }, data: { name }, select: { id: true, name: true } });
      } catch (err) {
        if (isUniqueViolation(err)) return 'duplicate';
        if (isNotFound(err)) return 'not_found';
        throw err;
      }
    },

    async deleteCategory(id) {
      try {
        const row = await prisma.category.findUnique({ where: { id }, select: { _count: { select: { templates: true } } } });
        if (!row) return 'not_found';
        if (row._count.templates > 0) return 'has_templates';
        await prisma.category.delete({ where: { id } });
        return 'deleted';
      } catch (err) {
        if (isNotFound(err)) return 'not_found';
        // Foreign key (ON DELETE RESTRICT) caught a template added between the count and the delete.
        if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2003') return 'has_templates';
        throw err;
      }
    },

    async createTemplate(input, createdById) {
      try {
        const row = await prisma.exerciseTemplate.create({ data: { ...input, createdById }, select: templateSelect });
        return toRecord(row);
      } catch (err) {
        const failure = templateWriteFailure(err);
        if (failure) return failure;
        throw err;
      }
    },

    async updateTemplate(id, input) {
      try {
        const row = await prisma.exerciseTemplate.update({ where: { id }, data: input, select: templateSelect });
        return toRecord(row);
      } catch (err) {
        if (isNotFound(err)) return 'not_found';
        const failure = templateWriteFailure(err);
        if (failure) return failure;
        throw err;
      }
    },

    async deleteTemplate(id) {
      try {
        await prisma.exerciseTemplate.delete({ where: { id } });
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
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
