import { timingSafeEqual } from 'crypto'
import type {
  WhatsAppProvider, WhatsAppConfig, UazapiConfig, NumeroDeWhatsApp, WhatsAppProviderType,
} from './types'
import { UazapiProvider } from './uazapi'
import { OfficialAPIProvider } from './official'
import { ler } from '@/lib/db'

export function resolveProvider(config: WhatsAppConfig): WhatsAppProvider {
  if (config.provider === 'uazapi')   return new UazapiProvider(config)
  if (config.provider === 'official') return new OfficialAPIProvider(config)
  throw new Error(`Unknown WhatsApp provider: ${(config as any).provider}`)
}

/** As colunas que compõem uma `NumeroDeWhatsApp`. Uma lista só, para não divergirem. */
const COLUNAS_DO_NUMERO =
  'id, tenant_id, provider, label, phone_e164, phone_number_id, waba_id, ' +
  'config, is_active, is_default, managed, branch_id, user_id'

/**
 * O cliente do Supabase aqui é sem tipos gerados, e `select()` por CONSTANTE
 * (em vez de literal) perde a inferência e vira `GenericStringError[]`. A
 * constante existe para as colunas não divergirem entre as quatro buscas, então
 * a conversão fica num ponto só, aqui, em vez de espalhada.
 */
function linhas(data: unknown): LinhaDoNumero[] {
  return (data ?? []) as LinhaDoNumero[]
}

type LinhaDoNumero = {
  id: string; tenant_id: string; provider: string; label: string
  phone_e164: string | null; phone_number_id: string | null; waba_id: string | null
  config: Record<string, unknown> | null
  is_active: boolean; is_default: boolean; managed: boolean
  branch_id: string | null; user_id: string | null
}

/**
 * Linha do banco → caixa.
 *
 * O `provider` volta para DENTRO de `config` porque é dali que `resolveProvider`
 * o lê. A coluna é a verdade; o campo no jsonb é conveniência para os provedores,
 * que não precisam saber que existe uma tabela nova.
 */
function numeroDaLinha(l: LinhaDoNumero): NumeroDeWhatsApp {
  return {
    id:       l.id,
    tenantId: l.tenant_id,
    provider: l.provider as WhatsAppProviderType,
    label:    l.label,
    phone:    l.phone_e164,
    phoneNumberId: l.phone_number_id,
    wabaId:   l.waba_id,
    branchId: l.branch_id,
    userId:   l.user_id,
    isDefault: l.is_default,
    isActive:  l.is_active,
    managed:   l.managed,
    config: { ...(l.config as object), provider: l.provider } as WhatsAppConfig,
  }
}

/**
 * A caixa, por id.
 *
 * Sem filtro `is_active` de propósito: quem chama é que decide se aceita uma
 * caixa fora do ar. O inbox, por exemplo, precisa mostrar a linha de uma
 * conversa antiga mesmo depois de a conexão cair.
 */
export async function getNumero(numeroId: string): Promise<NumeroDeWhatsApp | null> {
  if (!numeroId) return null
  const { createAdminClient } = await import('@/lib/supabase/admin')

  const { data, error } = await createAdminClient()
    .from('whatsapp_numbers')
    .select(COLUNAS_DO_NUMERO)
    .eq('id', numeroId)
    .maybeSingle<LinhaDoNumero>()

  if (error) { console.error('[getNumero]', error.message); return null }
  return data ? numeroDaLinha(data) : null
}

/** Todas as caixas da rede, padrão primeiro. Base de toda escolha de saída. */
export async function getNumerosDaRede(tenantId: string): Promise<NumeroDeWhatsApp[]> {
  const { createAdminClient } = await import('@/lib/supabase/admin')

  const { data, error } = await createAdminClient()
    .from('whatsapp_numbers')
    .select(COLUNAS_DO_NUMERO)
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('label')

  if (error) { console.error('[getNumerosDaRede]', error.message); return [] }
  return linhas(data).map(numeroDaLinha)
}

/**
 * Por qual caixa da Cloud API esta entrega chegou?
 *
 * Devolve a LINHA, não o tenant. Antes isto devolvia `string | null` e quem
 * chamava jogava o número fora para recarregar "a config da rede" — o que
 * fazia, entre outras coisas, o HMAC ser validado com o `appSecret` de outra
 * caixa. Com dois apps na Meta, toda entrega cairia em 401.
 *
 * ⚠️ Sem filtro `is_active`: o handshake de verificação acontece no momento da
 * configuração, antes de a linha estar no ar.
 */
export async function getNumeroPorPhoneNumberId(
  phoneNumberId: string,
): Promise<NumeroDeWhatsApp | null> {
  if (!phoneNumberId) return null
  const { createAdminClient } = await import('@/lib/supabase/admin')

  // Índice único global em `phone_number_id`: é busca, não varredura.
  const { data, error } = await createAdminClient()
    .from('whatsapp_numbers')
    .select(COLUNAS_DO_NUMERO)
    .eq('provider', 'official')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle<LinhaDoNumero>()

  if (error) { console.error('[getNumeroPorPhoneNumberId]', error.message); return null }
  return data ? numeroDaLinha(data) : null
}

/**
 * Por qual caixa sai o que começa AQUI.
 *
 * Substitui `getWhatsAppConfig(tenantId)`, que foi deletada em vez de virar um
 * atalho: um atalho que escolhe uma linha em silêncio é exatamente o defeito
 * que esta frente removeu, e um `shim` só adiaria o problema para quem viesse
 * depois. A regra mora em `escolherNumeroDeSaida`, que é pura e testada.
 */
export async function resolverNumeroDeSaida(
  tenantId: string,
  userId: string | null,
  numeroDaConversa: string | null,
): Promise<NumeroDeWhatsApp | null> {
  const { escolherNumeroDeSaida } = await import('./escolha')
  return escolherNumeroDeSaida(
    await getNumerosDaRede(tenantId), userId, numeroDaConversa,
  )
}

/**
 * De qual rede é este webhook da uazapi?
 *
 * A uazapi ecoa o TOKEN da própria instância no corpo de cada entrega. Como o
 * token é secreto, roteamento e autenticação viram a mesma operação — bem
 * melhor que a Z-API, que mandava um `instanceId` público e exigia um header
 * separado para autenticar (header que, se não configurado, deixava o webhook
 * aberto).
 *
 * ⚠️ Sem filtro `is_active` de propósito: é o evento `connection` que ativa a
 * config, e filtrar aqui descartaria justamente a mensagem que deveria ativá-la.
 */
export async function getNumeroPorTokenUazapi(
  token: string,
): Promise<NumeroDeWhatsApp | null> {
  if (!token) return null

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('whatsapp_numbers')
    .select(COLUNAS_DO_NUMERO)
    .eq('provider', 'uazapi')

  if (error) { console.error('[getNumeroPorTokenUazapi]', error.message); return null }

  const recebido = Buffer.from(token)
  for (const linha of linhas(data)) {
    const guardado = linha.config?.token
    if (typeof guardado !== 'string' || !guardado) continue

    // Comparação em tempo constante: o token é credencial, não identificador.
    // É por isso que esta busca é uma varredura e não um `.eq('config->>token')`
    // — o índice tornaria a comparação dependente do valor.
    const esperado = Buffer.from(guardado)
    if (esperado.length !== recebido.length) continue
    if (!timingSafeEqual(esperado, recebido)) continue

    return numeroDaLinha(linha)
  }
  return null
}
