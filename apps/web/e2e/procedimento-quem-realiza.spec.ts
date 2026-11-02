import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * por-01 (revisão do Heitor, 2026-11-02): "já deveria ter um cadastro das
 * profissionais que podem realizar o procedimento. Isso já deve estar na hora
 * da criação de um procedimento e disponível também na edição".
 * - o cadastro do procedimento ganha "Quem realiza";
 * - o app (a escolha e o "Sem preferência") oferece só quem realiza, e a
 *   action recusa quem não realiza;
 * - a agenda da clínica AVISA quando a profissional escolhida não realiza;
 * - o repasse ao desativar (F5) oferece só quem realiza.
 * Sem ninguém marcado, valem todas as que atendem (o de antes).
 */

const marca = `qr${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let gestora: MembroDeTeste | null = null
let bia: MembroDeTeste | null = null
let cris: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
const nomeAna = `${PREFIXO} Ana ${marca}`
const nomeProc = `${PREFIXO} Proc ${marca}`
const criados: string[] = []

/** O n-ésimo dia ÚTIL a partir de amanhã (a grade padrão não abre no fim de semana). */
const dia = (n: number) => {
  const uteis: string[] = []
  for (let i = 1; uteis.length < n; i++) {
    const d = new Date(Date.now() + i * 86_400_000)
    const semana = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(d)
    if (semana !== 'Sat' && semana !== 'Sun') uteis.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d))
  }
  return uteis[n - 1]!
}

function devolvido(texto: string): unknown {
  // Em dev, o mesmo id tem linhas de depuração (`1:D…`): vale a que é JSON.
  for (const l of texto.split(/\r?\n/).filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ocupar(professionalId: string, quando: string): Promise<string> {
  const clientId = await rede!.criarCliente(`Ocupa ${quando}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(quando).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'ocupar o horário').toBeNull()
  criados.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true, name: nomeAna }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()

  gestora = await criarMembro(`g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'team', nivel: 'MANAGE' },
    ],
  })
  bia = await criarMembro(`b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  cris = await criarMembro(`c${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Cris', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  for (const m of [bia, cris]) expect((await db().from('users').update({ provides_services: true }).eq('id', m.userId)).error).toBeNull()
  cliente = await clienteComSessao(`k${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // A Ana tem MENOS atendimentos no dia(3): sem "Quem realiza", o "Sem preferência" iria para ela.
  await ocupar(bia.userId, `${dia(3)}T15:00:00-03:00`)
  await ocupar(cris.userId, `${dia(3)}T16:00:00-03:00`)
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (data ?? []).map(a => a.id as string)
    if (ids.length) {
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  await cliente?.limpar(); await cris?.limpar(); await bia?.limpar(); await gestora?.limpar(); await rede?.limpar()
})

test.describe.serial('quem realiza o procedimento', () => {
  test('o cadastro do procedimento marca quem realiza', async ({ browser }) => {
    await como(browser, gestora!.estado, async p => {
      await p.goto('/admin/procedures')
      await p.locator('tr', { hasText: nomeProc }).getByRole('button', { name: 'Editar' }).click()
      const grupo = p.locator('dialog[open]').getByRole('group', { name: 'Quem realiza' })
      await grupo.getByRole('button', { name: /Bia/ }).click()
      await grupo.getByRole('button', { name: /Cris/ }).click()
      await p.locator('dialog[open]').getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(p.locator('dialog[open]')).toHaveCount(0, { timeout: 15_000 })
    })
    const { data } = await db().from('procedure_professionals').select('user_id').eq('procedure_id', rede!.procedureId)
    expect((data ?? []).map(l => l.user_id).sort()).toEqual([bia!.userId, cris!.userId].sort())
  })

  test('o app oferece só quem realiza', async ({ browser }) => {
    await como(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/novo`)
      const passo2 = p.getByText('Tem preferência de profissional?')
      await expect(async () => {
        if (!(await passo2.isVisible())) await p.getByRole('button', { name: nomeProc }).click({ timeout: 2000 })
        await expect(passo2).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30_000 })
      await expect(p.getByRole('button', { name: /Bia/ })).toBeVisible()
      await expect(p.getByRole('button', { name: /Cris/ })).toBeVisible()
      await expect(p.getByRole('button', { name: new RegExp(`Ana ${marca}`) })).toHaveCount(0)
    })
  })

  test('a action recusa quem não realiza, e o "Sem preferência" escolhe entre quem realiza', async ({ browser }) => {
    await como(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/novo`)
      const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
        branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: rede!.professionalId,
        scheduledAt: new Date(`${dia(3)}T10:00:00-03:00`).toISOString(), slug,
      }])
      expect(r.texto).toContain('não realiza este procedimento')

      const r2 = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
        branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: null,
        scheduledAt: new Date(`${dia(3)}T10:00:00-03:00`).toISOString(), slug,
      }])
      expect(devolvido(r2.texto)).not.toHaveProperty('error')
    })
    const { data } = await db().from('appointments').select('professional_id').eq('client_id', cliente!.clientId)
      .eq('scheduled_at', new Date(`${dia(3)}T10:00:00-03:00`).toISOString())
    expect(data ?? []).toHaveLength(1)
    expect([bia!.userId, cris!.userId]).toContain(data![0]!.professional_id)
  })

  test('a agenda da clínica avisa quando a profissional escolhida não realiza', async ({ browser }) => {
    await como(browser, gestora!.estado, async p => {
      await p.goto(`/${slug}/agenda?date=${diaEmQueAUnidadeAbre(2)}`)
      await p.getByRole('button', { name: 'Agendar', exact: true }).click()
      const janela = p.locator('dialog[open]')
      await janela.getByLabel('Procedimento *').selectOption(rede!.procedureId)
      await janela.getByLabel('Profissional *').selectOption(rede!.professionalId)
      await expect(janela.locator('[data-aviso-quem-realiza]')).toContainText('não está em “Quem realiza”')
      await janela.getByLabel('Profissional *').selectOption(bia!.userId)
      await expect(janela.locator('[data-aviso-quem-realiza]')).toHaveCount(0)
    })
  })

  test('o repasse ao desativar oferece só quem realiza', async ({ browser }) => {
    const ag = await ocupar(cris!.userId, `${dia(4)}T10:00:00-03:00`)
    await como(browser, gestora!.estado, async p => {
      await p.goto('/admin/team')
      const r = await chamarAcao(p, 'actions/team.ts', 'pendenciasParaDesativar', '/admin/team', [cris!.userId])
      const pend = devolvido(r.texto) as { agendamentos: { id: string; livres: { id: string }[] }[] }
      const linha = pend.agendamentos.find(a => a.id === ag)!
      expect(linha.livres.map(l => l.id)).toContain(bia!.userId)
      expect(linha.livres.map(l => l.id)).not.toContain(rede!.professionalId)

      // E a action recusa repassar a quem não realiza.
      const r2 = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', '/admin/team',
        [cris!.userId, '/admin/team', { agendamentos: [{ id: ag, para: rede!.professionalId }], oportunidades: [] }])
      expect(r2.texto).toContain('não realiza')
    })
    const { data } = await db().from('appointments').select('professional_id').eq('id', ag).single()
    expect(data?.professional_id).toBe(cris!.userId)
  })
})
