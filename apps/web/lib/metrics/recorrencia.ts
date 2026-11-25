/**
 * O "Ranking — Recorrência" das clientes (D16 da 28ª): quem mais VOLTOU no
 * recorte — os atendimentos concluídos (`metrics_recorrencia_das_clientes`),
 * a mesma conta na rede e na unidade recortada. Saía do ranking de gasto, e
 * listava quem pagou sem vir ("0 atend."). Aqui só a ordem e o corte: quem
 * tem ao menos um atendimento, as 5 primeiras.
 */
export interface RecorrenciaDaCliente { clientId: string; name: string; appointments: number }

export function rankingDaRecorrencia<T extends RecorrenciaDaCliente>(lista: T[], limite = 5): T[] {
  return lista.filter(c => c.appointments > 0)
    .sort((a, b) => b.appointments - a.appointments || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limite)
}
