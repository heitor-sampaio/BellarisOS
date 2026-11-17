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
