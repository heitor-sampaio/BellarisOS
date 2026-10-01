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
import type { ModoOficial } from './modo-oficial'

export type WhatsAppProviderType = 'uazapi' | 'official'

/** Um provedor de WhatsApp é um canal que também sabe ler webhook. */
export interface WhatsAppProvider extends SendProvider {
  parseInbound(payload: unknown): InboundMsg | null
  parseStatus(payload: unknown): StatusUpdate | null
  testConnection(): Promise<{ ok: boolean; detail?: string }>
}

// -- Config shapes stored in integration_configs.config (jsonb) --

export interface UazapiConfig {
  provider:   'uazapi'
  /**
   * Token DA INSTÂNCIA (header `token`).
   *
   * É também o segredo do webhook: a uazapi ecoa este valor no corpo de cada
   * entrega, o que faz roteamento e autenticação virarem a mesma operação.
   */
  token:      string
  instanceId?:   string
  instanceName?: string
  /**
   * Servidor uazapi desta instância, fixado na criação.
   *
   * Cada conta tem seu subdomínio (`bellarisos.uazapi.com`) — guardar aqui, e
   * não numa constante global, evita que trocar o env quebre as instâncias
   * criadas antes da troca.
   */
  baseUrl?:   string
  /** Instância criada pelo BellarisOS, em vez de digitada pela rede. */
  managed?:   boolean
  /** Número que pareou — só para mostrar na tela. */
  connectedPhone?: string | null
  connectedName?:  string | null
  /**
   * Proxy PRÓPRIO, quando configurado.
   *
   * A uazapi já sai por um proxy gerenciado por ela (`mode: internal`, IP no
   * Brasil). Este campo só é preenchido quando a instalação opta por um IP
   * contratado à parte. Nunca vai para o cliente.
   */
  proxyUrl?:        string
  proxyAppliedAt?:  string
  webhookAppliedAt?: string
}

export interface OfficialConfig {
  provider:      'official'
  phoneNumberId: string
  accessToken:   string
  /**
   * Token do handshake e segredo da assinatura — da caixa ligada a um app
   * PRÓPRIO da clínica. A caixa conectada pelo cadastro incorporado não os
   * tem: o handshake é o `META_VERIFY_TOKEN` e a assinatura, o
   * `META_APP_SECRET` do app do BellarisOS.
   */
  verifyToken?:  string
  appSecret?:    string
  /**
   * `cadastro_incorporado` = conectada pelo botão "Conectar pela Meta"
   * (`lib/whatsapp/cadastro-incorporado.ts`), com o token de negócio que a
   * Meta emitiu para o app. Sem o campo, credencial colada à mão.
   */
  conexao?:      'cadastro_incorporado'
  /** O portfólio de negócios da clínica na Meta (vem do cadastro). */
  businessId?:   string
  /**
   * PIN de duas etapas definido ao registrar o número na Cloud API. Só no modo
   * `cloud_api` pelo cadastro: a Meta o pede de novo para registrar outra vez.
   */
  pin?:          string
  /**
   * Id da WhatsApp Business Account.
   *
   * Diferente do `phoneNumberId`: mensagem sai pelo número, template é
   * gerenciado pela conta. Sem ele não há gestão de template — e trocar um
   * pelo outro dá 404 sem explicação.
   */
  wabaId?:       string
  /**
   * Endereço da Graph API — SÓ para teste. O E2E aponta a caixa `[e2e]` para
   * uma Graph falsa em 127.0.0.1 e o envio roda inteiro sem sair para a Meta
   * (como `baseUrl` na uazapi). Não está na lista de chaves do formulário
   * (`CHAVES_DA_CONFIG`): só se grava direto no banco, nunca pela tela.
   */
  graphBase?:    string
  /**
   * Como o numero chegou a API: com o aplicativo do celular continuando a
   * funcionar (coexistencia) ou migrando de vez (cloud_api).
   *
   * Guardado porque a escolha tem consequencia que a tela precisa lembrar:
   * quem migrou nao tem mais o aplicativo atendendo por aquele numero, e
   * oferecer o caminho de volta como se fosse um botao seria mentira.
   * Ver `lib/whatsapp/modo-oficial.ts`.
   */
  modo?:         ModoOficial
}

export type WhatsAppConfig = UazapiConfig | OfficialConfig

/**
 * Uma CAIXA de WhatsApp da rede — uma linha de `whatsapp_numbers`.
 *
 * Substitui a pergunta "qual o WhatsApp desta rede?", que era a forma de
 * `getWhatsAppConfig(tenantId)` e que só tinha resposta enquanto houvesse um
 * número só. A partir daqui a pergunta é sempre "qual DESTES", e quem chama
 * precisa dizer por quê: a caixa que recebeu, a do usuário, ou a padrão.
 *
 * `config` continua no formato antigo (com `provider` dentro) porque é o que
 * `resolveProvider` consome — os provedores não precisam saber que existe uma
 * tabela nova.
 */
export interface NumeroDeWhatsApp {
  id:       string
  tenantId: string
  provider: WhatsAppProviderType
  /** Como a rede reconhece esta caixa. Vai para a tela e para os eventos. */
  label:    string
  phone:    string | null
  phoneNumberId: string | null
  /** Dono do catálogo de templates. Dois números podem compartilhar uma WABA. */
  wabaId:   string | null
  /** RÓTULO, não escopo: não entra em RLS nem na escolha de por onde sai. */
  branchId: string | null
  /** Quem fala sempre por esta caixa (`users.id`). Várias pessoas podem
   *  dividir um número; cada pessoa tem no máximo um (`whatsapp_number_users`). */
  userIds:  string[]
  isDefault: boolean
  isActive:  boolean
  /** Instância criada e paga por nós na uazapi. */
  managed:   boolean
  config:    WhatsAppConfig
}
