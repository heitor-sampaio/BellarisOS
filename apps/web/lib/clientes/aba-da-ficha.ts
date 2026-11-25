/**
 * A aba aberta da ficha da cliente, pelo `?aba=` (C77, F65): o servidor monta
 * o que ELA mostra. As chaves são as da tela (`TABS` em
 * `components/branch/client-profile.tsx`); qualquer outra — vazia, de link
 * velho, repetida — é a Visão geral, que é o que a tela abre nesse caso.
 */
export type AbaDaFicha = 'visao' | 'historico' | 'oportunidades' | 'planejamento' | 'fichas' | 'financeiro' | 'documentos' | 'dados'

const ABAS: readonly AbaDaFicha[] = ['visao', 'historico', 'oportunidades', 'planejamento', 'fichas', 'financeiro', 'documentos', 'dados']

/**
 * O NOME da aba também abre a aba (A8 da 29ª): a chave do Prontuário é
 * "fichas" (os links velhos com `?aba=fichas` seguem valendo), e quem escreve
 * `?aba=prontuario` quer o Prontuário — caía na Visão geral, calado.
 */
const APELIDOS: Record<string, AbaDaFicha> = { prontuario: 'fichas' }

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** A chave pedida pela URL, com os apelidos já trocados (null sem pedido). */
export function chaveDaAbaPedida(pedida: string | null | undefined): string | null {
  if (!pedida?.trim()) return null
  return APELIDOS[semAcento(pedida)] ?? pedida
}

export function abaDaFicha(pedida: string | string[] | undefined): AbaDaFicha {
  const aba = chaveDaAbaPedida(Array.isArray(pedida) ? pedida[0] : pedida)
  return ABAS.includes(aba as AbaDaFicha) ? (aba as AbaDaFicha) : 'visao'
}
