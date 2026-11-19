import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * CP1 — o bloco Copilot do plano de adaptação (docs/revisao.md): a gravação
 * que o Copilot faz entra na Auditoria em nome de QUEM PEDIU, com a marca
 * "pelo Copilot" (`ator_nome` "Nome (pelo Copilot)" e `via = 'copilot'`).
 *
 * A marca é o cabeçalho `x-bellaris-via: copilot`, que o cliente de serviço só
 * põe nas gravações do Confirmar do Copilot (`efetivarAcao`). O gatilho
 * `private.auditar` só o lê com a chave de SERVIÇO: pela sessão, o cabeçalho
 * forjado não vale — como o `x-bellaris-ator` (CF3b).
 */
test.setTimeout(240_000)
test.describe.configure({ mode: 'serial' })

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY!
const marca = Date.now().toString(36)
const db = () => banco()
let falsa: OpenaiFalsa | null = null
let rede: RedeDoCopilot
let nomeDoDono = ''
let authDoDono = ''
let ficha = ''

type Linha = { tabela: string; operacao: string; registro_id: string | null; ator_user_id: string | null; ator_nome: string; ator_tipo: string; via: string | null }
const linhasDe = async (tabela: string, registro: string) => {
  const { data, error } = await db().from('auditoria').select('*')
    .eq('tenant_id', rede.outra.tenantId).eq('tabela', tabela).eq('registro_id', registro).order('id')
  expect(error, error?.message).toBeNull()
  return ((data ?? []) as Linha[]).map(l => [l.operacao, l.ator_user_id, l.ator_nome, l.ator_tipo, l.via ?? null])
}

test.beforeAll(async () => {
  if (contraAFalsa()) falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`cp1${marca}`)
  const { data } = await db().from('users').select('name, auth_id').eq('id', rede.dono.userId).single<{ name: string; auth_id: string }>()
  nomeDoDono = data!.name; authDoDono = data!.auth_id
  ficha = await rede.outra.criarCliente('Bia')
})

test.afterAll(async () => {
  await rede?.limpar()
  await falsa?.fechar()
})

test('o Copilot cadastra a cliente: a Auditoria diz quem pediu, "pelo Copilot"', async ({ browser }) => {
  test.skip(!contraAFalsa(), 'o servidor precisa da OpenAI falsa (OPENAI_BASE_URL_TESTE)')
  const nome = `${PREFIXO} Cliente do Copilot ${marca}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/clients')
    falsa!.zerar()
    falsa!.roteiro.push({ chamar: [{ nome: 'cadastrar_cliente', args: { nome, telefone: '48 99987-' + String(Date.now()).slice(-4) } }] }, { texto: 'Confira o cartão.' })
    const painel = await falarComOCopilot(p, 'cadastre a cliente')
    await esperarResposta(p)
    const cartao = painel.locator('.copilot-cartao[data-cartao="acao"]').last()
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const { data: criada } = await db().from('clients').select('id').eq('tenant_id', rede.outra.tenantId).eq('name', nome).single<{ id: string }>()
  expect(criada, 'a ficha foi criada').not.toBeNull()
  await expect.poll(() => linhasDe('clients', criada!.id), { timeout: 15_000 })
    .toEqual([['criou', rede.dono.userId, `${nomeDoDono} (pelo Copilot)`, 'membro', 'copilot']])
})

test('pela chave de serviço, a marca vale com quem gravou', async () => {
  const r = await fetch(`${URL_}/rest/v1/clients?id=eq.${ficha}&select=id`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'content-type': 'application/json', Prefer: 'return=representation',
      'x-bellaris-ator': authDoDono, 'x-bellaris-via': 'copilot',
    },
    body: JSON.stringify({ is_active: false }),
  })
  expect(r.status, await r.clone().text()).toBe(200)
  expect((await linhasDe('clients', ficha)).at(-1)).toEqual(['editou', rede.dono.userId, `${nomeDoDono} (pelo Copilot)`, 'membro', 'copilot'])
})

// A ficha a sessão não grava mais (M1, o Heitor, 18/11): o agendamento, sim, e
// ele é auditado — é por ele que se prova que o cabeçalho forjado não marca.
test('pela sessão, o cabeçalho forjado não vale: sem a marca', async () => {
  const o = rede.outra
  const { data: ag, error: eA } = await db().from('appointments').insert({
    branch_id: o.branchId, client_id: ficha, professional_id: o.professionalId, procedure_id: o.procedureId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eA, eA?.message).toBeNull()
  const r = await fetch(`${URL_}/rest/v1/appointments?id=eq.${ag!.id}&select=id`, {
    method: 'PATCH',
    headers: {
      apikey: ANON, Authorization: `Bearer ${rede.dono.accessToken}`, 'content-type': 'application/json', Prefer: 'return=representation',
      'x-bellaris-via': 'copilot',
    },
    body: JSON.stringify({ price: 120 }),
  })
  expect(r.status, await r.clone().text()).toBe(200)
  expect(((await r.json()) as unknown[]).length, 'a sessão do dono alterou o agendamento').toBe(1)
  expect((await linhasDe('appointments', ag!.id)).at(-1)).toEqual(['editou', rede.dono.userId, nomeDoDono, 'membro', null])
})

test('valor que não é "copilot" não marca', async () => {
  const r = await fetch(`${URL_}/rest/v1/clients?id=eq.${ficha}&select=id`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'content-type': 'application/json', Prefer: 'return=representation',
      'x-bellaris-ator': authDoDono, 'x-bellaris-via': 'qualquer coisa',
    },
    body: JSON.stringify({ is_active: true }),
  })
  expect(r.status, await r.clone().text()).toBe(200)
  expect((await linhasDe('clients', ficha)).at(-1)).toEqual(['editou', rede.dono.userId, nomeDoDono, 'membro', null])
})
