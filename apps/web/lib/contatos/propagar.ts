import type { createAdminClient } from '@/lib/supabase/admin'
import type { getTenantContext } from '@/lib/auth'
import { gravar, ler } from '@/lib/db'
import { registrarEventoLead } from '@/lib/lead-events'
import { normalizarTelefone } from '@/lib/importacao/normalizar'

type Admin = ReturnType<typeof createAdminClient>
type Ctx = Awaited<ReturnType<typeof getTenantContext>>

/** Só os dígitos — o formato que a conversa e o webhook usam. */
export const digitosDoTelefone = (t: string | null | undefined): string | null =>
  (t ?? '').replace(/\D/g, '') || null

/**
 * O MESMO número, com ou sem máscara e com ou sem o 55 do país (J-19): a tela
 * mostra "(41) 99200-0040" para o "5541992000040" do WhatsApp gravado.
 */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const nacional = (t: string | null | undefined) => {
    const d = digitosDoTelefone(t) ?? ''
    return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
  }
  const x = nacional(a)
  return x !== '' && x === nacional(b)
}

/** O mesmo número brasileiro com e sem o 55 (só dígitos). */
function formasDoMesmoNumero(d: string): string[] {
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return [d, d.slice(2)]
  if (d.length === 10 || d.length === 11) return [d, `55${d}`]
  return [d]
}

export const TELEFONE_INCOMPLETO = 'Telefone incompleto: com o DDD, 10 ou 11 dígitos (ou “+” e o código do país).'

/**
 * O telefone que a pessoa, a conversa e a oportunidade GUARDAM (C28 do
 * levantamento das regras, F70): o do WhatsApp — só dígitos, 55 + DDD + número
 * (`normalizarTelefone`, a mesma regra da importação); o de outro país, com
 * "+", fica com os dígitos dele. Era só tirar a máscara: "(48) 99876-1234"
 * virava "48998761234", e a próxima mensagem do WhatsApp ("5548998761234") não
 * achava a pessoa. O incompleto é recusado. O MESMO número de antes (com ou sem
 * máscara, com ou sem o 55) fica como estava — inclusive o de fora gravado sem
 * o "+".
 */
export function telefoneParaGravar(
  bruto: string | null | undefined, anterior?: string | null,
): { fone: string | null } | { error: string } {
  const d = digitosDoTelefone(bruto)
  if (!d) return { fone: null }
  if (anterior && (d === digitosDoTelefone(anterior) || mesmoTelefone(bruto, anterior))) return { fone: anterior }
  const fone = normalizarTelefone(bruto ?? '')
  return fone ? { fone } : { error: TELEFONE_INCOMPLETO }
}

/**
 * Nome e telefone são da PESSOA (§9.2.1), e quem guarda cópia deles — cada
 * conversa e cada oportunidade — tem de acompanhar. Até 2026-09-28 corrigir o
 * nome numa thread não mudava a outra thread da mesma pessoa, nem a própria
 * pessoa (`contacts`); e corrigir no card da oportunidade não mudava nada fora
 * dele.
 *
 * Chamado pelos dois lugares que editam: o painel do inbox (`atualizarContato`)
 * e o card da oportunidade (`updateLead`). Quem chama já gravou no próprio
 * registro; aqui vai o resto.
 *
 * - **Nome** vai para a pessoa, TODAS as conversas e TODAS as oportunidades.
 * - **Telefone** vai para a pessoa e para as conversas que tinham o MESMO número
 *   antigo, ou nenhum. Conversa com outro número é outro WhatsApp da mesma
 *   pessoa — e na conversa o telefone é o DESTINO da mensagem: trocar ali
 *   mandaria para o número errado. O número novo passa a identificar a pessoa,
 *   para a próxima mensagem vinda dele achá-la. Nas oportunidades vai para todas
 *   (é a cópia do card, não destino de nada).
 * - Cada oportunidade que mudou registra na linha do tempo dela o de → para.
 */
