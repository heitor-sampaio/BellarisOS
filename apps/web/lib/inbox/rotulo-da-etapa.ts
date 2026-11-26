/**
 * O rótulo da etapa no filtro do inbox (A5 da 32ª simulação; princípio 7).
 *
 * Com mais de um funil e nenhum escolhido, as etapas de funis diferentes
 * ficavam lado a lado sem dizer de qual são (duas "Proposta"). Aí a etapa diz
 * o funil: "Funil · Etapa". Com o funil escolhido, ou com um funil só, só o
 * nome da etapa — o funil já está dito.
 *
 * Puro: o filtro chama; o teste também.
 */
export function rotuloDaEtapa(
  etapa: { nome: string; funil: string },
  funis: { id: string; nome: string }[],
  funilEscolhido: string,
): string {
  if (funilEscolhido !== 'todos' || funis.length <= 1) return etapa.nome
  const funil = funis.find(f => f.id === etapa.funil)?.nome
  return funil ? `${funil} · ${etapa.nome}` : etapa.nome
}
