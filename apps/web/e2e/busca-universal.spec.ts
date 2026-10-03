import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * A busca universal da topbar (2026-10-03).
 *
 * Um atalho para tudo — cliente, conversa, oportunidade, agendamento, equipe,
 * catálogo, páginas —, e a regra que importa: a busca NÃO abre exceção de
 * alcance. Quem não vê um registro na tela própria dele não o acha por aqui.
 * Por isso as recusas são provadas pela action direta (`buscarTudo`), não só
 * pela tela, sempre com o admin como controle.
 *
 * Numa rede `[e2e]` própria: nada aqui lê ou mexe na rede real.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const nomeDe = (o_que: string) => `${PREFIXO} ${o_que} ${marca}`
// O cliente de `criarCliente` leva a marca DA REDE (`bu…`), não a do spec.
const clienteDe = (o_que: string) => `${PREFIXO} ${o_que} bu${marca}`

interface Fx {
  outra:     OutraRede
  admin:     MembroDeTeste
  sdr:       MembroDeTeste
  agenda:    MembroDeTeste
  clienteId: string
  conversaVisivel: string
  leadLivre: string
}
let f: Fx | null = null
const criado: {
  outra?: OutraRede; membros: MembroDeTeste[]; cliente?: ClienteDeTeste
  agendamentos: string[]; leads: string[]
} = { membros: [], agendamentos: [], leads: [] }

test.beforeAll(async () => {
  test.setTimeout(240_000)
  const b = db()
  const outra = await criarOutraRede(`bu${marca}`)
  criado.outra = outra

  const membro = async (chave: string, permissoes: Parameters<typeof criarMembro>[1]['permissoes']) => {
    const m = await criarMembro(`bu${chave}${marca}`, { tenant: outra.tenantId, rotulo: `Busca ${chave}`, permissoes })
    criado.membros.push(m); return m
  }
  const admin = await membro('admin', [
    { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE' },
    { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'team', nivel: 'VIEW' },
    { modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'stock', nivel: 'VIEW' },
    { modulo: 'settings', nivel: 'MANAGE' },
  ])
  // Só o CRM, "só os meus": não vê cliente nenhum, nem a oportunidade de outro.
  const sdr = await membro('sdr', [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }])
  // Só a agenda, "só os meus": só os próprios horários.
  const agenda = await membro('agenda', [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }])

  // Cliente com acento no nome: a busca sem acento tem de achá-lo.
  const clienteId = await outra.criarCliente('João Buscável')

  // Duas conversas: uma de todo mundo, outra da pessoa que tem oportunidade
  // SÓ de outro dono — some do SDR no modo "pela pessoa" (o padrão).
  const agora = Date.now()
  const foneOculta = '5548' + String(agora).slice(-9)
  const conversa = (nome: string, fone: string) => ({
    tenant_id: outra.tenantId, channel: 'whatsapp', status: 'open', provider: 'uazapi',
    contact_name: nome, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
    last_message_at: new Date(agora).toISOString(), last_message: 'oi, tudo bem?', unread_count: 0,
  })
  const { data: convs, error: eC } = await b.from('conversations').insert([
    conversa(nomeDe('Conversa Buscável'), '5548' + String(agora + 1).slice(-9)),
    conversa(nomeDe('Conversa Oculta'), foneOculta),
  ]).select('id, contact_name')
  expect(eC, 'criar as conversas').toBeNull()
  const conversaVisivel = (convs ?? []).find(c => (c.contact_name as string).includes('Buscável'))!.id as string

  // Oportunidades: a do SDR, a sem dono e a de outro dono (a pessoa da
  // conversa oculta, pelo telefone — o gatilho liga pelo número).
  const { data: leads, error: eL } = await b.from('leads').insert([
    { tenant_id: outra.tenantId, name: nomeDe('Lead Meu'), owner_id: sdr.userId },
    { tenant_id: outra.tenantId, name: nomeDe('Lead Livre'), owner_id: null },
    { tenant_id: outra.tenantId, name: nomeDe('Lead Alheio'), owner_id: outra.professionalId, phone: foneOculta },
  ]).select('id, name')
  expect(eL, 'criar as oportunidades').toBeNull()
  criado.leads.push(...(leads ?? []).map(l => l.id as string))
  const leadLivre = (leads ?? []).find(l => (l.name as string).includes('Lead Livre'))!.id as string

  // Dois horários amanhã: um do membro da agenda, outro do profissional da rede.
  const amanha = new Date(agora + 24 * 3600_000).toISOString()
  const clienteMeu   = await outra.criarCliente('Cliente Meu Horário')
  const clienteOutro = await outra.criarCliente('Cliente Outro Horário')
  const horario = (client_id: string, professional_id: string) => ({
    branch_id: outra.branchId, client_id, procedure_id: outra.procedureId, professional_id,
    status: 'SCHEDULED', source: 'INTERNAL', scheduled_at: amanha, duration_min: 30, price: 0,
  })
  const { data: aps, error: eA } = await b.from('appointments').insert([
    horario(clienteMeu, agenda.userId), horario(clienteOutro, outra.professionalId),
  ]).select('id')
  expect(eA, 'criar os agendamentos').toBeNull()
  criado.agendamentos.push(...(aps ?? []).map(a => a.id as string))

  f = { outra, admin, sdr, agenda, clienteId, conversaVisivel, leadLivre }
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const t = criado.outra.tenantId
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }

  falhas.push(...(await apagarAgendamentos(criado.agendamentos)).map(x => `${x.o_que}: ${x.erro}`))
  olhar('desligar as conversas', await b.from('conversations').update({ lead_id: null }).eq('tenant_id', t))
  const { data: ls, error: eLs } = await b.from('leads').select('id').eq('tenant_id', t)
  if (eLs) falhas.push(`ler os leads: ${eLs.message}`)
  const leadIds = ((ls ?? []) as { id: string }[]).map(l => l.id)
  if (leadIds.length) {
    olhar('histórico', await b.from('lead_events').delete().in('lead_id', leadIds))
    olhar('leads', await b.from('leads').delete().in('id', leadIds))
  }
  const { data: cs, error: eCs } = await b.from('conversations').select('id').eq('tenant_id', t)
  if (eCs) falhas.push(`ler as conversas: ${eCs.message}`)
  await apagarConversas(((cs ?? []) as { id: string }[]).map(c => c.id))
  olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', t))
  if (criado.cliente) await criado.cliente.limpar()
  for (const m of criado.membros) await m.limpar()
  await criado.outra.limpar()
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: estado, ...(viewport ? { viewport } : {}) })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const campo = (p: Page) => p.getByRole('combobox', { name: 'Busca universal' })