export async function propagarDadosDaPessoa(
  admin: Admin,
  ctx: Ctx,
  contatoId: string,
  mudanca: {
    /** Nome novo; `undefined` = não mexe. Vazio não apaga o nome de ninguém. */
    nome?: string | null
    /** Telefone novo (qualquer formato); `undefined` = não mexe. */
    telefone?: string | null
    /** O número que a edição substituiu — decide quais conversas acompanham. */
    telefoneAnterior?: string | null
  },
  opcoes: { excetoLead?: string } = {},
): Promise<void> {
  const tenantId = ctx.tenantId!
  const nome     = mudanca.nome?.trim() || null
  const mexeNome = mudanca.nome !== undefined && !!nome
  const mexeFone = mudanca.telefone !== undefined
  // No formato do WhatsApp (C28): quem chama já conferiu o tamanho; o que não
  // se reconhece (o de fora gravado sem o "+") segue só com os dígitos.
  const fone     = mexeFone ? (normalizarTelefone(mudanca.telefone ?? '') ?? digitosDoTelefone(mudanca.telefone)) : null
  const anterior = digitosDoTelefone(mudanca.telefoneAnterior)
  if (!mexeNome && !mexeFone) return

  // ─── A pessoa ──────────────────────────────────────────────────────────
  const pessoa = await ler(admin.from('contacts').select('identifiers')
    .eq('id', contatoId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a pessoa')
  if (!pessoa) return
  const patchPessoa: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (mexeNome) patchPessoa.name = nome
  if (mexeFone) {
    patchPessoa.phone = fone
    const ids = (pessoa.identifiers as string[] | null) ?? []
    if (fone && !ids.includes(fone)) patchPessoa.identifiers = [...ids, fone]
  }
  await gravar(admin.from('contacts').update(patchPessoa)
    .eq('id', contatoId).eq('tenant_id', tenantId), 'atualizar a pessoa')

  // ─── As conversas ──────────────────────────────────────────────────────
  const agora = new Date().toISOString()
  if (mexeNome) {
    await gravar(admin.from('conversations').update({ contact_name: nome, updated_at: agora })
      .eq('contato_id', contatoId).eq('tenant_id', tenantId), 'atualizar o nome nas conversas')
  }
  if (mexeFone) {
    // `anterior` é só dígitos: seguro dentro do filtro em texto. A conversa
    // pode guardar o mesmo número com ou sem o 55 (as gravadas antes da F70).
    const formas = anterior ? formasDoMesmoNumero(anterior) : []
    let q = admin.from('conversations').update({ contact_phone: fone, updated_at: agora })
      .eq('contato_id', contatoId).eq('tenant_id', tenantId)
    q = formas.length ? q.or(`contact_phone.is.null,contact_phone.in.(${formas.join(',')})`) : q.is('contact_phone', null)
    await gravar(q, 'atualizar o telefone nas conversas')
  }

  // ─── As oportunidades ──────────────────────────────────────────────────
  const leads = await ler(admin.from('leads').select('id, name, phone')
    .eq('tenant_id', tenantId).eq('contato_id', contatoId), 'buscar as oportunidades da pessoa')

  for (const lead of (leads ?? []) as { id: string; name: string | null; phone: string | null }[]) {
    if (lead.id === opcoes.excetoLead) continue
    const patch: Record<string, unknown> = {}
    const changes: { campo: string; de: string | null; para: string | null }[] = []

    // Nome é NOT NULL no lead: pessoa sem nome não apaga o do card.
    if (mexeNome && nome !== lead.name) {
      patch.name = nome
      changes.push({ campo: 'Nome', de: lead.name ?? null, para: nome })
    }
    if (mexeFone && fone !== digitosDoTelefone(lead.phone)) {
      patch.phone = fone
      changes.push({ campo: 'Telefone', de: lead.phone ?? null, para: fone })
    }
    if (changes.length === 0) continue

    await gravar(admin.from('leads').update(patch).eq('id', lead.id), 'atualizar a oportunidade da pessoa')
    await registrarEventoLead({
      tenantId, leadId: lead.id, type: 'UPDATED',
      actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
      changes,
    })
  }
}
