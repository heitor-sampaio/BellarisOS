import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, totp, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O portal da plataforma (/suporte), fase 1 do suporte (2026-10-03).
 *
 * - quem é da plataforma vê todas as redes, e abrir uma fica registrado;
 * - plataforma e redes não se misturam: o atendente não entra no /admin nem
 *   na unidade, e o membro de rede não entra no /suporte;
 * - a verificação em duas etapas é OPÇÃO do admin do sistema (2026-10-06):
 *   desligada, quem não tem autenticador entra só com a senha; ligada, ou para
 *   quem cadastrou um, sem o código (aal2) o painel não abre, nem as actions;
 * - Equipe e Auditoria são só do admin da plataforma, e plano também;
 * - o cadastro do autenticador funciona pela tela (código calculado aqui).
 *
 * Numa rede `[e2e]` própria, com atendentes `[e2e]` criados pelo teste.
 */

test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
const SUP = () => urlDaPlataforma('suporte')
const SIS = () => urlDaPlataforma('sistema')

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  outra: OutraRede; membro: MembroDeTeste; desativado: MembroDeTeste
  suporte: AtendenteDeTeste; admin: AtendenteDeTeste; semMfa: AtendenteDeTeste; novo: AtendenteDeTeste; livre: AtendenteDeTeste
  nomeDaRede: string; slug: string
}
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[]; atendentes: AtendenteDeTeste[] } = { membros: [], atendentes: [] }

