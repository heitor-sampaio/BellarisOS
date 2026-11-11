/**
 * As medidas do cadastro do produto — a embalagem (`products.unit`) e o
 * conteúdo dela (`consumption_unit`). Puro: o modal do produto e os testes
 * usam a mesma lista (morava solta dentro do modal).
 *
 * "un" é a embalagem avulsa (uma unidade do produto); "U" é a medida da dose,
 * como a toxina ("frasco de 100 U" — J-11, 2026-10-30), ao lado de "UI".
 */
// "seringa" (A12 da 11ª): o ácido hialurônico vem em seringa.
export const MEDIDAS_DO_PRODUTO = ['un', 'U', 'UI', 'ml', 'L', 'g', 'kg', 'cx', 'par', 'rolo', 'ampola', 'frasco', 'seringa'] as const

/**
 * A medida no plural (A49 da 12ª simulação, 2026-11-11: "3 frasco", "Saem
 * 13.500 ml (27 frasco)"). As siglas (un, ml, g, cx, U, UI…) não mudam; a
 * palavra vai ao plural a partir de 2 — "1,5 frasco", como "1,5 litro".
 * A medida escrita à mão no cadastro ("refil", "bisnaga") segue a regra da
 * língua: -l vira -is, -r e -z ganham -es, -ão vira -ões, o resto ganha -s.
 */
const SIGLAS = new Set(['un', 'u', 'ui', 'ml', 'l', 'g', 'kg', 'mg', 'cx', 'cm', 'mm', 'm'])

export function medidaNoPlural(medida: string, quantidade: number): string {
  const m = (medida ?? '').trim()
  if (!m || Math.abs(quantidade) < 2 || SIGLAS.has(m.toLowerCase()) || /[^a-zà-ú]/i.test(m) || /s$/i.test(m)) return m
  if (/ão$/i.test(m)) return m.replace(/ão$/i, 'ões')
  if (/il$/i.test(m)) return m.replace(/il$/i, 'is')
  if (/[aeou]l$/i.test(m)) return m.replace(/l$/i, 'is')
  if (/[rz]$/i.test(m)) return m + 'es'
  if (/m$/i.test(m)) return m.replace(/m$/i, 'ns')
  return m + 's'
}

/** "27 frascos", "13.500 ml", "2,68 frascos" — a quantidade em pt-BR com a medida no plural. */
export function quantidadeComMedida(quantidade: number, medida: string, casas = 3): string {
  return `${quantidade.toLocaleString('pt-BR', { maximumFractionDigits: casas })} ${medidaNoPlural(medida, quantidade)}`
}
