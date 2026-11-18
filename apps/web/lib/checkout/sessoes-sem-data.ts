import { primeiroNome } from '@/lib/saudacao'

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

/**
 * O "deu certo" do checkout: o plano fechou, e o que ficou para depois.
 *
 * `jaAgendadas` (D3 da 15ª simulação): as sessões que já tinham agendamento
 * ANTES do checkout — a cliente marca a sessão pelo app antes de pagar
 * (PT1d/PT3). Sem contá-las, a Lia leu "Nenhuma agendada ainda" com a sessão 1
 * marcada. `semData` já vem sem elas.
 */
// A20 da 24ª: com o nome da cliente ("quando Carla marcar"), não "a cliente" fixo.
export function avisoDoPlanoFechado(totalDeSessoes: number, semData: number[], jaAgendadas = 0, nome?: string | null): string {
  const base = `Plano fechado: ${totalDeSessoes} ${totalDeSessoes === 1 ? 'sessão' : 'sessões'}.`
  if (semData.length === 0) return `${base} Todas com data.`
  const agendadas = jaAgendadas > 0 ? `${jaAgendadas} já ${jaAgendadas === 1 ? 'agendada' : 'agendadas'}, ` : ''
  const resto = semData.length === totalDeSessoes ? 'Nenhuma agendada ainda' : `${agendadas}${semData.length} sem data`
  return `${base} ${resto} — agende pela ficha quando ${nome?.trim() ? primeiroNome(nome) : 'a cliente'} marcar.`
}

/** "já agendada: 16/11 às 14:00", no fuso da unidade — a sessão que o checkout não oferece de novo (D3 da 15ª). */
export function textoDaSessaoJaAgendada(iso: string, fuso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
  return `já agendada: ${dia} às ${hora}`
}
