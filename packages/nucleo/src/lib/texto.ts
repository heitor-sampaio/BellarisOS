/**
 * Comparação de texto para busca na TELA (listas já carregadas).
 *
 * "joao" tem de achar "João" e "acido" tem de achar "Ácido": quem digita
 * rápido não põe acento, e a lista que não acha o que está nela parece vazia.
 * O banco faz a mesma coisa com `private.sem_acento` — as duas pontas da busca
 * universal comparam igual.
 */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** `termo` aparece em algum dos textos, ignorando acento e caixa. Termo vazio casa com tudo. */
export function contemSemAcento(
  textos: (string | null | undefined)[],
  termo: string,
): boolean {
  const t = semAcento(termo.trim())
  if (!t) return true
  return textos.some(x => !!x && semAcento(x).includes(t))
}

/** O `?q=` de uma tela: texto, aparado, até 80 caracteres. */
export function termoDaUrl(q: string | string[] | undefined): string {
  const v = Array.isArray(q) ? q[0] : q
  return (v ?? '').trim().slice(0, 80)
}