/** A busca crua, pela action — o que o SERVIDOR devolve a esta pessoa. */
async function buscaDireta(p: Page, termo: string): Promise<string> {
  const r = await chamarAcao(p, 'actions/busca.ts', 'buscarTudo', '/admin/dashboard', [termo, null])
  return r.texto
}

test.describe.serial('busca universal', () => {
  test('Ctrl+K foca; acha o cliente sem acento e Enter abre a ficha', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(campo(p)).toBeVisible()
      await p.keyboard.press('Control+k')
      await expect(campo(p)).toBeFocused()

      // As palavras em qualquer ordem: "buscavel joao" acha "João Buscável".
      await campo(p).fill(`buscavel bu${marca} joao`)
      const opcao = p.getByRole('option', { name: new RegExp(`João Buscável bu${marca}`) })
      await expect(opcao).toBeVisible({ timeout: 15_000 })
      await campo(p).fill(`joao buscavel bu${marca}`)
      await expect(opcao).toBeVisible({ timeout: 15_000 })
      // O primeiro item já é o ativo: Enter o abre.
      await expect(p.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await campo(p).press('Enter')
      await expect(p).toHaveURL(new RegExp(`/admin/clients/${f!.clienteId}`), { timeout: 20_000 })
    })
  })

  test('páginas aparecem na hora, pelo nome ou pelo apelido; "/" também foca', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(campo(p)).toBeVisible()
      await p.keyboard.press('/')
      await expect(campo(p)).toBeFocused()
      await campo(p).fill('negocios')
      await expect(p.getByRole('option', { name: /Oportunidades/ })).toBeVisible()
      await campo(p).fill('configuracoes fidelidade')
      await p.getByRole('option', { name: /Configurações → Fidelidade/ }).click()
      await expect(p).toHaveURL(/\/admin\/settings\?tab=fidelidade/, { timeout: 20_000 })
    })
  })

  test('conversa abre no inbox; oportunidade abre o card no quadro', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      // O quadro nasce o funil padrão na primeira visita; a oportunidade vai
      // para a primeira etapa dele, para ter onde aparecer.
      await p.goto('/admin/oportunidades')
      await expect.poll(async () => {
        const { data } = await db().from('crm_stages').select('id').eq('tenant_id', f!.outra.tenantId)
        return (data ?? []).length
      }, { timeout: 20_000 }).toBeGreaterThan(0)
      const { data: etapa } = await db().from('crm_stages').select('id')
        .eq('tenant_id', f!.outra.tenantId).order('position').limit(1).single<{ id: string }>()
      expect((await db().from('leads').update({ crm_stage_id: etapa!.id }).eq('id', f!.leadLivre)).error).toBeNull()

      await campo(p).fill(`conversa buscavel ${marca}`)
      await p.getByRole('option', { name: new RegExp(`Conversa Buscável ${marca}`) }).click({ timeout: 15_000 })
      await expect(p).toHaveURL(new RegExp(`/admin/inbox\\?c=${f!.conversaVisivel}`), { timeout: 20_000 })

      // A busca do PRÓPRIO inbox acha o mesmo, sem acento: o banco e a guarda
      // do navegador (conversaCasaComBusca) comparam igual.
      await expect(p.locator('button.inbox-conversa').first()).toBeVisible({ timeout: 20_000 })
      await p.getByPlaceholder('Pesquisar…').fill(`conversa buscavel ${marca}`)
      await expect(p.locator('button.inbox-conversa')).toHaveCount(1, { timeout: 15_000 })
      await expect(p.locator('button.inbox-conversa').first()).toContainText(nomeDe('Conversa Buscável'))

      const abrirLead = async () => {
        await campo(p).fill(`lead livre ${marca}`)
        await p.getByRole('option', { name: new RegExp(`Lead Livre ${marca}`) }).click({ timeout: 15_000 })
        await expect(p).toHaveURL(/\/admin\/oportunidades/, { timeout: 20_000 })
        await expect(p.locator('dialog[open] input[name="name"]')).toHaveValue(nomeDe('Lead Livre'), { timeout: 20_000 })
      }
      await abrirLead()
      // Fechado o card, pedir o MESMO de novo pela busca o reabre (o quadro
      // não remonta; o pedido vem da URL).
      await p.keyboard.press('Escape')
      await expect(p.locator('dialog[open]')).toHaveCount(0)
      await abrirLead()
    })
  })

  test('CRM "só os meus": nem a oportunidade nem a conversa de outro dono; cliente nenhum', async ({ browser }) => {
    // Controle: o admin acha tudo.
    await comSessao(browser, f!.admin.estado, async p => {
      const tudo = await buscaDireta(p, marca)
      expect(tudo).toContain(nomeDe('Lead Meu'))
      expect(tudo).toContain(nomeDe('Lead Livre'))
      expect(tudo).toContain(nomeDe('Lead Alheio'))
      expect(tudo).toContain(nomeDe('Conversa Oculta'))
      expect(tudo).toContain(clienteDe('João Buscável'))
    })
    await comSessao(browser, f!.sdr.estado, async p => {
      const meu = await buscaDireta(p, marca)
      expect(meu).toContain(nomeDe('Lead Meu'))
      expect(meu).toContain(nomeDe('Lead Livre'))
      expect(meu).toContain(nomeDe('Conversa Buscável'))
      expect(meu).not.toContain(nomeDe('Lead Alheio'))
      expect(meu).not.toContain(nomeDe('Conversa Oculta'))
      // Sem o módulo de clientes, cliente nenhum — nem a agenda.
      expect(meu).not.toContain(clienteDe('João Buscável'))
      expect(meu).not.toContain(clienteDe('Cliente Outro Horário'))
    })
  })

  test('agenda "só os meus": só os próprios horários', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      const tudo = await buscaDireta(p, `horario bu${marca}`)
      expect(tudo).toContain(clienteDe('Cliente Meu Horário'))
      expect(tudo).toContain(clienteDe('Cliente Outro Horário'))
    })
    await comSessao(browser, f!.agenda.estado, async p => {
      const meu = await buscaDireta(p, `horario bu${marca}`)
      expect(meu).toContain(clienteDe('Cliente Meu Horário'))
      expect(meu).not.toContain(clienteDe('Cliente Outro Horário'))
      // O módulo de clientes ele não tem: o cliente não aparece como cliente.
      expect(meu).not.toContain(clienteDe('João Buscável'))
    })
  })

  test('no celular, a lupa abre a busca embaixo da topbar, dentro da tela', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      await p.goto('/admin/dashboard')
      // O campo do desktop some; fica a lupa.
      await expect(campo(p)).toHaveCount(0)
      await p.getByRole('button', { name: 'Buscar', exact: true }).click()
      const sobre = p.locator('.busca-sobreposicao')
      await expect(sobre).toBeVisible()
      await expect(campo(p)).toBeFocused()

      const topbar = await p.locator('header').first().boundingBox()
      const caixa  = await sobre.boundingBox()
      expect(caixa!.y, 'começa embaixo da topbar').toBeGreaterThanOrEqual(topbar!.y + topbar!.height - 1)
      expect(caixa!.x).toBeGreaterThanOrEqual(0)
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390 + 0.5)
      expect(caixa!.y + caixa!.height).toBeLessThanOrEqual(844 + 0.5)

      await campo(p).fill(`joao buscavel bu${marca}`)
      await p.getByRole('option', { name: new RegExp(`João Buscável bu${marca}`) }).click({ timeout: 15_000 })
      await expect(p).toHaveURL(new RegExp(`/admin/clients/${f!.clienteId}`), { timeout: 20_000 })
      await expect(sobre).toHaveCount(0)
    }, { width: 390, height: 844 })
  })

  test('o cliente final não usa a busca da equipe', async ({ browser }) => {
    const unidade = { id: f!.outra.branchId, slug: `e2e-un-bu${marca}` }
    criado.cliente = await clienteComSessao(`bu${marca}`, unidade, { tenant: f!.outra.tenantId })
    await comSessao(browser, criado.cliente.estado, async p => {
      const texto = await buscaDireta(p, marca)
      // A recusa em POSITIVO: só "não veio nada" passaria também com a action
      // calada. O `semAcesso()` chega com o digest fixo.
      expect(texto).toContain('BELLARIS_SEM_ACESSO')
      expect(texto).not.toContain(clienteDe('João Buscável'))
      expect(texto).not.toContain(nomeDe('Lead Livre'))
      expect(texto).not.toContain(nomeDe('Conversa Buscável'))
    })
  })
})
