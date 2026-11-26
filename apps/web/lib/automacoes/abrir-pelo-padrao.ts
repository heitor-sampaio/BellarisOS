import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getNumerosDaRede } from '@/lib/whatsapp/factory'
import { variantesDoTelefone } from '@/lib/importacao/normalizar'
import { extrairVariaveis } from '@/lib/templates/core'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import { problemasDaAberturaPeloPadrao, type ModeloAprovado, type RedeParaAbrir } from './abrir-pelo-padrao-regras'

/**
 * O "Abrir pelo número padrão" do "Mandar mensagem" (AX-06; R10 — o Heitor,
 * 26/11, na página de perguntas: "Está no escopo: construir (com os modelos
 * aprovados pela Meta na automação)"). A rede escolheu, no passo, que a
 * cliente SEM conversa aberta recebe pelo número padrão — a conversa nasce no
 * inbox, com a mensagem, na caixa dele.
 *
 * Fora de `actions/`: recebe a rede por parâmetro; quem chama é o motor.
 */

export interface NumeroPadrao {
  id:       string
  label:    string
  provider: 'uazapi' | 'official'
  wabaId:   string | null
}

/** O número padrão ATIVO da rede (sem os removidos), ou nulo. Nunca "o primeiro ativo". */
export async function numeroPadraoDaRede(tenantId: string): Promise<NumeroPadrao | null> {
  const n = (await getNumerosDaRede(tenantId)).find(x => x.isDefault && x.isActive && !x.removido)
  return n ? { id: n.id, label: n.label, provider: n.provider, wabaId: n.wabaId } : null
}

/** O telefone do cadastro como o WhatsApp o conhece: 55 + DDD + número (a régua de `conversa_de_whatsapp_da_cliente`). */
export function telefoneDoWhatsapp(bruto: string | null | undefined): string | null {
  const d = (bruto ?? '').replace(/\D/g, '')
  const e164 = d.length === 10 || d.length === 11 ? `55${d}` : d
  return e164.length >= 12 ? e164 : null
}

/**
 * A conversa da cliente na caixa do número padrão: a que existe (da ficha ou
 * do telefone, também a encerrada, que reabre), senão uma nova — da ficha da
 * cliente; o contato liga o gatilho, pelo telefone.
 */
export async function conversaNoNumero(
  tenantId: string, clienteId: string, numero: NumeroPadrao,
): Promise<{ conversaId: string; criada: boolean } | { motivo: string }> {
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('id, name, phone')
    .eq('id', clienteId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a cliente') as
    { id: string; name: string | null; phone: string | null } | null
  if (!cliente) return { motivo: 'A cliente do fluxo não foi encontrada.' }
  const telefone = telefoneDoWhatsapp(cliente.phone)
  if (!telefone) return { motivo: 'A cliente não tem celular no cadastro: não há para onde abrir a conversa.' }
  const formas = variantesDoTelefone(telefone)

  // A da ficha primeiro; senão a do telefone sem ficha. A do telefone ligada a
  // OUTRA ficha não é dela (a régua de `conversa_de_whatsapp_da_cliente`).
  const existente = async (): Promise<{ id: string; status: string } | { outraFicha: true } | null> => {
    const linhas = await ler(admin.from('conversations').select('id, status, client_id')
      .eq('tenant_id', tenantId).eq('channel', 'whatsapp').eq('whatsapp_number_id', numero.id)
      .or(`client_id.eq.${clienteId},contact_phone.in.(${formas.join(',')}),contact_external_id.in.(${formas.join(',')})`)
      .order('last_message_at', { ascending: false, nullsFirst: false }).order('id').limit(10),
      'buscar a conversa da cliente no número padrão') as { id: string; status: string; client_id: string | null }[] | null
    const lista = linhas ?? []
    const daFicha = lista.find(l => l.client_id === clienteId) ?? lista.find(l => !l.client_id)
    if (daFicha) return { id: daFicha.id, status: daFicha.status }
    return lista.length ? { outraFicha: true } : null
  }
  const OUTRA_FICHA = 'O celular da cliente já tem conversa no número padrão, ligada a outra ficha: a automação não mistura as duas.'

  const ja = await existente()
  if (ja && 'outraFicha' in ja) return { motivo: OUTRA_FICHA }
  if (ja) {
    // A encerrada reabre: é nela que a mensagem nova vai aparecer.
    if (ja.status === 'closed') {
      await ler(admin.from('conversations').update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', ja.id).eq('tenant_id', tenantId).select('id'), 'reabrir a conversa')
    }
    return { conversaId: ja.id, criada: false }
  }

  const { data: criada, error } = await admin.from('conversations').insert({
    tenant_id:           tenantId,
    branch_id:           null,
    client_id:           clienteId,
    channel:             'whatsapp',
    status:              'open',
    provider:            numero.provider,
    contact_name:        cliente.name,
    contact_phone:       telefone,
    contact_external_id: telefone,
    contact_aliases:     [telefone],
    whatsapp_number_id:  numero.id,
  }).select('id').single<{ id: string }>()
  if (!error && criada) return { conversaId: criada.id, criada: true }

  // Outra execução criou ao mesmo tempo (o índice único do número).
  if (error?.code === '23505') {
    const depois = await existente()
    if (depois && 'outraFicha' in depois) return { motivo: OUTRA_FICHA }
    if (depois) return { conversaId: depois.id, criada: false }
  }
  throw new Error(`Não consegui abrir a conversa no número padrão: ${error?.message ?? 'sem resposta'}`)
}

/** Os modelos APROVADOS da conta (WABA) do número padrão oficial, que o sistema monta. */
export async function modelosDoNumeroPadrao(
  tenantId: string, padrao: NumeroPadrao | null,
): Promise<(ModeloAprovado & { texto: string })[]> {
  if (!padrao || padrao.provider !== 'official' || !padrao.wabaId) return []
  const linhas = await ler(createAdminClient().from('message_templates')
    .select('id, name, header_text, body_text, footer_text')
    .eq('tenant_id', tenantId).eq('waba_id', padrao.wabaId).eq('status', 'APPROVED')
    .is('nao_suportado', null).order('name'), 'buscar os modelos aprovados') as
    { id: string; name: string; header_text: string | null; body_text: string; footer_text: string | null }[] | null
  return (linhas ?? []).map(t => ({
    id: t.id, nome: t.name,
    variaveis: extrairVariaveis(t.header_text, t.body_text),
    texto: [t.header_text, t.body_text, t.footer_text].filter(Boolean).join('\n\n'),
  }))
}

/** A conferência de `problemasDaAberturaPeloPadrao`, com o que a rede tem hoje. */
export async function problemasDaAberturaNaRede(tenantId: string, grafo: GrafoDeAutomacao): Promise<string[]> {
  const usa = (grafo?.nos ?? []).some(n => (n.config as { semConversa?: string } | null)?.semConversa === 'abrir_pelo_padrao')
  if (!usa) return []
  const padrao = await numeroPadraoDaRede(tenantId)
  const rede: RedeParaAbrir = {
    padrao:  padrao ? { label: padrao.label, oficial: padrao.provider === 'official' } : null,
    modelos: await modelosDoNumeroPadrao(tenantId, padrao),
  }
  return problemasDaAberturaPeloPadrao(grafo.nos, rede)
}
