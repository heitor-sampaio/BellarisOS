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
export function resumoDaComissaoDoMembro(c: { tipo: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'NENHUMA'; valor: string; venda: string }): string {
  const pct = (t: string) => `${t.trim().replace('.', ',')}%`
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
