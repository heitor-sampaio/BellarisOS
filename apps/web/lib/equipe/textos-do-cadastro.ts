import { formatBRL, parseDinheiro } from '@estetica-os/utils'

/**
 * Textos do cadastro da equipe — puros, para a tela e o teste dizerem o mesmo
 * (os atritos A20 e A21 da 18ª simulação; princípio 3).
 */

/**
 * O resumo da comissão ANTES de salvar (A20): no celular o tipo era um botão
 * suspenso e, logo abaixo, a "Comissão de venda (%)" — o 30% caiu na venda, e
 * o erro só aparecia na linha da Equipe depois. O resumo diz o que vai valer,
 * nos dois campos, como a pessoa digitou.
 */
export function resumoDaComissaoDoMembro(c: { tipo: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'NENHUMA'; valor: string; venda: string; atende?: boolean }): string {
  const pct = (t: string) => `${t.trim().replace('.', ',')}%`
  const temVenda = c.venda.trim() && Number.isFinite(parseDinheiro(c.venda)) && parseDinheiro(c.venda) > 0
  // A22 da 20ª (princípio 7): quem não atende e não tem a de atendimento — o
  // resumo falava em "nenhuma por atendimento" a quem só vende. E sem a de venda
  // dela vale a do pacote, a do produto e a da rede (princípio 3; o mesmo que a
  // A6 da 24ª corrigiu no chip): "Comissão: nenhuma." as escondia.
  if (c.atende === false && c.tipo === 'NENHUMA') return temVenda ? `Comissão: ${pct(c.venda)} de cada venda.` : 'Comissão: a de venda do pacote, do produto ou da rede.'
  let atendimento: string
  if (c.tipo === 'NENHUMA') atendimento = 'nenhuma por atendimento'
  else if (!c.valor.trim() || !Number.isFinite(parseDinheiro(c.valor))) {
    atendimento = c.tipo === 'PERCENTAGE' ? 'falta o percentual de cada atendimento' : 'falta o valor de cada atendimento'
  } else atendimento = c.tipo === 'PERCENTAGE' ? `${pct(c.valor)} de cada atendimento` : `${formatBRL(parseDinheiro(c.valor)).replace(/ /g, ' ')} por atendimento`
  const venda = c.venda.trim() && Number.isFinite(parseDinheiro(c.venda)) && parseDinheiro(c.venda) > 0
    ? ` · ${pct(c.venda)} de cada venda` : ''
  return `Comissão: ${atendimento}${venda}.`
}

/**
 * O "deu certo" do cadastro do membro (A21): o formulário fechava calado. A
 * senha não vai à tela — é a temporária que quem cadastra digitou.
 */
export function confirmacaoDoCadastro(nome: string): string {
  const quem = nome.trim()
  return `${quem ? `${quem} entrou na equipe.` : 'Membro criado.'} A senha é a temporária que você definiu; ela troca no primeiro acesso.`
}

/**
 * Quem entrou na equipe sem a comissão (A3 da 8ª simulação): o aviso dizia "os
 * atendimentos dela" também do Dr. Marcos (A3 da 20ª; princípio 3) — fala
 * pelo nome, sem supor o gênero.
 */
export function avisoDeQuemEntrouSemComissao(nome: string): string {
  return `${nome} entrou sem comissão: os atendimentos de ${nome} não geram comissão até alguém definir, no chip “Sem comissão” da linha.`
}

/**
 * O "deu certo" do Reativar (A6 da 22ª simulação; princípio 3): ele não dizia o
 * que volta e o que não volta. Volta o login e o "Atende" como estava; o que
 * foi repassado ao desativar (agendamentos e oportunidades) fica com quem
 * recebeu.
 */
export function textoDoReativado(nome: string, atende: boolean): string {
  return `${nome} voltou: entra no sistema ${atende ? 'e atende ' : ''}como antes. O que foi repassado ao desativar continua com quem recebeu.`
}

/**
 * O botão do Desativar com o "Repassar todos … para" (A3 da 23ª simulação;
 * princípio 3): repassar a quem atende numa unidade só preenche só as linhas
 * dela (H6), e o botão dizia "Desativar" com 4 de 5 ficando com a pessoa
 * desativada. Com o "todos para" numa pessoa que não pegou todos, o botão diz
 * quantos vão.
 */
export function rotuloDoDesativar(p: { todosParaAlguem: boolean; repassados: number; total: number }): string {
  return p.todosParaAlguem && p.repassados < p.total ? `Desativar e repassar ${p.repassados} de ${p.total}` : 'Desativar'
}
