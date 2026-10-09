import 'server-only'
import { unstable_cache } from 'next/cache'
import { custoPorMes, type BaldeDeCusto } from './custo-do-copilot'

/**
 * O custo REAL da OpenAI, pela Costs API (`/v1/organization/costs`) — o mesmo
 * número da fatura, antes de impostos e do IOF do cartão (pedido do Heitor,
 * 2026-10-08). Pede a chave de ADMINISTRAÇÃO da organização
 * (`OPENAI_ADMIN_KEY`, só no serviço Sistema, de leitura), não a do Copilot.
 *
 * - Sem a chave: `null` — a tela mostra só a estimativa.
 * - A OpenAI recusou ou caiu: `{ erro }` — a tela avisa e mostra a estimativa.
 * - Guardado por 1 h: o dado é por DIA e chega com atraso; perguntar a cada
 *   abertura da tela só gastaria o limite da API. O ERRO não é guardado (a
 *   leitura o lança, e o cache não guarda o que foi lançado): uma queda de um
 *   minuto não esconde o real por uma hora.
 *
 * A chave de administração é da ORGANIZAÇÃO, não de um projeto: sem filtro, o
 * custo é o da conta inteira — os outros projetos dela também. Com
 * `OPENAI_PROJECT_ID` (o `proj_…` do projeto do BellarisOS, onde mora a chave do
 * Copilot), só o dele (`project_ids`). Sem ele, a tela avisa que soma tudo.
 *
 * A OpenAI não sabe quais são as redes: o rateio é `ratearCusto`.
 */

export type CustoReal = { porMes: Record<string, number> } | { erro: string } | null

/** O custo real é só do projeto do BellarisOS (`OPENAI_PROJECT_ID`), ou da organização inteira. */
export const custoRealDoProjeto = (): boolean => !!process.env.OPENAI_PROJECT_ID?.trim()

const URL_DA_OPENAI = 'https://api.openai.com/v1'

class ErroDaOpenai extends Error {}

async function lerDaOpenai(desde: string): Promise<{ porMes: Record<string, number> }> {
  const chave = process.env.OPENAI_ADMIN_KEY!
  const base = (process.env.OPENAI_BASE_URL_TESTE || URL_DA_OPENAI).replace(/\/+$/, '')
  const inicio = Math.floor(Date.parse(`${desde}T00:00:00Z`) / 1000)
  const baldes: BaldeDeCusto[] = []
  let pagina: string | null = null
  // Um ano de dias cabe em 3 páginas de 180; o teto evita laço sem fim.
  for (let i = 0; i < 6; i++) {
    const q = new URLSearchParams({ start_time: String(inicio), bucket_width: '1d', limit: '180' })
    const projeto = process.env.OPENAI_PROJECT_ID?.trim()
    if (projeto) q.append('project_ids', projeto)
    if (pagina) q.set('page', pagina)
    let r: Response
    try {
      r = await fetch(`${base}/organization/costs?${q}`, {
        headers: { authorization: `Bearer ${chave}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new ErroDaOpenai('Não consegui falar com a OpenAI agora.')
    }
    if (!r.ok) {
      throw new ErroDaOpenai(r.status === 401 || r.status === 403
        ? 'A OpenAI recusou a chave de administração (OPENAI_ADMIN_KEY).'
        : `A OpenAI respondeu ${r.status} ao pedir o custo.`)
    }
    const j = await r.json().catch(() => null) as { data?: BaldeDeCusto[]; has_more?: boolean; next_page?: string | null } | null
    baldes.push(...(j?.data ?? []))
    if (!j?.has_more || !j.next_page) break
    pagina = j.next_page
  }
  return { porMes: Object.fromEntries(custoPorMes(baldes)) }
}

/** O custo real por mês desde `desde` (`AAAA-MM-01`), guardado por 1 h. */
export async function custoRealDaOpenai(desde: string): Promise<CustoReal> {
  if (!process.env.OPENAI_ADMIN_KEY) return null
  try {
    return await unstable_cache(() => lerDaOpenai(desde), ['openai-custo-real', process.env.OPENAI_PROJECT_ID ?? 'organizacao', desde], { revalidate: 3600 })()
  } catch (e) {
    if (e instanceof ErroDaOpenai) return { erro: e.message }
    console.error('[custo-real-da-openai]', e)
    return { erro: 'Não consegui ler o custo real da OpenAI agora.' }
  }
}
