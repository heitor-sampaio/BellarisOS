import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { leadAoAlcance } from '@/lib/crm/alcance'
import { conversaAoAlcance } from '@/lib/inbox/alcance'
import { variantesDoTelefone } from '@/lib/importacao/normalizar'
import { registrarEventoLead } from '@/lib/lead-events'
import { ligarContatoAoCliente } from '@/lib/clients/cliente-rapido'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A PESSOA do CRM (`contacts`, §9.2.1) que tem o telefone da cliente que se
 * cadastra e ainda não é cliente — D-9, decisão do Heitor (frente de cadastro,
 * 2026-10-29). Cadastrar a cliente com o número de um lead, até o PERDIDO que
 * voltou, criava uma ficha solta: o card seguia "Ainda não é cliente" e a
 * conversa sem o selo. A tela pergunta "É a mesma pessoa do lead X?".
 *
 * Só conta o que quem cadastra ALCANÇA: a oportunidade pela regra do funil
 * (`leadAoAlcance`) e a conversa pela do inbox (`conversaAoAlcance`) — sem o
 * CRM, nada (o nome do lead não sai por esta porta).
 */
export type PessoaDoCrm = {
  contatoId: string
  /** O nome do lead (o mais recente ao alcance) ou, sem lead, o da pessoa. */
  nome: string
  /** A oportunidade que se converte (a mais recente ao alcance); nula quando a pessoa só tem conversa. */
  leadId: string | null
  /** Todas as oportunidades ao alcance, ainda sem cliente, que se ligam. */
  leadIds: string[]
  conversaIds: string[]
  /** A oportunidade escolhida está perdida (a tela diz isso). */
  perdida: boolean
}

/** O telefone do cadastro (dígitos de `telefoneDoCadastro`) no formato do WhatsApp, com as variantes do nono dígito. */
function formasDoTelefone(digitos: string): string[] {
  const whatsapp = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos
  return variantesDoTelefone(whatsapp)
}

export async function pessoaDoCrmDoTelefone(admin: Admin, ctx: TenantContext, digitos: string): Promise<PessoaDoCrm | null> {
  const contatos = await ler(admin.from('contacts').select('id, name')
    .eq('tenant_id', ctx.tenantId!).overlaps('identifiers', formasDoTelefone(digitos))
    .order('created_at', { ascending: false }).limit(5), 'procurar a pessoa do CRM pelo telefone') as { id: string; name: string | null }[]

  for (const c of contatos) {
    const leads = await ler(admin.from('leads').select('id, name, client_id, perdido_em')
      .eq('tenant_id', ctx.tenantId!).eq('contato_id', c.id).order('created_at', { ascending: false }).limit(50),
      'buscar as oportunidades da pessoa') as { id: string; name: string | null; client_id: string | null; perdido_em: string | null }[]
    const conversas = await ler(admin.from('conversations').select('id, client_id')
      .eq('tenant_id', ctx.tenantId!).eq('contato_id', c.id).limit(50),
      'buscar as conversas da pessoa') as { id: string; client_id: string | null }[]
    // Já é cliente (de outra ficha): não é a pergunta deste cadastro.
    if (leads.some(l => l.client_id) || conversas.some(v => v.client_id)) continue

    const leadsAoAlcance: typeof leads = []
    for (const l of leads) if (await leadAoAlcance(admin, ctx, l.id)) leadsAoAlcance.push(l)
    const conversaIds: string[] = []
    for (const v of conversas) if (await conversaAoAlcance(admin, ctx, v.id)) conversaIds.push(v.id)
    if (!leadsAoAlcance.length && !conversaIds.length) continue

    const escolhido = leadsAoAlcance[0] ?? null
    return {
      contatoId: c.id,
      nome: escolhido?.name || c.name || 'sem nome',
      leadId: escolhido?.id ?? null,
      leadIds: leadsAoAlcance.map(l => l.id),
      conversaIds,
      perdida: !!escolhido?.perdido_em,
    }
  }
  return null
}

/**
 * "Sim, é a mesma pessoa": as OUTRAS oportunidades ao alcance e as conversas
 * passam a ser da cliente. A escolhida (`leadId`) segue o caminho da conversão
 * do `addClient` (CONVERTED, o clique do anúncio, a API de Conversões).
 */
export async function ligarPessoaDoCrmAoCliente(
  admin: Admin, ctx: TenantContext, pessoa: PessoaDoCrm, clientId: string,
): Promise<void> {
  for (const id of pessoa.leadIds) {
    if (id === pessoa.leadId) continue
    await gravar(admin.from('leads').update({ client_id: clientId })
      .eq('id', id).eq('tenant_id', ctx.tenantId!).is('client_id', null), 'ligar a oportunidade à cliente')
    await registrarEventoLead({
      tenantId: ctx.tenantId!, leadId: id, type: 'CONVERTED',
      actorUserId: ctx.internalUserId, actorName: ctx.userName || null,
    })
  }
  for (const id of pessoa.conversaIds) await ligarContatoAoCliente(admin, ctx.tenantId!, id, clientId)
}
