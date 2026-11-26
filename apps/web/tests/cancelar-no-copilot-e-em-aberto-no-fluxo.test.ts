import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RECUSA_DESISTIR } from '@/lib/appointments/quem-cancela'

/**
 * O Heitor, 25/11, às duas pendências da entrega das respostas:
 * - "2 sim": o cartão do Copilot ao cancelar o Em atendimento diz "Cancelar",
 *   como o botão da tela ("Discordo — Mantem o Cancelar"); era "Desistir do
 *   atendimento". A frase da recusa acompanha.
 * - "3 sim": a série do fluxo de caixa passa a "A receber · em aberto", o nome
 *   do cartão ("O cartão vira 'A receber · em aberto' e soma tudo"); a série
 *   soma todo o a receber em aberto, com e sem cliente.
 */
const ler = (f: string) => readFileSync(path.join(__dirname, '..', f), 'utf8')

describe('o "Cancelar" também no Copilot', () => {
  it('o cartão do Em atendimento diz "Cancelar atendimento"', () => {
    const f = ler('lib/copilot/ferramentas/agenda-escrita.ts')
    expect(f).not.toContain("'Desistir do atendimento'")
    expect(f).toContain("ag.status === 'IN_PROGRESS' ? 'Cancelar atendimento' : 'Cancelar agendamento'")
  })

  it('a recusa diz cancelar, não desistir', () => {
    expect(RECUSA_DESISTIR).toBe('Cancelar o atendimento em andamento é de quem tem o Atendimento em Gerenciar.')
  })
})

describe('o fluxo de caixa diz "A receber · em aberto"', () => {
  it('a série e a dica', () => {
    const f = ler('components/shared/fluxo-de-caixa.tsx')
    expect(f).toContain("rotulo: 'A receber · em aberto'")
    expect(f).not.toContain('A receber da cliente')
    expect(f).toContain('O que entra (o a receber em aberto')
  })
})
