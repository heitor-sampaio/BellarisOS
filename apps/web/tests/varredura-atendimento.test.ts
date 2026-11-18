import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions, ResolvedScopes, AppModule } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * A varredura de conformidade de 18/11 — agenda, atendimento, prontuário,
 * injetáveis, estoque e o Copilot da agenda/clientes. Cada bloco cita a regra.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** O corpo de uma função do arquivo, até a próxima `export` (ou o fim). */
function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nexport ', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(perm: Partial<Record<AppModule, 'NONE' | 'VIEW' | 'MANAGE'>>, escopos: Partial<ResolvedScopes> = {}, over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'eu', userName: 'Ana', roleLabel: 'Cargo',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', ...perm } as ResolvedPermissions,
    scopes: { ...ALL_SCOPES, ...escopos } as ResolvedScopes,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  }
}

// CLAUDE.md §11 (o Heitor, 18/11): "o módulo `atendimento` (Ver/Gerenciar, com
// escopo) inicia, conclui, desiste no meio"; atendimento.md, "Quem faz o quê".
describe('ATD-A01 — desistir no meio é do Atendimento em Gerenciar, com o escopo dele', () => {
  it('a regra é uma, pura: o Em atendimento pede o Atendimento; o resto, a Agenda', async () => {
    const { recusaDoCancelar, podeCancelarAlgum } = await import('@/lib/appointments/quem-cancela')
    const emAtendimento = (prof: string | null) => ({ status: 'IN_PROGRESS', professional_id: prof })
    const agendado = (prof: string | null) => ({ status: 'SCHEDULED', professional_id: prof })

    // Só a Agenda em Gerenciar: cancela o agendado, não desiste do atendimento.
    const soAgenda = ctx({ agenda: 'MANAGE' })
    expect(recusaDoCancelar(soAgenda, agendado('outra'))).toBeNull()
    expect(recusaDoCancelar(soAgenda, emAtendimento('outra'))).toMatch(/Atendimento em Gerenciar/)

    // O inverso: o Atendimento em Gerenciar e a Agenda em Ver desiste.
    const atende = ctx({ agenda: 'VIEW', atendimento: 'MANAGE' })
    expect(recusaDoCancelar(atende, emAtendimento('outra'))).toBeNull()
    expect(recusaDoCancelar(atende, agendado('outra'))).toMatch(/Agenda em Gerenciar/)
    expect(podeCancelarAlgum(atende)).toBe(true)
    expect(podeCancelarAlgum(soAgenda)).toBe(true)
    expect(podeCancelarAlgum(ctx({ agenda: 'VIEW', atendimento: 'VIEW' }))).toBe(false)

    // O escopo do Atendimento: "só os meus" desiste só do DELA.
    const soOsMeus = ctx({ agenda: 'MANAGE', atendimento: 'MANAGE' }, { atendimento: 'OWN' })
    expect(recusaDoCancelar(soOsMeus, emAtendimento('eu'))).toBeNull()
    expect(recusaDoCancelar(soOsMeus, emAtendimento('outra'))).toBeTruthy()
    // …e o "só os meus" do Atendimento não muda o cancelar do agendado.
    expect(recusaDoCancelar(soOsMeus, agendado('outra'))).toBeNull()
  })

  it('o núcleo (cancelarCore) decide pela situação lida e grava só nela', () => {
    const c = corpo('lib/appointments/alteracoes.ts', 'cancelarCore')
    expect(c).toContain('recusaDoCancelar(ctx, existente)')
    expect(c).toContain(".eq('status', existente.status)")
  })

  it('as actions não barram pela Agenda antes de ler a situação', () => {
    const s = corpo('actions/appointments.ts', 'cancelAppointmentSessionInterno')
    expect(s).not.toContain("assertPermission(ctx, 'agenda', 'MANAGE')")
    expect(s).toContain('podeCancelarAlgum(ctx)')
    // A desistência com insumo ou intercorrência confere o escopo do Atendimento.
    expect(s).toContain('recusaDoCancelar(ctx, existente)')
    const u = corpo('actions/appointments.ts', 'updateAppointmentStatusInterno')
    expect(u).toMatch(/status === 'CANCELLED'[\s\S]{0,80}podeCancelarAlgum/)
  })

  it('a janela da agenda: o "Cancelar" do Em atendimento é de quem atende, com o aviso da sessão paga', () => {
    const j = fonte('components/branch/appointment-sheet.tsx')
    expect(j).toMatch(/const podeCancelar = emAtendimento \? podeAtenderEste : podeGerenciar/)
    expect(j).toContain('{TEXTO_DA_SESSAO_NA_DESISTENCIA}')
    expect(j).toContain('data-sessao-paga-conta')
  })

  it('a tela do atendimento: o "Cancelar" do Em atendimento pede o Atendimento (canManage)', () => {
    const t = fonte('components/branch/appointment-session.tsx')
    expect(t).toContain("isActive && (status === 'IN_PROGRESS' ? canManage : canCheckin)")
  })

  it('o Copilot: a ferramenta segue a mesma regra, no preparo e no núcleo', () => {
    const f = fonte('lib/copilot/ferramentas/agenda-escrita.ts')
    const cancelar = f.slice(f.indexOf("nome: 'cancelar_agendamento'"), f.indexOf("nome: 'confirmar_agendamento'"))
    expect(cancelar).toContain('pode: podeCancelarAlgum')
    expect(cancelar).toContain('recusaDoCancelar(c.ctx, ag)')
    expect(cancelar).toContain('TEXTO_DA_SESSAO_NA_DESISTENCIA')
  })
})

