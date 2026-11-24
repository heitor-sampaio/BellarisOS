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

const CAPACIDADES: { nome: string; ferramentas: readonly string[] }[] = [
  { nome: 'consultar a agenda', ferramentas: ['agendamentos', 'horarios_livres'] },
  { nome: 'achar um cliente', ferramentas: ['cliente', 'clientes'] },
  { nome: 'ver números', ferramentas: ['indicadores'] },
  { nome: 'cadastrar', ferramentas: ['cadastrar_cliente'] },
  { nome: 'agendar', ferramentas: ['agendar'] },
]

const ATALHOS: { texto: string; ferramenta: string; comDinheiro?: boolean }[] = [
  { texto: 'Quais são os horários livres amanhã?', ferramenta: 'horarios_livres' },
  { texto: 'Quem são os agendamentos de hoje?', ferramenta: 'agendamentos' },
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
  /** Alguma ferramenta liberada grava (o Copilot em Gerenciar e o módulo dela). */
  grava?: boolean
}): AberturaDoCopilot {
  const tem = (f: string) => entrada.ferramentas.includes(f)
  const capacidades = CAPACIDADES.filter(c => c.ferramentas.some(tem)).map(c => c.nome)
  const grava = entrada.grava ?? (tem('cadastrar_cliente') || tem('agendar'))
  const texto = capacidades.length
    ? `Olá! Peça o que precisar: ${emLista(capacidades)}.${grava ? ' Toda gravação passa pela sua confirmação.' : ''}`
    : `Olá! Peça o que precisar, dentro do que a sua permissão abre.${grava ? ' Toda gravação passa pela sua confirmação.' : ''}`
  const sugestoes = ATALHOS.filter(a => tem(a.ferramenta) && (!a.comDinheiro || entrada.veFaturamento)).map(a => a.texto)
  return { texto, sugestoes }
}
