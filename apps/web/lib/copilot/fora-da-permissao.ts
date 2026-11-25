/**
 * O que a permissão da pessoa não mostra na ficha que o Copilot lê.
 *
 * D11 da 28ª: sem a Fidelidade em Ver, a ferramenta devolvia a ficha sem os
 * pontos — igual a quem não tem ponto nenhum —, e o modelo respondia "Não
 * encontrei pontos de fidelidade na ficha". Princípio 4 (faltou o dado: avisa,
 * nunca responde outro caso) e CW-05 (fala em permissão, nunca em cargo): o
 * recado vai junto dos dados, e o modelo diz que a permissão não mostra.
 */
export function foraDaPermissaoDaFicha(o: {
  veAgenda: boolean
  veCredito: boolean
  vePontos: boolean
  /** O programa de fidelidade da rede ligado e no plano (C5: desligado, nenhum sinal de pontos). */
  fidelidadeLigada: boolean
}): Record<string, string> | undefined {
  const r: Record<string, string> = {}
  if (!o.veAgenda) r.atendimentos = 'Os atendimentos da cliente não vieram: a permissão desta pessoa não inclui a Agenda em Ver. Se ela perguntar, diga isso (não diga que não há atendimentos).'
  if (!o.veCredito) r.creditoInterno = 'O crédito interno não veio: a permissão desta pessoa não inclui o Financeiro em Ver nem o PDV em Gerenciar. Se ela perguntar, diga isso (não diga que não há crédito).'
  if (!o.vePontos && o.fidelidadeLigada) r.pontosDeFidelidade = 'Os pontos de fidelidade não vieram: a permissão desta pessoa não inclui a Fidelidade em Ver. Se ela perguntar, diga isso (não diga que a cliente não tem pontos).'
  return Object.keys(r).length ? r : undefined
}
