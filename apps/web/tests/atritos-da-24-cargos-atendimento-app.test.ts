import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * 24ª simulação (2026-11-17): cargos e equipe, atendimento, agenda e plano,
 * dashboard, app da cliente e a operação da noite.
 * - A1 [3]: o resumo do cargo sem o Prontuário em Gerenciar não dizia quem conclui.
 * - A2 [3]: a matriz dizia que a Agenda em Ver "inicia e conclui" (concluir pede o Prontuário em Gerenciar).
 * - A3 [3]: no PDV travado em Gerenciar, o "Sem acesso" seguia com cara de clicável.
 * - A4 [3]: "Dê o nome ao lado", e o campo fica na lista de cargos.
 * - A5 [3]: a linha do PDV no resumo não dizia de onde vem o Fechamento do dia.
 * - A6 [3]: o chip "Sem comissão de venda" em quem ganhou a comissão do pacote.
 * - A11 [3]: o Estoque da rede de uma unidade tinha o subtítulo "Estoque".
 * - A32 [3]: sem a Agenda, o dashboard mostrava as etapas da agenda zeradas.
 * - A35 [3]: depois de "Registrar aplicação", o mapa voltava sem os pontos.
 * - A36 [3]: o "Gerar plano" barrava pela ficha de saúde sem avisar antes.
 * - A37 [3]: "Fora do horário (00:00–24:00)" no atendimento que passa da meia-noite.
 * - A38 [3]: a grade oferecia o horário que já passou (o relógio parado; o fuso da tela).
 * - A39 [3]: "Aguardando" na agenda, "Agendado" no detalhe e no app.
 * - A45 [3]: o confirmar do app voltava ao histórico sem aviso.
 * - A46 [3]: o de hoje que passou sem ser atendido seguia "Agendado" em "Próximos".
 * - A47 [7]: remarcar pelo app pedia dois toques.
 * - A48 [3]: o sino cortava o texto com reticências.
 * - A52 [3]: a unidade sem sala, sem dica nenhuma.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('A1/A2: quem conclui, na matriz e no resumo do cargo', () => {
  // Desde 2026-11-18 (o Heitor: "Agenda é agenda e atendimento é atendimento. Só inicia
  // e conclui atendimento quem tem gerenciar no atendimento"): o módulo Atendimento.
  // Sem o Prontuário em Gerenciar, conclui sem o clínico (era "não conclui").
  it('A1: o Atendimento em Ver diz que não inicia nem conclui; em Gerenciar sem o Prontuário, que o clínico pede o Prontuário', async () => {
    const { conclusaoNoResumo } = await import('@/lib/permissions-copy')
    expect(conclusaoNoResumo({ atendimento: 'VIEW', medical_records: 'MANAGE' }, { atendimento: 'ALL' }))
      .toBe('Vê os atendimentos, sem iniciar nem concluir: iniciar e concluir pedem o Atendimento em Gerenciar.')
    expect(conclusaoNoResumo({ atendimento: 'MANAGE', medical_records: 'VIEW' }, { atendimento: 'ALL' }))
      .toBe('Inicia e conclui os atendimentos. A evolução, as fotos e a ficha de saúde pedem o Prontuário em Gerenciar.')
    // Sem o Atendimento, nada a dizer; com ele de todos e o Prontuário, tudo.
    expect(conclusaoNoResumo({ agenda: 'MANAGE', medical_records: 'NONE' }, {})).toBeNull()
    expect(conclusaoNoResumo({ atendimento: 'MANAGE', medical_records: 'MANAGE' }, { atendimento: 'ALL' })).toBeNull()
  })
  it('A2: a Agenda em Ver não promete concluir, e diz que não marca horário', async () => {
    const { LEVEL_COPY, SCOPE_NOTE } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.agenda.VIEW).not.toMatch(/inicia e conclui/)
    expect(LEVEL_COPY.agenda.VIEW).toMatch(/Não marca/)
    expect(SCOPE_NOTE.agenda).not.toMatch(/Em Ver, inicia e conclui\./)
    // Iniciar e concluir saíram da Agenda (2026-11-18): é o Atendimento.
    expect(SCOPE_NOTE.atendimento).toMatch(/inicia e conclui/)
  })
})

