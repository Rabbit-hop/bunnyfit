import type { APIRequestContext } from '@playwright/test'

const API = 'http://127.0.0.1:8080'

/**
 * Delete every Manager-library row an E2E run may have left behind: templates, then
 * categories whose name starts with "E2E " (the prefix all E2E specs use). Safe to call
 * repeatedly; seed data never starts with that prefix.
 */
export async function removeE2eLibraryData(request: APIRequestContext, email: string, password: string) {
  const login = await request.post(`${API}/api/auth/login`, { data: { email, password } })
  if (!login.ok()) return
  const { token } = (await login.json()) as { token: string }
  const headers = { Authorization: `Bearer ${token}` }

  const templates = (await (await request.get(`${API}/api/templates`, { headers })).json()) as { id: string; name: string }[]
  for (const t of templates.filter((x) => x.name.startsWith('E2E '))) {
    await request.delete(`${API}/api/templates/${t.id}`, { headers })
  }
  const categories = (await (await request.get(`${API}/api/categories`, { headers })).json()) as { id: string; name: string }[]
  for (const c of categories.filter((x) => x.name.startsWith('E2E '))) {
    await request.delete(`${API}/api/categories/${c.id}`, { headers })
  }
}
