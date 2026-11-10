import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import {
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
  const initialToast = (location.state as { toast?: string } | null)?.toast ?? ''

  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [toast, setToast] = useState(initialToast)
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null)

  const [newCategory, setNewCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const noticeRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const [cats, tpls] = await Promise.all([
        listCategories(),
        listTemplates({ categoryId: categoryFilter, trackingMode: modeFilter }),
      ])
      setCategories(cats)
      setTemplates(tpls)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [categoryFilter, modeFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

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
    <section className="page library-page" data-testid="library-page">
      <h2>Exercise Library</h2>

      {toast && (
        <p className="toast" role="status" data-testid="library-toast">
          {toast}
        </p>
      )}
      {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}

      <div className="library-section">
        <div className="library-section-head">
          <h3>Templates</h3>
          <Link className="btn btn-primary" to="/manager/library/templates/new" data-testid="template-new">
            New template
          </Link>
        </div>

        <div className="library-filters">
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} data-testid="filter-mode">
              <option value="">All modes</option>
              {TRACKING_MODES.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </div>

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

        {state === 'ready' && templates.length === 0 && (
          <p className="empty-state" data-testid="templates-empty">
            No exercises yet. Add the first one
          </p>
        )}

        {state === 'ready' && templates.length > 0 && (
          <div className="table-scroll">
            <table className="library-table" data-testid="template-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Mode</th>
                  <th>Body part</th>
                  <th>Range</th>
                  <th>MET</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} data-testid={`template-row-${t.id}`}>
                    <td>{t.name}</td>
                    <td>{t.category.name}</td>
                    <td>{MODE_LABEL[t.trackingMode]}</td>
                    <td>{t.targetBodyPart}</td>
                    <td>{formatRange(t)}</td>
                    <td>{t.metValue}</td>
                    <td className="row-actions">
                      <Link
                        className="btn btn-secondary"
                        to={`/manager/library/templates/${t.id}`}
                        data-testid={`template-edit-${t.id}`}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPendingDelete(t)}
                        data-testid={`template-delete-${t.id}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="library-section">
        <h3>Categories</h3>

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
