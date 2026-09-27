import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, tenantId, filiaisAtivas, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { dayKeyTZ, addDaysTZ } from '../lib/datetime'
import { ARQUIVO_DE_SESSAO } from '../playwright.config'

/**
 * O portal do cliente final, ponta a ponta — até 2026-09-27 nenhum teste
 * entrava nele como cliente.
 *
 * - agendar pela tela: só o que está ativo e marcado para o app aparece, e o
 *   agendamento nasce `CLIENT_APP`;
 * - a action recusa, chamada direto, o que a tela não oferece: procedimento
 *   oculto ou inativo, horário no passado, fora da grade ou já ocupado, e
 *   unidade de outra rede. Todos esses passavam até esta data;
 * - confirmar e avaliar o atendimento, e só o próprio;
 * - financeiro e histórico mostram o pagamento do plano (que não tem
 *   agendamento e ficava de fora), e não o de outro cliente;
 * - o perfil grava.
 *
 * O profissional é um membro `[e2e]`: o horário de teste não entra na agenda
 * de ninguém de verdade.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  unidade: { id: string; slug: string }
  prof: MembroDeTeste
  visivel: string; oculto: string; inativo: string
  cliente: ClienteDeTeste; outro: ClienteDeTeste
  outraRede: OutraRede
}
let f: Fx | null = null

/** Dia futuro, longe de qualquer agenda real, no fuso da clínica. */
const DIA = dayKeyTZ(addDaysTZ(new Date(), 45))
const instante = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString()

const agendamentosDo = async (clientId: string) =>
  (await db().from('appointments').select('id, scheduled_at, status, source, price, procedure_id')
    .eq('client_id', clientId).order('scheduled_at')).data ?? []

async function comoCliente(browser: Browser, c: ClienteDeTeste): Promise<{ page: Page; fechar: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: c.estado })
  return { page: await ctx.newPage(), fechar: () => ctx.close() }
}

