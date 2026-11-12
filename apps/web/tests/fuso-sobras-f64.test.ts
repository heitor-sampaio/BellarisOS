import { describe, it, expect } from 'vitest'
import { NODES } from '@estetica-os/types'
import { fmtDateTime } from '@/lib/appointments/avisos'
import { situacaoDoVencimento, textoDoVencimento, vencimentoDoDia } from '@/lib/financeiro/vencimentos'
import { separarOEmAberto } from '@/lib/checkout/em-aberto-do-plano'
import { periodoDe, periodosRecentes, periodoDaChave } from '@/lib/comissoes/periodo'
import { fimDoDiaDaValidade } from '@/lib/pacotes/trazer'
import { validadeDoLote } from '@/components/admin/reports-linhas'
import { avisoDoBloqueioNoAtendimento } from '@/lib/agenda/bloqueio'
import { resumoDoNo } from '@/lib/automacoes/resumo'
import { quandoDispara } from '@/lib/notifications/quando-dispara'
import { instanteDaCampanha, campoDaCampanha } from '@/lib/notifications/hora-da-campanha'
import { formatarNoFuso, diaRelativo } from '@/lib/formatar-no-fuso'
import { periodRef } from '@/lib/datetime'

/**
 * F64 — o fuso da unidade no que sobrou da F62/F62b (13ª simulação, D1–D6,
 * A7, D13; C4 do levantamento das regras). O Vitest roda em UTC: quem
 * formata no relógio do processo erra aqui como erra no servidor.
 *
 * A Ipê é de Rio Branco (UTC−5) e a Acácia de Manaus (UTC−4).
 */
const ACRE = 'America/Rio_Branco'
const MANAUS = 'America/Manaus'

describe('os avisos da agenda (D2)', () => {
  it('dizem a hora no relógio da unidade, não no do servidor', () => {
    // 18:50 no Acre = 23:50Z = 20:50 em Brasília.
    expect(fmtDateTime('2026-11-11T23:50:00Z', ACRE)).toBe('11/11 às 18:50')
    // 23:30 de 11/11 no Acre = 04:30Z de 12/11: o DIA também é o do Acre.
    expect(fmtDateTime('2026-11-12T04:30:00Z', ACRE)).toBe('11/11 às 23:30')
    // Sem fuso, o de Brasília (como era no servidor da produção).
    expect(fmtDateTime('2026-11-11T23:50:00Z')).toBe('11/11 às 20:50')
  })
})

describe('o vencimento (C4)', () => {
  // 23:30 de 10/03 em Manaus = 03:30Z de 11/03 = 00:30 de 11/03 em Brasília.
  const agora = new Date('2026-03-11T03:30:00Z')
  it('vence hoje no dia da unidade, não no de Brasília', () => {
    expect(situacaoDoVencimento(vencimentoDoDia('2026-03-10'), agora, MANAUS)).toBe('HOJE')
    expect(situacaoDoVencimento(vencimentoDoDia('2026-03-11'), agora, MANAUS)).toBe('A_VENCER')
    expect(textoDoVencimento(vencimentoDoDia('2026-03-10'), agora, MANAUS)).toBe('Vence hoje')
    // Sem fuso, Brasília (já é 11/03 lá).
    expect(situacaoDoVencimento(vencimentoDoDia('2026-03-10'), agora)).toBe('VENCIDA')
  })
  it('o check-in do plano cobra o que vence até o fim do dia DA UNIDADE', () => {
    const r = separarOEmAberto([
      { id: 'hoje', amount: 100, is_paid: false, due_date: vencimentoDoDia('2026-03-10') },
      { id: 'amanha', amount: 200, is_paid: false, due_date: vencimentoDoDia('2026-03-11') },
    ], agora, MANAUS)
    expect(r.pendentes).toEqual(['hoje'])
    expect(r.aVencer).toBe(200)
  })
})

