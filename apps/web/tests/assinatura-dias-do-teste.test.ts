import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { diasDoTeste, textoDoFimDoTeste } from '@/lib/redes/dias-do-teste'

/**
 * A30 da 25ª: a Assinatura dizia só "teste grátis até 18/12/2026". O Heitor:
 * "Mostra" (quantos dias faltam). O fim do teste é o fim do DIA em Brasília —
 * o banco grava 23:59:59 de São Paulo e o cron vence por esse instante —, então
 * o último dia conta inteiro: no dia 18/12 o teste "termina hoje".
 */

const FIM = '2026-12-19T02:59:59+00:00' // 18/12/2026 23:59:59 em São Paulo, como o banco grava

describe('diasDoTeste — dias de calendário até o último dia, em Brasília', () => {
  it('um mês antes: 30', () => {
    expect(diasDoTeste(FIM, new Date('2026-11-18T13:00:00-03:00'))).toBe(30)
  })
  it('a hora do dia não muda a conta (de manhã e à noite, o mesmo número)', () => {
    expect(diasDoTeste(FIM, new Date('2026-11-18T00:05:00-03:00'))).toBe(30)
    expect(diasDoTeste(FIM, new Date('2026-11-18T23:55:00-03:00'))).toBe(30)
  })
  it('o dia é o de Brasília, não o UTC (às 22:00 de 17/12 em Brasília já é 18/12 em UTC)', () => {
    expect(diasDoTeste(FIM, new Date('2026-12-17T22:00:00-03:00'))).toBe(1)
  })
  it('no último dia, 0 (termina hoje) — até 23:59:59', () => {
    expect(diasDoTeste(FIM, new Date('2026-12-18T08:00:00-03:00'))).toBe(0)
    expect(diasDoTeste(FIM, new Date('2026-12-18T23:59:00-03:00'))).toBe(0)
  })
  it('passado o fim, null (o teste acabou)', () => {
    expect(diasDoTeste(FIM, new Date('2026-12-19T00:00:30-03:00'))).toBeNull()
  })
  it('sem data de fim, null (não chuta)', () => {
    expect(diasDoTeste(null, new Date('2026-11-18T12:00:00-03:00'))).toBeNull()
  })
})

describe('textoDoFimDoTeste', () => {
  it('hoje, amanhã e em N dias', () => {
    expect(textoDoFimDoTeste(0)).toBe('termina hoje')
    expect(textoDoFimDoTeste(1)).toBe('termina amanhã')
    expect(textoDoFimDoTeste(30)).toBe('termina em 30 dias')
  })
})

describe('a Assinatura e o aviso do topo usam a mesma conta', () => {
  const raiz = path.resolve(__dirname, '..')
  it('settings-assinatura diz os dias', () => {
    const fonte = readFileSync(path.join(raiz, 'components/admin/settings-assinatura.tsx'), 'utf8')
    expect(fonte).toContain('diasDoTeste(')
    expect(fonte).toContain('textoDoFimDoTeste(')
  })
  it('o aviso do topo não conta por conta própria (era Math.ceil do instante: "termina em 1 dia" no último dia)', () => {
    const fonte = readFileSync(path.join(raiz, 'lib/redes/aviso.ts'), 'utf8')
    expect(fonte).toContain('diasDoTeste(')
    expect(fonte).not.toContain('Math.ceil')
  })
})
