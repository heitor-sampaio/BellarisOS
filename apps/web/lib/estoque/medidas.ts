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
 * As medidas que são QUANTIDADE — massa, volume e a dose —, e quanto cada uma
 * vale na base da grandeza dela (1 kg = 1000 g). Não são um formato de
 * embalagem (frasco, pote, caixa): servem de embalagem só para contar direto
 * nelas, sem conteúdo.
 */
const GRANDEZAS: Record<string, { grandeza: string; base: number }> = {
  g: { grandeza: 'massa', base: 1 }, kg: { grandeza: 'massa', base: 1000 },
  ml: { grandeza: 'volume', base: 1 }, l: { grandeza: 'volume', base: 1000 },
  u: { grandeza: 'U', base: 1 }, ui: { grandeza: 'UI', base: 1 },
}
const grandezaDe = (medida: string | null | undefined) => GRANDEZAS[(medida ?? '').trim().toLowerCase()] ?? null
const emTexto = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

/**
 * A embalagem e o conteúdo que não fecham — o IMPOSSÍVEL (D2 da 31ª simulação,
 * decisão do Claude, 26/11; princípio 2: só o impossível se recusa). A
 * embalagem é o que se compra e se conta na prateleira; o conteúdo, quanto ela
 * tem na medida de uso (ES-17). "1 g com 1000 g" não existe: o alginato
 * cadastrado assim chamava o pote de "g" na Entrada, no lote, no dashboard e
 * no Copilot. A mesma grandeza só fecha pela conta dela ("1 kg com 1000 g",
 * "1 L com 1000 ml"); sem conteúdo, a medida como embalagem vale (conta-se
 * direto em g). Devolve a recusa, ou `null`.
 */
export function recusaDaEmbalagem(embalagem: string | null | undefined, conteudo: number | null | undefined, medida: string | null | undefined): string | null {
  const de = grandezaDe(embalagem)
  const para = grandezaDe(medida)
  if (!de || !para || de.grandeza !== para.grandeza || !(Number(conteudo) > 0)) return null
  const certo = de.base / para.base
  if (Math.abs(Number(conteudo) - certo) < 1e-9 * Math.max(1, certo)) return null
  const emb = (embalagem ?? '').trim()
  const med = (medida ?? '').trim()
  const conta = emb.toLowerCase() === med.toLowerCase() ? '' : ` (1 ${emb} tem ${emTexto(certo)} ${med})`
  return `“1 ${emb} com ${emTexto(Number(conteudo))} ${med}” não fecha${conta}: a embalagem é o que se compra e se conta na prateleira `
    + `(frasco, seringa, caixa…; “un” quando nenhuma serve), e o conteúdo é quanto ela tem. Troque a embalagem, ou apague o conteúdo para contar direto em ${emb}.`
}

/**
 * A medida como embalagem com o conteúdo noutra grandeza ("ml com 50 g") — o
 * improvável, que avisa sem recusar (princípio 2; decisão do Claude, 26/11).
 */
export function avisoDaEmbalagem(embalagem: string | null | undefined, conteudo: number | null | undefined, medida: string | null | undefined): string | null {
  const de = grandezaDe(embalagem)
  const para = grandezaDe(medida)
  if (!de || !(medida ?? '').trim() || !(Number(conteudo) > 0)) return null
  if (para && para.grandeza === de.grandeza) return null
  const emb = (embalagem ?? '').trim()
  return `“${emb}” é uma medida, não o que se compra: confira se a embalagem não é um frasco, uma caixa ou “un”. A entrada, a transferência e o saldo contam em ${emb}. Se estiver certa, vale assim.`
}

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
