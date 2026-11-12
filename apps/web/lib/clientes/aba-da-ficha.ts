/**
 * A aba aberta da ficha da cliente, pelo `?aba=` (C77, F65): o servidor monta
 * o que ELA mostra. As chaves são as da tela (`TABS` em
 * `components/branch/client-profile.tsx`); qualquer outra — vazia, de link
 * velho, repetida — é a Visão geral, que é o que a tela abre nesse caso.
 */
export type AbaDaFicha = 'visao' | 'historico' | 'oportunidades' | 'planejamento' | 'fichas' | 'financeiro' | 'documentos' | 'dados'

const ABAS: readonly AbaDaFicha[] = ['visao', 'historico', 'oportunidades', 'planejamento', 'fichas', 'financeiro', 'documentos', 'dados']

export function abaDaFicha(pedida: string | string[] | undefined): AbaDaFicha {
  const aba = Array.isArray(pedida) ? pedida[0] : pedida
  return ABAS.includes(aba as AbaDaFicha) ? (aba as AbaDaFicha) : 'visao'
}
