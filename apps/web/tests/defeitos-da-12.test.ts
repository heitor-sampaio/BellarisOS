import { describe, it, expect } from 'vitest'
import { LEVEL_COPY, quemVendeNoResumo, TEXTO_DA_VENDA_DO_PACOTE } from '@/lib/permissions-copy'
import { rotuloNoMenu, avisoDasVazias } from '@/lib/documentos/variaveis'
import { textoDoProximoLivre } from '@/lib/agenda/proximo-livre'
import { idadeDoLead } from '@/lib/crm/idade-do-lead'

// Os defeitos fora do dinheiro da 12ª simulação (2026-11-10/11), da F58.

// D1: a Rita, com Procedimentos em Gerenciar, lia "fechar a venda do pacote",
// e a ficha só mostra "Vender" a quem recebe (Recebimentos, ou o Financeiro em
// Gerenciar — podeReceber). Quem vende segue decidido pelo cargo (princípio 1);
// a tela deixa de prometer o que não abre (princípio 3).
describe('D1 da 12ª: a venda é de Recebimentos, e a tela diz', () => {
  it('Procedimentos e pacotes em Gerenciar não promete a venda', () => {
    expect(LEVEL_COPY.procedures.MANAGE).not.toMatch(/fechar a venda/)
    expect(LEVEL_COPY.procedures.MANAGE).toMatch(/Recebimentos/)
  })
  const nada = { procedures: 'NONE', crm: 'NONE', clients: 'NONE', cashier: 'NONE', financial: 'NONE' } as const
  it('o resumo do cargo diz que o comercial sem Recebimentos não vende', () => {
    expect(quemVendeNoResumo({ ...nada, procedures: 'MANAGE', crm: 'MANAGE', clients: 'MANAGE' }))
      .toBe('Não vende pelo “Vender” da ficha: vender é de Recebimentos (ou do Financeiro em Gerenciar).')
  })
  it('com Recebimentos (ou o Financeiro em Gerenciar), vende', () => {
    expect(quemVendeNoResumo({ ...nada, cashier: 'MANAGE' })).toMatch(/^Vende pelo “Vender” da ficha/)
    expect(quemVendeNoResumo({ ...nada, financial: 'MANAGE' })).toMatch(/^Vende pelo “Vender” da ficha/)
  })
  it('quem nem vende nem mexe no comercial não lê nada', () => {
    expect(quemVendeNoResumo({ ...nada })).toBeNull()
  })
  it('a tela de Pacotes diz que o “Vender” é de quem tem Recebimentos', () => {
    expect(TEXTO_DA_VENDA_DO_PACOTE).toMatch(/“Vender”/)
    expect(TEXTO_DA_VENDA_DO_PACOTE).toMatch(/Recebimentos/)
  })
})

// D6: o contrato da Patrícia saiu "Entrada: , em 6 parcelas…, primeiro
// vencimento em ." — a dona juntou `pagamento.forma` (a frase inteira) com as
// opcionais, que saem vazias no cartão em vezes. Nada se bloqueia (princípio 2);
// o menu e o checkout dizem (princípio 3).
describe('D6 da 12ª: as variáveis que saem vazias se dizem', () => {
  it('o menu diz quando a opcional sai vazia', () => {
    expect(rotuloNoMenu('pagamento.entrada')).toMatch(/vazia sem entrada/)
    expect(rotuloNoMenu('pagamento.primeiro_vencimento')).toMatch(/vazia/)
  })
  it('a forma de pagamento diz que já é a frase completa', () => {
    expect(rotuloNoMenu('pagamento.forma')).toMatch(/frase completa/)
    expect(rotuloNoMenu('pagamento.forma')).toMatch(/entrada/)
  })
  it('a obrigatória não ganha o "vazia"', () => {
    expect(rotuloNoMenu('cliente.nome')).toBe('Nome')
  })
  it('o aviso do plano diz quais saem vazias, pelo nome do menu', () => {
    expect(avisoDasVazias(['pagamento.entrada', 'pagamento.primeiro_vencimento']))
      .toBe('Neste plano saem vazias: Valor da entrada e Primeiro vencimento. Confira se o texto do contrato fica certo sem elas (a forma de pagamento já é a frase completa).')
    expect(avisoDasVazias([])).toBeNull()
  })
})

// D7: às 23:10, o modal abriu em 23:30 (não cabe: o último início é 23:00) e o
// "próximo livre" trocou dia e hora calado. A troca agora se diz.
describe('D7 da 12ª: o próximo livre diz que trocou', () => {
  it('outro dia: "Hoje não há mais horário livre…"', () => {
    expect(textoDoProximoLivre('2026-11-10T23:30', '2026-11-11T00:00', 'Gabi', '2026-11-10'))
      .toBe('Hoje não há mais horário livre para Gabi. O próximo é amanhã, 00:00.')
    expect(textoDoProximoLivre('2026-11-10T23:30', '2026-11-13T08:00', 'Gabi', '2026-11-10'))
      .toBe('Hoje não há mais horário livre para Gabi. O próximo é 13/11, 08:00.')
  })
  it('o mesmo dia: a hora que não cabe e a que cabe', () => {
    expect(textoDoProximoLivre('2026-11-10T14:00', '2026-11-10T15:30', 'Gabi', '2026-11-10'))
      .toBe('14:00 não está livre para Gabi. O próximo horário livre é 15:30.')
  })
  it('um dia que não é hoje', () => {
    expect(textoDoProximoLivre('2026-11-12T08:00', '2026-11-13T09:00', 'Gabi', '2026-11-10'))
      .toBe('Em 12/11 não há horário livre para Gabi. O próximo é 13/11, 09:00.')
  })
  it('a mesma hora não é troca', () => {
    expect(textoDoProximoLivre('2026-11-10T14:00', '2026-11-10T14:00', 'Gabi', '2026-11-10')).toBeNull()
  })
})

// D12: o lead criado às 23:20 de 10/11 dizia "hoje" às 00:05 de 11/11 —
// eram 24 h corridas, não o dia de Brasília.
describe('D12 da 12ª: "hoje" e "ontem" pelo dia de Brasília', () => {
  const as = (iso: string) => new Date(iso).getTime()
  it('23:20 de ontem, às 00:05, é ontem', () => {
    expect(idadeDoLead('2026-11-10T23:20:00-03:00', as('2026-11-11T00:05:00-03:00'))).toBe('ontem')
  })
  it('00:01 de hoje, às 23:59, é hoje', () => {
    expect(idadeDoLead('2026-11-11T00:01:00-03:00', as('2026-11-11T23:59:00-03:00'))).toBe('hoje')
  })
  it('dias de calendário', () => {
    expect(idadeDoLead('2026-11-08T23:50:00-03:00', as('2026-11-11T00:10:00-03:00'))).toBe('há 3 dias')
  })
})
