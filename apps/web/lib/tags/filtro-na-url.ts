/**
 * O filtro de Tags na URL (`?tags=`) — CLAUDE.md §1, Tags: o filtro
 * personalizado da rede vale onde houver filtro. Puro: a página lê, a tela
 * escreve, o teste chama sem banco.
 *
 * As tags vão separadas por vírgula; a vírgula e o `%` do nome vão escapados
 * (`%2C`, `%25`) — a tag com vírgula ("Pacote, 10x") não se parte em duas.
 * Quem precisar do filtro em outra tela (Relatórios, Agenda) usa estes.
 */

/**
 * Os pedaços de `?tags=` como vieram, cada um já sem o escape (`%2C` volta a
 * ser vírgula), sem aparar nem tirar repetidos — para quem confere contra o
 * vocabulário e ainda aceita a URL antiga, com a vírgula do nome sem escape
 * (a Agenda, `lerTagsDaUrl`).
 */
export function pedacosDaUrl(valor: string | undefined | null): string[] {
  if (!valor) return []
  return valor.split(',').map(parte => {
    try { return decodeURIComponent(parte) } catch { return parte }
  })
}

/** As tags de `?tags=` (o valor como o Next entrega em `searchParams`). */
export function tagsDaUrl(valor: string | undefined | null): string[] {
  const saida: string[] = []
  for (const parte of pedacosDaUrl(valor)) {
    const t = parte.trim()
    if (t && !saida.some(x => x.toLocaleLowerCase('pt-BR') === t.toLocaleLowerCase('pt-BR'))) saida.push(t)
  }
  return saida
}

/** O valor de `?tags=` para estas tags (vazio = sem filtro). */
export function tagsParaAUrl(tags: readonly string[]): string {
  return tags.map(t => t.trim().replace(/%/g, '%25').replace(/,/g, '%2C')).filter(Boolean).join(',')
}

/** A busca atual (`?a=1&b=2`) com as tags trocadas — sem tag, o `?tags=` sai. Devolve com o `?` (ou vazio). */
export function buscaComAsTags(busca: string, tags: readonly string[]): string {
  const q = new URLSearchParams(busca.startsWith('?') ? busca.slice(1) : busca)
  const valor = tagsParaAUrl(tags)
  if (valor) q.set('tags', valor)
  else q.delete('tags')
  const s = q.toString()
  return s ? `?${s}` : ''
}

/**
 * O literal de `text[]` do Postgres para o filtro `cs` (contém) do PostgREST:
 * cada tag entre aspas, com `"` e `\` escapados. O `.contains()` do
 * supabase-js junta os itens sem aspas, e a tag com vírgula viraria duas.
 */
export function literalDeArrayDoPostgres(tags: readonly string[]): string {
  return `{${tags.map(t => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
}
