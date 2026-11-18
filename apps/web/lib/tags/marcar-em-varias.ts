import { tagsDoVocabulario, temTag } from '@/lib/tags/escolha'

/**
 * Marcar a MESMA tag em várias clientes de uma vez (A21 da 16ª simulação,
 * 2026-11-17). É a pessoa que marca (CLAUDE.md §1, Tags): a tag é uma do
 * vocabulário da rede, com o nome dele (`tagsDoVocabulario` — a que não existe
 * não se grava), e só muda quem ainda não a tem; as tags que a ficha já tinha
 * ficam. Pura — o teste a chama sem banco.
 */
export const MAXIMO_DE_FICHAS_POR_MARCACAO = 200

export function marcacoesDaTag(
  fichas: readonly { id: string; tags: readonly string[] | null }[],
  pedida: string,
  vocabulario: readonly string[],
): { tag: string | null; mudar: { id: string; tags: string[] }[] } {
  const tag = tagsDoVocabulario([pedida], vocabulario, [])[0] ?? null
  if (!tag) return { tag: null, mudar: [] }
  const mudar = fichas
    .filter(f => !temTag(f.tags ?? [], tag))
    .map(f => ({ id: f.id, tags: [...(f.tags ?? []), tag] }))
  return { tag, mudar }
}
