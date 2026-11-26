import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDosBloqueios } from '@/lib/agenda/bloqueio'

/**
 * O modal "Novo agendamento":
 * - D5: depois que o servidor recusa o choque, o "Usar o próximo livre" continua
 *   ali (AG-07: o modal "oferece 'Usar o próximo livre'"); a recusa trocava o
 *   bloco do choque por um texto sem o botão. A recusa segue UMA mensagem só
 *   (A26 da 5ª: `e2e/agenda-encaixe-avisa.spec.ts`).
 * - A7: no dia em que a unidade não abre, "A unidade não abre neste dia" aparecia
 *   duas vezes (o aviso do horário e a grade de horários vazia): uma só.
 * - A9: o aviso do bloqueio diz "confirme só se for isso mesmo" (AG-20; o
 *   Copilot já dizia). A frase de cada bloqueio fica como está (os testes dela);
 *   o aviso junto, que o modal mostra, ganha o pedido no fim.
 */
const modal = () => readFileSync(join(__dirname, '..', 'components/branch/appointment-modal.tsx'), 'utf8')

describe('D5: a recusa do choque mantém o "Usar o próximo livre"', () => {
  it('o próximo livre é buscado pelo choque do aviso, também depois da recusa', () => {
    expect(modal()).toMatch(/const chaveDoProximo = conflitoDoAviso \? chaveDosAvisos : ''/)
  })
  it('a mensagem da recusa traz o botão', () => {
    expect(modal()).toMatch(/recusadoPorChoque && rotuloDoProximo && proximo && \(\s*<button[^>]*data-proximo-livre-da-recusa/)
  })
  it('a recusa de um horário que já saiu da tela não fica dizendo o choque', () => {
    expect(modal()).toMatch(/const recusaDeOutroHorario = /)
  })
})

describe('A7: "A unidade não abre neste dia" uma vez só', () => {
  it('a grade de horários não aparece no dia em que a unidade não abre (o aviso do horário já diz)', () => {
    expect(modal()).toMatch(/\{gradeDoDia && horasDaGrade\.length > 0 && \(/)
  })
})

describe('A9: o aviso do bloqueio pede para confirmar', () => {
  it('um bloqueio', () => {
    expect(avisoDosBloqueios(['Horário bloqueado para Bruna das 12:00 às 13:00 (Almoço). O encaixe é permitido.']))
      .toBe('Horário bloqueado para Bruna das 12:00 às 13:00 (Almoço). O encaixe é permitido. Confirme só se for isso mesmo.')
  })
  it('vários, juntos, com o pedido uma vez; nenhum, nada', () => {
    expect(avisoDosBloqueios(['A.', 'B.'])).toBe('A. B. Confirme só se for isso mesmo.')
    expect(avisoDosBloqueios([])).toBeNull()
  })
  it('o aviso do horário usa a junção', () => {
    expect(readFileSync(join(__dirname, '..', 'lib/appointments/encaixe.ts'), 'utf8')).toMatch(/const bloqueio = avisoDosBloqueios\(\[/)
  })
})
