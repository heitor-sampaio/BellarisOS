/**
 * A saudação da topbar e o nome dela. Era "Bom dia" a qualquer hora, e o
 * primeiro nome de "Dra. Lívia Ramos" saía "Dra." (simulação de um dia de
 * clínica, 2026-10-20). A hora é a de Brasília, nos dois lados (servidor e
 * navegador), para a hidratação não divergir.
 */

const TITULOS = /^(dr|dra|sr|sra|srta|prof|profa)\.?$/i

export function saudacao(agora: Date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora)) % 24
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** O primeiro nome, com o título junto ("Dra. Lívia"); sem o que vem entre parênteses. */
export function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(p => p && !/^\(.*\)?$/.test(p))
  if (partes.length >= 2 && TITULOS.test(partes[0]!)) return `${partes[0]} ${partes[1]}`
  return partes[0] ?? nome
}
