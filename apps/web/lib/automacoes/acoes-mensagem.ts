import { createAdminClient } from '@/lib/supabase/admin'
import { conversaDeWhatsappDaCliente } from '@/lib/contatos/conversa-de-whatsapp'
import { enviarNaConversa, enviarModeloNaConversa, type ResultadoDoEnvio } from '@/lib/inbox/enviar'
import { reenviarNaConversa } from '@/lib/inbox/reenviar'
import { numeroPadraoDaRede, conversaNoNumero } from './abrir-pelo-padrao'
import { emitirEventoDeConversa } from '@/lib/events/conversa'
import { EVENTOS } from '@estetica-os/types'
import { notifyClient } from '@/lib/notifications/notify'
import { ler } from '@/lib/db'
import type { ChannelKind } from '@/lib/channels/types'
import type { ConfigAcaoMensagem } from '@estetica-os/types'
import { semPedirResposta } from './modelos'
import { erroDaAbertura } from './em-portugues'
import type { MensagemNaoEnviada } from './mensagem-nao-enviada'
import type { ContextoDaExecucao } from './contexto'
import type { AtorDaAutomacao } from './acoes-crm'

/**
 * A ação que fala com o CLIENTE — a de maior consequência do catálogo.
 *
 * Três coisas a distinguem das outras:
 *
 *  1. **Precisa de uma conversa.** Mensagem não existe no vácuo: ela mora numa
 *     thread do inbox, que é onde a equipe vai ver a resposta. Quando o fluxo
 *     não tem conversa no contexto, procuramos a do cliente; não havendo
 *     nenhuma, o passo diz isso em vez de inventar um canal.
 *  2. **A janela de 24h da Meta decide o que dá para mandar.** Fora dela, texto
 *     livre é recusado pela API — e sem checar vira "enviado" que o cliente
 *     nunca recebe. Por isso o node usa o modelo aprovado escolhido no passo
 *     (R10), e sem ele o passo falha com motivo legível.
 *  3. **Passa pelos limites** de silêncio noturno e teto por cliente, que as
 *     ações internas não têm.
 *
 * O envio em si é `lib/inbox/enviar.ts`, o mesmo caminho da pessoa no inbox.
 */

export interface PedidoDeMensagem {
  /** `push`: o aviso no celular da cliente, sem conversa (A14). */
  canal:       ChannelKind | 'push'
  texto:       string
  templateId?: string | null
  /**
   * AX-06 (D6 da 32ª): para quem não tem conversa aberta no canal, o que a
   * rede escolheu no passo. Sem nada, "Não mandar" (princípio 6).
   */
  semConversa?: ConfigAcaoMensagem['semConversa']
  /**
   * O modelo aprovado do passo (R10), já com os valores das variáveis
   * interpolados pelo motor; `semDado` = as variáveis que saíram vazias
   * (princípio 4: o modelo não sai com o buraco).
   */
  modelo?: { templateId: string; valores: Record<string, string>; semDado: string[] } | null
  /**
   * D2 da 38ª (IN-18): a mensagem que a tentativa anterior desta execução
   * gravou e o provedor não aceitou. A nova tentativa reenvia ESTA linha — a
   * mesma bolha "Não enviada" —, em vez de gravar outra.
   */
  naoEnviada?: MensagemNaoEnviada | null
}

/**
 * O envio que não saiu, com a mensagem que ficou "Não enviada" na conversa
 * (D2 da 38ª). O passo falha (o cron tenta de novo), e o motor guarda
 * `naoEnviada` no contexto para a tentativa seguinte reaproveitá-la.
 */
export class EnvioNaoSaiu extends Error {
  constructor(message: string, readonly naoEnviada: MensagemNaoEnviada) {
    super(message)
    this.name = 'EnvioNaoSaiu'
  }
}

/** A falha do envio: com a linha gravada, leva-a junto; sem ela, é o erro de sempre. */
function falhaDoEnvio(texto: string, mensagemId: string | undefined, abriuPeloPadrao?: string | null): Error {
  const mensagem = abriuPeloPadrao ? erroDaAbertura(abriuPeloPadrao, texto) : texto
  return mensagemId
    ? new EnvioNaoSaiu(mensagem, { mensagemId, ...(abriuPeloPadrao ? { abriuPeloPadrao } : {}) })
    : new Error(mensagem)
}

export interface ResultadoDaMensagem {
  resumo:      Record<string, unknown>
  /** Quando preenchido, o motor devolve o run à fila em vez de seguir. */
  esperarAte?: Date
}

