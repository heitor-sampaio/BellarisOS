import { supabase } from './supabase'
import type { BootstrapData, BranchesResponse, DayAppointment, ClientHit, NewAppointmentBody } from './types'

const BASE = import.meta.env.VITE_API_BASE as string

/** Monta querystring ignorando valores vazios/undefined. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeaders() })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Erro ${res.status}`)
  return json as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Erro ${res.status}`)
  return json as T
}

export const api = {
  branches: () => get<BranchesResponse>('/api/ext/branches'),
  bootstrap: (branchId?: string) => get<BootstrapData>(`/api/ext/bootstrap${qs({ branchId })}`),
  agenda: (date: string, branchId?: string) =>
    get<{ appointments: DayAppointment[] }>(`/api/ext/agenda${qs({ date, branchId })}`),
  slots: (professionalId: string, date: string, durationMin: number, branchId?: string) =>
    get<{ slots: string[] }>(`/api/ext/slots${qs({ professionalId, date, durationMin, branchId })}`),
  searchClients: (q: string) =>
    get<{ clients: ClientHit[] }>(`/api/ext/clients/search${qs({ q })}`),
  createAppointment: (body: NewAppointmentBody) =>
    post<{ success: boolean; id: string }>('/api/ext/appointments', body),
}
