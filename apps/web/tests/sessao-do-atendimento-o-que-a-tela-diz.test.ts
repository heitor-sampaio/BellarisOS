import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O que a tela do atendimento, a janela do agendamento e a página do plano
 * DIZEM e OFERECEM (princípio 3: o que a tela mostra é o que vale; princípio 7:
 * o botão diz o que faz; CLAUDE.md §14: o botão que a pessoa não pode usar, a
 * tela esconde, e o { error } da action nunca se descarta).
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const SESSAO = 'components/branch/appointment-session.tsx'
const JANELA = 'components/branch/appointment-sheet.tsx'
const PASSOS = 'components/branch/passos-do-plano.tsx'

describe('o plano não se recebe na tela do atendimento (AT-13, PV-01, PV-13, DP-06)', () => {
  it('a tela do atendimento não chama receberDoPlano nem abre a janela de receber o plano', () => {
    const s = fonte(SESSAO)
    expect(s).not.toContain('receberDoPlano')
    expect(s).not.toContain('Receber o plano de tratamento')
    expect(s).not.toContain('no check-in')
  })
  it('a action receberDoPlano saiu (o plano se recebe na comanda do PDV)', () => {
    expect(fonte('actions/treatment-plans.ts')).not.toMatch(/export async function receberDoPlano\b/)
  })
  it('o saldo do plano leva ao PDV da cliente, a quem recebe', () => {
    const s = fonte(SESSAO)
    const ini = s.indexOf('function PlanoEmAbertoBanner')
    const fim = s.slice(ini).search(/\r?\n\}\r?\n/)
    const banner = s.slice(ini, ini + fim)
    expect(banner).toContain('rotaDaClienteNoPdv(')
    expect(banner).toContain('Receber no PDV')
    expect(banner).toContain('podeReceber &&')
  })
  it('a sessão do plano já concluída não fala de "checkout do plano"', () => {
    expect(fonte(SESSAO)).not.toContain('checkout do plano de tratamento')
  })
})

describe('o desconto do plano vai à comanda do PDV (PL-10)', () => {
  it('o editor do plano não diz "checkout do plano" nem "Fechar agora"', () => {
    const e = fonte('components/branch/treatment-plan-editor.tsx')
    const ini = e.indexOf('data-desconto-no-checkout')
    const trecho = e.slice(ini, ini + 400)
    expect(trecho).not.toContain('checkout do plano')
    expect(trecho).not.toContain('Fechar agora')
    expect(trecho).toContain('comanda do plano no PDV')
  })
})

