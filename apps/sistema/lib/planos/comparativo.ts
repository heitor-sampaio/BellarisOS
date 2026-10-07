import {
  FUNCIONALIDADES, LIMITES, ADICIONAIS, adicionalCabeNoPlano, type RecursosDoPlano,
} from '@estetica-os/nucleo/lib/planos/recursos'
import { reaisDe } from '@estetica-os/nucleo/lib/redes/valor'

/**
 * O COMPARATIVO dos planos (2026-10-07, pedido do Heitor): tudo o que cada
 * plano inclui, numa tabela — uma coluna por plano, uma linha por item: o
 * preço, cada funcionalidade do catálogo (por grupo), os limites e os
 * adicionais à venda. A montagem é pura; a tela (`ComparativoDePlanos`) só
 * desenha. O catálogo é o de `lib/planos/recursos.ts`: item novo lá aparece
 * aqui sozinho.
 */
export type CelulaDoComparativo = { tipo: 'sim' } | { tipo: 'nao' } | { tipo: 'texto'; texto: string }

export interface LinhaDoComparativo { rotulo: string; emBreve?: boolean; celulas: CelulaDoComparativo[] }
export interface Comparativo {
  planos: { id: string; nome: string; ativo: boolean }[]
  secoes: { titulo: string; linhas: LinhaDoComparativo[] }[]
}

interface PlanoParaComparar { id: string; nome: string; valorCentavos: number; ativo: boolean; recursos: RecursosDoPlano }

const sim = (v: boolean): CelulaDoComparativo => (v ? { tipo: 'sim' } : { tipo: 'nao' })
const texto = (t: string): CelulaDoComparativo => ({ tipo: 'texto', texto: t })

export function comparativoDosPlanos(planos: PlanoParaComparar[]): Comparativo {
  const grupos = [...new Set(FUNCIONALIDADES.map(f => f.grupo))]
  return {
    planos: planos.map(p => ({ id: p.id, nome: p.nome, ativo: p.ativo })),
    secoes: [
      { titulo: 'Preço', linhas: [{ rotulo: 'Valor mensal', celulas: planos.map(p => texto(reaisDe(p.valorCentavos))) }] },
      ...grupos.map(g => ({
        titulo: g,
        linhas: FUNCIONALIDADES.filter(f => f.grupo === g).map(f => ({
          rotulo: f.rotulo,
          ...('emBreve' in f && f.emBreve ? { emBreve: true } : {}),
          celulas: planos.map(p => sim((p.recursos.funcionalidades as string[]).includes(f.chave))),
        })),
      })),
      {
        titulo: 'Limites',
        linhas: LIMITES.map(l => ({
          rotulo: l.rotulo,
          celulas: planos.map(p => texto(p.recursos.limites[l.chave] === null ? 'Ilimitado' : String(p.recursos.limites[l.chave]))),
        })),
      },
      {
        titulo: 'Adicionais à venda',
        linhas: ADICIONAIS.map(a => ({
          rotulo: a.chave === 'copilot' ? `${a.rotulo} avulso` : a.rotulo,
          ...('emBreve' in a && a.emBreve ? { emBreve: true } : {}),
          celulas: planos.map(p => {
            // Não cabe no plano porque o plano já dá: o WhatsApp ilimitado, o Copilot incluído.
            if (!adicionalCabeNoPlano(p.recursos, a.chave)) return texto(a.chave === 'whatsapp' ? 'Ilimitado no plano' : 'Incluído no plano')
            const preco = p.recursos.adicionais?.[a.chave]?.valor_centavos
            if (preco == null) return sim(false)
            return texto(`${reaisDe(preco)} ${a.chave === 'whatsapp' ? 'por conexão' : 'por mês'}`)
          }),
        })),
      },
    ],
  }
}
