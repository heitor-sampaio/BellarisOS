import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { formatarCep, formatarTelefone } from '@/lib/documentos/valores'
import { normalizarHorario, resumoDoHorario } from '@/lib/agenda/horario'

/**
 * A clínica do ENDEREÇO, como a cliente a vê no app (J-66, 2026-10-30):
 * nenhuma tela trazia endereço, telefone, WhatsApp nem horário. É a unidade
 * do slug (único no sistema, §5) — a mesma de onde vem a ficha dela.
 *
 * O WhatsApp é o telefone da unidade (ou o da rede): o número conectado ao
 * inbox mora em tabela de credencial e não vai à cliente.
 */
export interface AClinica {
  nome:      string
  endereco:  string | null
  telefone:  string | null
  /** `https://wa.me/55…`, ou nulo sem telefone. */
  whatsapp:  string | null
  /** `tel:+55…`, para ligar. */
  ligar:     string | null
  /** "Seg a sex, 08:00–20:00" — a unidade, dia a dia (`resumoDoHorario`). */
  horario:   string[]
}

/** O link do WhatsApp de um telefone brasileiro (com ou sem o 55). */
export function linkDoWhatsapp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`
}

export async function aClinicaDoEndereco(slug: string): Promise<AClinica | null> {
  const admin = createAdminClient()
  const u = await ler(admin.from('branches')
    .select('name, phone, address, city, state, zip_code, horario, tenants!inner(name, phone)')
    .eq('slug', slug).eq('is_active', true).maybeSingle(), 'buscar a clínica do endereço') as {
      name: string; phone: string | null; address: string | null; city: string | null; state: string | null; zip_code: string | null
      horario: unknown; tenants: { name: string; phone: string | null }
    } | null
  if (!u) return null
  const telefone = u.phone || u.tenants.phone || null
  const cidade = [u.city, u.state].filter(Boolean).join(' – ')
  const endereco = [u.address, cidade, formatarCep(u.zip_code)].filter(Boolean).join(', ') || null
  return {
    nome:     u.name,
    endereco,
    telefone: formatarTelefone(telefone),
    whatsapp: linkDoWhatsapp(telefone),
    ligar:    linkDoWhatsapp(telefone)?.replace('https://wa.me/', 'tel:+') ?? null,
    horario:  resumoDoHorario(normalizarHorario(u.horario), null),
  }
}