/**
 * A conversa em que falar.
 *
 * Preferência pela que já está no contexto (o fluxo nasceu de uma mensagem);
 * senão, a mais recente do cliente naquele canal. Não CRIA conversa: abrir
 * pelo número padrão é a escolha da rede no passo (`abrirPeloNumeroPadrao`).
 */
async function conversaPara(
  tenantId: string,
  contexto: ContextoDaExecucao,
  canal: ChannelKind,
): Promise<{ id: string } | { motivo: string }> {
  const daConversa = contexto.conversa as { id?: string; canal?: string } | null | undefined
  if (daConversa?.id && (!daConversa.canal || daConversa.canal === canal)) {
    return { id: daConversa.id }
  }

  const clienteId = (contexto.cliente as { id?: string } | null)?.id
  if (!clienteId) {
    return { motivo: 'Este fluxo não tem conversa nem cliente — não há para quem mandar.' }
  }

  // WhatsApp: a régua única (C55, F69) — pela ficha, senão pelo telefone,
  // sem a conversa de um número removido.
  if (canal === 'whatsapp') {
    const id = await conversaDeWhatsappDaCliente(tenantId, clienteId)
    return id ? { id } : { motivo: 'Este cliente não tem conversa aberta no WhatsApp. A automação não abre conversa nova.' }
  }

  const { data, error } = await createAdminClient()
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clienteId)
    .eq('channel', canal)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) throw new Error(`Não consegui achar a conversa: ${error.message}`)

  const conv = data?.[0]
  if (!conv) {
    return { motivo: `Este cliente não tem conversa aberta em ${canal}. A automação não abre conversa nova.` }
  }
  return { id: conv.id as string }
}

export async function mandarMensagem(
  ator: AtorDaAutomacao,
  contexto: ContextoDaExecucao,
  pedido: PedidoDeMensagem,
): Promise<ResultadoDaMensagem> {
  const texto = pedido.texto.trim()
  if (!texto) throw new Error('A mensagem está vazia.')
  if (!pedido.canal) throw new Error('Nenhum canal escolhido.')

  if (pedido.canal === 'push') return avisoNoCelular(ator, contexto, texto)

  const remetente = { id: null, nome: `Automação · ${ator.nome}` }

  // D2 da 38ª: a tentativa anterior deixou uma "Não enviada" — é ela que sai.
  if (pedido.naoEnviada) {
    const r = await tentarDeNovo(ator, pedido, texto, remetente, pedido.naoEnviada)
    if (r) return r
  }

  const alvo = await conversaPara(ator.tenantId, contexto, pedido.canal)
  if ('motivo' in alvo) {
    // AX-06 (o Heitor, 2026-11-11, H1): a rede escolheu mandar como aviso no
    // celular a quem não tem conversa aberta. O aviso não se responde, e o
    // pedido de resposta do texto sai (AX-03).
    if (pedido.semConversa === 'aviso_no_celular') {
      const r = await avisoNoCelular(ator, contexto, semPedirResposta(texto))
      return { resumo: { ...r.resumo, semConversa: true } }
    }
    // R10 (o Heitor, 26/11): a rede escolheu abrir a conversa pelo número padrão.
    if (pedido.semConversa === 'abrir_pelo_padrao' && pedido.canal === 'whatsapp') {
      return abrirPeloNumeroPadrao(ator, contexto, texto, pedido.modelo ?? null)
    }
    return { resumo: { enviada: false, motivo: alvo.motivo } }
  }

  let r: ResultadoDoEnvio = await enviarNaConversa(ator.tenantId, alvo.id, texto, remetente)
  let comModelo = false

  // Janela fechada não é um erro do sistema: é uma regra da Meta. Com o modelo
  // aprovado escolhido no passo (R10), é ele que sai; sem ele, o passo diz o
  // que fazer.
  const fechou = !r.ok && !r.mensagemId && /janela/i.test(r.error ?? '')
  if (fechou && pedido.modelo) {
    if (pedido.modelo.semDado.length) {
      return { resumo: { enviada: false, motivo: `Faltou o dado de ${pedido.modelo.semDado.join(', ')}: o modelo não saiu.` } }
    }
    r = await enviarModeloNaConversa(ator.tenantId, alvo.id, pedido.modelo.templateId, pedido.modelo.valores, remetente, { userId: null })
    comModelo = true
  }

  if (!r.ok) {
    throw falhaDoEnvio(
      fechou && !comModelo
        ? `${r.error} Para falar fora das 24h, a Meta só aceita um modelo aprovado: escolha um no passo.`
        : (r.error ?? 'Falha no envio.'),
      r.mensagemId,
    )
  }

  await emitirEnviada(ator, alvo.id, texto, r.mensagemId!)
  return {
    resumo: {
      enviada: true, canal: pedido.canal, conversaId: alvo.id,
      ...(comModelo ? { modelo: true } : {}),
      // O texto interpolado, não o modelo: é ele que o cliente recebeu.
      texto: texto.length > 120 ? `${texto.slice(0, 120)}…` : texto,
    },
  }
}