describe('A3/A4/A5: a tela de Cargos', () => {
  it('A3: travado, só o nível que vale aparece (com o cadeado)', () => {
    const f = fonte('components/admin/roles-editor.tsx')
    expect(f).toContain('const escondido = !available || (travado && !active)')
    expect(f).toMatch(/travado && active && <Lock/)
  })
  it('A4: o texto aponta a lista de cargos, e o campo tem nome', () => {
    const f = fonte('components/admin/roles-editor.tsx')
    expect(f).not.toContain('Dê o nome ao lado')
    expect(f).toContain('Dê o nome na lista de cargos e clique em Criar')
    expect(f).toContain('aria-label="Nome do cargo"')
  })
  it('A5: o resumo diz de onde vêm a venda e o Fechamento do dia', async () => {
    const { quemVendeNoResumo } = await import('@/lib/permissions-copy')
    expect(quemVendeNoResumo({ cashier: 'MANAGE' })).toBe('Vende no PDV (procedimento, pacote, produto e crédito) e faz o Fechamento do dia: os dois vêm do PDV.')
    expect(quemVendeNoResumo({ cashier: 'NONE', financial: 'MANAGE' })).toBe('Vende no PDV (procedimento, pacote, produto e crédito) e faz o Fechamento do dia: os dois vêm do Financeiro em Gerenciar.')
  })
})

describe('A6: o chip de quem não atende diz de onde vem a comissão de venda', () => {
  it('sem a dela, vale a do pacote, do produto ou da rede', async () => {
    const { chipDaComissao } = await import('@/lib/comissoes/chip-do-membro')
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: false })).toBe('Venda: a do pacote, produto ou rede')
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: 5, atende: false })).toBe('Venda 5%')
  })
})

describe('A11: o Estoque da rede de uma unidade diz o nome dela', () => {
  it('não repete "Estoque" no subtítulo', () => {
    expect(fonte('app/admin/estoque/page.tsx')).not.toMatch(/umaUnidadeSo\(branches\.length\) \? 'Estoque'/)
  })
})

describe('A32: sem a Agenda, o quadro de clientes não mostra as etapas da agenda', () => {
  it('etapasDoQueOCargoVe', async () => {
    const { etapasDoQueOCargoVe } = await import('@/lib/dashboard/etapas-do-ciclo')
    const etapas = [
      { label: 'Novos clientes', count: 3, color: 'a' },
      { label: 'Agendamentos', count: 0, color: 'b' },
      { label: 'Concluídos', count: 0, color: 'c' },
      { label: 'Cancelados/faltas', count: 0, color: 'd' },
    ]
    expect(etapasDoQueOCargoVe(etapas, false).map(e => e.label)).toEqual(['Novos clientes'])
    expect(etapasDoQueOCargoVe(etapas, true)).toHaveLength(4)
  })
  it('os dois dashboards passam por ela', () => {
    expect(fonte('app/[slug]/dashboard/page.tsx')).toContain('etapasDoQueOCargoVe(')
    expect(fonte('app/admin/dashboard/page.tsx')).toContain('etapasDoQueOCargoVe(')
  })
})

describe('A35: o ponto registrado continua desenhado', () => {
  it('registrar a aplicação também guarda o mapa do planejamento', () => {
    const f = fonte('actions/injectable-map.ts')
    const corpo = f.slice(f.indexOf('export async function registrarAplicacao'), f.indexOf('function revalidarPlanejamento'))
    expect(corpo).toContain("from('injectable_maps')")
    expect(corpo).toContain('points:')
  })
})

describe('A36: o plano avisa da ficha de saúde antes do clique', () => {
  const linha = (fields: AnamnesisRow['fields']): AnamnesisRow => ({ id: Math.random().toString(36), fields })
  const saude: AnamnesisRow[] = [
    linha([{ id: 'allergies', type: 'textarea', label: 'Alergias', required: true }]),
    linha([{ id: 'gestante', type: 'select', label: 'Gestante', required: true, options: ['Sim', 'Não'] }]),
  ]
  it('avisoDaFichaParaOPlano', async () => {
    const { avisoDaFichaParaOPlano } = await import('@/lib/atendimento/obrigatorias')
    expect(avisoDaFichaParaOPlano(saude, {})).toBe('Para gerar o plano, falta responder na ficha de saúde: "Alergias", "Gestante".')
    expect(avisoDaFichaParaOPlano(saude, { allergies: 'Nega', gestante: 'Não' })).toBeNull()
  })
  it('o bloco do plano mostra o aviso', () => {
    expect(fonte('components/branch/appointment-session.tsx')).toContain('data-ficha-antes-do-plano')
  })
})

