import { createAdminClient } from '@/lib/supabase/admin'
import { getAdsConfig } from './factory'
import { ler, tentar } from '@/lib/db'

const GRAPH_API_VERSION = 'v25.0'

/** Nome do anúncio e da campanha a que ele pertence. */
export interface NomesDoAnuncio {
  adId:          string
  adName?:       string | null
  adsetId?:      string | null
  adsetName?:    string | null
  campaignId?:   string | null
  campaignName?: string | null
  /**
   * O CRIATIVO — o que a pessoa viu antes de clicar.
   *
   * Separado de `adName` porque são coisas diferentes: o anúncio tem o nome
   * que o gestor deu na campanha, e o criativo é a peça, que pode ser reusada
   * em vários anúncios.
   */
  creativeName?:  string | null
  creativeThumb?: string | null
  creativeBody?:  string | null
}

/**
 * De qual campanha veio um anúncio.
 *
 * O aviso de click-to-WhatsApp traz o ID do anúncio e o texto do criativo —
 * **nunca o nome da campanha**. Quem sabe disso é a API de Anúncios da Meta, e
 * a resposta é imutável: um anúncio pertence à mesma campanha para sempre. Daí
 * a tabela `meta_ad_cache` não expirar.
 *
 * Três motivos para o cache existir antes de a primeira consulta acontecer:
 * a Graph API tem limite de chamadas, uma campanha ativa traz dezenas de
 * mensagens por dia do MESMO anúncio, e isso roda dentro de um webhook — que
 * não pode ficar esperando rede.
 *
 * Nunca lança: sem a integração Meta Ads conectada, sem permissão `ads_read`
 * ou com o anúncio em outra conta, a tela continua mostrando o que o aviso
 * trouxe (título e id). Atribuição pela metade é melhor que erro de webhook.
 */
export async function nomesDoAnuncio(
  tenantId: string,
  adId:     string,
): Promise<NomesDoAnuncio | null> {
  if (!adId) return null
  const admin = createAdminClient()

  const cache = await ler(admin
    .from('meta_ad_cache')
    .select('ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, creative_name, creative_thumb_url, creative_body, erro')
    .eq('tenant_id', tenantId)
    .eq('ad_id', adId)
    .maybeSingle(), 'buscar o anúncio')

  // Busca que já falhou não se repete: anúncio de outra conta de anúncios
  // nunca vai resolver, e insistir a cada mensagem só queima o rate limit.
  if (cache) {
    if (cache.erro) return null
    return {
      adId,
      adName:       cache.ad_name,
      adsetId:      cache.adset_id,
      adsetName:    cache.adset_name,
      campaignId:   cache.campaign_id,
      campaignName: cache.campaign_name,
      creativeName:  cache.creative_name,
      creativeThumb: cache.creative_thumb_url,
      creativeBody:  cache.creative_body,
    }
  }

  const config = await getAdsConfig(tenantId, 'meta_ads')
  // Sem integração não há o que gravar: quando ela for conectada, a próxima
  // mensagem tenta de novo. Gravar "erro" aqui congelaria a falta de
  // integração como se fosse um anúncio impossível de resolver.
  if (!config || config.provider !== 'meta_ads') return null

  let nomes: NomesDoAnuncio | null = null
  let erro: string | null = null
  try {
    // `thumbnail_url` do criativo é hospedada pela Meta e NÃO expira como a
    // do aviso do WhatsApp — é ela que serve para o selo a longo prazo.
    const campos =
      'id,name,adset{id,name},campaign{id,name},' +
      'creative{id,name,thumbnail_url,body,title}'
    const url =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(adId)}` +
      `?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(config.accessToken)}`

    const res = await fetch(url, { cache: 'no-store' })
    const body = await res.json().catch(() => ({})) as any
    if (!res.ok) {
      erro = body?.error?.message ?? `Graph API ${res.status}`
    } else {
      nomes = {
        adId,
        adName:       body?.name ?? null,
        adsetId:      body?.adset?.id ?? null,
        adsetName:    body?.adset?.name ?? null,
        campaignId:   body?.campaign?.id ?? null,
        campaignName: body?.campaign?.name ?? null,
        creativeName:  body?.creative?.name  ?? null,
        creativeThumb: body?.creative?.thumbnail_url ?? null,
        creativeBody:  body?.creative?.body  ?? null,
      }
    }
  } catch (e) {
    erro = (e as Error).message
  }

  await tentar(admin.from('meta_ad_cache').upsert({
    tenant_id:     tenantId,
    ad_id:         adId,
    ad_name:       nomes?.adName ?? null,
    adset_id:      nomes?.adsetId ?? null,
    adset_name:    nomes?.adsetName ?? null,
    campaign_id:   nomes?.campaignId ?? null,
    campaign_name: nomes?.campaignName ?? null,
    creative_name:       nomes?.creativeName  ?? null,
    creative_thumb_url:  nomes?.creativeThumb ?? null,
    creative_body:       nomes?.creativeBody  ?? null,
    erro,
    fetched_at:    new Date().toISOString(),
  }, { onConflict: 'tenant_id,ad_id' }), 'guardar o anúncio no cache')

  return nomes
}

/**
 * O mesmo, para vários anúncios de uma vez.
 *
 * A tela do inbox mostra uma conversa com várias mensagens de anúncio; pedir
 * um a um daria uma consulta por mensagem. Aqui o cache é lido em bloco e só
 * os ausentes vão à Graph API.
 */
export async function nomesDeAnuncios(
  tenantId: string,
  adIds:    string[],
): Promise<Map<string, NomesDoAnuncio>> {
  const unicos = [...new Set(adIds.filter(Boolean))]
  const saida = new Map<string, NomesDoAnuncio>()
  if (unicos.length === 0) return saida

  const admin = createAdminClient()
  const linhas = await ler(admin
    .from('meta_ad_cache')
    .select('ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, creative_name, creative_thumb_url, creative_body, erro')
    .eq('tenant_id', tenantId)
    .in('ad_id', unicos), 'carregar os anúncios')

  const emCache = new Set<string>()
  for (const l of linhas ?? []) {
    emCache.add(l.ad_id as string)
    if (l.erro) continue
    saida.set(l.ad_id as string, {
      adId:         l.ad_id as string,
      adName:       l.ad_name,
      adsetId:      l.adset_id,
      adsetName:    l.adset_name,
      campaignId:   l.campaign_id,
      campaignName: l.campaign_name,
      creativeName:  l.creative_name,
      creativeThumb: l.creative_thumb_url,
      creativeBody:  l.creative_body,
    })
  }

  // Os que faltam vão um a um — é o que a Graph API permite para um nó por id,
  // e são poucos: só entram aqui anúncios vistos pela primeira vez.
  for (const id of unicos) {
    if (emCache.has(id)) continue
    const n = await nomesDoAnuncio(tenantId, id)
    if (n) saida.set(id, n)
  }

  return saida
}
