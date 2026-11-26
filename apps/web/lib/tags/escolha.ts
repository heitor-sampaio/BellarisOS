/**
 * As tags da rede na tela (2026-10-13): um vocabulário só para a ficha e o
 * CRM, gerenciado em Configurações → Tags. Puro — a ficha, o cadastro, o
 * painel do inbox e a action dividem.
 *
 * "VIP" e "vip" são a MESMA tag (o banco garante um nome por rede sem caixa):
 * marcar usa o nome do vocabulário, desmarcar tira qualquer grafia.
 */

const chave = (t: string) => t.trim().toLowerCase()

export function temTag(lista: readonly string[], tag: string): boolean {
  const k = chave(tag)
  return lista.some(t => chave(t) === k)
}

export function alternarTag(lista: readonly string[], tag: string): string[] {
  return temTag(lista, tag) ? lista.filter(t => chave(t) !== chave(tag)) : [...lista, tag]
}

/**
 * O que a tela oferece: o vocabulário ATIVO, mais a tag que a pessoa já tem e
 * não está nele (arquivada, ou de antes do vocabulário) — senão ela ficaria
 * gravada e invisível.
 * Não existe tag de unidade (H16): a "Unidade: X" gravada é uma tag comum.
 */
export function opcoesDeTag(vocabulario: readonly string[], marcadas: readonly string[]): string[] {
  const fora = marcadas.filter(t => !temTag(vocabulario, t))
  return [...vocabulario, ...fora.filter((t, i) => fora.findIndex(x => chave(x) === chave(t)) === i)]
}

export function validarNomeDeTag(bruto: string): { nome: string } | { error: string } {
  const nome = bruto.trim().replace(/\s+/g, ' ')
  if (!nome) return { error: 'Dê um nome à tag.' }
  if (nome.length > 60) return { error: 'A tag tem no máximo 60 caracteres.' }
  return { nome }
}

/**
 * As tags que a gravação guarda (D7 da 18ª simulação): só as do vocabulário,
 * com o nome dele, mais as que o registro já tinha (a arquivada, a de antes do
 * vocabulário — tirá-las seria mexer no que a pessoa não tocou). A tag que
 * não existe não se grava: o gatilho `trg_registrar_tags` a poria no
 * vocabulário, e criar tag é de Configurações → Tags, de quem tem “A rede
 * inteira” (H7). O card da oportunidade tinha uma entrada livre que criava.
 */
export function tagsDoVocabulario(pedidas: readonly string[], vocabulario: readonly string[], jaTinha: readonly string[]): string[] {
  const saida: string[] = []
  for (const bruta of pedidas) {
    const t = bruta.trim()
    if (!t || temTag(saida, t)) continue
    const doVocabulario = vocabulario.find(v => chave(v) === chave(t))
    const antiga = jaTinha.find(v => chave(v) === chave(t))
    const nome = doVocabulario ?? antiga
    if (nome) saida.push(nome)
  }
  return saida
}

/** Uma linha de `tags_da_rede`: o nome, se está arquivada e quantas pessoas a têm. */
export interface UsoDaTag { nome: string; arquivada_em: string | null; clientes: number | string; contatos: number | string }

/**
 * As opções do FILTRO de tags (A6 e Decisão D da 33ª simulação): as ativas,
 * mais as ARQUIVADAS que alguma pessoa ainda tem (ficha ou contato sem ficha).
 * Arquivar tira a tag das opções de MARCAR (TG-08), não do filtro: quem a tem
 * continua com ela, e o filtro a acha em toda tela (CLAUDE.md §1, Tags). A que
 * ninguém tem não se oferece: filtraria uma lista vazia.
 */
export function opcoesDoFiltroDeTags(ativas: readonly string[], uso: readonly UsoDaTag[]): string[] {
  const emUso = uso
    .filter(u => u.arquivada_em && Number(u.clientes) + Number(u.contatos) > 0)
    .map(u => u.nome)
    .filter(n => !temTag(ativas, n))
  if (!emUso.length) return [...ativas]
  return [...ativas, ...emUso].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}