describe('o fechamento das comissões no fuso da rede (D12)', () => {
  // 23:30 de 30/11 em Manaus = 03:30Z de 01/12.
  const noFim = new Date('2026-12-01T03:30:00Z')
  it('o mês e os limites são os do relógio da rede', () => {
    const p = periodoDe(noFim, 'MENSAL', MANAUS)
    expect(p.chave).toBe('2026-11-01')
    expect(p.inicio.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(p.fim.toISOString()).toBe('2026-12-01T03:59:59.999Z')
    expect(periodosRecentes('MENSAL', noFim, 2, MANAUS).map(x => x.chave)).toEqual(['2026-11-01', '2026-10-01'])
    expect(periodoDaChave('2026-11-01', 'MENSAL', MANAUS)?.inicio.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(periodRef(noFim, MANAUS)).toBe('2026-11')
  })
  it('sem fuso, Brasília', () => {
    expect(periodoDe(noFim, 'MENSAL').chave).toBe('2026-12-01')
  })
})

describe('a validade do pacote trazido de fora (sobra da F62b)', () => {
  it('vale até o fim do dia NA UNIDADE', () => {
    expect(fimDoDiaDaValidade('2026-03-10', MANAUS)).toBe('2026-03-11T03:59:59.999Z')
    expect(fimDoDiaDaValidade('2026-03-10')).toBe('2026-03-11T02:59:59.999Z')
  })
})

describe('a validade do lote nos Relatórios (C4)', () => {
  it('o lote vencido diz "Venceu", não "0d"', () => {
    const v = validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-11-20T10:00:00-03:00'))
    expect(v.vencido).toBe(true)
    expect(v.rotulo).toBe('Venceu')
    expect(validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-11-17T10:00:00-03:00')).rotulo).toBe('Vence hoje')
    expect(validadeDoLote('2026-11-27 00:00:00+00', new Date('2026-11-17T10:00:00-03:00')).rotulo).toBe('10d')
  })
  it('o hoje é o da unidade', () => {
    // 23:30 de 17/11 em Manaus: ainda vale.
    expect(validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-11-18T03:30:00Z'), MANAUS).vencido).toBe(false)
  })
})

describe('o bloqueio na tela do atendimento (C4)', () => {
  it('diz as horas do relógio da unidade', () => {
    const b = { inicio: '2026-11-11T17:00:00Z', fim: '2026-11-11T18:00:00Z', motivo: 'Almoço' }
    expect(avisoDoBloqueioNoAtendimento({ profissional: 'Rosa' }, b, ACRE)).toContain('das 12:00 às 13:00')
  })
})

describe('o relógio das automações e das campanhas (A7, D4)', () => {
  it('o "Pelo relógio" diz o fuso fora de Brasília', () => {
    expect(resumoDoNo(NODES.GATILHO_AGENDA, { frequencia: 'diaria', hora: '09:00' }, ACRE)).toBe('Todo dia às 09:00 (horário de Rio Branco)')
    expect(resumoDoNo(NODES.GATILHO_AGENDA, { frequencia: 'diaria', hora: '09:00' }, 'America/Sao_Paulo')).toBe('Todo dia às 09:00')
    expect(resumoDoNo(NODES.GATILHO_AGENDA, { frequencia: 'diaria', hora: '09:00' })).toBe('Todo dia às 09:00')
  })
  it('a campanha automática diz "a partir das 09:00" no relógio da rede', () => {
    expect(quandoDispara('BIRTHDAY', null, ACRE)).toBe('no dia do aniversário da cliente, a partir das 09:00 (horário de Rio Branco)')
    expect(quandoDispara('BIRTHDAY', null)).toBe('no dia do aniversário da cliente, a partir das 09:00')
  })
  it('a campanha agendada: a hora digitada é a do relógio da rede', () => {
    expect(instanteDaCampanha('2026-11-12T09:00', ACRE)).toBe('2026-11-12T14:00:00.000Z')
    expect(instanteDaCampanha('2026-11-12T09:00', 'America/Sao_Paulo')).toBe('2026-11-12T12:00:00.000Z')
    // O instante completo (com fuso) passa como veio.
    expect(instanteDaCampanha('2026-11-12T14:00:00.000Z', ACRE)).toBe('2026-11-12T14:00:00.000Z')
    expect(instanteDaCampanha('lixo', ACRE)).toBeNull()
    // E volta ao campo no mesmo relógio.
    expect(campoDaCampanha('2026-11-12T14:00:00.000Z', ACRE)).toBe('2026-11-12T09:00')
    expect(campoDaCampanha(null, ACRE)).toBe('')
  })
})

describe('o formato no fuso (ficha, atendimento, inbox)', () => {
  it('formata o instante no relógio da unidade, em qualquer processo', () => {
    expect(formatarNoFuso('2026-11-12T00:30:00Z', "dd/MM/yyyy 'às' HH:mm", ACRE)).toBe('11/11/2026 às 19:30')
    expect(formatarNoFuso('2026-11-12T00:30:00Z', 'EEE, dd MMM · HH:mm', ACRE)).toBe('quarta, 11 nov · 19:30')
    expect(formatarNoFuso(null, 'HH:mm', ACRE)).toBe('')
  })
  it('hoje e ontem são os dias da unidade', () => {
    const agora = new Date('2026-11-12T04:00:00Z') // 23:00 de 11/11 no Acre
    expect(diaRelativo('2026-11-11T23:59:00Z', ACRE, agora)).toBe('hoje')
    expect(diaRelativo('2026-11-11T04:00:00Z', ACRE, agora)).toBe('ontem')
    expect(diaRelativo('2026-11-09T12:00:00Z', ACRE, agora)).toBeNull()
  })
})
