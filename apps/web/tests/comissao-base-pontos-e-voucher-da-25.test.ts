import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { composicaoDaBase } from '@/lib/comissoes/base-efetiva'
import { csvDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * A17 da 25ª simulação (princípio 3): o extrato de comissão chamava de
 * "desconto" a base reduzida pelos pontos e pelo voucher (com a rede em
 * "Sobre o valor pago"). vendas-financeiro.md: os pontos e o voucher "não é
 * desconto"; indicadores.md: "ponto é forma de pagamento, não desconto".
 *
 * O banco passa a dizer, dentro do que saiu da base antes da taxa
 * (`base_desconto`), a parte que foi de pontos e voucher (`base_fidelidade`);
 * a tela e o CSV escrevem as duas à parte.
 */

const nb = (s: string) => s.replace(/ /g, ' ')
const linha = { preco: 200, base: 160, baseTaxa: 0, baseInsumos: 0, baseFator: 1 }

describe('A17: pontos e voucher não são desconto na base da comissão', () => {
  it('só pontos e voucher: a composição não diz "desconto"', () => {
    const t = nb(composicaoDaBase({ ...linha, baseDesconto: 40, baseFidelidade: 40 }))
    expect(t).toBe('R$ 200,00 − R$ 40,00 de pontos e voucher')
    expect(t).not.toMatch(/desconto/)
  })
  it('desconto comercial e pontos juntos: cada um com o seu nome', () => {
    expect(nb(composicaoDaBase({ ...linha, baseDesconto: 40, baseFidelidade: 20 })))
      .toBe('R$ 200,00 − R$ 20,00 de desconto − R$ 20,00 de pontos e voucher')
  })
  it('sem a parte dos pontos (linhas de antes), segue como era', () => {
    expect(nb(composicaoDaBase({ ...linha, baseDesconto: 40 }))).toBe('R$ 200,00 − R$ 40,00 de desconto')
  })

  it('o CSV tem a coluna dos pontos e voucher, separada do desconto', () => {
    const l = {
      id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-18T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 16,
      status: 'OPEN', payoutId: null, appointmentId: null, scheduledAt: '2026-11-18T13:00:00Z', cliente: 'Helena', procedimento: 'Limpeza',
      origem: 'AVULSO', preco: 200, regraTipo: 'PERCENTAGE', regraValor: 10, pacote: null, descontaTaxa: false, descontaInsumos: false,
      previsto: null, baseComPontos: 'VALOR_PAGO', plano: null, base: 160, baseDesconto: 40, baseFidelidade: 30, baseTaxa: 0, baseInsumos: 0,
      baseFator: 1, pagoEm: null, regraDe: null, transacaoId: null,
    } as unknown as LancamentoDoExtrato
    const csv = csvDoExtrato([l], new Map([['p1', 'Bianca']]), new Map([['b1', 'Centro']]))
    const [cab, um] = csv.slice(1).split('\r\n').map(s => s.split(';'))
    const iDesc = cab!.indexOf('Desconto que saiu da base')
    const iFid = cab!.indexOf('Pontos e voucher que saíram da base')
    expect(iFid, 'a coluna nova').toBeGreaterThan(-1)
    expect(um![iDesc]).toBe('10,00')
    expect(um![iFid]).toBe('30,00')
  })

  it('o banco devolve a parte dos pontos e voucher (a última definição de cada função)', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivos = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    const ultima = (re: RegExp) => {
      const com = arquivos.filter(f => re.test(readFileSync(path.join(dir, f), 'utf8')))
      return { arquivo: com[com.length - 1]!, sql: readFileSync(path.join(dir, com[com.length - 1]!), 'utf8') }
    }
    for (const re of [
      /create (or replace )?function private\.comissao_conta_detalhe\s*\(/i,
      /create (or replace )?function private\.comissao_base_do_pagamento\s*\(/i,
      /create (or replace )?function public\.comissoes_extrato_com_regra\s*\(/i,
    ]) {
      const { arquivo, sql } = ultima(re)
      expect(sql, `${re} em ${arquivo}`).toMatch(/base_fidelidade/)
    }
    const leitura = readFileSync(path.join(__dirname, '..', 'lib', 'comissoes', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/baseFidelidade:\s*Number\(l\.base_fidelidade/)
  })
})
