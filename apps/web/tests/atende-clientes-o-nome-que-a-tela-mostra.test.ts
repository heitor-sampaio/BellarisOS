import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { O_ATENDE_NA_FICHA } from '@/lib/equipe/atende'

/**
 * Os avisos que mandam marcar o "Atende" citavam “Atende clientes em” — o título da lista que só aparece depois de
 * "Escolher em quais unidades atende". Na ficha, a pessoa vê a caixa “Atende clientes”, e procurava um nome que não
 * estava na tela. A frase é a que a Equipe já usa (o Heitor, 25/11, à proposta de usar a mesma frase nas telas: "ok").
 */
const fonte = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const ONDE = [
  ['components', 'admin', 'desativar-membro.tsx'],
  ['components', 'branch', 'janela-do-agendamento-acoes.tsx'],
  ['lib', 'appointments', 'core.ts'],
  ['lib', 'appointments', 'troca-de-profissional.ts'],
]

describe('o aviso cita o nome que a ficha da Equipe mostra', () => {
  it('o nome do campo é um só', () => {
    expect(O_ATENDE_NA_FICHA).toBe('o “Atende clientes” (com mais de uma unidade, em “Escolher em quais unidades atende”)')
  })
  it('nenhum aviso cita mais o “Atende clientes em”', () => {
    for (const p of ONDE) expect(fonte(...p), p.join('/')).not.toContain('“Atende clientes em”')
  })
  it('as recusas e os avisos usam a frase', () => {
    for (const p of ONDE.slice(1)) expect(fonte(...p), p.join('/')).toContain('O_ATENDE_NA_FICHA')
  })
})
