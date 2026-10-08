import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { apagarAgendamentos, apagarClientes } from './apoio/limpeza'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'
import { docx, xlsx } from './apoio/zip'

/**
 * O que ficou de fora da primeira entrega do Copilot (a dívida, 2026-10-08):
 *  - o CHECK-IN ("a cliente chegou"), pelo mesmo núcleo da tela;
 *  - o ACESSO ao app do cliente (login = e-mail, senha inicial = CPF), no
 *    cadastro ou para quem já é cliente — sempre pelo cartão;
 *  - docx e xlsx lidos como texto (era "mande em PDF").
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let clienteId: string
const agendamentos: string[] = []

/** Um CPF válido a partir de 9 dígitos. */
function cpfDe(base: string): string {
  const d = base.split('').map(Number)
  const dig = (n: number) => { const s = d.slice(0, n).reduce((t, v, i) => t + v * (n + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  d.push(dig(9)); d.push(dig(10))
  return d.join('')
}
const numeroDe = (m: string) => String(parseInt(m, 36)).padStart(9, '7').slice(-9)

async function pedir(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Confira o cartão e confirme.' })
  const painel = await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`ext${marca}`)
  clienteId = await rede.outra.criarCliente('Extras Lia')
})
test.afterAll(async () => {
  const falhas = await apagarAgendamentos(agendamentos)
  const { data: clientes } = await db().from('clients').select('id, auth_id').eq('tenant_id', rede.outra.tenantId)
  for (const c of clientes ?? []) if (c.auth_id) await db().auth.admin.deleteUser(c.auth_id as string).catch(() => {})
  await apagarClientes((clientes ?? []).map(c => c.id as string).filter(id => id !== clienteId), falhas)
  await rede?.limpar()
  await falsa?.fechar()
  expect(falhas).toEqual([])
})

test('check-in pelo Copilot: o cartão, e o Confirmar marca a chegada com histórico "via Copilot"', async ({ browser }) => {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.outra.branchId, client_id: clienteId, procedure_id: rede.outra.procedureId, professional_id: rede.outra.professionalId,
    scheduled_at: new Date(Date.now() + 1800_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamentos.push(data!.id)
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const cartao = await pedir(p, 'fazer_check_in', { agendamento: data!.id })
    await expect(cartao.getByText('Check-in')).toBeVisible()
    expect((await db().from('appointments').select('status').eq('id', data!.id).single()).data!.status, 'nada antes do Confirmar').toBe('SCHEDULED')
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  expect((await db().from('appointments').select('status').eq('id', data!.id).single()).data!.status).toBe('CONFIRMED')
  const { data: h } = await db().from('appointment_history').select('action, changed_by_name').eq('appointment_id', data!.id)
  expect(h!.map(x => x.action)).toContain('CHECKIN')
  expect(h!.find(x => x.action === 'CHECKIN')!.changed_by_name).toContain('(via Copilot)')
})

test('cadastrar COM acesso ao app: o cartão diz o login, e o Confirmar cria a conta do cliente', async ({ browser }) => {
  const cpf = cpfDe(numeroDe(marca))
  const email = `e2e-acesso-${marca}@bellaris.invalid`
  const telefone = `48${numeroDe(marca)}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const cartao = await pedir(p, 'cadastrar_cliente', { nome: `${PREFIXO} Acesso ${marca}`, telefone, email, cpf, criar_acesso: true })
    await expect(cartao.getByText('Acesso ao app', { exact: true })).toBeVisible()
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const { data: c } = await db().from('clients').select('id, auth_id, email').eq('tenant_id', rede.outra.tenantId).eq('document', cpf).single()
  expect(c!.auth_id, 'o login nasceu e está ligado').toBeTruthy()
  const { data: u } = await db().auth.admin.getUserById(c!.auth_id as string)
  expect(u.user?.email).toBe(email)
  expect((u.user?.app_metadata as { client_id?: string })?.client_id, 'o acesso é do cliente').toBe(c!.id)
})

test('dar acesso a quem JÁ é cliente: pelo cartão, com o e-mail e o CPF', async ({ browser }) => {
  const cpf = cpfDe(numeroDe(`${marca}x`))
  const email = `e2e-acesso2-${marca}@bellaris.invalid`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const cartao = await pedir(p, 'criar_acesso_ao_app', { cliente: clienteId, email, cpf })
    await expect(cartao.getByText('Acesso ao app', { exact: true })).toBeVisible()
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const { data: c } = await db().from('clients').select('auth_id, email, document').eq('id', clienteId).single()
  expect([!!c!.auth_id, c!.email, c!.document]).toEqual([true, email, cpf])
})

test('docx e xlsx chegam ao modelo como TEXTO', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const postar = (campos: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) =>
      p.request.post('/api/copilot', { headers: { origin: process.env.E2E_BASE_URL! }, multipart: { pagina: '/admin/dashboard', ...campos } })
    const entrada = () => {
      const ultimo = falsa.respostas().at(-1)?.corpo.input?.at(-1) as { content?: { type: string; text?: string }[] }
      return (ultimo?.content ?? []).map(c => c.text ?? '').join('\n')
    }
    falsa.zerar(); falsa.roteiro.push({ texto: 'Li o documento.' })
    await (await postar({ texto: 'leia', anexos: { name: 'ficha.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx(['Ficha da Lia', 'Telefone: 48 98888-1234']) } })).text()
    expect(entrada()).toContain('Telefone: 48 98888-1234')
    falsa.zerar(); falsa.roteiro.push({ texto: 'Li a planilha.' })
    await (await postar({ texto: 'leia', anexos: { name: 'lista.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx([['Nome', 'Telefone'], ['Bia', '48977776666']]) } })).text()
    expect(entrada()).toContain('Bia;48977776666')
  })
})