// ATD-A04: "Não compareceu" no Em atendimento era um botão que o servidor
// recusa ("A cliente está em atendimento: não é falta.") — CLAUDE.md §14.
describe('ATD-A04 — a janela não oferece "Não compareceu" a quem está em atendimento', () => {
  it('o botão e a dica da falta ficam fora do Em atendimento', () => {
    const j = fonte('components/branch/appointment-sheet.tsx')
    expect(j).toContain('{jaComecou && !emAtendimento && (')
    expect(j).toContain('{!jaComecou && !emAtendimento && (')
  })
})

// ATD-A02 = COP-01: a ferramenta do Copilot pede o MESMO nível da action da
// tela (copilot.md: "As ferramentas chamam os MESMOS núcleos da tela").
describe('ATD-A02/COP-01 — a matriz das gravações do Copilot é a da tela', () => {
  /**
   * A trava da action da tela, por ferramenta de gravação — a do NÍVEL do
   * módulo (o escopo pode ser mais estreito no Copilot; ele nunca é mais largo).
   */
  const DA_TELA: Record<string, { modulo: AppModule; outra?: (c: TenantContext) => boolean }> = {
    agendar:               { modulo: 'agenda' },        // addAppointment
    remarcar:              { modulo: 'agenda' },        // rescheduleAppointment
    cancelar_agendamento:  { modulo: 'agenda', outra: c => c.permissions.atendimento === 'MANAGE' }, // a desistência (ATD-A01)
    confirmar_agendamento: { modulo: 'agenda' },        // updateAppointmentStatus CONFIRMED (C10)
    fazer_check_in:        { modulo: 'agenda' },        // checkinAppointment
    cadastrar_cliente:     { modulo: 'clients' },       // addClient
    atualizar_contato:     { modulo: 'clients' },       // updateClientContactData
    marcar_tags:           { modulo: 'clients' },       // marcarTagEmClientes
    criar_acesso_ao_app:   { modulo: 'clients' },       // darAcessoAoApp
    lancar:                { modulo: 'financial' },     // createTransactionAdvanced
    marcar_pago:           { modulo: 'cashier', outra: c => c.permissions.financial === 'MANAGE' }, // podeDarBaixa (CX2)
    entrada_de_estoque:    { modulo: 'stock' },         // adminAddStock
    ajuste_de_estoque:     { modulo: 'stock' },         // adminAdjustStock
    criar_oportunidade:    { modulo: 'crm' },           // createLead
    mover_etapa:           { modulo: 'crm' },           // updateLeadStage
    trocar_responsavel:    { modulo: 'crm' },           // updateLead + podeTrocarResponsavel
  }

  it('toda ferramenta de gravação está na matriz', async () => {
    const { FERRAMENTAS } = await import('@/lib/copilot/ferramentas')
    const escritas = FERRAMENTAS.filter(f => f.tipo === 'escrita').map(f => f.nome).sort()
    expect(escritas).toEqual(Object.keys(DA_TELA).sort())
  }, 60_000)

  it('com o módulo da tela só em Ver, nenhuma gravação; em Gerenciar, liberada', async () => {
    const { FERRAMENTAS } = await import('@/lib/copilot/ferramentas')
    const { ferramentaLiberada } = await import('@/lib/copilot/executor')
    for (const f of FERRAMENTAS.filter(x => x.tipo === 'escrita')) {
      const { modulo, outra } = DA_TELA[f.nome]!
      expect(ferramentaLiberada(ctx({ [modulo]: 'VIEW' }), f), `${f.nome} com ${modulo} em Ver`).toBe(false)
      expect(ferramentaLiberada(ctx({ [modulo]: 'MANAGE' }), f), `${f.nome} com ${modulo} em Gerenciar`).toBe(true)
      if (outra) {
        const c = ctx({ agenda: 'VIEW', financial: 'MANAGE', atendimento: 'MANAGE' })
        expect(ferramentaLiberada(c, f), `${f.nome} pela outra trava da tela`).toBe(outra(c))
      }
    }
  }, 60_000)

  it('confirmar pela agenda em Ver é recusado (o caso da varredura)', async () => {
    const { confirmarAgendamento } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const { ferramentaLiberada } = await import('@/lib/copilot/executor')
    expect(ferramentaLiberada(ctx({ agenda: 'VIEW' }), confirmarAgendamento)).toBe(false)
  }, 60_000)
})