describe('A37: o atendimento que passa da meia-noite', () => {
  it('avisoForaDoHorario', async () => {
    const { avisoForaDoHorario } = await import('@/lib/agenda/horario')
    const dia = [{ de: '00:00', ate: '24:00' }]
    expect(avisoForaDoHorario('Dra. Beatriz', dia, 23 * 60 + 40, 45))
      .toBe('Passa da meia-noite (fim às 00:25): o horário de atendimento de Dra. Beatriz vai até 24:00. O encaixe é permitido.')
    expect(avisoForaDoHorario('Dra. Beatriz', dia, 10 * 60, 60)).toBeNull()
    expect(avisoForaDoHorario('Ana', [{ de: '10:00', ate: '18:00' }], 19 * 60, 60))
      .toBe('Fora do horário de atendimento de Ana (10:00–18:00). O encaixe é permitido.')
    expect(avisoForaDoHorario('Ana', [], 10 * 60, 60)).toBe('Ana não atende neste dia. O encaixe é permitido.')
  })
  it('o aviso do horário passa por ela', () => {
    expect(fonte('lib/appointments/encaixe.ts')).toContain('avisoForaDoHorario(')
  })
})

describe('A38: a grade não oferece o que já passou', () => {
  it('a grade anda com o relógio, e o Agendar dá o fuso da unidade', () => {
    expect(fonte('components/shared/grade-de-horarios.tsx')).toContain('useAgora()')
    const modal = fonte('components/branch/appointment-modal.tsx')
    expect(modal).toMatch(/<GradeDeHorarios[\s\S]*?fuso=\{fuso\}/)
    expect(modal).toContain('useAgora()')
  })
})

describe('A39: um rótulo só para o agendado', () => {
  it('ROTULO_DO_STATUS', async () => {
    const { ROTULO_DO_STATUS } = await import('@/lib/agenda/rotulo-do-status')
    expect(ROTULO_DO_STATUS.SCHEDULED).toBe('Agendado')
  })
  it('a agenda e o dashboard não dizem "Aguardando"', () => {
    for (const arq of ['components/branch/agenda-calendar.tsx', 'components/branch/professional-agenda.tsx', 'app/[slug]/dashboard/page.tsx']) {
      expect(fonte(arq), arq).not.toMatch(/label: +'Aguardando'/)
    }
  })
})

describe('A45: o confirmar do app avisa', () => {
  it('textoDoConfirmadoNoApp', async () => {
    const { textoDoConfirmadoNoApp } = await import('@/lib/clientes/textos-do-app')
    expect(textoDoConfirmadoNoApp(true)).toBe('Atendimento confirmado; avaliação enviada.')
    expect(textoDoConfirmadoNoApp(false)).toBe('Atendimento confirmado.')
  })
  it('o formulário mostra o aviso', () => {
    expect(fonte('components/client-portal/confirm-appointment-form.tsx')).toContain('toast.success(textoDoConfirmadoNoApp(')
  })
})

describe('A46: o de hoje que passou sem ser atendido', () => {
  it('horarioPassouSemAtender', async () => {
    const { horarioPassouSemAtender } = await import('@/lib/clientes/agenda-do-portal')
    const agora = new Date('2026-11-17T23:00:00Z')
    expect(horarioPassouSemAtender({ status: 'SCHEDULED', scheduled_at: '2026-11-17T21:00:00Z', duration_min: 60 }, agora)).toBe(true)
    expect(horarioPassouSemAtender({ status: 'CONFIRMED', scheduled_at: '2026-11-17T22:30:00Z', duration_min: 60 }, agora)).toBe(false)
    expect(horarioPassouSemAtender({ status: 'IN_PROGRESS', scheduled_at: '2026-11-17T21:00:00Z', duration_min: 60 }, agora)).toBe(false)
  })
  it('o app diz, na lista e na Início', () => {
    expect(fonte('app/[slug]/cliente/agendamentos/page.tsx')).toContain('horarioPassouSemAtender(')
    expect(fonte('app/[slug]/cliente/home/page.tsx')).toContain('horarioPassouSemAtender(')
  })
})

describe('A47: remarcar num toque', () => {
  it('o cartão leva ao remarcar já aberto', () => {
    expect(fonte('app/[slug]/cliente/agendamentos/page.tsx')).toContain('?remarcar=1')
    expect(fonte('app/[slug]/cliente/agendamentos/[id]/page.tsx')).toContain('abrirRemarcando=')
    expect(fonte('components/client-portal/alterar-agendamento.tsx')).toContain('abrirRemarcando')
  })
})

describe('A48: o sino não corta o texto', () => {
  it('o título quebra, e o corpo vai até três linhas', () => {
    const f = fonte('components/client-portal/notification-bell.tsx')
    const item = f.slice(f.indexOf('function NotificationItem'))
    expect(item).not.toContain("textOverflow: 'ellipsis'")
    expect(item).toContain('WebkitLineClamp: 3')
  })
})

describe('A52: a unidade sem sala tem a dica', () => {
  it('o Agendar diz', () => {
    expect(fonte('components/branch/appointment-modal.tsx')).toContain('data-unidade-sem-sala')
  })
})
