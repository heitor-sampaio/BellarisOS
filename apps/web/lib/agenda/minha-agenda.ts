/**
 * Os rótulos dos cartões do topo da "Minha agenda" (A22 da 22ª simulação;
 * princípio 3). Quem atende em mais de uma unidade vê os dela de fora como
 * cartões ("Na unidade X"): "Hoje" e "Esta semana" contam as unidades dela, e a
 * ocupação é só a da unidade do cabeçalho — lado a lado, "Hoje: 2" e
 * "Ocupação hoje 0%" pareciam se contradizer. Com algum de outra unidade, os
 * rótulos dizem de onde é cada número.
 */
export function rotulosDaMinhaAgenda({ deOutraUnidade, unidade }: { deOutraUnidade: boolean; unidade: string }): {
  hoje: string; semana: string; ocupacao: string
} {
  if (!deOutraUnidade) return { hoje: 'Hoje', semana: 'Esta semana', ocupacao: 'Ocupação hoje' }
  return { hoje: 'Hoje · suas unidades', semana: 'Esta semana · suas unidades', ocupacao: `Ocupação hoje · ${unidade}` }
}

/**
 * A "Semana" da Minha agenda em lista (A27 da 23ª simulação; princípio 7): eram
 * 7 cartões de dia com barrinhas e nenhum atendimento — clicar num dia voltava
 * ao Dia. Embaixo da faixa, os atendimentos da semana por dia, em ordem; só os
 * dias que têm algum, sem os cancelados (a grade do dia também não os mostra).
 * `diaDo`: a chave AAAA-MM-DD do início, no relógio da grade (a tela passa o
 * `format` de parede; o padrão lê o começo do texto).
 */
export function semanaEmLista<E extends { id: string; start: string; status: string }>(
  eventos: readonly E[],
  dias: readonly string[],
  diaDo: (start: string) => string = s => s.slice(0, 10),
): { dia: string; eventos: E[] }[] {
  return dias.map(dia => ({
    dia,
    eventos: eventos
      .filter(e => e.status !== 'CANCELLED' && diaDo(e.start) === dia)
      .slice()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
  })).filter(d => d.eventos.length > 0)
}
