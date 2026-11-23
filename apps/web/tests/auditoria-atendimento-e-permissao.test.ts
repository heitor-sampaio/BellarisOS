import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Correções da auditoria das regras (18/11), agente B — a permissão e o
 * atendimento. Cada bloco cita a fala que manda.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const raiz = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8')
const migrationsDoAgenteB = () => readdirSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations'))
  .filter(f => f >= '20261123900001' && f < '20261123999999')
  .map(f => raiz(join('supabase', 'migrations', f)))
  .join('\n')

/** O corpo de uma função exportada do arquivo, até a próxima `export`. */
function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.indexOf(`async function ${nome}`)
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nexport ', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

// O Heitor, 18/11: "Agenda é agenda e atendimento é atendimento. Só inicia e
// conclui atendimento quem tem gerenciar no atendimento."
describe('1. O módulo Atendimento', () => {
  // Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o módulo é só o nível.
  it('existe, com Ver e Gerenciar, sem escopo', async () => {
    const { APP_MODULES } = await import('@estetica-os/types')
    const permissoes = await import('@/lib/permissions')
    const { MODULE_LEVELS, MODULE_LABELS } = permissoes
    expect(APP_MODULES).toContain('atendimento')
    expect(MODULE_LEVELS.atendimento).toEqual(['NONE', 'VIEW', 'MANAGE'])
    expect(MODULE_LABELS.atendimento).toBe('Atendimento')
    expect(Object.keys(permissoes)).not.toContain('SCOPE_LABELS')
  })

  it('está no grupo do dia a dia, logo depois da Agenda, e a cópia diz o que cada nível faz', async () => {
    const copia = await import('@/lib/permissions-copy')
    const { MODULE_GROUPS, LEVEL_COPY } = copia
    const grupo = MODULE_GROUPS.find(g => g.modules.includes('atendimento'))
    expect(grupo?.key).toBe('atendimento')
    expect(grupo!.modules.indexOf('atendimento')).toBe(grupo!.modules.indexOf('agenda') + 1)
    expect(LEVEL_COPY.atendimento.VIEW).toMatch(/sem iniciar nem concluir/)
    // Cada passo, um módulo (UM2/UM3, o Heitor, 2026-11-23): iniciar, concluir,
    // desistir no meio e montar o plano são do Atendimento em Gerenciar.
    expect(LEVEL_COPY.atendimento.MANAGE).toMatch(/inicia, conclui e desiste/)
    expect(LEVEL_COPY.atendimento.MANAGE).toMatch(/monta o plano/)
    // O clínico continua do Prontuário.
    expect(LEVEL_COPY.atendimento.MANAGE).toMatch(/Prontuário em Gerenciar/)
    // Sem o "só os meus" (SM1): não há nota de escopo.
    expect(Object.keys(copia)).not.toContain('SCOPE_NOTE')
  })

  it('a Agenda volta a ser agenda: nem Ver nem Gerenciar falam em iniciar ou concluir', async () => {
    const { LEVEL_COPY, MODULE_GROUPS } = await import('@/lib/permissions-copy')
    const { MODULE_HINTS } = await import('@/lib/permissions')
    expect(MODULE_GROUPS.length).toBeGreaterThan(0)
    expect(LEVEL_COPY.agenda.VIEW).not.toMatch(/inicia|conclu/i)
    expect(LEVEL_COPY.agenda.MANAGE).not.toMatch(/inicia|conclu/i)
    expect(MODULE_HINTS.agenda).not.toMatch(/atendimentos/)
    // Concluir não pede mais o Prontuário: sai o "concluir pede o Prontuário".
    expect(LEVEL_COPY.medical_records.MANAGE).not.toMatch(/concluir/i)
  })

  it('o resumo do cargo diz o Atendimento (e não mais o Prontuário) para iniciar e concluir', async () => {
    const { conclusaoNoResumo, tratamentosNoResumo } = await import('@/lib/permissions-copy')
    // Sem o "só os meus" (SM1, 2026-11-23): sai o "só os próprios atendimentos".
    expect(conclusaoNoResumo({ atendimento: 'NONE' })).toBeNull()
    expect(conclusaoNoResumo({ atendimento: 'VIEW' }))
      .toBe('Vê os atendimentos, sem iniciar nem concluir: iniciar e concluir pedem o Atendimento em Gerenciar.')
    expect(conclusaoNoResumo({ atendimento: 'MANAGE', medical_records: 'MANAGE' })).toBeNull()
    expect(conclusaoNoResumo({ atendimento: 'MANAGE', medical_records: 'VIEW' }))
      .toBe('Inicia e conclui os atendimentos. A evolução, as fotos e a ficha de saúde pedem o Prontuário em Gerenciar.')
    expect(tratamentosNoResumo({ atendimento: 'VIEW' })).toBe('Tratamentos vem do Atendimento em “Ver”: os planos de tratamento das clientes, para acompanhar.')
    expect(tratamentosNoResumo({ agenda: 'MANAGE' })).toBeNull()
  })

  // UM2 + SM1 (o Heitor, 2026-11-23): o Atendimento em Gerenciar inicia e
  // conclui qualquer atendimento ao alcance — sem o "só os meus".
  it('iniciar e concluir pedem o Atendimento em Gerenciar, e só ele', () => {
    const inicio = corpo('actions/appointments.ts', 'startAppointmentInterno')
    expect(inicio).toContain("assertPermission(ctx, 'atendimento', 'MANAGE')")
    expect(inicio).not.toContain('isOwnScope')
    expect(inicio).not.toContain("assertPermission(ctx, 'agenda', 'VIEW')")

    const fim = corpo('actions/appointments.ts', 'finishSessionInterno')
    expect(fim).toContain("assertPermission(ctx, 'atendimento', 'MANAGE')")
    expect(fim).not.toContain('isOwnScope')
    expect(fim).not.toContain('é preciso ter o módulo Prontuário para gerenciar')
    // O clínico (evolução, intercorrência, dores, ficha de saúde, ficha) só com o Prontuário em Gerenciar.
    expect(fim).toContain("const registraClinico = can(ctx, 'medical_records', 'MANAGE')")

    const chegar = corpo('actions/appointments.ts', 'chegarEIniciar')
    expect(chegar).toContain("assertPermission(ctx, 'atendimento', 'MANAGE')")

    const status = corpo('actions/appointments.ts', 'updateAppointmentStatusInterno')
    expect(status).toContain("'atendimento'")
    expect(status).not.toContain('a agenda em Ver inicia e conclui')
  })

  // UM1 (o Heitor, 2026-11-23): a tela abre com o Atendimento em Ver, não com a
  // Agenda; sem ele, só a vista pessoal (SM2) — o agendamento da própria pessoa.
  it('a tela do atendimento e a janela da agenda decidem pelo Atendimento', () => {
    const sessao = fonte('app/_shared/sessao-de-atendimento.tsx')
    expect(sessao).not.toContain("assertAnyPermission(ctx, ['agenda', 'atendimento'], 'VIEW')")
    expect(sessao).toContain("const veOAtendimento = can(ctx, 'atendimento', 'VIEW')")
    expect(sessao).toContain('if (!veOAtendimento && !pessoal) throw semAcesso()')
    expect(sessao).toContain('if (pessoal && apptRaw.professional_id !== pessoal) throw semAcesso()')
    expect(sessao).toContain("can(ctx, 'atendimento', 'MANAGE')")
    const ui = fonte('components/branch/appointment-session.tsx')
    expect(ui).toMatch(/const mostraFinalizar {6}= status === 'IN_PROGRESS' && canManage\r?\n/)
    for (const p of ['app/[slug]/agenda/page.tsx', 'app/admin/agenda/page.tsx']) {
      expect(fonte(p)).toContain("podeConcluir={can(ctx, 'atendimento', 'MANAGE')}")
    }
    const quem = fonte('lib/equipe/quem-desfaz.ts')
    // quemConcluiOAtendimento = só o Atendimento em Gerenciar (SM1: sem o "só os meus").
    expect(quem).toContain("return quemTemEmGerenciar(tenantId, branchId, 'atendimento')")
    expect(quem).toMatch(/function quemTemEmGerenciar[^]*?quemTemNoNivel\(tenantId, branchId, modulo, \['MANAGE'\]\)/)
    expect(fonte('lib/equipe/textos-de-quem-pode.ts')).toContain('quem tem o Atendimento em Gerenciar')
  })

  it('a migration põe o Atendimento nos cargos de hoje e nos modelos, sem mudar quem já atende', () => {
    const sql = migrationsDoAgenteB()
    expect(sql).toMatch(/'atendimento'/)
    expect(sql).toContain('private.cargos_modelo_semear')
    // O modelo que hoje atende (a Agenda e o Prontuário em Gerenciar) atende.
    expect(sql).toMatch(/"atendimento":\["MANAGE","OWN"\]/)
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

// UM3 (o Heitor, 2026-11-23; revê a PT2): montar o plano pede o Atendimento em
// Gerenciar, com a unidade do plano ao alcance; o "Atende" deixa de ser trava.
describe('2. O plano é do Atendimento', () => {
  it('gerar o plano na avaliação aberta pede o Atendimento em Gerenciar (montaPlano), não o Prontuário', () => {
    const f = corpo('actions/treatment-plans.ts', 'generateEvaluationPlanInterno')
    expect(f).not.toContain('Gerar o plano na avaliação grava o prontuário: é preciso ter o Prontuário em Gerenciar.')
    expect(f).toContain('if (!montaPlano(ctx, appt.branch_id as string))')
    const quemMonta = fonte('lib/plano-de-tratamento/quem-monta.ts')
    expect(quemMonta).toContain("if (!can(ctx as TenantContext, 'atendimento', 'MANAGE')) return false")
    expect(quemMonta).toContain('return unidadeId ? alcancaUnidade(ctx, unidadeId) : true')
  })
  it('ver os planos da cliente pede o Atendimento, não a Agenda', () => {
    const f = corpo('actions/treatment-plans.ts', 'getPlanosDoCliente')
    expect(f).toContain("assertPermission(ctx, 'atendimento', 'VIEW')")
    expect(f).not.toContain("assertPermission(ctx, 'agenda', 'VIEW')")
    expect(fonte('lib/menu.ts')).not.toMatch(/label: 'Tratamentos',\s+href: '\/admin\/planejamentos',\s+visible: p => has\(p, 'agenda'\)/)
  })
})

// 28/10: "quem gerencia a agenda cancela e passa o atendimento a outra pessoa".
// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): quem tem a Agenda em
// Gerenciar troca em qualquer agendamento; o "no que é dela" saiu.
describe('3. Passar o atendimento a outra pessoa', () => {
  it('a janela oferece "Trocar profissional" a quem tem a Agenda em Gerenciar, em qualquer agendamento', () => {
    const f = fonte('components/branch/appointment-sheet.tsx')
    expect(f).toMatch(/\{podeGerenciar && \(\s*<TrocarProfissional/)
    expect(f).not.toMatch(/ehMeu\) && podeGerenciar && \(\s*<TrocarProfissional/)
  })
})

// EQ1 ("Concord."): "A rede inteira (todas, inclusive as que vierem)".
describe('4. Quem atende com "A rede inteira" atende na unidade nova', () => {
  it('a migration põe a unidade nova no "Atende" de quem atende em todas', () => {
    const sql = migrationsDoAgenteB()
    expect(sql).toMatch(/after insert or update of is_active on public\.branches/i)
    expect(sql).toMatch(/branch_id is null/)
  })
})

describe('5. Agendar pelo CRM pede a Agenda em Gerenciar', () => {
  it('a action e as telas do quadro', () => {
    expect(corpo('actions/crm-scheduling.ts', 'createCrmAppointment')).toContain("assertPermission(ctx, 'agenda', 'MANAGE')")
    for (const p of ['app/[slug]/oportunidades/page.tsx', 'app/admin/oportunidades/page.tsx']) {
      expect(fonte(p)).toContain("can(ctx, 'agenda', 'MANAGE')")
    }
  })
})

// H8: "cada usuário poder configurar as suas".
describe('6. Respostas rápidas: cada pessoa guarda as suas', () => {
  it('quem usa o inbox (o CRM em Ver) grava e apaga as próprias', () => {
    expect(corpo('actions/quick-replies.ts', 'saveQuickReply')).toContain("assertPermission(ctx, 'crm', 'VIEW')")
    expect(corpo('actions/quick-replies.ts', 'deleteQuickReply')).toContain("assertPermission(ctx, 'crm', 'VIEW')")
  })
})

// Princípio 4: "nunca o valor de outro caso parecido".
describe('7. A nota do ranking por procedimento', () => {
  it('o procedimento sem nota própria não herda a do atendimento', () => {
    const sql = migrationsDoAgenteB()
    const i = sql.indexOf('function public.metrics_notas_dos_procedimentos')
    expect(i).toBeGreaterThan(-1)
    expect(sql.slice(i, sql.indexOf('$function$;', i) > 0 ? sql.indexOf('$function$;', i) : undefined)).not.toContain('client_rating')
  })
  it('a tela diz', async () => {
    const { TEXTO_DA_NOTA_DO_PROCEDIMENTO } = await import('@/lib/avaliacao/notas')
    expect(TEXTO_DA_NOTA_DO_PROCEDIMENTO).toMatch(/nota própria/)
    expect(fonte('components/admin/settings-geral.tsx')).toContain('TEXTO_DA_NOTA_DO_PROCEDIMENTO')
  })
})

// O Heitor, 18/11: "Não existe isso de desistir no meio do atendimento. Se
// isso por ventura acontecer, problema de quem desistir."
describe('8. A desistência no meio não devolve a sessão paga', () => {
  it('o pre_pago_libera não solta o que foi iniciado, e a sessão conta como usada', () => {
    const sql = migrationsDoAgenteB()
    const i = sql.indexOf('function private.pre_pago_libera')
    expect(i).toBeGreaterThan(-1)
    const f = sql.slice(i)
    expect(f).toMatch(/old\.status::text = 'IN_PROGRESS'/)
    expect(f).toMatch(/status = 'USED'/)
    expect(f).toMatch(/status = 'USADA'/)
  })

  it('a sessão do plano ligada ao cancelado (a desistência) não volta a "A agendar" no app', async () => {
    const { situacaoDaSessaoNoApp } = await import('@/lib/plano-de-tratamento/sessao-no-app')
    const s = situacaoDaSessaoNoApp({ status: 'CANCELLED', scheduled_at: '2026-11-10T13:00:00Z', completed_at: null }, 'America/Sao_Paulo')
    expect(s.aAgendar).toBe(false)
    expect(s.texto).toBe('Usada em 10/11 (atendimento interrompido)')
    const vendas = fonte('lib/copilot/ferramentas/vendas.ts')
    expect(vendas).toContain("a.status === 'CANCELLED' && a.started_at")
  })

  it('a janela da desistência diz que a sessão paga conta como usada (princípio 3)', async () => {
    const m = await import('@/lib/atendimento/desistencia')
    expect(m.TEXTO_DA_SESSAO_NA_DESISTENCIA).toMatch(/conta como usada/)
    expect(m.TEXTO_DA_SESSAO_NA_DESISTENCIA).not.toMatch(/volta/)
    const tela = fonte('components/branch/appointment-session.tsx')
    expect(tela).toContain('{TEXTO_DA_SESSAO_NA_DESISTENCIA}')
    expect(tela).toContain("canManage ? { insumos: confirmedInsumos, registraClinico: canEditRecords }")
  })
})

describe('9. O bloqueio pelo Copilot avisa e pede confirmação', () => {
  it('não recusa mais', () => {
    const f = fonte('lib/copilot/ferramentas/agenda-escrita.ts')
    expect(f).not.toContain('o encaixe num horário bloqueado é pela agenda')
    expect(f).not.toMatch(/if \(bloqueado\) return \{ erro/)
    expect(f).toContain('avisoDoBloqueado')
  })
})
