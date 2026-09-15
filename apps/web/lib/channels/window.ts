import type { ChannelKind } from './types'

/** 24 horas em milissegundos. */
const JANELA_MS = 24 * 60 * 60 * 1000

export interface EstadoJanela {
  aberta:  boolean
  /** Quando fecha (ou fechou). Nulo quando a regra não se aplica ao canal. */
  fechaEm: string | null
  motivo:  string | null
}

/**
 * A janela de resposta da Meta.
 *
 * Instagram, Messenger e o WhatsApp pela API oficial só aceitam resposta livre
 * até 24h depois da última mensagem do contato. Passado isso, a API recusa — e
 * sem esta checagem a pessoa escreve, vê "enviado" e a mensagem nunca chega.
 *
 * Z-API fica de fora: não passa pela API oficial e não tem a trava. Por isso a
 * decisão olha o PROVEDOR configurado, não só o canal — a mesma conversa de
 * WhatsApp tem ou não janela dependendo de como a rede conectou.
 *
 * Conversa que nunca recebeu mensagem (`lastInboundAt` nulo) também está
 * fechada: não dá para iniciar conversa nesses canais sem template aprovado,
 * que é outra feature.
 */
export function estadoDaJanela(
  channel: ChannelKind,
  lastInboundAt: string | null,
  provider?: string | null,
): EstadoJanela {
  const regidoPelaMeta =
    channel === 'instagram' ||
    channel === 'messenger' ||
    (channel === 'whatsapp' && provider === 'official')

  if (!regidoPelaMeta) return { aberta: true, fechaEm: null, motivo: null }

  if (!lastInboundAt) {
    return {
      aberta:  false,
      fechaEm: null,
      motivo:  'Este contato ainda não escreveu. Nestes canais a conversa precisa começar por ele.',
    }
  }

  const fecha = new Date(new Date(lastInboundAt).getTime() + JANELA_MS)
  const aberta = fecha.getTime() > Date.now()

  return {
    aberta,
    fechaEm: fecha.toISOString(),
    motivo:  aberta
      ? null
      : 'A janela de 24 horas fechou. O contato precisa escrever de novo para você poder responder.',
  }
}
