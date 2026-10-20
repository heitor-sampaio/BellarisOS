import {
  FUNCIONALIDADES, adicionalCabeNoPlano, type ChaveDeFuncionalidade,
} from '@estetica-os/nucleo/lib/planos/recursos'
import type { PlanoDoSite } from '@/lib/planos'

/**
 * A calculadora do site (2026-10-19, pedido do Heitor): a pessoa diz o tamanho
 * da clínica e a página diz o plano.
 *
 * "Mais adequado" é o de MENOR TOTAL por mês que cabe, contando os adicionais
 * que o plano VENDE (número de WhatsApp além do limite — sem teto —, Copilot avulso) — não
 * só o preço do plano: com 2 números, o Starter com um extra sai mais barato
 * que o PRO. Empate: menos adicionais, depois a ordem do catálogo. Tudo vem
 * dos planos do sistema (`planos_do_site`): plano ou preço novo entra sozinho.
 */

export interface Necessidade {
  unidades: number
  pessoas: number
  whatsapp: number
  /** As funcionalidades que ela quer e que mudam de plano para plano (`escolhasDaCalculadora`). */
  funcionalidades: string[]
}

export interface ItemDoOrcamento { rotulo: string; centavos: number }

export type Orcamento =
  | { plano: string; cabe: true; totalCentavos: number; itens: ItemDoOrcamento[] }
  | { plano: string; cabe: false; motivo: string }

export type OrcamentoQueCabe = Extract<Orcamento, { cabe: true }>

const ROTULO = new Map<string, string>(FUNCIONALIDADES.map(f => [f.chave, f.rotulo]))
/** O nome curto, na conta ("Copilot", não "Copilot (IA secretária)"). */
const curto = (chave: string) => (ROTULO.get(chave) ?? chave).replace(/\s*\(.*\)$/, '')

const ate = (n: number, um: string, varios: string) => `Até ${n} ${n === 1 ? um : varios}`

/** O orçamento de UM plano para a necessidade: o total com os adicionais, ou o motivo de não caber. */
export function orcar(p: PlanoDoSite, n: Necessidade): Orcamento {
  const { limites, adicionais } = p.recursos
  const tem = new Set<string>(p.recursos.funcionalidades)
  const itens: ItemDoOrcamento[] = [{ rotulo: `Plano ${p.nome}`, centavos: p.valorCentavos }]
  const nao = (motivo: string): Orcamento => ({ plano: p.nome, cabe: false, motivo })

  if (limites.unidades !== null && n.unidades > limites.unidades) return nao(ate(limites.unidades, 'unidade', 'unidades'))
  if (limites.membros !== null && n.pessoas > limites.membros) return nao(ate(limites.membros, 'pessoa na equipe', 'pessoas na equipe'))

  if (limites.whatsapp !== null && n.whatsapp > limites.whatsapp) {
    const extras = n.whatsapp - limites.whatsapp
    const preco = adicionais.whatsapp?.valor_centavos
    const vende = preco != null && adicionalCabeNoPlano(p.recursos, 'whatsapp')
    // Sem teto de extras (2026-10-19): o plano que vende o número extra sempre cabe.
    if (!vende) return nao(ate(limites.whatsapp, 'número de WhatsApp', 'números de WhatsApp'))
    itens.push({ rotulo: extras === 1 ? '1 número de WhatsApp extra' : `${extras} números de WhatsApp extras`, centavos: extras * preco })
  }

  for (const f of n.funcionalidades) {
    if (tem.has(f)) continue
    // Só o Copilot é vendido à parte (ADICIONAIS); o resto, ou o plano tem, ou não cabe.
    const preco = f === 'copilot' ? adicionais.copilot?.valor_centavos : undefined
    if (preco == null || !adicionalCabeNoPlano(p.recursos, 'copilot')) return nao(`Sem ${ROTULO.get(f) ?? f}`)
    itens.push({ rotulo: curto(f), centavos: preco })
  }

  return { plano: p.nome, cabe: true, totalCentavos: itens.reduce((s, i) => s + i.centavos, 0), itens }
}

/** O indicado (ou nenhum) e o orçamento de cada plano, na ordem do catálogo. */
export function recomendar(planos: PlanoDoSite[], n: Necessidade): { indicado: OrcamentoQueCabe | null; todos: Orcamento[] } {
  const ordenados = [...planos].sort((a, b) => a.ordem - b.ordem)
  const todos = ordenados.map(p => orcar(p, n))
  const cabem = todos.filter((o): o is OrcamentoQueCabe => o.cabe)
  const indicado = cabem.reduce<OrcamentoQueCabe | null>((melhor, o) =>
    !melhor || o.totalCentavos < melhor.totalCentavos
      || (o.totalCentavos === melhor.totalCentavos && o.itens.length < melhor.itens.length) ? o : melhor, null)
  return { indicado, todos }
}

/**
 * O que perguntar além do tamanho: as funcionalidades que mudam o plano ou o
 * preço — algum plano NÃO inclui, e algum a oferece (de série ou à parte).
 * Hoje, só o Copilot; se um plano novo tirar outra, ela aparece sozinha.
 */
export function escolhasDaCalculadora(planos: PlanoDoSite[]): { chave: ChaveDeFuncionalidade; rotulo: string }[] {
  return FUNCIONALIDADES.filter(f => {
    const faltaEmAlgum = planos.some(p => !(p.recursos.funcionalidades as string[]).includes(f.chave))
    const alguemOferece = planos.some(p => (p.recursos.funcionalidades as string[]).includes(f.chave)
      || (f.chave === 'copilot' && p.recursos.adicionais.copilot != null && adicionalCabeNoPlano(p.recursos, 'copilot')))
    return faltaEmAlgum && alguemOferece
  }).map(f => ({ chave: f.chave, rotulo: f.rotulo }))
}
