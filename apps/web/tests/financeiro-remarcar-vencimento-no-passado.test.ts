import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDoNovoVencimento } from '@/lib/financeiro/vencimentos'

/**
 * Decisão 1 do Claude na 30ª (vendas-financeiro:CR-11; princípio 2, "não
 * recusar o valor que a rede escolheu (… prazo)": no máximo, avisar). Remarcar
 * o vencimento para uma data que já passou é aceito — a parcela fica vencida na
 * hora. A janela não dizia isso: junto do campo, o aviso "Essa data já passou:
 * a parcela fica vencida." É texto, nunca recusa (o botão segue ligado).
 */
const agora = new Date('2026-11-25T15:00:00.000Z') // 25/11, meio-dia em Brasília

describe('o aviso do novo vencimento no passado', () => {
  it('a data de ontem (ou antes) avisa que a parcela fica vencida', () => {
    expect(avisoDoNovoVencimento('2026-11-24', agora)).toBe('Essa data já passou: a parcela fica vencida.')
    expect(avisoDoNovoVencimento('2026-10-01', agora)).toBe('Essa data já passou: a parcela fica vencida.')
  })
  it('hoje e o futuro não avisam (o que vence hoje ainda não venceu)', () => {
    expect(avisoDoNovoVencimento('2026-11-25', agora)).toBeNull()
    expect(avisoDoNovoVencimento('2026-12-10', agora)).toBeNull()
    expect(avisoDoNovoVencimento('', agora)).toBeNull()
  })
  it('o dia de hoje é o da unidade (à meia-noite e meia de Brasília, Manaus ainda está no dia de antes)', () => {
    const tarde = new Date('2026-11-26T03:30:00.000Z') // 00:30 de 26/11 em Brasília, 23:30 de 25/11 em Manaus
    expect(avisoDoNovoVencimento('2026-11-25', tarde)).toBe('Essa data já passou: a parcela fica vencida.')
    expect(avisoDoNovoVencimento('2026-11-25', tarde, 'America/Manaus')).toBeNull()
  })
  it('a janela mostra o aviso junto do campo e não desliga o botão por ele', () => {
    const tela = readFileSync(join(__dirname, '..', 'components/shared/remarcar-vencimento.tsx'), 'utf8')
    expect(tela).toMatch(/avisoDoNovoVencimento\(dia, new Date\(\), fuso\)/)
    expect(tela).toContain('data-vencimento-no-passado')
    expect(tela).toMatch(/disabled=\{gravando \|\| !dia\}/)
  })
})
