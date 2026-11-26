import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { textoDoFechamento, csvDoExtrato } from '@/lib/comissoes/extrato-texto'

/**
 * R17 (o Heitor, 26/11, na página de perguntas: "No fuso da unidade, com o nome
 * do relógio ao lado (a proposta)"). A comissão paga em Barra do Garças
 * (horário de Cuiabá) às 13:13 aparecia às 14:13 nos "Últimos fechamentos" e no
 * CSV (o fuso da rede), e às 13:13 nas linhas do mesmo extrato. O fechamento sai
 * no fuso da unidade dele; quando não é o relógio da tela, diz qual.
 */
const SP = 'America/Sao_Paulo'
const CB = 'America/Cuiaba'
const sp = (s: string) => s.replace(/[  ]/g, ' ')
const f = { inicio: '2026-11-18T12:00:00.000Z', fim: '2026-11-18T17:13:00.000Z', paidAt: '2026-11-18T17:13:00.000Z' }

describe('R17: o fechamento no fuso da unidade dele', () => {
  it('a unidade de Cuiabá numa tela de Brasília: a hora de lá, e o relógio ao lado', () =>
    expect(sp(textoDoFechamento(f, SP, CB))).toBe(
      'lançamentos de 18/11/2026 até 18/11/2026 às 13:13, pago em 18/11/2026 às 13:13 (horário de Cuiabá)'))
  it('no relógio da tela, sem o nome do relógio', () =>
    expect(sp(textoDoFechamento(f, SP, SP))).toBe(
      'lançamentos de 18/11/2026 até 18/11/2026 às 14:13, pago em 18/11/2026 às 14:13'))
  it('o CSV: o "Pago em" no fuso da unidade do fechamento', () => {
    const fechamento = { id: 'f1', professionalName: 'Lia', branchId: 'cuiaba', branchName: 'Barra do Garças', total: 50, estornadoAt: null, estornoMotivo: null, ...f }
    const csv = sp(csvDoExtrato([], new Map(), new Map(), SP, [fechamento], new Map([['cuiaba', CB]])))
    expect(csv).toContain('Lia;Barra do Garças;18/11/2026 13:13;50,00;Pago')
  })
  it('a tela passa o fuso da unidade de cada fechamento', () => {
    const tela = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'shared', 'financeiro-comissoes.tsx'), 'utf8')
    expect(tela).toMatch(/textoDoFechamento\(f, fusoDaRede, fusoDaUnidade\)/)
  })
})
