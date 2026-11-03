import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getNumerosDaRede } from '@/lib/whatsapp/factory'
import { caixasDoAlcance, conversaAoAlcance } from '@/lib/inbox/alcance'
import { numeroRemovidoDaConversa } from '@/lib/inbox/numero-removido'
import { variantesDoTelefone } from '@/lib/importacao/normalizar'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Responder a pessoa da conversa de um número REMOVIDO por outro número
 * (r3-f14-04, o Heitor em 2026-11-03: "Um botão 'Responder pelo número X' com
 * uma seleção dos números possíveis, na própria conversa, que abre a conversa
 * nova no número atual").
 *
 * A conversa do número removido fica como está (r2-cfg-06): não se responde
 * por ela. Daqui sai a CONVERSA do mesmo contato no número escolhido — a que
 * já existe, se houver; senão, uma nova —, e é nela que a pessoa escreve. O
 * envio continua o de sempre (`enviarNaConversa`: a janela de 24h da caixa, o
 * suporte, o alcance).
 */

/** Um número pelo qual esta pessoa pode responder. */
export interface NumeroParaResponder {
  id:        string
  label:     string
  /** É o número DELA (`whatsapp_number_users`): é por ele que a escolha de saída manda. */
  doUsuario: boolean
}

/**
 * Os números ATIVOS da clínica que a pessoa alcança — os do cargo, quando o
 * cargo só vê as caixas dela (`caixasDoAlcance`) —, o dela primeiro, depois o
 * padrão e os outros pelo nome. Sem os removidos (`getNumerosDaRede` já os tira).
 */
export async function numerosParaResponder(admin: Admin, ctx: TenantContext): Promise<NumeroParaResponder[]> {
  const [numeros, caixas] = await Promise.all([getNumerosDaRede(ctx.tenantId!), caixasDoAlcance(admin, ctx)])
  const meu = (n: { userIds: string[] }) => !!ctx.internalUserId && n.userIds.includes(ctx.internalUserId)
  return numeros
    .filter(n => n.isActive && !n.removido && (caixas === null || caixas.includes(n.id)))
    .sort((a, b) => Number(meu(b)) - Number(meu(a)))
    .map(n => ({ id: n.id, label: n.label, doUsuario: meu(n) }))
}

interface ConversaDeOrigem {
  id: string; channel: string; contato_id: string | null; contact_name: string | null; contact_phone: string | null
  lead_id: string | null; client_id: string | null; branch_id: string | null; whatsapp_number_id: string | null
}

/**
 * Abre (ou cria) a conversa do contato da conversa `conversaId` no número
 * `numeroId`. Recusa, sem criar nada: a conversa fora do alcance, a que não é
 * de um número removido, o número que não está entre os da pessoa (removido,
 * fora do ar, de outra rede, fora das caixas do cargo).
 */
export async function abrirConversaNoNumero(
  admin: Admin, ctx: TenantContext, conversaId: string, numeroId: string,
): Promise<{ conversationId: string; criada: boolean } | { error: string }> {
  if (!(await conversaAoAlcance(admin, ctx, conversaId))) return { error: 'Conversa não encontrada.' }
  const conv = await ler(admin.from('conversations')
    .select('id, channel, contato_id, contact_name, contact_phone, lead_id, client_id, branch_id, whatsapp_number_id')
    .eq('id', conversaId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a conversa') as ConversaDeOrigem | null
  if (!conv || conv.channel !== 'whatsapp') return { error: 'Conversa não encontrada.' }
  if (!(await numeroRemovidoDaConversa(admin, conv.whatsapp_number_id))) {
    return { error: 'O número desta conversa continua na clínica: responda por ela.' }
  }

  const opcoes = await numerosParaResponder(admin, ctx)
  if (!opcoes.some(n => n.id === numeroId)) return { error: 'Este número não está disponível para você responder.' }

  const telefone = (conv.contact_phone ?? '').replace(/\D/g, '')
  if (telefone.length < 8) {
    return { error: 'Esta conversa não tem o telefone da pessoa: comece a conversa pelo número da clínica a partir do card dela.' }
  }
  const formas = variantesDoTelefone(telefone)

  // A que já existe — da mesma pessoa, ou do mesmo telefone, naquele número.
  const existente = async () => {
    const quem = [conv.contato_id ? `contato_id.eq.${conv.contato_id}` : null, `contact_phone.in.(${formas.join(',')})`].filter(Boolean).join(',')
    const linhas = await ler(admin.from('conversations').select('id')
      .eq('tenant_id', ctx.tenantId!).eq('channel', 'whatsapp').eq('whatsapp_number_id', numeroId).or(quem)
      .order('last_message_at', { ascending: false, nullsFirst: false }).order('id').limit(1),
      'buscar a conversa da pessoa no número') as { id: string }[] | null
    return linhas?.[0]?.id ?? null
  }
  const ja = await existente()
  if (ja) return { conversationId: ja, criada: false }

  // Nasce da MESMA pessoa (o gatilho soma os aliases aos identificadores dela)
  // e com o card e a ficha da conversa de origem: no alcance "pela conversa",
  // sem o card a thread nova cairia no bolo comum.
  const { data: criada, error } = await admin.from('conversations').insert({
    tenant_id:           ctx.tenantId!,
    branch_id:           conv.branch_id,
    lead_id:             conv.lead_id,
    client_id:           conv.client_id,
    contato_id:          conv.contato_id,
    channel:             'whatsapp',
    status:              'open',
    contact_name:        conv.contact_name,
    contact_phone:       telefone,
    contact_external_id: telefone,
    contact_aliases:     [telefone],
    whatsapp_number_id:  numeroId,
  }).select('id').single<{ id: string }>()
  if (!error && criada) return { conversationId: criada.id, criada: true }

  // Duas abas ao mesmo tempo: a outra criou primeiro (o índice único do número).
  if (error?.code === '23505') {
    const depois = await existente()
    if (depois) return { conversationId: depois, criada: false }
  }
  console.error('[abrirConversaNoNumero]', error?.message)
  return { error: 'Não foi possível abrir a conversa neste número.' }
}