// ATD-A05: trocar a profissional chega ao agendamento DELA numa unidade em que
// ela atende (decisão 2 da 8ª; `alcancaOAgendamento`), como as outras actions.
describe('ATD-A05 — reassignProfessional pelo alcance do agendamento', () => {
  it('confere alcancaOAgendamento, não só a unidade', () => {
    const c = corpo('actions/appointments.ts', 'reassignProfessionalInterno')
    expect(c).toContain('alcancaOAgendamento(ctx, apptBranch.id, appt.professional_id')
    expect(c).not.toContain('alcancaUnidade(')
  })
})

// ATD-A03/ATD-P04/ATD-P06: a ficha do procedimento e a foto dela são do
// atendimento, como a evolução (`saveDraftNotes`): o Atendimento e o Prontuário
// em Gerenciar ("Editar registro" — atendimento.md, `canEditRecords`), o
// alcance do agendamento e o "só os meus" da Agenda e do Atendimento.
describe('ATD-A03/P04/P06 — a ficha do procedimento e a foto dela seguem a evolução', () => {
  for (const nome of ['salvarFichaDoProcedimento', 'uploadAnamnesisPhoto']) {
    it(nome, () => {
      const c = corpo('actions/anamnesis.ts', nome)
      expect(c).toContain("assertPermission(ctx, 'atendimento', 'MANAGE')")
      expect(c).toContain("assertPermission(ctx, 'medical_records', 'MANAGE')")
      expect(c).toContain('alcancaOAgendamento(')
      expect(c).toContain('deOutroProfissional(')
      expect(c).toContain('deOutroNoAtendimento(')
      expect(c).not.toContain('alcancaUnidade(')
    })
  }
})

// ATD-P06: o registro de UNIDADE que é de um atendimento chega pelo alcance do
// agendamento (a profissional que atende também na outra unidade).
describe('ATD-P06 — o anexo e a aplicação pelo alcance do agendamento', () => {
  for (const nome of ['enviarDocumentoACliente', 'deleteClientDocument']) {
    it(nome, () => {
      expect(corpo('actions/client-documents.ts', nome)).toContain('alcanceDoAnexo(')
    })
  }
  it('registrarAplicacao', () => {
    const c = corpo('actions/injectable-map.ts', 'registrarAplicacao')
    expect(c).toContain('alcancaOAgendamento(')
    expect(c).not.toContain('alcancaUnidade(')
  })
})

const migrationsDaFaixa = () => {
  const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
  return readdirSync(dir).filter(n => /^202611245\d{5}_/.test(n)).map(n => readFileSync(join(dir, n), 'utf8')).join('\n')
}

