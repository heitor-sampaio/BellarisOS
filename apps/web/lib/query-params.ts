/**
 * Monta uma query string a partir da atual, alterando só o que foi pedido.
 *
 * Os seletores da tela de relatórios montavam a URL do zero
 * (`router.push('?period=' + p)`), então trocar o período apagava a aba e
 * qualquer outro filtro. Cada filtro novo herdava o mesmo defeito.
 *
 * Chave com valor `null` é removida.
 */
export function mesclarParams(
  atuais: URLSearchParams | ReadonlyURLSearchParamsLike,
  alteracoes: Record<string, string | null | undefined>,
): string {
  const p = new URLSearchParams(atuais.toString())
  for (const [chave, valor] of Object.entries(alteracoes)) {
    if (valor === null || valor === undefined || valor === '') p.delete(chave)
    else p.set(chave, valor)
  }
  const s = p.toString()
  return s ? `?${s}` : '?'
}

/**
 * O mesmo, já como caminho completo.
 *
 * `mesclarParams` sozinho devolve `'?'` quando não sobra parâmetro nenhum, e
 * `/clients/123?` fica na barra do navegador e no histórico como se fosse outra
 * URL. Aqui o caminho volta limpo.
 */
export function rotaComParams(
  pathname: string,
  atuais: URLSearchParams | ReadonlyURLSearchParamsLike,
  alteracoes: Record<string, string | null | undefined>,
): string {
  const qs = mesclarParams(atuais, alteracoes)
  return qs === '?' ? pathname : pathname + qs
}

/** `useSearchParams()` do Next devolve um objeto somente-leitura com toString. */
interface ReadonlyURLSearchParamsLike {
  toString(): string
}
