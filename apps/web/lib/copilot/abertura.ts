/**
 * A abertura do Copilot — o "Olá" e os atalhos da conversa vazia (A28 da 26ª
 * simulação; princípio 3). Era fixa: "cadastrar ou agendar" e "Quanto
 * faturamos este mês?" a quem não tinha a Agenda, o Financeiro nem os
 * Clientes em Gerenciar. Agora sai das ferramentas que a permissão da pessoa
 * libera (`ferramentasDoCargo`, a mesma lista que o modelo recebe) e de ela
 * ver o dinheiro (a régua do dashboard e dos Relatórios).
 *
 * Pura: a action monta a entrada, a tela mostra o resultado.
 */

export interface AberturaDoCopilot {
  texto: string
  sugestoes: string[]
}

/**
 * O que a abertura oferece, cada um pelas ferramentas que o liberam. Toda
 * ferramenta de GRAVAÇÃO tem nome aqui (A21 da 30ª; copilot CH-07): o "Toda
 * gravação passa pela sua confirmação." ia a quem só ouvia "achar um cliente"
 * — a gravação que a permissão dela faz (cancelar, com o Atendimento em
 * Gerenciar) não estava na frase. `semAs`: o item some quando a pessoa já tem
 * a ferramenta que o inclui (quem agenda também remarca e cancela, e a frase
 * fica curta). `tests/copilot-fala-o-que-a-tela-diz.test.ts` trava a lista.
 */
export const CAPACIDADES_DO_COPILOT: readonly { nome: string; ferramentas: readonly string[]; semAs?: readonly string[] }[] = [
  { nome: 'consultar a agenda', ferramentas: ['agendamentos', 'horarios_livres'] },
  // A vista pessoal (Q03 da revisão de 24/11): a agenda e as comissões DELA.
  { nome: 'consultar a sua agenda', ferramentas: ['minha_agenda'] },
  { nome: 'ver as suas comissões', ferramentas: ['minhas_comissoes'] },
  { nome: 'achar um cliente', ferramentas: ['cliente', 'clientes'] },
  { nome: 'ver números', ferramentas: ['indicadores'] },
  // Os Clientes em Gerenciar: cadastrar e, junto, atualizar o contato, as tags e o acesso.
  { nome: 'cadastrar', ferramentas: ['cadastrar_cliente', 'atualizar_contato', 'marcar_tags', 'criar_acesso_ao_app'] },
  // A Agenda em Gerenciar: agendar e, junto, remarcar, confirmar e marcar a chegada.
  { nome: 'agendar', ferramentas: ['agendar', 'remarcar', 'confirmar_agendamento', 'fazer_check_in'] },
  // Sem a Agenda em Gerenciar, o Atendimento em Gerenciar só cancela (quem-cancela.ts).
  { nome: 'cancelar um agendamento', ferramentas: ['cancelar_agendamento'], semAs: ['agendar'] },
  { nome: 'lançar no financeiro', ferramentas: ['lancar'] },
  // O PDV sem o Financeiro em Gerenciar só dá baixa.
  { nome: 'dar baixa num lançamento', ferramentas: ['marcar_pago'], semAs: ['lancar'] },
  { nome: 'lançar no estoque', ferramentas: ['entrada_de_estoque', 'ajuste_de_estoque'] },
  { nome: 'criar e mover oportunidades', ferramentas: ['criar_oportunidade', 'mover_etapa', 'trocar_responsavel'] },
]

const ATALHOS: { texto: string; ferramenta: string; comDinheiro?: boolean }[] = [
  { texto: 'Quais são os horários livres amanhã?', ferramenta: 'horarios_livres' },
  { texto: 'Quem são os agendamentos de hoje?', ferramenta: 'agendamentos' },
  { texto: 'Quais são os meus horários de amanhã?', ferramenta: 'minha_agenda' },
  { texto: 'Quanto tenho de comissão neste período?', ferramenta: 'minhas_comissoes' },
  { texto: 'Quanto faturamos este mês?', ferramenta: 'indicadores', comDinheiro: true },
  { texto: 'Cadastrar uma cliente nova', ferramenta: 'cadastrar_cliente' },
]

function emLista(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}`
}

export function aberturaDoCopilot(entrada: {
  /** Os nomes das ferramentas liberadas (`ferramentasDoCargo`). */
  ferramentas: readonly string[]
  /** Vê o faturamento: a Visão geral dos Relatórios (a aba que o "quanto faturamos" lê) com o Financeiro em Ver. */
  veFaturamento: boolean
  /** Alguma ferramenta liberada grava (o módulo dela em Gerenciar; o Copilot em Ver já liga). */
  grava?: boolean
}): AberturaDoCopilot {
  const tem = (f: string) => entrada.ferramentas.includes(f)
  const capacidades = CAPACIDADES_DO_COPILOT
    .filter(c => c.ferramentas.some(tem) && !(c.semAs ?? []).some(tem))
    .map(c => c.nome)
  const grava = entrada.grava ?? (tem('cadastrar_cliente') || tem('agendar'))
  const texto = capacidades.length
    ? `Olá! Peça o que precisar: ${emLista(capacidades)}.${grava ? ' Toda gravação passa pela sua confirmação.' : ''}`
    : `Olá! Peça o que precisar, dentro do que a sua permissão abre.${grava ? ' Toda gravação passa pela sua confirmação.' : ''}`
  const sugestoes = ATALHOS.filter(a => tem(a.ferramenta) && (!a.comDinheiro || entrada.veFaturamento)).map(a => a.texto)
  return { texto, sugestoes }
}