test.beforeAll(async () => {
  test.setTimeout(600_000)
  const outra = await criarOutraRede(`pl${marca}`)
  criado.outra = outra
  const membro = await criarMembro(`plm${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gerente', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  criado.membros.push(membro)
  const desativado = await criarMembro(`pld${marca}`, {
    tenant: outra.tenantId, rotulo: 'Desativado', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  criado.membros.push(desativado)
  expect((await db().from('users').update({ is_active: false }).eq('id', desativado.userId)).error).toBeNull()

  const atendente = async (chave: string, opcoes: Parameters<typeof criarAtendente>[1]) => {
    const a = await criarAtendente(`${chave}${marca}`, opcoes)
    criado.atendentes.push(a); return a
  }
  const suporte = await atendente('sup', { papel: 'SUPORTE' })
  const admin   = await atendente('adm', { papel: 'ADMIN' })
  const semMfa  = await atendente('aal1', { papel: 'SUPORTE', fatorSemCodigo: true })
  const livre   = await atendente('livre', { papel: 'SUPORTE', semVerificacao: true })
  const novo    = await atendente('novo', { papel: 'SUPORTE', semVerificacao: true })

  const { data: rede } = await db().from('tenants').select('name').eq('id', outra.tenantId).single<{ name: string }>()
  f = { outra, membro, desativado, suporte, admin, semMfa, novo, livre, nomeDaRede: rede!.name, slug: `e2e-un-pl${marca}` }
})

test.afterAll(async () => {
  for (const a of criado.atendentes) await a.limpar()
  for (const m of criado.membros) await m.limpar()
  if (criado.outra) {
    const { error } = await db().from('platform_audit_log').delete().eq('tenant_id', criado.outra.tenantId)
    expect(error).toBeNull()
    await criado.outra.limpar()
  }
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function registros(staffId: string, kind: string): Promise<number> {
  const { data, error } = await db().from('platform_audit_log').select('id')
    .eq('staff_id', staffId).eq('kind', kind).eq('tenant_id', f!.outra.tenantId)
  expect(error).toBeNull()
  return (data ?? []).length
}

test.describe.serial('portal da plataforma', () => {
  test('o atendente vê as redes, e abrir uma fica registrado', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      // A entrada do portal é a fila de chamados (fase 3); as redes, a aba ao lado.
      await p.goto(`${SUP()}/`)
      await expect(p).toHaveURL(`${SUP()}/chamados`)
      await p.getByRole('link', { name: 'Redes', exact: true }).click()
      await expect(p).toHaveURL(`${SUP()}/redes`)
      // As redes de teste só com o filtro ligado.
      await expect(p.getByRole('link', { name: f!.nomeDaRede })).toHaveCount(0)
      await p.goto(`${SUP()}/redes?teste=1`)
      await p.getByRole('link', { name: f!.nomeDaRede }).click()
      await expect(p).toHaveURL(`${SUP()}/redes/${f!.outra.tenantId}`)
      await expect(p.getByText(`Gerente plm${marca}`).first()).toBeVisible()
    })
    await expect.poll(() => registros(f!.suporte.staffId, 'rede.visualizada')).toBe(1)
  })

  // "O atendente não entra nos portais das redes" mora em plataforma-hosts.spec
  // desde 2026-10-06: a clínica é outro host, e lá a marca é recusada.

  test('o membro da rede não entra no suporte (o cookie dele é da clínica)', async ({ browser }) => {
    await comSessao(browser, f!.membro.estado, async p => {
      await p.goto(`${SUP()}/redes/${f!.outra.tenantId}`)
      await expect(p).toHaveURL(`${SUP()}/login`)
    })
  })

  test('com autenticador cadastrado e sem o código, nem o painel nem as actions', async ({ browser }) => {
    await comSessao(browser, f!.semMfa.estado, async p => {
      await p.goto(`${SUP()}/redes`)
      await expect(p).toHaveURL(`${SUP()}/verificacao`)
      // A action direta, com o mesmo login sem aal2: não reativa ninguém.
      await chamarAcao(p, 'actions/membros.ts', 'reativarMembroDaRede', `${SUP()}/redes/${f!.outra.tenantId}`,
        [f!.outra.tenantId, f!.desativado.userId])
    })
    const { data } = await db().from('users').select('is_active').eq('id', f!.desativado.userId).single<{ is_active: boolean }>()
    expect(data!.is_active).toBe(false)
    expect(await registros(f!.semMfa.staffId, 'membro.reativado')).toBe(0)
  })

  test('Equipe e Auditoria só para o admin da plataforma (moram no sistema, outro host)', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      await p.goto(`${SIS()}/equipe`)
      await expect(p).toHaveURL(`${SIS()}/login`)
      await p.goto(`${SIS()}/auditoria`)
      await expect(p).toHaveURL(`${SIS()}/login`)
    })
    await comSessao(browser, f!.admin.estado, async p => {
      await p.goto(`${SIS()}/equipe`)
      await expect(p.getByRole('heading', { name: 'Equipe da plataforma' })).toBeVisible()
      await p.goto(`${SIS()}/auditoria`)
      await expect(p.getByRole('heading', { name: 'Auditoria da plataforma' })).toBeVisible()
    })
  })

  test('o suporte reativa um membro pela tela; o plano é só do admin', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      await p.goto(`${SUP()}/redes/${f!.outra.tenantId}`)
      const linha = p.locator('tr', { hasText: `Desativado pld${marca}` })
      await linha.getByRole('button', { name: 'Reativar' }).click()
      await expect(p.getByText('Membro reativado.')).toBeVisible({ timeout: 15_000 })
      // O plano: o suporte não muda, nem pela action direta (ela é do sistema,
      // outro host — onde ele nem tem sessão).
      await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', `${SIS()}/redes/${f!.outra.tenantId}`,
        [f!.outra.tenantId, { planoId: null, valorCentavos: 100 }]).catch(() => null)
    })
    const { data: membro } = await db().from('users').select('is_active').eq('id', f!.desativado.userId).single<{ is_active: boolean }>()
    expect(membro!.is_active).toBe(true)
    expect(await registros(f!.suporte.staffId, 'membro.reativado')).toBe(1)
    expect((await db().from('tenant_subscriptions').select('tenant_id').eq('tenant_id', f!.outra.tenantId)).data ?? []).toHaveLength(0)

    await comSessao(browser, f!.admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', `${SIS()}/redes/${f!.outra.tenantId}`,
        [f!.outra.tenantId, { planoId: null, valorCentavos: 15900 }])
      expect(r.texto).toContain('"ok":true')
    })
    const { data: depois } = await db().from('tenant_subscriptions').select('valor_centavos').eq('tenant_id', f!.outra.tenantId)
      .single<{ valor_centavos: number }>()
    expect(depois!.valor_centavos).toBe(15900)
    expect(await registros(f!.admin.staffId, 'assinatura.alterada')).toBe(1)
  })

  test('cadastrar o autenticador pela tela abre o painel', async ({ browser }) => {
    await comSessao(browser, f!.novo.estado, async p => {
      // Quem quiser cadastra por vontade própria, mesmo com a opção desligada.
      await p.goto(`${SUP()}/verificacao`)
      await p.getByRole('button', { name: 'Cadastrar autenticador' }).click()
      const segredo = (await p.getByTestId('segredo-totp').textContent())?.trim() ?? ''
      expect(segredo.length).toBeGreaterThan(10)
      await p.getByLabel('Código de 6 dígitos').fill(totp(segredo))
      await p.getByRole('button', { name: 'Confirmar' }).click()
      await expect(p).toHaveURL(`${SUP()}/chamados`, { timeout: 20_000 })
    })
  })

  test('a verificação é OPÇÃO do admin do sistema: desligada entra só com a senha; ligada, pede o autenticador', async ({ browser }) => {
    // A opção é da plataforma inteira (platform_settings): o teste devolve o
    // valor de antes, aconteça o que acontecer.
    const { data: antes, error } = await db().from('platform_settings').select('exigir_verificacao').eq('id', 1)
      .single<{ exigir_verificacao: boolean }>()
    expect(error).toBeNull()
    const definir = async (ligada: boolean) => comSessao(browser, f!.admin.estado, async p => {
      await p.goto(`${SIS()}/configuracoes`)
      const caixa = p.getByLabel('Exigir a verificação em duas etapas de toda a equipe')
      await caixa.setChecked(ligada)
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Configurações salvas.')).toBeVisible({ timeout: 15_000 })
    })
    try {
      await definir(false)
      await comSessao(browser, f!.livre.estado, async p => {
        await p.goto(`${SUP()}/chamados`)
        await expect(p).toHaveURL(`${SUP()}/chamados`)
      })
      await definir(true)
      await comSessao(browser, f!.livre.estado, async p => {
        await p.goto(`${SUP()}/chamados`)
        await expect(p).toHaveURL(`${SUP()}/verificacao`)
      })
      const { data: log } = await db().from('platform_audit_log').select('dados')
        .eq('staff_id', f!.admin.staffId).eq('kind', 'plataforma.configurada')
      expect((log ?? []).map(l => (l.dados as { exigir_verificacao?: boolean }).exigir_verificacao)).toEqual(expect.arrayContaining([false, true]))
    } finally {
      const { error: eVolta } = await db().from('platform_settings').update({ exigir_verificacao: antes!.exigir_verificacao }).eq('id', 1)
      expect(eVolta).toBeNull()
    }
  })
})
