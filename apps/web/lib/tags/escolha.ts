import { isUnitTag } from '@estetica-os/utils'

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
 * gravada e invisível. A de unidade tem a sua seção.
 */
export function opcoesDeTag(vocabulario: readonly string[], marcadas: readonly string[]): string[] {
  const fora = marcadas.filter(t => !isUnitTag(t) && !temTag(vocabulario, t))
  return [...vocabulario, ...fora.filter((t, i) => fora.findIndex(x => chave(x) === chave(t)) === i)]
}

export function validarNomeDeTag(bruto: string): { nome: string } | { error: string } {
  const nome = bruto.trim().replace(/\s+/g, ' ')
  if (!nome) return { error: 'Dê um nome à tag.' }
  if (nome.length > 60) return { error: 'A tag tem no máximo 60 caracteres.' }
  if (isUnitTag(nome)) return { error: 'Tags "Unidade: …" são do sistema (a unidade que o cliente frequenta).' }
  return { nome }
}
