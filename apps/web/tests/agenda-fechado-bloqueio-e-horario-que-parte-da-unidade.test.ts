import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDoDiaSemHorario } from '@/lib/agenda/intervalos-da-grade'
import { periodoAoAbrirODia, HORARIO_PADRAO, type Horario } from '@/lib/agenda/horario'
import { avisoDosMarcadosNoBloqueio } from '@/lib/agenda/bloqueio'

/**
 * A agenda, o bloqueio, o horário e o procedimento:
 * - A6 (AG-22; princípio 3): o dia em que a unidade não abre e o dia em que a
 *   pessoa não atende ficam sem nada na Semana e no Dia — só o vazio. Dizem
 *   "Fechado" e "Não atende neste dia" (o vocabulário que a agenda e o editor
 *   de horário já usam), no estilo do "Intervalo".
 * - A10 (AG-20): os atendimentos que continuam dentro do bloqueio só apareciam
 *   no toast, depois de gravar — a janela diz antes.
 * - A11 (PC-14): a seção "Quem realiza" sumia quando ninguém atende; aparece,
 *   dizendo por quê.
 * - A12 (princípio 3): "Escolher o horário" e marcar o dia abriam 08:00–20:00,
 *   e não o horário da unidade.
 * - A13 (princípio 7): para quem tem a Agenda em Ver, a janela do bloqueio
 *   tem o "Fechar" (era só o X).
 * - A14 (princípio 7): "Mostrar cancelados" traz também as faltas, e o nome diz.
 * - D13 (AG-51): com duas unidades ou mais, o histórico e a linha do tempo da
 *   ficha dizem a unidade de cada agendamento.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

const UNIDADE_SEM_DOMINGO: Horario = { dias: { 0: [], 1: [{ de: '09:00', ate: '18:00' }] } }

describe('A6: o dia fechado e o dia em que a pessoa não atende dizem', () => {
  it('a unidade não abre: "Fechado"; abre e a pessoa não atende: "Não atende neste dia"; atende: nada', () => {
    expect(rotuloDoDiaSemHorario(UNIDADE_SEM_DOMINGO, null, 0)).toBe('Fechado')
    expect(rotuloDoDiaSemHorario(UNIDADE_SEM_DOMINGO, { dias: { 1: [] } }, 1)).toBe('Não atende neste dia')
    expect(rotuloDoDiaSemHorario(UNIDADE_SEM_DOMINGO, null, 1)).toBeNull()
    // Sem horário cadastrado, a unidade usa o padrão: o domingo é fechado.
    expect(rotuloDoDiaSemHorario(null, null, 0)).toBe('Fechado')
  })
  it('a Semana e o Dia mostram os rótulos', () => {
    const semana = fonte('components/branch/agenda-week-view.tsx')
    expect(semana).toMatch(/data-dia-fechado/)
    expect(semana).toMatch(/data-nao-atende-no-dia/)
    const dia = fonte('components/branch/agenda-day-view.tsx')
    expect(dia).toMatch(/data-dia-fechado/)
    expect(dia).toMatch(/data-nao-atende-no-dia/)
  })
})

describe('A10: o "Bloquear horário" diz antes de gravar o que continua', () => {
  it('o texto do aviso (o mesmo de depois de gravar)', () => {
    expect(avisoDosMarcadosNoBloqueio(0)).toBeNull()
    expect(avisoDosMarcadosNoBloqueio(1)).toBe('Já há 1 atendimento marcado perto desse período: ele continua na agenda. Remarque se precisar.')
    expect(avisoDosMarcadosNoBloqueio(3)).toBe('Já há 3 atendimentos marcados perto desse período: eles continuam na agenda. Remarque se precisar.')
  })
  it('a action que conta sem gravar confere a permissão e o alcance, e a janela mostra', () => {
    const acao = fonte('actions/agenda-bloqueios.ts')
    const corpo = acao.slice(acao.indexOf('export async function marcadosNoBloqueio'))
    expect(corpo).toMatch(/^export async function marcadosNoBloqueio\(entrada: unknown\)/)
    const ate = corpo.indexOf('\nexport ', 10)
    const so = ate > 0 ? corpo.slice(0, ate) : corpo
    expect(so).toMatch(/assertPermission\(ctx, 'agenda', 'MANAGE'\)/)
    expect(so).toMatch(/alcancaUnidade\(ctx, e\.branchId\)/)
    expect(so).not.toMatch(/insert\(/)
    const janela = fonte('components/shared/bloqueio-da-agenda.tsx')
    expect(janela).toMatch(/marcadosNoBloqueio\(/)
    expect(janela).toMatch(/data-marcados-no-bloqueio/)
  })
})

describe('A11: "Quem realiza" aparece quando ninguém atende, dizendo por quê', () => {
  it('a seção não depende de haver quem atende', () => {
    const f = fonte('components/admin/procedure-form.tsx')
    expect(f).not.toMatch(/\{profissionais\.length > 0 && \(\s*<div>\s*<TituloDaSecao dica=\{\['Sobre quem realiza'/)
    expect(f).toMatch(/data-quem-realiza-sem-ninguem/)
  })
})

describe('A12: o horário escolhido parte do da unidade', () => {
  const UNIDADE: Horario = { dias: { 1: [{ de: '10:00', ate: '14:00' }, { de: '15:00', ate: '19:00' }], 2: [{ de: '00:00', ate: '24:00' }], 0: [] } }
  it('marcar o dia traz o período da unidade nesse dia', () => {
    expect(periodoAoAbrirODia(UNIDADE, '1')).toEqual([{ de: '10:00', ate: '14:00' }, { de: '15:00', ate: '19:00' }])
    expect(periodoAoAbrirODia(UNIDADE, '2')).toEqual([{ de: '00:00', ate: '24:00' }])
  })
  it('sair das 24 horas, ou o dia em que a unidade não abre: o comercial', () => {
    expect(periodoAoAbrirODia(UNIDADE, '2', { semDiaInteiro: true })).toEqual([{ de: '08:00', ate: '20:00' }])
    expect(periodoAoAbrirODia(UNIDADE, '0')).toEqual([{ de: '08:00', ate: '20:00' }])
    expect(periodoAoAbrirODia(UNIDADE, '1', { semDiaInteiro: true })).toEqual([{ de: '10:00', ate: '14:00' }, { de: '15:00', ate: '19:00' }])
  })
  it('sem a base, o padrão; e a cópia não é a mesma lista', () => {
    expect(periodoAoAbrirODia(null, '1')).toEqual(HORARIO_PADRAO.dias['1'])
    expect(periodoAoAbrirODia(UNIDADE, '1')).not.toBe(UNIDADE.dias['1'])
  })
  it('o editor usa a base, não o 08:00–20:00 fixo', () => {
    const f = fonte('components/shared/editor-de-horario.tsx')
    expect(f).not.toMatch(/\[\{ de: '08:00', ate: '20:00' \}\]/)
    expect(f).toMatch(/periodoAoAbrirODia\(base, chave\)/)
    expect(f).toMatch(/periodoAoAbrirODia\(base, chave, \{ semDiaInteiro: true \}\)/)
  })
})

describe('A13: a janela do bloqueio só de leitura fecha pelo "Fechar"', () => {
  it('o "Fechar" não depende de poder desfazer', () => {
    const f = fonte('components/shared/bloqueio-da-agenda.tsx')
    expect(f).toMatch(/data-bloqueio-so-de-leitura/)
  })
})

describe('A14: "Mostrar cancelados e faltas"', () => {
  it('o nome do filtro diz as faltas', () => {
    expect(fonte('components/branch/agenda-calendar.tsx')).toMatch(/comCancelados \? 'Esconder cancelados e faltas' : 'Mostrar cancelados e faltas'/)
  })
})

describe('D13: a ficha diz a unidade de cada agendamento (com duas ou mais)', () => {
  it('o histórico de procedimentos e a linha do tempo dizem a unidade', () => {
    const f = fonte('components/branch/client-profile.tsx')
    expect(f).toMatch(/unidadeDoEvento/)
    expect(f.match(/data-unidade-do-agendamento/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
