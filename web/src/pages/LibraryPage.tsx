import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { TemplateDialog } from '../components/TemplateDialog'
import {
  DEFAULT_TEMPLATE_IMAGE,
  MODE_LABEL,
  TRACKING_MODES,
  createCategory,
  deleteCategory,
  deleteTemplate,
  describeError,
  formatRange,
  listCategories,
  listTemplates,
  renameCategory,
  type Category,
  type Template,
} from '../lib/library'

type LoadState = 'loading' | 'ready' | 'error'

export function LibraryPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const initialToast = (location.state as { toast?: string } | null)?.toast ?? ''

  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [keyword, setKeyword] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState(initialToast)
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  // undefined = closed, null = new template, Template = editing
  const [templateDialog, setTemplateDialog] = useState<Template | null | undefined>(undefined)

  const [newCategory, setNewCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const noticeRef = useRef<HTMLDivElement>(null)
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    // Only the latest request may update the page; an older, slower response is ignored.
    const seq = ++loadSeq.current
    setState('loading')
    try {
      const [cats, tpls] = await Promise.all([
        listCategories(),
        listTemplates({ categoryId: categoryFilter, trackingMode: modeFilter }),
      ])
      if (seq !== loadSeq.current) return
      setCategories(cats)
      setTemplates(tpls)
      setState('ready')
    } catch {
      if (seq !== loadSeq.current) return
      setState('error')
    }
  }, [categoryFilter, modeFilter])

  useEffect(() => {
    void load()
  }, [load])

  // The "saved" toast arrives via router state: clear that state so a refresh does not show it again.
  useEffect(() => {
    if (initialToast) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toasts dismiss themselves.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Close the Categories dialog with Esc
  useEffect(() => {
    if (!categoriesOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCategoriesOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [categoriesOpen])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  // Keyword pills = exercise names currently loaded (max 8, no duplicates)
  const keywords = useMemo(() => Array.from(new Set(templates.map((t) => t.name))).slice(0, 8), [templates])

  const visibleTemplates = useMemo(
    () => {
      const needle = query.trim().toLowerCase()
      return templates.filter(
        (t) => (!keyword || t.name === keyword) && (!needle || t.name.toLowerCase().includes(needle)),
      )
    },
    [templates, keyword, query],
  )

  function chooseCategory(id: string) {
    setCategoryFilter(id)
    setKeyword(null)
  }

  async function refreshCategories() {
    setCategories(await listCategories())
  }

  async function onAddCategory(event: FormEvent) {
    event.preventDefault()
    setCategoryError('')
    setNotice('')
    try {
      await createCategory(newCategory.trim())
      setNewCategory('')
      await refreshCategories()
    } catch (error) {
      setCategoryError(describeFieldMessage(error))
    }
  }

  async function onRename(event: FormEvent) {
    event.preventDefault()
    if (!renamingId) return
    setCategoryError('')
    try {
      await renameCategory(renamingId, renameValue.trim())
      setRenamingId(null)
      await load()
    } catch (error) {
      setCategoryError(describeFieldMessage(error))
    }
  }

  async function onDeleteCategory(category: Category) {
    setNotice('')
    setCategoryError('')
    try {
      await deleteCategory(category.id)
      setToast(`Category "${category.name}" deleted.`)
      if (categoryFilter === category.id) setCategoryFilter('')
      await refreshCategories()
    } catch (error) {
      setNotice(describeError(error).message)
    }
  }

  async function confirmDeleteTemplate() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    setNotice('')
    try {
      await deleteTemplate(target.id)
      setToast(`Template "${target.name}" deleted.`)
      await load()
    } catch (error) {
      setNotice(describeError(error).message)
    }
  }

  return (
    <section className="library-page" data-testid="library-page">
      <header className="page-holder">
        <h2>Exercise Library</h2>
        <div className="lib-top-actions">
          <button
            type="button"
            className="btn btn-secondary lib-new"
            onClick={() => setCategoriesOpen(true)}
            data-testid="categories-open"
          >
            Categories
          </button>
          <button type="button" className="btn btn-primary lib-new" onClick={() => setTemplateDialog(null)} data-testid="template-new">
            New template
          </button>
        </div>
      </header>

      {toast && (
        <p className="toast" role="status" data-testid="library-toast">
          {toast}
        </p>
      )}
      {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}

      {/* Row 1: category circles */}
      <div className="chip-row" role="group" aria-label="Categories">
        <button
          type="button"
          aria-pressed={categoryFilter === ''}
          className={categoryFilter === '' ? 'chip-circle active' : 'chip-circle'}
          onClick={() => chooseCategory('')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={categoryFilter === c.id}
            className={categoryFilter === c.id ? 'chip-circle active' : 'chip-circle'}
            onClick={() => chooseCategory(c.id)}
            data-testid={`category-chip-${c.id}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Row 2: popular exercise keywords */}
      <div className="chip-row chip-row-pills" role="group" aria-label="Popular exercises">
        <label className="search-box">
          <span className="search-dot" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
          </span>
          <span className="sr-only">Search exercises by name</span>
          <input
            type="search"
            value={query}
            maxLength={80}
            placeholder="Search exercises"
            onChange={(e) => setQuery(e.target.value)}
            data-testid="library-search"
          />
        </label>
        {keywords.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={keyword === name}
            className={keyword === name ? 'chip-pill active' : 'chip-pill'}
            onClick={() => setKeyword(keyword === name ? null : name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="library-filters">
        {/* Kept for tests and screen readers; the circles above are the visible category filter */}
        <label className="sr-only">
          Category
          <select
            value={categoryFilter}
            onChange={(e) => chooseCategory(e.target.value)}
            data-testid="filter-category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select
            value={modeFilter}
            onChange={(e) => {
              setModeFilter(e.target.value)
              setKeyword(null)
            }}
            data-testid="filter-mode"
          >
            <option value="">All modes</option>
            {TRACKING_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="lib-heading">{keyword ?? 'Templates'}</h3>

      {state === 'loading' && (
        <div className="skeleton-rows" data-testid="library-loading" aria-busy="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {state === 'error' && (
        <ErrorNotice>
          Something went wrong. Please try again.{' '}
          <button type="button" className="btn btn-secondary" onClick={() => void load()} data-testid="library-retry">
            Retry
          </button>
        </ErrorNotice>
      )}

      {state === 'ready' && templates.length === 0 && (categoryFilter || modeFilter) && (
        <p className="empty-state" data-testid="templates-no-match">
          No templates match these filters
        </p>
      )}

      {state === 'ready' && templates.length === 0 && !categoryFilter && !modeFilter && (
        <p className="empty-state" data-testid="templates-empty">
          No exercises yet. Add the first one
        </p>
      )}

      {state === 'ready' && templates.length > 0 && visibleTemplates.length === 0 && (
        <p className="empty-state" data-testid="search-no-match">
          No exercises match your search
        </p>
      )}

      {state === 'ready' && visibleTemplates.length > 0 && (
        <ul className="exercise-grid" data-testid="template-table">
          {visibleTemplates.map((t) => (
            <li key={t.id} className="exercise-card" data-testid={`template-row-${t.id}`}>
              <img src={t.imageUrl || DEFAULT_TEMPLATE_IMAGE} alt="" className="exercise-card-art" />
              <strong className="exercise-card-name">{t.name}</strong>
              <span className="exercise-card-cat">
                {t.category.name} · {MODE_LABEL[t.trackingMode]}
              </span>
              <span className="exercise-card-meta">
                {t.targetBodyPart} · {formatRange(t)} · MET {t.metValue}
              </span>
              <span className="row-actions exercise-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTemplateDialog(t)}
                  data-testid={`template-edit-${t.id}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPendingDelete(t)}
                  data-testid={`template-delete-${t.id}`}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {categoriesOpen && (
        <div
          className="dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCategoriesOpen(false)
          }}
        >
          <div
            className="dialog dialog-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="categories-title"
            data-testid="categories-dialog"
          >
            <div className="dialog-head">
              <h3 id="categories-title">Categories</h3>
              <button
                type="button"
                className="btn btn-secondary dialog-close"
                onClick={() => setCategoriesOpen(false)}
                aria-label="Close"
                data-testid="categories-close"
              >
                ✕
              </button>
            </div>

            <form className="inline-form" onSubmit={onAddCategory}>
              <label className="sr-only" htmlFor="category-add-name">
                New category name
              </label>
              <input
                id="category-add-name"
                value={newCategory}
                maxLength={50}
                placeholder="New category"
                onChange={(e) => setNewCategory(e.target.value)}
                data-testid="category-add-name"
              />
              <button type="submit" className="btn btn-primary" data-testid="category-add">
                Add
              </button>
            </form>
            {categoryError && (
              <p className="field-error" data-testid="field-error-name">
                {categoryError}
              </p>
            )}

            {state === 'ready' && categories.length === 0 && (
              <p className="empty-state" data-testid="categories-empty">
                No categories yet
              </p>
            )}

            <ul className="category-list">
              {categories.map((c) => (
                <li key={c.id} data-testid={`category-row-${c.id}`}>
                  {renamingId === c.id ? (
                    <form className="inline-form" onSubmit={onRename}>
                      <label className="sr-only" htmlFor={`category-rename-input-${c.id}`}>
                        Category name
                      </label>
                      <input
                        id={`category-rename-input-${c.id}`}
                        value={renameValue}
                        maxLength={50}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        data-testid={`category-rename-input-${c.id}`}
                      />
                      <button type="submit" className="btn btn-primary" data-testid={`category-rename-save-${c.id}`}>
                        Save
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setRenamingId(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="category-name">
                        {c.name} <small>({c.templateCount})</small>
                      </span>
                      <span className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setRenamingId(c.id)
                            setRenameValue(c.name)
                            setCategoryError('')
                          }}
                          data-testid={`category-rename-${c.id}`}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void onDeleteCategory(c)}
                          data-testid={`category-delete-${c.id}`}
                        >
                          Delete
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {templateDialog !== undefined && (
        <TemplateDialog
          template={templateDialog}
          categories={categories}
          onClose={() => setTemplateDialog(undefined)}
          onSaved={(name) => {
            setTemplateDialog(undefined)
            setToast(`Template "${name}" saved.`)
            void load()
          }}
        />
      )}

      {pendingDelete && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" data-testid="delete-dialog">
            <h3 id="delete-title">Delete "{pendingDelete.name}"?</h3>
            <p>Delete this template? Participants&apos; existing plans are not affected.</p>
            <div className="row-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPendingDelete(null)} data-testid="delete-cancel">
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirmDeleteTemplate()} data-testid="delete-confirm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function describeFieldMessage(error: unknown): string {
  const { message, fields } = describeError(error)
  const nameField = fields.find((f) => f.field === 'name')
  if (nameField) return `name: ${nameField.limit ?? message}`
  return message
}