// ATD-P07: D14 (o Heitor, 2026-10-28): "A aplicação de injetáveis se CONFIRMA e
// se REGISTRA só no atendimento".
describe('ATD-P07 — a aplicação só nasce num atendimento', () => {
  it('a action recusa sem o atendimento', () => {
    expect(corpo('actions/injectable-map.ts', 'registrarAplicacao')).toMatch(/if \(!appointmentId\) return \{ error:/)
  })
  it('e o banco também (a função do registro)', () => {
    const sql = migrationsDaFaixa()
    expect(sql).toContain('public.injetavel_registrar_aplicacao')
    expect(sql).toContain('p_agendamento is null')
  })
})

// ATD-P03: eq-02 (revisão de 2026-11-02) — "a cliente DELA" é a de um
// agendamento com ela NÃO CANCELADO; a falta conta (`clienteAtendidaPor`).
describe('ATD-P03 — o "só os meus" do Prontuário pela regra única (o cancelado não conta)', () => {
  for (const pagina of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
    it(pagina, () => {
      const f = fonte(pagina)
      const i = f.indexOf('const canViewRecords')
      const trecho = f.slice(i, i + 300)
      expect(trecho).toContain("clienteNoEscopo(admin, ctx, 'medical_records', id)")
      expect(trecho).not.toContain('.some(')
    })
  }
  it('recusaDoAnexo', () => {
    const f = fonte('actions/client-documents.ts')
    const r = f.slice(f.indexOf('async function recusaDoAnexo'), f.indexOf('export async function uploadClientDocument'))
    expect(r).toContain("clienteNoEscopo(admin, ctx, 'medical_records', clientId)")
  })
  it('listarMapasDeInjetaveis', () => {
    expect(corpo('actions/injectable-map.ts', 'listarMapasDeInjetaveis')).toContain(".neq('clients.appointments.status', 'CANCELLED')")
  })
})

// ATD-P05: a ficha de saúde é prontuário — com "só os meus", só da cliente dela.
describe('ATD-P05 — salvarAnamneseGeral confere o "só os meus" do Prontuário', () => {
  it('pela regra única', () => {
    expect(corpo('actions/pre-atendimento.ts', 'salvarAnamneseGeral')).toContain("clienteNoEscopo(admin, ctx, 'medical_records', dados.data.clientId)")
  })
})

// ATD-P08: quem VÊ o prontuário vê a foto da ficha (a ficha lida na aba Prontuário).
describe('ATD-P08 — a foto da ficha se assina com o Prontuário em Ver', () => {
  it('signAnamnesisPhotos pede Ver e confere o "só os meus" pelo atendimento da foto', () => {
    const c = corpo('actions/anamnesis.ts', 'signAnamnesisPhotos')
    expect(c).toContain("assertPermission(ctx, 'medical_records', 'VIEW')")
    expect(c).not.toContain("assertPermission(ctx, 'medical_records', 'MANAGE')")
    expect(c).toContain('clienteNoEscopo(')
  })
})

// ATD-P09: CLAUDE.md §14 — "Tela nova que mostra dado clínico sem
// registrarAcessoAoProntuario": o mapa de injetáveis é clínico.
describe('ATD-P09 — abrir os mapas de injetáveis fica registrado', () => {
  for (const nome of ['getPlanejamentoInjetavel', 'listarPlanejamentosDoCliente', 'listarMapasDeInjetaveis']) {
    it(nome, () => {
      expect(corpo('actions/injectable-map.ts', nome)).toContain('registrarAcessoAoProntuario(ctx, ')
    })
  }
  it('o ponto existe (o rótulo e o banco)', () => {
    expect(fonte('lib/prontuario/acessos.ts')).toContain("injetaveis: 'Planejamento de injetáveis'")
    expect(migrationsDaFaixa()).toContain("'injetaveis'")
  })
})

// ATD-P10: a lista da cliente mostra só o planejamento que abre (`mapaAoAlcance`).
describe('ATD-P10 — listarPlanejamentosDoCliente recorta pela unidade ao alcance', () => {
  it('filtra por mapaAoAlcance', () => {
    expect(corpo('actions/injectable-map.ts', 'listarPlanejamentosDoCliente')).toContain('mapaAoAlcance(ctx, ')
  })
})

// ATD-E02: C24 — o mínimo não é negativo (como o adminUpdateMinStock).
describe('ATD-E02 — o mínimo do produto não é negativo no cadastro e na edição', () => {
  it('createProduct, updateProduct e o mínimo da unidade recusam', () => {
    const f = fonte('actions/stock.ts')
    expect(f.match(/if \(minStock < 0\) return \{ error: 'O mínimo não pode ser negativo\.' \}/g)?.length).toBe(3)
  })
})

// COP-02: copilot.md — "a sessão do atendimento iniciado e cancelado conta como feita".
describe('COP-02 — a lista de sessões do plano diz "feita" na desistência', () => {
  it('a situação da sessão usa a mesma regra da conta', () => {
    expect(fonte('lib/copilot/ferramentas/vendas.ts')).toContain("feitaNa(s.appointment_id) ? 'feita'")
  })
})

// COP-03: copilot.md — o "sem visita" é "sempre o da rede, também com a unidade pedida".
describe('COP-03 — o "sem visita" do Copilot diz que é da rede', () => {
  it('não devolve a unidade como se fosse o recorte', () => {
    const f = fonte('lib/copilot/ferramentas/clientes.ts')
    expect(f).not.toContain("unidade: u.unidade?.name ?? 'todas as unidades'")
    expect(f).toContain("recorte: 'a rede inteira")
  })
})

// IND-07: indicadores.md — nenhuma tela soma: o crédito interno vem do banco.
describe('IND-07 — o crédito interno do Copilot é o da ficha', () => {
  it('getCreditoInternoDoCliente, não a soma em JS', () => {
    const f = fonte('lib/copilot/ferramentas/clientes.ts')
    expect(f).toContain('getCreditoInternoDoCliente(')
    expect(f).not.toContain(".from('internal_credits')")
  })
})