/**
 * A nova tentativa da execução (D2 da 38ª; crm-inbox:IN-18, princípio 3): a
 * mensagem que a anterior gravou e não saiu volta pela MESMA linha
 * (`reenviarNaConversa`, o núcleo do "Tentar de novo" da bolha) — a conversa
 * fica com uma "Não enviada" só, e a execução segue registrando cada
 * tentativa.
 *
 * - Já saiu (alguém usou o "Tentar de novo" na conversa): não sai de novo.
 * - Está saindo agora: não manda outra; a tentativa seguinte confere.
 * - Sumiu: `null`, e o passo segue o envio de sempre.
 * - A janela de 24 h fechou e o passo tem o modelo aprovado (R12): sai o modelo.
 *
 * O fato "mensagem enviada" sai quando ela sai: a tentativa que falhou não o
 * emitiu.
 */
async function tentarDeNovo(
  ator: AtorDaAutomacao,
  pedido: PedidoDeMensagem,
  texto: string,
  remetente: { id: null; nome: string },
  naoEnviada: MensagemNaoEnviada,
): Promise<ResultadoDaMensagem | null> {
  const linha = await ler(createAdminClient().from('messages')
    .select('id, status, conversation_id')
    .eq('id', naoEnviada.mensagemId).eq('tenant_id', ator.tenantId).maybeSingle(),
  'buscar a mensagem que não saiu') as { id: string; status: string; conversation_id: string } | null
  if (!linha) return null

  const abriu = naoEnviada.abriuPeloPadrao ?? null
  const enviada = (extra?: Record<string, unknown>): ResultadoDaMensagem => ({
    resumo: {
      enviada: true, canal: pedido.canal, conversaId: linha.conversation_id,
      ...(abriu ? { abriuConversa: true, numero: abriu } : {}),
      ...extra,
      texto: texto.length > 120 ? `${texto.slice(0, 120)}…` : texto,
    },
  })

  if (['sent', 'delivered', 'read'].includes(linha.status)) return enviada()
  if (linha.status !== 'failed') {
    throw falhaDoEnvio('A mensagem ainda estava saindo pelo "Tentar de novo" da conversa.', linha.id, abriu)
  }

  const r = await reenviarNaConversa(ator.tenantId, linha.id, remetente)
  if (r.ok) {
    await emitirEnviada(ator, linha.conversation_id, texto, linha.id)
    return enviada()
  }

  // R12 (o Heitor, 26/11): fora das 24 h, sai o modelo aprovado do passo. A
  // "Não enviada" do texto fica como está (é a que não saiu).
  if (!r.mensagemId && /janela/i.test(r.error ?? '') && pedido.modelo && !pedido.modelo.semDado.length) {
    const m = await enviarModeloNaConversa(ator.tenantId, linha.conversation_id, pedido.modelo.templateId, pedido.modelo.valores, remetente, { userId: null })
    if (m.ok) {
      await emitirEnviada(ator, linha.conversation_id, texto, m.mensagemId!)
      return enviada({ modelo: true })
    }
    throw falhaDoEnvio(m.error ?? 'Falha no envio.', m.mensagemId ?? linha.id, abriu)
  }

  throw falhaDoEnvio(r.error ?? 'Falha no envio.', linha.id, abriu)
}

/**
 * O mesmo evento que a resposta da equipe emite — quem lê a corrente não
 * deveria precisar saber se quem digitou foi uma pessoa ou o motor. A
 * diferença aparece na origem e no ator.
 */
async function emitirEnviada(ator: AtorDaAutomacao, conversaId: string, texto: string, mensagemId: string) {
  await emitirEventoDeConversa(EVENTOS.CONVERSA_MENSAGEM_ENVIADA, conversaId, ator.tenantId, {
    texto,
    mensagemId,
    ator:       { id: null, nome: `Automação · ${ator.nome}`, tipo: 'sistema' },
    origem:     'automacao',
    profundidade: ator.profundidade + 1,
  })
}

