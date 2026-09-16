/**
 * Tipos do WhatsApp.
 *
 * Os tipos de ENTRADA (mensagem recebida, status, referral) mudaram de casa
 * para `lib/channels/types.ts` quando Instagram e Messenger entraram: são os
 * mesmos para todo canal, e `lib/meta/` importar daqui seria dependência na
 * direção errada. Ficam reexportados para quem já importava deste arquivo.
 */
export type {
  InboundMsg, InboundMedia, InboundReferral, StatusUpdate, MessageType, MediaKind,
} from '@/lib/channels/types'

import type { InboundMsg, StatusUpdate, SendProvider } from '@/lib/channels/types'

export type WhatsAppProviderType = 'zapi' | 'official'

/** Um provedor de WhatsApp é um canal que também sabe ler webhook. */
export interface WhatsAppProvider extends SendProvider {
  parseInbound(payload: unknown): InboundMsg | null
  parseStatus(payload: unknown): StatusUpdate | null
  testConnection(): Promise<{ ok: boolean; detail?: string }>
}

// -- Config shapes stored in integration_configs.config (jsonb) --

export interface ZAPIConfig {
  provider:      'zapi'
  instanceId:    string
  token:         string
  baseUrl?:      string   // default: https://api.z-api.io
  webhookToken?: string   // Security Token configurado no painel Z-API (client-token header)
  /**
   * Instância criada pelo BellarisOS na nossa conta de integrador, em vez de
   * digitada pela rede.
   *
   * Muda o que a tela oferece (QR em vez de formulário) e, principalmente,
   * quem paga: instância gerenciada gera custo para nós e precisa ser
   * CANCELADA na Z-API quando a rede desconecta.
   */
  managed?:      boolean
  /** Fim do período de avaliação (epoch ms). Some se ninguém parear até lá. */
  trialDue?:     number
  /** Número que pareou — só para mostrar na tela. */
  connectedPhone?: string | null
  connectedName?:  string | null
}

export interface OfficialConfig {
  provider:      'official'
  phoneNumberId: string
  accessToken:   string
  verifyToken:   string
  appSecret:     string   // for HMAC webhook signature validation
  /**
   * Id da WhatsApp Business Account.
   *
   * Diferente do `phoneNumberId`: mensagem sai pelo número, template é
   * gerenciado pela conta. Sem ele não há gestão de template — e trocar um
   * pelo outro dá 404 sem explicação.
   */
  wabaId?:       string
}

export type WhatsAppConfig = ZAPIConfig | OfficialConfig
