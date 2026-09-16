/**
 * Contrato comum dos canais do inbox.
 *
 * Estes tipos moravam em `lib/whatsapp/types.ts`, quando WhatsApp era o único
 * canal que funcionava. Instagram e Messenger precisam dos mesmos, e
 * `lib/meta/` importar de `lib/whatsapp/` seria uma dependência com a direção
 * errada — daí o lugar neutro. `lib/whatsapp/types.ts` reexporta, para não
 * quebrar quem já importava de lá.
 */

export type ChannelKind = 'whatsapp' | 'instagram' | 'messenger' | 'email' | 'manual'

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'other'

export type MediaKind = 'image' | 'audio' | 'video' | 'document'

/** Dados de atribuição de anúncio click-to-WhatsApp (Meta) ou equivalente. */
export interface InboundReferral {
  sourceType?: string   // 'ad' | 'post' (Meta CTWA)
  sourceId?:   string   // ad id
  sourceUrl?:  string   // usado para inferir plataforma (facebook|instagram)
  ctwaClid?:   string   // click id do click-to-WhatsApp
  headline?:   string   // título do anúncio
}

/**
 * Mídia recebida, do jeito que o provedor entrega.
 *
 * A uazapi manda a URL pronta; a Graph API manda só um id, que exige uma segunda
 * chamada autenticada para virar URL — e essa URL ainda expira. Por isso as
 * duas formas convivem aqui, e quem resolve é `lib/inbox/media.ts`.
 */
export interface InboundMedia {
  kind:      MediaKind
  url?:      string
  mediaId?:  string
  mimeType?: string
}

export interface InboundMsg {
  /**
   * Identidade do contato NO CANAL: telefone ou @lid/BSUID no WhatsApp, PSID no
   * Messenger, IGSID no Instagram. É o que identifica a conversa.
   */
  externalUserId: string
  /**
   * Telefone, quando o canal tem um E ele veio de verdade.
   *
   * Nunca receba aqui um @lid com os dígitos extraídos: ele tem o mesmo
   * tamanho de um E.164, entra sem reclamar e vira um número para o qual a
   * clínica liga e não existe. Ver `lib/channels/identity.ts`.
   */
  phone?:      string | null
  /**
   * Outros identificadores da MESMA pessoa vistos nesta mensagem (@lid, BSUID,
   * telefone). O WhatsApp alterna entre eles; é por aqui que a conversa antiga
   * é reencontrada em vez de nascer uma segunda.
   */
  aliases?:    string[]
  content:     string
  externalId:  string      // id da mensagem no provedor
  timestamp:   string      // ISO 8601
  type:        MessageType
  media?:      InboundMedia
  displayName?: string     // nome público do contato (vira o nome do card)
  referral?:   InboundReferral
  /** `external_id` da mensagem que esta responde, quando é uma resposta. */
  replyToExternalId?: string
}

export interface StatusUpdate {
  externalId: string
  status:     'sent' | 'delivered' | 'read' | 'failed'
}

/**
 * Recibo de entrega/leitura do Messenger e do Instagram.
 *
 * Diferente do WhatsApp, que nomeia a mensagem, aqui o normal é uma MARCA
 * D'ÁGUA: "tudo que você mandou até este instante foi entregue" — um recibo só
 * cobre várias mensagens, e o id específico às vezes nem vem. Por isso não dá
 * para reaproveitar `StatusUpdate`, que é por mensagem.
 */
export interface StatusRecibo {
  status:         'delivered' | 'read'
  /** Contato da conversa (PSID no Messenger, IGSID no Instagram). */
  externalUserId: string
  /** Mensagens nomeadas, quando o provedor as manda. */
  externalIds?:   string[]
  /** ISO. Tudo enviado até aqui recebeu o status. */
  watermark?:     string
}

/**
 * O que o inbox precisa de um canal para enviar.
 *
 * Deliberadamente menor que os provedores: `sendMessage` só pergunta "como eu
 * mando neste canal". Webhook e teste de conexão são assunto de quem
 * implementa, não do envio.
 */
/**
 * Arquivo saindo daqui para o contato.
 *
 * Carrega os bytes E a URL assinada porque os provedores pedem coisas
 * diferentes: a Cloud API quer o arquivo enviado antes (para devolver um id),
 * enquanto uazapi e Messenger baixam de uma URL que a gente passa.
 */
export interface OutboundMedia {
  kind:      MediaKind
  bytes:     ArrayBuffer
  /** Link temporário do nosso bucket, para quem busca por URL. */
  url:       string
  mimeType:  string
  filename:  string
  /** Legenda. Imagem, vídeo e documento aceitam; áudio, não. */
  caption?:  string
}

/** Opções de envio que nem todo canal suporta. */
export interface SendOptions {
  /**
   * `external_id` da mensagem sendo respondida.
   *
   * Quem não implementa simplesmente ignora: a mensagem sai sem a citação do
   * lado do contato, mas a conversa continua mostrando a resposta ligada à
   * original aqui dentro — melhor que recusar o envio.
   */
  replyToExternalId?: string
}

export interface SendProvider {
  /** `to` é o `contact_external_id` da conversa. */
  send(to: string, content: string, options?: SendOptions): Promise<{ externalId: string }>
  /** Envia arquivo. Ausente = o canal não suporta anexo pela nossa integração. */
  sendMedia?(to: string, media: OutboundMedia): Promise<{ externalId: string }>
  /** Baixa a mídia recebida; nem todo provedor precisa de autenticação. */
  fetchMedia?(media: InboundMedia): Promise<{ bytes: ArrayBuffer; mimeType: string } | null>
  /**
   * Nome público do contato, perguntado ao provedor.
   *
   * Existe porque o webhook nem sempre traz o nome: na PRIMEIRA mensagem de um
   * contato novo o chat ainda está sendo criado do lado de lá, e o campo chega
   * vazio — que é justamente quando a conversa nasce e fixa o telefone como
   * nome. Só é chamado quando falta nome, nunca a cada mensagem.
   */
  fetchDisplayName?(externalUserId: string): Promise<string | null>
  /**
   * Reescreve uma mensagem já enviada.
   *
   * Ausente = o canal não permite editar. A API oficial da Meta não permite:
   * lá a mensagem é imutável depois de entregue.
   *
   * Devolve o novo `externalId` quando o provedor troca o id ao editar (o
   * WhatsApp troca). Sem atualizar, a edição seguinte aponta para um id morto.
   */
  editMessage?(externalId: string, texto: string): Promise<{ externalId?: string }>
  /**
   * Envia um template aprovado — o único caminho para falar com alguém fora da
   * janela de 24h.
   *
   * Opcional porque só a API oficial tem template: a uazapi fala pelo WhatsApp
   * Web, onde não existe janela nem aprovação, e Instagram/Messenger não têm
   * nada equivalente.
   */
  sendTemplate?(
    to: string,
    template: { name: string; language: string; components: Array<Record<string, unknown>> },
  ): Promise<{ externalId: string }>
}

/**
 * Canais regidos pela janela de 24h da Meta: só dá para responder livremente
 * até 24h da última mensagem do contato.
 *
 * A uazapi fica de fora porque não passa pela API oficial e não tem essa trava.
 * É o mesmo motivo de a janela ser decidida pelo PROVEDOR configurado, e não
 * só pelo canal — ver `lib/channels/window.ts`.
 */
export const CANAIS_COM_JANELA: ChannelKind[] = ['instagram', 'messenger']
