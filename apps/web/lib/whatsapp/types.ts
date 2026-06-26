export type WhatsAppProviderType = 'zapi' | 'official'

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'other'

export interface InboundMsg {
  from:       string      // phone number, only digits (E.164 sem +)
  content:    string      // text content (or caption for media)
  externalId: string      // messageId from the provider
  timestamp:  string      // ISO 8601
  type:       MessageType
  mediaUrl?:  string
}

export interface StatusUpdate {
  externalId: string
  status:     'sent' | 'delivered' | 'read' | 'failed'
}

export interface WhatsAppProvider {
  send(to: string, content: string): Promise<{ externalId: string }>
  parseInbound(payload: unknown): InboundMsg | null
  parseStatus(payload: unknown): StatusUpdate | null
  testConnection(): Promise<{ ok: boolean; detail?: string }>
}

// ── Config shapes stored in integration_configs.config (jsonb) ──

export interface ZAPIConfig {
  provider:    'zapi'
  instanceId:  string
  token:       string
  baseUrl?:    string   // default: https://api.z-api.io
}

export interface OfficialConfig {
  provider:      'official'
  phoneNumberId: string
  accessToken:   string
  verifyToken:   string
  appSecret:     string   // for HMAC webhook signature validation
}

export type WhatsAppConfig = ZAPIConfig | OfficialConfig