test.describe.serial('portal do cliente', () => {
  test.beforeAll(async () => {
    const b = db()
    const tenant = await tenantId()
    const unidade = (await filiaisAtivas())[0]!
    const proc = async (rotulo: string, extra: Record<string, unknown>) => {
      const { data, error } = await b.from('procedures').insert({
        tenant_id: tenant, name: `${PREFIXO} ${rotulo} ${marca}`, category: 'e2e',
        duration_min: 30, price: 150, is_active: true, visible_on_client_app: true, ...extra,
      }).select('id').single<{ id: string }>()
      expect(error, `criar ${rotulo}`).toBeNull()
      return data!.id
    }
    const prof = await criarMembro(`prof${marca}`, { rotulo: 'Profissional do app', permissoes: [], branchId: unidade.id })
    await b.from('users').update({ provides_services: true }).eq('id', prof.userId)

    f = {
      unidade: { id: unidade.id, slug: unidade.slug },
      prof,
      visivel: await proc('Proc do app', {}),
      oculto:  await proc('Proc oculto', { visible_on_client_app: false }),
      inativo: await proc('Proc inativo', { is_active: false }),
      cliente: await clienteComSessao(`app${marca}`, unidade),
      outro:   await clienteComSessao(`app2${marca}`, unidade),
      outraRede: await criarOutraRede(`app${marca}`),
    }
    // Tudo na outra rede apto a atender pelo app — senão o caso "unidade de
    // outra rede" seria recusado pelo profissional, não pela rede.
    await b.from('procedures').update({ visible_on_client_app: true }).eq('id', f.outraRede.procedureId)
    await b.from('users').update({ branch_id: f.outraRede.branchId, provides_services: true, is_active: true }).eq('id', f.outraRede.professionalId)
  })

  test.afterAll(async ({ browser }) => {
    if (!f) return
    const b = db()
    // Desativar PELO APP invalida o cache da lista de profissionais que os
    // clientes de verdade veem — apagar direto no banco deixaria um
    // profissional fantasma nela por até 5 minutos.
    const admin = await browser.newContext({ storageState: ARQUIVO_DE_SESSAO })
    try {
      await chamarAcao(await admin.newPage(), 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [f.prof.userId, '/admin/team'])
    } finally {
      await admin.close()
    }
    await f.cliente.limpar()
    await f.outro.limpar()
    await f.outraRede.limpar()
    await b.from('domain_events').delete().in('entidade_id', [f.prof.userId, f.visivel, f.oculto, f.inativo])
    await b.from('procedures').delete().in('id', [f.visivel, f.oculto, f.inativo])
    await f.prof.limpar()
  })

  test('agenda pela tela: só o procedimento ativo e visível aparece, e nasce CLIENT_APP', async ({ browser, page: admin }) => {
    // O profissional acabou de nascer; reativá-lo pelo app invalida o cache
    // da lista (é o mesmo caminho da tela de equipe).
    await chamarAcao(admin, 'actions/team.ts', 'reactivateTeamMember', '/admin/team', [f!.prof.userId, '/admin/team'])

    const { page, fechar } = await comoCliente(browser, f!.cliente)
    try {
      await expect(async () => {
        await page.goto(`/${f!.unidade.slug}/cliente/agendamentos/novo`)
        await expect(page.getByRole('button', { name: new RegExp(`Proc do app ${marca}`) })).toBeVisible({ timeout: 3000 })
      }).toPass({ timeout: 30_000 })
      await expect(page.getByText(`Proc oculto ${marca}`)).toHaveCount(0)
      await expect(page.getByText(`Proc inativo ${marca}`)).toHaveCount(0)

      await page.getByRole('button', { name: new RegExp(`Proc do app ${marca}`) }).click()
      // A lista de profissionais é cacheada (5 min, `stale-while-revalidate`):
      // a primeira leitura depois de invalidar pode ainda vir velha.
      await expect(async () => {
        const botao = page.getByRole('button', { name: new RegExp(`Profissional do app prof${marca}`) })
        if (!(await botao.isVisible())) {
          await page.reload()
          await page.getByRole('button', { name: new RegExp(`Proc do app ${marca}`) }).click()
        }
        await expect(botao).toBeVisible({ timeout: 3000 })
      }).toPass({ timeout: 60_000 })
      await page.getByRole('button', { name: new RegExp(`Profissional do app prof${marca}`) }).click()

      await page.locator('input[type="date"]').fill(DIA)
      await page.getByRole('button', { name: '10:00', exact: true }).click()
      await page.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(page).toHaveURL(new RegExp(`/${f!.unidade.slug}/cliente/agendamentos$`))
    } finally {
      await fechar()
    }

    const ags = await agendamentosDo(f!.cliente.clientId)
    expect(ags).toHaveLength(1)
    expect(ags[0]).toMatchObject({ status: 'SCHEDULED', source: 'CLIENT_APP', procedure_id: f!.visivel, price: 150 })
    expect(new Date(ags[0]!.scheduled_at as string).toISOString()).toBe(instante(DIA, '10:00'))
  })

  test('a action recusa o que a tela não oferece', async ({ browser }) => {
    const { page, fechar } = await comoCliente(browser, f!.cliente)
    const rota = `/${f!.unidade.slug}/cliente/agendamentos/novo`
    const pedir = (sobre: Partial<{ branchId: string; procedureId: string; professionalId: string; scheduledAt: string }>) =>
      chamarAcao(page, 'actions/appointments.ts', 'createClientAppointment', rota, [{
        branchId: f!.unidade.id, procedureId: f!.visivel, professionalId: f!.prof.userId,
        scheduledAt: instante(DIA, '14:00'), slug: f!.unidade.slug, ...sobre,
      }])
    try {
      const antes = (await agendamentosDo(f!.cliente.clientId)).length
      const ontem = dayKeyTZ(addDaysTZ(new Date(), -1))
      const casos: [string, Parameters<typeof pedir>[0]][] = [
        ['procedimento oculto do app', { procedureId: f!.oculto }],
        ['procedimento inativo',       { procedureId: f!.inativo }],
        ['horário no passado',          { scheduledAt: instante(ontem, '14:00') }],
        ['madrugada, fora da grade',    { scheduledAt: instante(DIA, '03:00') }],
        ['fora da grade de 30 min',     { scheduledAt: instante(DIA, '14:10') }],
        ['horário já ocupado',          { scheduledAt: instante(DIA, '10:00') }],
        ['unidade de outra rede',       { branchId: f!.outraRede.branchId, procedureId: f!.outraRede.procedureId, professionalId: f!.outraRede.professionalId }],
      ]
      for (const [nome, sobre] of casos) {
        const n = (await agendamentosDo(f!.cliente.clientId)).length
        await pedir(sobre)
        expect.soft((await agendamentosDo(f!.cliente.clientId)).length, `${nome}: não cria`).toBe(n)
      }
      const naOutraRede = await db().from('appointments').select('id').eq('client_id', f!.cliente.clientId).eq('branch_id', f!.outraRede.branchId)
      expect(naOutraRede.data ?? []).toHaveLength(0)

      // Controle: um horário livre da grade, pela mesma chamada, cria.
      await pedir({ scheduledAt: instante(DIA, '14:00') })
      await expect.poll(async () => (await agendamentosDo(f!.cliente.clientId)).length).toBe(antes + 1)
    } finally {
      await fechar()
    }
  })

  test('confirma e avalia o próprio atendimento — uma vez, e só o seu', async ({ browser }) => {
    const [primeiro, segundo] = await agendamentosDo(f!.cliente.clientId)
    await db().from('appointments').update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
      .in('id', [primeiro!.id, segundo!.id])

    const { page, fechar } = await comoCliente(browser, f!.cliente)
    try {
      await page.goto(`/${f!.unidade.slug}/cliente/atendimentos/${primeiro!.id}/confirmar`)
      const estrelas = (grupo: string, n: number) =>
        page.getByText(grupo, { exact: true }).locator('xpath=..').getByRole('button', { name: `${n} estrela${n > 1 ? 's' : ''}` })
      await estrelas('Procedimento', 5).click()
      await estrelas('Profissional', 4).click()
      await page.getByPlaceholder('Conte como foi seu atendimento (opcional)').fill(`${PREFIXO} ótimo`)
      await page.getByRole('button', { name: 'Confirmar que realizei o atendimento' }).click()
      await expect(page).toHaveURL(new RegExp('/cliente/historico'))

      const { data } = await db().from('appointments')
        .select('client_confirmed_at, procedure_rating, client_rating, client_feedback').eq('id', primeiro!.id).single()
      expect(data).toMatchObject({ procedure_rating: 5, client_rating: 4, client_feedback: `${PREFIXO} ótimo` })
      expect(data!.client_confirmed_at).not.toBeNull()

      // De novo, pela action: não reescreve a avaliação.
      await chamarAcao(page, 'actions/appointments.ts', 'confirmAndRateAppointment', `/${f!.unidade.slug}/cliente/historico`,
        [{ appointmentId: primeiro!.id, slug: f!.unidade.slug, procedureRating: 1, professionalRating: 1, feedback: 'mudou' }])
      const { data: depois } = await db().from('appointments').select('procedure_rating, client_feedback').eq('id', primeiro!.id).single()
      expect(depois).toMatchObject({ procedure_rating: 5, client_feedback: `${PREFIXO} ótimo` })
    } finally {
      await fechar()
    }

    // Outro cliente, chamando com o id do atendimento alheio: nada muda.
    const outro = await comoCliente(browser, f!.outro)
    try {
      await outro.page.goto(`/${f!.unidade.slug}/cliente/atendimentos/${segundo!.id}/confirmar`)
      await expect(outro.page).toHaveURL(new RegExp('/cliente/historico'))
      await chamarAcao(outro.page, 'actions/appointments.ts', 'confirmAndRateAppointment', `/${f!.unidade.slug}/cliente/historico`,
        [{ appointmentId: segundo!.id, slug: f!.unidade.slug, procedureRating: 1 }])
      const { data } = await db().from('appointments').select('client_confirmed_at, procedure_rating').eq('id', segundo!.id).single()
      expect(data).toMatchObject({ client_confirmed_at: null, procedure_rating: null })
    } finally {
      await outro.fechar()
    }
  })

  test('financeiro e histórico mostram o pagamento do plano, e não o de outro cliente', async ({ browser }) => {
    const b = db()
    const lanca = async (clientId: string, descricao: string, valor: number) => {
      const { error } = await b.from('financial_transactions').insert({
        branch_id: f!.unidade.id, client_id: clientId, type: 'INCOME', category: 'Serviços',
        description: descricao, amount: valor, is_paid: true, paid_at: new Date().toISOString(),
        payment_method: 'PIX', created_by: 'e2e',
      })
      expect(error).toBeNull()
    }
    // Sem agendamento: é como o checkout de plano grava.
    await lanca(f!.cliente.clientId, `${PREFIXO} Plano do cliente ${marca}`, 321)
    await lanca(f!.outro.clientId, `${PREFIXO} Plano de OUTRO ${marca}`, 999)

    const { page, fechar } = await comoCliente(browser, f!.cliente)
    try {
      await page.goto(`/${f!.unidade.slug}/cliente/financeiro`)
      await expect(page.getByText(`${PREFIXO} Plano do cliente ${marca}`)).toBeVisible()
      await expect(page.getByText(`Plano de OUTRO ${marca}`)).toHaveCount(0)

      await page.goto(`/${f!.unidade.slug}/cliente/historico`)
      await page.getByRole('button', { name: /Pagamentos/ }).click()
      await expect(page.getByText(`${PREFIXO} Plano do cliente ${marca}`)).toBeVisible()
      await expect(page.getByText(`Plano de OUTRO ${marca}`)).toHaveCount(0)
    } finally {
      await fechar()
    }
  })

  test('o perfil grava o que o cliente edita', async ({ browser }) => {
    const { page, fechar } = await comoCliente(browser, f!.cliente)
    try {
      await page.goto(`/${f!.unidade.slug}/cliente/perfil`)
      await page.getByRole('button', { name: 'Editar' }).click()
      await page.locator('input[name="city"]').fill(`${PREFIXO} Cidade ${marca}`)
      await page.getByRole('button', { name: 'Salvar' }).click()
      await expect.poll(async () =>
        (await db().from('clients').select('city').eq('id', f!.cliente.clientId).single()).data?.city,
      ).toBe(`${PREFIXO} Cidade ${marca}`)
    } finally {
      await fechar()
    }
  })
})
