import { FUSO_PADRAO, fusoValido, nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * O relógio da grade da agenda da REDE (D4 da 33ª simulação; FU-04 e o
 * princípio 3: a tela diz qual é o relógio). Puro: roda no navegador.
 *
 * A grade desenha cada coluna no relógio da unidade dela (F62). Com unidades
 * em fusos diferentes, as 21:00 de Barra do Garças ficam na mesma altura das
 * 21:00 de Aragarças sem que a tela diga que são relógios diferentes. Então
 * (R16, o Heitor, 26/11: "Cada coluna no relógio da sua unidade, dizendo qual
 * é"): com fusos diferentes, cada coluna diz o relógio dela, também o de
 * Brasília, sem nota acima da grade ("não precisa da explicação"); com um fuso só, a nota de sempre ("Horário de Manaus", a `NotaDoFuso`); em
 * Brasília, nada (o caso comum não ganha texto, princípio 7).
 */
export function relogioDaGradeDaRede(unidades: readonly { name: string; fuso?: string | null }[]): { nota: string | null; porColuna: boolean } {
  const fusos = new Set(unidades.map(u => fusoValido(u.fuso)))
  // R16 (o Heitor, 26/11): cada coluna no relógio da sua unidade, dizendo qual — e "não precisa da
  // explicação": o rótulo da coluna basta, sem nota acima da grade.
  if (fusos.size > 1) return { nota: null, porColuna: true }
  const unico = [...fusos][0] ?? FUSO_PADRAO
  return { nota: unico === FUSO_PADRAO ? null : relogioDaColuna(unico), porColuna: false }
}

/** "Horário de Cuiabá" — o relógio de uma coluna, com a inicial maiúscula. */
export function relogioDaColuna(fuso: string | null | undefined): string {
  const nome = nomeDoFuso(fuso)
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}
