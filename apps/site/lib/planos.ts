import {
  FUNCIONALIDADES, adicionalCabeNoPlano, type RecursosDoPlano,
} from '@estetica-os/nucleo/lib/planos/recursos'
import { reaisDe } from '@estetica-os/nucleo/lib/redes/valor'

/**
 * Os planos do site (2026-10-17): os do SISTEMA, lidos por
 * `planos_do_site()` (migration 20261017000001) com a chave pública. A página
 * não escreve preço nenhum: mudou no sistema, muda aqui — em até uma hora,
 * que é o cache da leitura.
 */

export interface PlanoDoSite {
  nome: string
  descricao: string | null
  valorCentavos: number
  ordem: number
  recursos: RecursosDoPlano
}

export interface CartaoDoPlano {
  nome: string
  descricao: string | null
  preco: string
  /** O que o plano dá, em frases curtas (os limites e o Copilot). */
  destaques: string[]
  /** O que se contrata à parte, com o preço. */
  adicionais: string[]
  comCopilot: boolean
  /** Todas as funcionalidades do catálogo, fora o Copilot. */
  todasAsFuncionalidades: boolean
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `Até ${n} ${varios}`)

export function cartaoDoPlano(p: PlanoDoSite): CartaoDoPlano {
  const r = p.recursos
  const tem = new Set<string>(r.funcionalidades)
  const comCopilot = tem.has('copilot')
  const { unidades, whatsapp, membros } = r.limites
  const destaques = [
    unidades === null ? 'Unidades ilimitadas' : plural(unidades, 'unidade', 'unidades'),
    whatsapp === null ? 'Números de WhatsApp ilimitados' : plural(whatsapp, 'número de WhatsApp', 'números de WhatsApp'),
    membros === null ? 'Equipe ilimitada' : plural(membros, 'pessoa na equipe', 'pessoas na equipe'),
    ...(comCopilot ? ['Copilot incluído'] : []),
  ]
  const adicionais: string[] = []
  const copilot = r.adicionais?.copilot?.valor_centavos
  if (!comCopilot && copilot != null && adicionalCabeNoPlano(r, 'copilot')) adicionais.push(`Copilot: + ${reaisDe(copilot)} por mês`)
  const extra = r.adicionais?.whatsapp?.valor_centavos
  if (extra != null && adicionalCabeNoPlano(r, 'whatsapp')) adicionais.push(`Número de WhatsApp extra: + ${reaisDe(extra)} por mês`)

  return {
    nome: p.nome,
    descricao: p.descricao,
    preco: reaisDe(p.valorCentavos),
    destaques,
    adicionais,
    comCopilot,
    todasAsFuncionalidades: FUNCIONALIDADES.every(f => f.chave === 'copilot' || tem.has(f.chave)),
  }
}

/** O que a função devolve → planos. Linha torta (sem preço, sem recursos) fica de fora. */
export function planosDoSite(linhas: unknown): PlanoDoSite[] {
  if (!Array.isArray(linhas)) return []
  return linhas.flatMap((l): PlanoDoSite[] => {
    const x = l as Record<string, unknown> | null
    const r = x?.recursos as RecursosDoPlano | null | undefined
    if (!x || typeof x.nome !== 'string' || typeof x.valor_centavos !== 'number') return []
    if (!r || !Array.isArray(r.funcionalidades) || !r.limites || typeof r.limites !== 'object') return []
    return [{
      nome: x.nome,
      descricao: typeof x.descricao === 'string' && x.descricao.trim() ? x.descricao : null,
      valorCentavos: x.valor_centavos,
      ordem: typeof x.ordem === 'number' ? x.ordem : 0,
      recursos: { ...r, adicionais: r.adicionais ?? {} },
    }]
  })
}

// O último valor bom, no processo: o banco fora do ar não tira o preço da
// página de quem já o mostrou.
let ultimoBom: PlanoDoSite[] | null = null

/** Só para os testes. */
export function _esquecerUltimoBom() { ultimoBom = null }

/**
 * Os planos, do banco, com cache de uma hora (o cache de dados do Next).
 * `null` quando nunca houve leitura boa: a seção de preços diz isso em vez de
 * mostrar R$ 0.
 */
export async function lerPlanos(): Promise<PlanoDoSite[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) return ultimoBom
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/planos_do_site`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
      cache: 'force-cache',
      next: { revalidate: 3600, tags: ['planos-do-site'] },
    } as RequestInit)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const planos = planosDoSite(await res.json())
    ultimoBom = planos
    return planos
  } catch (e) {
    console.error('[site] planos_do_site:', e instanceof Error ? e.message : e)
    return ultimoBom
  }
}
