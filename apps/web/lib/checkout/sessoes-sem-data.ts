/**
 * O que o checkout do plano diz das sessões que ficam sem data (A37 da 8ª
 * simulação, 2026-11-06): concluir caía na ficha sem confirmação, e as sessões
 * 2 e 3 ficavam sem data e sem aviso. A regra não muda — agendar no checkout é
 * opcional —; a tela só diz antes e confirma depois.
 */
export function textoDasSessoesSemData(numeros: number[]): string | null {
  if (numeros.length === 0) return null
  const lista = numeros.length === 1 ? String(numeros[0])
    : `${numeros.slice(0, -1).join(', ')} e ${numeros[numeros.length - 1]}`
  return numeros.length === 1
    ? `A sessão ${lista} fica sem data: agende pela ficha da cliente (Tratamentos) quando ela marcar.`
    : `As sessões ${lista} ficam sem data: agende pela ficha da cliente (Tratamentos) quando ela marcar.`
}

/** O "deu certo" do checkout: o plano fechou, e o que ficou para depois. */
export function avisoDoPlanoFechado(totalDeSessoes: number, semData: number[]): string {
  const base = `Plano fechado: ${totalDeSessoes} ${totalDeSessoes === 1 ? 'sessão' : 'sessões'}.`
  return semData.length === 0 ? `${base} Todas com data.`
    : `${base} ${semData.length === totalDeSessoes ? 'Nenhuma agendada ainda' : `${semData.length} sem data`} — agende pela ficha quando a cliente marcar.`
}
