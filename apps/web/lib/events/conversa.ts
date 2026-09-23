import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS } from '@estetica-os/types'
import type { OrigemDeEvento, NomeDeEvento, AtorDoEvento, DadosDeConversa } from '@estetica-os/types'

/**
 * Emite um evento do inbox com o retrato da conversa.
 *
 * ⚠️ **A maior parte destes nasce no WEBHOOK, não numa ação.** Conversa
 * iniciada e mensagem recebida acontecem quando o WhatsApp entrega o evento,
 * sem ninguém logado — daí `ator` ser 'sistema' e `origem` ser 'webhook'. É o
 * caso que justificou o emissor aceitar os dois campos: uma automação de
 * primeiro atendimento precisa saber que **o cliente** falou, não a equipe.
 *
 * `texto` viaja junto porque é por ele que a automação decide ("quanto custa",
 * "quero agendar"). Sem isso o motor teria de buscar a mensagem que acabou de
 * chegar, justamente no disparo em que a resposta precisa ser rápida.
 */
export async function emitirEventoDeConversa(
  nome: NomeDeEvento,
  conversationId: string,
  tenantId: string,
  extras?: {
    texto?:      string | null
    mensagemId?: string | null
    temMidia?:   boolean
    anuncio?:    { id?: string | null; titulo?: string | null; campanha?: string | null } | null
    ator?:       AtorDoEvento
    origem?:     OrigemDeEvento
    /** Quantas automações houve antes deste fato — o anti-loop do motor. */
    profundidade?: number
    ctx?:        { internalUserId?: string | null; userName?: string | null }
  },
): Promise<void> {
  try {
    if (!tenantId) return
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('conversations')
      .select('id, branch_id, contact_name, contact_phone, channel, client_id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) console.error('[eventoDeConversa] retrato:', error.message)

    const dados: DadosDeConversa = {
      contatoNome:     (data?.contact_name  as string) ?? null,
      contatoTelefone: (data?.contact_phone as string) ?? null,
      canal:           (data?.channel as string) ?? 'desconhecido',
      clienteId:       (data?.client_id as string) ?? null,
    }
    if (extras?.texto      != null) dados.texto      = extras.texto
    if (extras?.mensagemId != null) dados.mensagemId = extras.mensagemId
    if (extras?.temMidia)           dados.temMidia   = true
    if (extras?.anuncio) {
      dados.anuncioId     = extras.anuncio.id ?? null
      dados.anuncioTitulo = extras.anuncio.titulo ?? null
      dados.campanhaNome  = extras.anuncio.campanha ?? null
    }

    const ator = extras?.ator
      ?? (extras?.ctx?.internalUserId ? atorDoContexto(extras.ctx) : ATOR_SISTEMA)

    await emitirEvento(nome, {
      tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: conversationId,
      dados,
      ator,
      origem:       extras?.origem ?? 'app',
      profundidade: extras?.profundidade,
      // A mensagem é a unidade de dedup, não a conversa: reentrega de webhook é
      // comum e não pode virar dois eventos da mesma mensagem. `iniciada` usa a
      // conversa, que acontece uma vez só.
      chave: nome === EVENTOS.CONVERSA_INICIADA
        ? `${nome}:${conversationId}`
        : extras?.mensagemId ? `${nome}:${extras.mensagemId}` : undefined,
    })
  } catch (e) {
    console.error('[eventoDeConversa]', nome, (e as Error).message)
  }
}
