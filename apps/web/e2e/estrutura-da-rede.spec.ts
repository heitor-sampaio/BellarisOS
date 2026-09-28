import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Cargos, fichas e unidades — as regras que nunca tinham teste.
 *
 *  - Cargo em uso não se apaga (a contagem que protege os membros); cargo sem
 *    uso sai; id de outra rede responde "não encontrado" em vez de derrubar a
 *    tela (`.single()` dentro de `ler` lançava — agora `maybeSingle`).
 *  - Ficha: editar, desativar, apagar. Apagar solta o procedimento que a usava
 *    (FK `on delete set null`); a de outra rede não é tocada.
 *  - Unidade de outra rede não se desativa.
 *
 * Nada aqui usa o cargo "Admin da rede" nem mexe no perfil da clínica: um
 * erro ali tiraria o acesso de gente de verdade.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  emUso: MembroDeTeste; cargoLivre: string
  ficha: string; procedimento: string
  outra: OutraRede; cargoAlheio: string; fichaAlheia: string
}
let f: Fx | null = null

test.beforeAll(async () => {
  const b = db()
  const tenant = await tenantId()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const schema = { rows: [{ id: 'r1', fields: [{ id: 'q1', type: 'text', label: 'Pergunta' }] }] }
  const outra = await criarOutraRede(`est${marca}`)
  const ficha = await ins('forms', { tenant_id: tenant, name: `${PREFIXO} Ficha ${marca}`, schema, is_active: true })
  f = {
    // O membro de teste nasce com um cargo próprio — em uso por ele.
    emUso: await criarMembro(`emuso${marca}`, { rotulo: 'Em uso', permissoes: [] }),
    cargoLivre: await ins('tenant_roles', { tenant_id: tenant, key: `E2E_LIVRE_${marca}`.toUpperCase(), label: `${PREFIXO} Cargo livre ${marca}` }),
    ficha,
    procedimento: await ins('procedures', { tenant_id: tenant, name: `${PREFIXO} Proc ficha ${marca}`, category: 'e2e', duration_min: 30, price: 10, form_id: ficha }),
    outra,
    cargoAlheio: await ins('tenant_roles', { tenant_id: outra.tenantId, key: `E2E_ALHEIO_${marca}`.toUpperCase(), label: `${PREFIXO} Cargo alheio ${marca}` }),
    fichaAlheia: await ins('forms', { tenant_id: outra.tenantId, name: `${PREFIXO} Ficha alheia ${marca}`, schema, is_active: true }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  await f.emUso.limpar()
  await b.from('role_permissions').delete().in('role_id', [f.cargoLivre, f.cargoAlheio])
  await b.from('tenant_roles').delete().in('id', [f.cargoLivre, f.cargoAlheio])
  await b.from('procedures').delete().eq('id', f.procedimento)
  await b.from('forms').delete().in('id', [f.ficha, f.fichaAlheia])
  await b.from('domain_events').delete().in('entidade_id', [f.ficha, f.cargoLivre, f.procedimento])
  await f.outra.limpar()
})

const existe = async (tabela: string, id: string) =>
  ((await db().from(tabela).select('id').eq('id', id)).data ?? []).length === 1

test.describe.serial('estrutura da rede', () => {
  test('cargos: em uso fica, livre sai, alheio responde sem derrubar a tela', async ({ page }) => {
    const apagar = (id: string) => chamarAcao(page, 'actions/roles.ts', 'deleteRole', '/admin/settings?tab=permissions', [id])

    await apagar(f!.emUso.roleId)
    expect(await existe('tenant_roles', f!.emUso.roleId), 'cargo em uso não sai').toBe(true)

    const alheio = await apagar(f!.cargoAlheio)
    expect(alheio.status, 'id alheio responde, não derruba').toBe(200)
    expect(await existe('tenant_roles', f!.cargoAlheio), 'cargo alheio intocado').toBe(true)

    await apagar(f!.cargoLivre)
    await expect.poll(() => existe('tenant_roles', f!.cargoLivre), { message: 'cargo livre sai (controle)' }).toBe(false)
  })

  test('fichas: editar e desativar; a alheia não é tocada', async ({ page }) => {
    const acao = (funcao: string, args: unknown[]) => chamarAcao(page, 'actions/fichas.ts', funcao, '/admin/settings?tab=fichas', args)
    const schema = { fields: [{ id: 'q1', type: 'text', label: 'Pergunta editada' }] }

    await acao('atualizarFicha', [{ id: f!.fichaAlheia, name: `${PREFIXO} invadida`, schema }])
    await acao('definirFichaAtiva', [f!.fichaAlheia, false])
    const { data: alheia } = await db().from('forms').select('name, is_active').eq('id', f!.fichaAlheia).single()
    expect(alheia).toEqual({ name: `${PREFIXO} Ficha alheia ${marca}`, is_active: true })

    await acao('atualizarFicha', [{ id: f!.ficha, name: `${PREFIXO} Ficha editada ${marca}`, schema }])
    await acao('definirFichaAtiva', [f!.ficha, false])
    await expect.poll(async () => (await db().from('forms').select('name, is_active').eq('id', f!.ficha).single()).data)
      .toEqual({ name: `${PREFIXO} Ficha editada ${marca}`, is_active: false })
  })

  test('fichas: apagar solta o procedimento que a usava; a alheia fica', async ({ page }) => {
    const apagar = (id: string) => chamarAcao(page, 'actions/fichas.ts', 'apagarFicha', '/admin/settings?tab=fichas', [id])
    await apagar(f!.fichaAlheia)
    expect(await existe('forms', f!.fichaAlheia), 'ficha alheia fica').toBe(true)

    await apagar(f!.ficha)
    await expect.poll(() => existe('forms', f!.ficha)).toBe(false)
    const { data } = await db().from('procedures').select('form_id').eq('id', f!.procedimento).single()
    expect(data!.form_id, 'o procedimento soltou a ficha').toBeNull()
  })

  test('caixa de WhatsApp: a unidade (rótulo) tem de ser da rede — garantido no banco', async () => {
    const b = db()
    const tenant = await tenantId()
    const caixa = (branchId: string) => b.from('whatsapp_numbers').insert({
      tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Caixa rótulo ${marca}`, is_active: false,
      branch_id: branchId, config: { token: `e2e-rotulo-${marca}-${branchId.slice(0, 4)}`, baseUrl: 'https://e2e.invalido' },
    }).select('id').single<{ id: string }>()

    const alheia = await caixa(f!.outra.branchId)
    expect(alheia.error?.code, 'unidade de outra rede é recusada pelo banco').toBe('23503')

    // Controle: unidade da rede entra; apagá-la solta a caixa, não a apaga.
    const { data: u } = await b.from('branches')
      .insert({ tenant_id: tenant, name: `${PREFIXO} Unidade rótulo ${marca}`, slug: `e2e-rot-${marca}`, is_active: false })
      .select('id').single<{ id: string }>()
    const propria = await caixa(u!.id)
    expect(propria.error).toBeNull()
    try {
      await b.from('branches').delete().eq('id', u!.id)
      const { data } = await b.from('whatsapp_numbers').select('branch_id, tenant_id').eq('id', propria.data!.id).single()
      expect(data).toEqual({ branch_id: null, tenant_id: tenant })
    } finally {
      await b.from('whatsapp_numbers').delete().eq('id', propria.data!.id)
      await b.from('branches').delete().eq('id', u!.id)
    }
  })

  test('unidades: a de outra rede não se desativa', async ({ page }) => {
    await chamarAcao(page, 'actions/branches.ts', 'toggleBranchStatus', '/admin/branches', [f!.outra.branchId, false])
    const { data } = await db().from('branches').select('is_active').eq('id', f!.outra.branchId).single()
    expect(data!.is_active).toBe(true)
  })
})
