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
 * O WhatsApp é o número CONECTADO (por-03, revisão do Heitor de 2026-11-02:
 * a conversa cai no inbox e fica registrada): o ativo rotulado com a unidade
 * do endereço, senão o padrão da rede; sem nenhum, o telefone da unidade (ou o
 * da rede). Só o número sai da tabela de credencial, lido pelo servidor —
 * nunca a credencial. O "Ligar" é sempre o telefone.
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

/** O link do WhatsApp com a mensagem pronta (A66): a cliente só aperta enviar. */
export function comMensagem(link: string | null, mensagem: string): string | null {
  return link ? `${link}?text=${encodeURIComponent(mensagem)}` : null
}

/** O número de WhatsApp conectado para a unidade (por-03): o dela, senão o padrão da rede. */
async function numeroConectado(admin: ReturnType<typeof createAdminClient>, tenantId: string, branchId: string): Promise<string | null> {
  const numeros = ((await ler(admin.from('whatsapp_numbers').select('phone_e164, branch_id, is_default')
    .eq('tenant_id', tenantId).eq('is_active', true).not('phone_e164', 'is', null)
    .order('is_default', { ascending: false }).order('created_at'), 'buscar o WhatsApp da unidade')) ?? []) as
    { phone_e164: string; branch_id: string | null; is_default: boolean }[]
  return (numeros.find(n => n.branch_id === branchId) ?? numeros.find(n => n.is_default))?.phone_e164 ?? null
}

export async function aClinicaDoEndereco(slug: string): Promise<AClinica | null> {
  const admin = createAdminClient()
  const u = await ler(admin.from('branches')
    .select('id, tenant_id, name, phone, address, city, state, zip_code, horario, tenants!inner(name, phone)')
    .eq('slug', slug).eq('is_active', true).maybeSingle(), 'buscar a clínica do endereço') as {
      id: string; tenant_id: string
      name: string; phone: string | null; address: string | null; city: string | null; state: string | null; zip_code: string | null
      horario: unknown; tenants: { name: string; phone: string | null }
    } | null
  if (!u) return null
  const telefone = u.phone || u.tenants.phone || null
  const conectado = await numeroConectado(admin, u.tenant_id, u.id)
  const cidade = [u.city, u.state].filter(Boolean).join(' – ')
  const endereco = [u.address, cidade, formatarCep(u.zip_code)].filter(Boolean).join(', ') || null
  return {
    nome:     u.name,
    endereco,
    telefone: formatarTelefone(telefone),
    whatsapp: linkDoWhatsapp(conectado ?? telefone),
    ligar:    linkDoWhatsapp(telefone)?.replace('https://wa.me/', 'tel:+') ?? null,
    horario:  resumoDoHorario(normalizarHorario(u.horario), null),
  }
}
