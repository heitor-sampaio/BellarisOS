import 'server-only'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { emitirEventoClinico } from '@/lib/events/clinico'
import { EVENTOS } from '@estetica-os/types'
import { gerarPdfAssinado } from './pdf'

/**
 * O que os canais de assinatura têm em comum (clínica, papel, portal, link).
 * Mora fora de `actions/` porque lá todo export vira endpoint público.
 */

export interface DocumentoAssinavel {
  id:             string
  tenant_id:      string
  branch_id:      string | null
  client_id:      string
  appointment_id: string | null
  title:          string
  status:         string
}

export const COLUNAS_ASSINAVEIS = 'id, tenant_id, branch_id, client_id, appointment_id, title, status'

/**
 * O IP de quem está na tela. Atrás do proxy do Railway, o primeiro do
 * `x-forwarded-for`. Só vai para o banco se tiver cara de IP: o parâmetro é
 * `inet`, e um valor torto faria a ASSINATURA inteira falhar.
 */
export async function ipEAparelho(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const bruto = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0]!.trim()
  const ip = /^(\d{1,3}\.){3}\d{1,3}$/.test(bruto) || (/^[0-9a-f:]+$/i.test(bruto) && bruto.includes(':')) ? bruto : null
  return { ip, ua: (h.get('user-agent') ?? '').slice(0, 500) || null }
}

export async function dadosDoAssinante(clientId: string): Promise<{ nome: string; documento: string | null }> {
  const admin = createAdminClient()
  const c = await ler(admin.from('clients').select('name, document').eq('id', clientId).single(), 'buscar o cliente')
  if (!c) throw new Error('Cliente do documento não encontrado.')
  const cpf = ((c.document as string | null) ?? '').replace(/\D/g, '')
  return { nome: c.name as string, documento: cpf || null }
}

/**
 * Depois que `documento_assinar` gravou: o evento (aviso do que aconteceu, e
 * só se gravou) e o PDF final em `after()` — quem assinou não espera o PDF, e
 * o cron `documentos-pdf` recolhe o que falhar aqui.
 *
 * `ator`: quem conduziu, da equipe; nulo quando foi o próprio cliente.
 */
export async function depoisDeAssinar(
  doc: DocumentoAssinavel,
  ator: { internalUserId: string | null; userName?: string | null } | null,
): Promise<void> {
  await emitirEventoClinico(EVENTOS.TERMO_ASSINADO, doc.id,
    { tenantId: doc.tenant_id, internalUserId: ator?.internalUserId ?? null, userName: ator?.userName ?? null }, {
      clientId:      doc.client_id,
      agendamentoId: doc.appointment_id,
      referencia:    doc.title,
      branchId:      doc.branch_id,
      chave:         'termo.assinado:' + doc.id,
    })
  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  revalidatePath('/[slug]/cliente/documentos', 'page')
  after(async () => {
    try { await gerarPdfAssinado(doc.tenant_id, doc.id) }
    catch (e) { console.error('[documentos] PDF assinado ficou para o cron:', (e as Error).message) }
  })
}