describe('a chegada só no dia do agendamento (D2 da 28ª)', () => {
  it('o "Check-in" e o "Marcar chegada e iniciar" da tela do atendimento conferem o dia', () => {
    const s = fonte(SESSAO)
    expect(s).toMatch(/const mostraChegarEIniciar\s*=\s*aChegar && ehODia &&/)
    expect(s).toMatch(/const mostraCheckin\s*=\s*aChegar && ehODia &&/)
    expect(s).toContain('ehODiaDoAgendamento(appointment.scheduledAt')
  })
  it('o check-in mostra o { error } que a action devolve', () => {
    const s = fonte(SESSAO)
    const ini = s.indexOf('async function handleCheckin')
    const corpo = s.slice(ini, ini + 500)
    expect(corpo).toMatch(/const r = await checkinAppointment\(/)
    expect(corpo).toMatch(/if \(r\?\.error\)/)
  })
})

describe('o plano aceito e já recebido (D8 da 28ª)', () => {
  it('não diz mais que a cliente "assina o contrato e paga"', () => {
    const s = fonte(SESSAO)
    const ini = s.indexOf('data-plano-aceito ')
    const bloco = s.slice(ini, ini + 1600)
    expect(bloco).toContain('existingPlan.recebido')
  })
  it('o servidor diz se o plano já foi recebido (a régua do andamento do plano)', () => {
    const p = fonte('app/_shared/sessao-de-atendimento.tsx')
    expect(p).toContain('andamentoDosPlanos(')
    expect(p).toMatch(/recebido:\s/)
  })
})

// O Heitor, 25/11, à troca da A9 da 28ª ("Desistir do atendimento" no lugar de
// "Cancelar"): "Discordo — Mantem o Cancelar". O Em atendimento segue sendo a
// desistência por dentro (lib/atendimento/desistencia.ts); a tela diz "Cancelar".
describe('o Em atendimento diz "Cancelar" (o Heitor, 25/11: "Mantem o Cancelar")', () => {
  it('na tela do atendimento, o botão e a janela dizem "Cancelar"', () => {
    const s = fonte(SESSAO)
    expect(s).not.toContain("'Desistir do atendimento'")
    expect(s).not.toContain('Motivo da desistência *')
    expect(s).not.toContain('Confirmar desistência')
    expect(s).toContain("'Cancelar atendimento'")
    expect(s).toContain('Motivo do cancelamento *')
    expect(s).toContain('Confirmar cancelamento')
    expect(s).toContain("{pending ? 'Cancelando…' : 'Confirmar cancelamento'}")
  })
  it('na janela do agendamento também', () => {
    const j = fonte(JANELA)
    expect(j).not.toContain('Desistir do atendimento')
    expect(j).not.toContain('Motivo da desistência *')
    expect(j).not.toContain('Confirmar desistência')
    expect(j).toContain('Motivo do cancelamento *')
    expect(j).toContain('Confirmar cancelamento')
  })
})

describe('a janela do agendamento abre a tela do atendimento a quem tem o Atendimento em Ver (UM1, A8 da 28ª)', () => {
  it('fora do Em atendimento, o link "Abrir a tela do atendimento"', () => {
    const j = fonte(JANELA)
    expect(j).toContain('Abrir a tela do atendimento')
    expect(j).toMatch(/appointment\.status !== 'IN_PROGRESS' && \(abreOAtendimento \|\| vistaDela\)/)
  })
})

describe('a confirmação da falta em palavras de todo dia (Pendente 20)', () => {
  it('não fala em "termos em aberto"', () => {
    const j = fonte(JANELA)
    expect(j).not.toContain('termos em aberto')
    expect(j).toContain('documentos deste horário que ela ainda não assinou')
  })
})

describe('a página do plano (D7 e D19 da 28ª)', () => {
  it('a sessão feita diz a hora em que foi feita (completed_at)', () => {
    expect(fonte('actions/treatment-plans.ts')).toMatch(/completedAt:\s+s\.appointments\?\.completed_at/)
    const p = fonte(PASSOS)
    expect(p).toMatch(/feita && s\.completedAt/)
  })
  it('o plano cancelado não diz "Depois do aceite" no pagamento nem nas sessões', () => {
    const p = fonte(PASSOS)
    expect(p).toMatch(/const estadoDoPagamento = cancelado \?/)
    expect(p).toMatch(/sobre=\{!aceito && !cancelado \? 'No aceite/)
    expect(p).toMatch(/sobre=\{!aceito && !cancelado \? 'As sessões se agendam/)
  })
})

describe('o agendar da sessão oferece só as unidades ao alcance da pessoa (D18 da 28ª, CLAUDE.md §11)', () => {
  it('a action confere cada unidade pelo alcance', () => {
    const a = fonte('actions/appointments.ts')
    const ini = a.indexOf('export async function unidadesAoAlcance')
    expect(ini).toBeGreaterThanOrEqual(0)
    expect(a.slice(ini, ini + 800)).toMatch(/alcancaUnidade\(ctx, /)
  })
  it('o SessionScheduler (pacote, plano, pré-pago) filtra as unidades por ela', () => {
    const m = fonte('components/branch/treatment-sessions-modal.tsx')
    expect(m).toContain('unidadesAoAlcance(')
    expect(m).toMatch(/opcoes\.map\(b => <option key=\{b\.id\}/)
  })
})
