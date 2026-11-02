import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * H5 (decisão do Heitor, 2026-11-01): "A cliente é da clínica, pode agendar em
 * qualquer unidade da clínica". A Marlene é cadastrada na Moinhos (A) e quer
 * ser atendida na Zona Sul (B).
 * - A62: o app deixa escolher a unidade, e os procedimentos, as profissionais e
 *   os horários vêm da escolhida; a URL da Zona Sul não volta à Moinhos.
 * - A65: o atendimento da Zona Sul diz que é da Zona Sul.
 * - por-05: o agendar do app passa pelo NÚCLEO da agenda (o evento de
 *   domínio "agendamento criado", que só o núcleo emite).
 * - A arquivada não agenda pelo app (o Heitor: "concordo"): "Fale com a
 *   clínica para agendar", e a action recusa.
 */

const marca = `ou${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slugA = ''
let unidadeB = ''
let slugB = ''
const nomeB = `${PREFIXO} Zona Sul ${marca}`
const nomeProc = `${PREFIXO} Drenagem ZS ${marca}`
let procB = ''
let profB: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null

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

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeB, slug: `e2e-zs-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB, 'criar a Zona Sul').toBeNull()
  unidadeB = b!.id; slugB = b!.slug

  // Um procedimento SÓ da Zona Sul, no app.
  const { data: pr, error: ePr } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, branch_id: unidadeB, name: nomeProc, category: 'e2e', duration_min: 30, price: 140, visible_on_client_app: true })
    .select('id').single<{ id: string }>()
  expect(ePr, 'criar o procedimento da Zona Sul').toBeNull()
  procB = pr!.id

  profB = await criarMembro(`p${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Esteticista ZS',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profB.userId)).error).toBeNull()

  cliente = await clienteComSessao(`c${marca}`, { id: rede.branchId, slug: slugA }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  const { data: ags } = await db().from('appointments').select('id').eq('client_id', cliente?.clientId ?? '')
  const ids = (ags ?? []).map(a => a.id as string)
  if (ids.length) {
    await db().from('domain_events').delete().in('entidade_id', ids)
    await db().from('appointment_history').delete().in('appointment_id', ids)
    await db().from('appointments').delete().in('id', ids)
  }
  await cliente?.limpar()
  await profB?.limpar()
  if (procB) await db().from('procedures').delete().eq('id', procB)
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await rede?.limpar()
})

test.describe.serial('a cliente agenda em outra unidade da clínica pelo app', () => {
  test('a URL da Zona Sul fica na Zona Sul (não volta à unidade de cadastro)', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slugB}/cliente/home`)
      await expect(p).toHaveURL(new RegExp(`/${slugB}/cliente/home$`))
      await expect(p.locator('header')).toContainText(nomeB)
    })
  })

  test('escolhe a Zona Sul no agendar e marca com quem atende lá', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slugA}/cliente/agendamentos/novo`)
      const unidades = p.getByRole('group', { name: 'Em qual unidade?' })
      await unidades.getByRole('link', { name: nomeB }).click()
      await expect(p).toHaveURL(new RegExp(`/${slugB}/cliente/agendamentos/novo$`))

      // O procedimento da Zona Sul aparece; a profissional é a de lá.
      const passo2 = p.getByText('Tem preferência de profissional?')
      await expect(async () => {
        if (!(await passo2.isVisible())) await p.getByRole('button', { name: nomeProc }).click({ timeout: 2000 })
        await expect(passo2).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30_000 })
      await p.getByRole('button', { name: /Esteticista ZS|Membro/ }).first().click()
      await p.getByLabel('Data').fill(dia(2))
      await p.getByRole('button', { name: '10:00', exact: true }).click()
      await expect(p.getByText(nomeB).last()).toBeVisible()
      await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(p).toHaveURL(new RegExp(`/${slugB}/cliente/agendamentos$`))
    })
    const { data: ag } = await db().from('appointments').select('id, branch_id, professional_id, source')
      .eq('client_id', cliente!.clientId).eq('procedure_id', procB).single()
    expect(ag?.branch_id).toBe(unidadeB)
    expect(ag?.professional_id).toBe(profB!.userId)
    expect(ag?.source).toBe('CLIENT_APP')

    // por-05: o núcleo da agenda emite o "agendamento criado" (o app não emitia).
    const { data: ev } = await db().from('domain_events').select('nome').eq('entidade_id', ag!.id)
    expect((ev ?? []).map(e => e.nome)).toContain('agendamento.criado')
  })

  test('A65: na agenda do app, o atendimento diz que é da Zona Sul', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slugA}/cliente/agendamentos`)
      const cartao = p.locator('a', { hasText: nomeProc }).first()
      await expect(cartao).toContainText(nomeB)
    })
  })

  test('a arquivada não agenda pelo app: "Fale com a clínica para agendar", e a action recusa', async ({ browser }) => {
    expect((await db().from('clients').update({ is_active: false }).eq('id', cliente!.clientId)).error).toBeNull()
    try {
      await como(browser, async p => {
        await p.goto(`/${slugB}/cliente/agendamentos/novo`)
        await expect(p.getByText('Fale com a clínica para agendar')).toBeVisible()
        await expect(p.getByRole('button', { name: nomeProc })).toHaveCount(0)

        const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slugB}/cliente/agendamentos/novo`, [{
          branchId: unidadeB, procedureId: procB, professionalId: profB!.userId,
          scheduledAt: new Date(`${dia(3)}T10:00:00-03:00`).toISOString(), slug: slugB,
        }])
        expect(r.texto).toContain('Fale com a clínica para agendar')
      })
      const { data } = await db().from('appointments').select('id').eq('client_id', cliente!.clientId)
        .eq('scheduled_at', new Date(`${dia(3)}T10:00:00-03:00`).toISOString())
      expect(data ?? []).toHaveLength(0)
    } finally {
      await db().from('clients').update({ is_active: true }).eq('id', cliente!.clientId)
    }
  })
})
