import { FUSO_PADRAO, fusoValido, nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * O relógio da grade da agenda da REDE (D4 da 33ª simulação; FU-04 e o
 * princípio 3: a tela diz qual é o relógio). Puro: roda no navegador.
 *
 * A grade desenha cada coluna no relógio da unidade dela (F62). Com unidades
 * em fusos diferentes, as 21:00 de Barra do Garças ficam na mesma altura das
 * 21:00 de Aragarças sem que a tela diga que são relógios diferentes. Então
 * (decisão do Claude, 26/11): com fusos diferentes, cada coluna diz o relógio
 * dela, também o de Brasília, e a nota acima da grade diz o de cada unidade;
 * com um fuso só, a nota de sempre ("Horário de Manaus", a `NotaDoFuso`); em
 * Brasília, nada (o caso comum não ganha texto, princípio 7).
 */
export function relogioDaGradeDaRede(unidades: readonly { name: string; fuso?: string | null }[]): { nota: string | null; porColuna: boolean } {
  const fusos = new Set(unidades.map(u => fusoValido(u.fuso)))
  if (fusos.size > 1) {
    const cada = unidades.map(u => `${u.name} no ${nomeDoFuso(u.fuso)}`).join('; ')
    return { nota: `Cada unidade no relógio dela: ${cada}.`, porColuna: true }
  }
  const unico = [...fusos][0] ?? FUSO_PADRAO
  return { nota: unico === FUSO_PADRAO ? null : relogioDaColuna(unico), porColuna: false }
}

/** "Horário de Cuiabá" — o relógio de uma coluna, com a inicial maiúscula. */
export function relogioDaColuna(fuso: string | null | undefined): string {
  const nome = nomeDoFuso(fuso)
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}
