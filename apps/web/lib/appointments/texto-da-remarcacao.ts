/**
 * O texto da remarcação no histórico do agendamento: DE QUANDO para quando
 * (princípio 3; decisão do Claude, 26/11 — A2 da 31ª). Era só "Reagendado
 * para 29/11, 14:00": o horário de antes não ficava em lugar nenhum. Cada
 * horário no relógio da sua unidade (o remarcar do app pode mudar de unidade).
 * O mesmo instante (só trocou quem atende) não repete o "de". Puro.
 */
export function textoDaRemarcacao(p: {
  de: string | null; para: string; fuso: string; fusoDeAntes?: string; pelaCliente?: boolean
}): string {
  const quando = (iso: string, fuso: string) => new Date(iso).toLocaleString('pt-BR', {
    timeZone: fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const quem = p.pelaCliente ? 'Remarcado pela cliente no app' : 'Remarcado'
  const para = quando(p.para, p.fuso)
  const mesmo = !p.de || new Date(p.de).getTime() === new Date(p.para).getTime()
  return mesmo ? `${quem} para ${para}` : `${quem} de ${quando(p.de!, p.fusoDeAntes ?? p.fuso)} para ${para}`
}
