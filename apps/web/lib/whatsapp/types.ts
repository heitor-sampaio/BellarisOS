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
}

export interface OfficialConfig {
  provider:      'official'
  phoneNumberId: string
  accessToken:   string
  verifyToken:   string
  appSecret:     string   // for HMAC webhook signature validation
}

export type WhatsAppConfig = ZAPIConfig | OfficialConfig
