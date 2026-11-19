/**
 * A tag é da PESSOA (o Heitor, 18/11, noite: "a tag é da pessoa e pode ter
 * mais de uma tag"; crm-inbox.md §9.2.1). Uma lista por pessoa: a da ficha
 * (`clients.tags`) e a dos contatos dela (`contacts.tags`), que o banco
 * mantém iguais (migration 20261125500001). A oportunidade não tem tag
 * própria: o card mostra e edita as da pessoa dele — a ficha, e sem ficha o
 * contato. Puro: o servidor e o teste usam sem banco.
 */

/** As duas listas numa só: sem repetir, sem distinguir a caixa; a primeira grafia vence. */
export function juntarTags(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): string[] {
  const saida: string[] = []
  for (const bruta of [...(a ?? []), ...(b ?? [])]) {
    const t = bruta?.trim()
    if (t && !saida.some(x => x.toLocaleLowerCase('pt-BR') === t.toLocaleLowerCase('pt-BR'))) saida.push(t)
  }
  return saida
}

export type PessoaDaOportunidade = { tabela: 'clients' | 'contacts'; id: string }

/** Onde moram as tags do card: a ficha; sem ficha, o contato. */
export function pessoaDaOportunidade(l: { client_id: string | null; contato_id: string | null }): PessoaDaOportunidade | null {
  if (l.client_id) return { tabela: 'clients', id: l.client_id }
  if (l.contato_id) return { tabela: 'contacts', id: l.contato_id }
  return null
}

/**
 * O embed das tags da pessoa numa leitura de `leads` (pelas chaves da
 * oportunidade: a ficha e o contato têm uma chave entre si, e o nome da
 * chave tira a dúvida do PostgREST).
 */
export const EMBED_TAGS_DA_PESSOA =
  'pessoa_ficha:clients!leads_client_id_fkey(tags), pessoa_contato:contacts!leads_contato_id_fkey(tags)'

type TagsEmbutidas = { tags: string[] | null } | { tags: string[] | null }[] | null | undefined

function tagsDoEmbed(e: TagsEmbutidas): string[] | null {
  if (!e) return null
  const um = Array.isArray(e) ? e[0] : e
  return um ? (um.tags ?? []) : null
}

/** As tags do card, lidas com `EMBED_TAGS_DA_PESSOA`. */
export function tagsDaPessoaDaOportunidade(l: {
  client_id: string | null
  pessoa_ficha?: TagsEmbutidas
  pessoa_contato?: TagsEmbutidas
}): string[] {
  if (l.client_id) return tagsDoEmbed(l.pessoa_ficha) ?? tagsDoEmbed(l.pessoa_contato) ?? []
  return tagsDoEmbed(l.pessoa_contato) ?? []
}