/**
 * "Abrir pelo número padrão" (AX-06; R10 — o Heitor, 26/11, na página de
 * perguntas: "Está no escopo: construir (com os modelos aprovados pela Meta
 * na automação)"). A cliente sem conversa aberta recebe pelo número padrão da
 * rede; a conversa nasce no inbox, com a mensagem, na caixa dele.
 *
 * - No WhatsApp Web (uazapi): o texto do passo — é a rede escolhendo correr o
 *   risco de banimento, e a tela do passo diz isso.
 * - Na Cloud API: o modelo aprovado do passo; sem ele, ou com variável sem o
 *   dado, NÃO abre conversa nenhuma e diz por quê.
 *
 * O silêncio noturno, o teto, a rede bloqueada e o suporte o motor já
 * conferiu antes (são de todo "Mandar mensagem").
 */
async function abrirPeloNumeroPadrao(
  ator: AtorDaAutomacao, contexto: ContextoDaExecucao, texto: string,
  modelo: PedidoDeMensagem['modelo'] | null,
): Promise<ResultadoDaMensagem> {
  const clienteId = (contexto.cliente as { id?: string } | null)?.id
  if (!clienteId) return { resumo: { enviada: false, motivo: 'Este fluxo não tem cliente — não há para quem abrir a conversa.' } }

  const padrao = await numeroPadraoDaRede(ator.tenantId)
  if (!padrao) {
    return { resumo: { enviada: false, motivo: 'A rede não tem número padrão de WhatsApp: a conversa não tem por onde abrir.' } }
  }
  const oficial = padrao.provider === 'official'
  if (oficial && !modelo) {
    return { resumo: { enviada: false, motivo: `O número padrão (${padrao.label}) é da API oficial: a conversa só abre com um modelo aprovado, e o passo não tem um.` } }
  }
  if (oficial && modelo!.semDado.length) {
    return { resumo: { enviada: false, motivo: `Faltou o dado de ${modelo!.semDado.join(', ')}: o modelo não saiu.` } }
  }

  const conversa = await conversaNoNumero(ator.tenantId, clienteId, padrao)
  if ('motivo' in conversa) return { resumo: { enviada: false, motivo: conversa.motivo } }

  const remetente = { id: null, nome: `Automação · ${ator.nome}` }
  const r = oficial
    ? await enviarModeloNaConversa(ator.tenantId, conversa.conversaId, modelo!.templateId, modelo!.valores, remetente, { userId: null })
    : await enviarNaConversa(ator.tenantId, conversa.conversaId, texto, remetente)
  // A16 da 38ª (AX-06): a conversa abriu, e a execução diz isso junto da falha.
  if (!r.ok) throw falhaDoEnvio(r.error ?? 'Falha no envio.', r.mensagemId, padrao.label)

  await emitirEnviada(ator, conversa.conversaId, texto, r.mensagemId!)
  return {
    resumo: {
      enviada: true, canal: 'whatsapp', conversaId: conversa.conversaId, abriuConversa: true,
      numero: padrao.label,
      ...(oficial ? { modelo: true } : {}),
      texto: texto.length > 120 ? `${texto.slice(0, 120)}…` : texto,
    },
  }
}

/**
 * O aviso no celular da cliente (A14): o canal da rede sem WhatsApp conectado.
 * Chega no app e no navegador em que ela ativou os avisos, e fica no sino do
 * portal — sem conversa, então não há resposta a esperar no inbox. O título é
 * o nome da clínica: é ela quem fala.
 */
async function avisoNoCelular(ator: AtorDaAutomacao, contexto: ContextoDaExecucao, texto: string): Promise<ResultadoDaMensagem> {
  const clienteId = (contexto.cliente as { id?: string } | null)?.id
  if (!clienteId) {
    return { resumo: { enviada: false, canal: 'push', motivo: 'Este fluxo não tem cliente — não há para quem mandar o aviso.' } }
  }
  const admin = createAdminClient()
  const [rede, ficha] = await Promise.all([
    ler(admin.from('tenants').select('name').eq('id', ator.tenantId).maybeSingle(), 'buscar o nome da rede') as Promise<{ name: string } | null>,
    ler(admin.from('clients').select('auth_id').eq('id', clienteId).eq('tenant_id', ator.tenantId).maybeSingle(), 'ver se a cliente tem acesso ao app') as Promise<{ auth_id: string | null } | null>,
  ])
  await notifyClient(admin, clienteId, { type: 'automacao', title: rede?.name ?? 'Aviso', body: texto })
  // A13 da 20ª (princípio 3): sem acesso ao app, o aviso fica num sino que
  // ela não abre — o passo não diz "enviada".
  if (!ficha?.auth_id) {
    return { resumo: { enviada: false, guardada: true, canal: 'push', motivo: 'Guardado no sino do app: a cliente não tem acesso ao app.' } }
  }
  return { resumo: { enviada: true, canal: 'push' } }
}
