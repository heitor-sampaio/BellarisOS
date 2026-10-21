import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * A lista de clientes mostra o cadastrado JÁ na próxima tela.
 *
 * A simulação de um dia de clínica (2026-10-20): a recepção cadastrava e a
 * lista abria sem a cliente — só aparecia buscando pelo nome. A lista é cache
 * (`clients:<rede>`, 120 s), e quem cadastra o expirava com revalidateTag
 * 'max', que serve o valor VELHO mais uma vez (CLAUDE.md §14).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const NOME = `${PREFIXO} Cliente da lista ${marca}`

function cpfDeTeste(): string {
  const base = String(Date.now()).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const soma = nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`lc${marca}`)
  recepcao = await criarMembro(`lc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id, auth_id').eq('name', NOME)
  for (const c of (data ?? []) as { id: string; auth_id: string | null }[]) {
    if (c.auth_id) await db().auth.admin.deleteUser(c.auth_id)
  }
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('cadastrou, a lista já mostra — sem buscar', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try {
    const p = await ctx.newPage()
    // A lista aberta antes: é ela que deixa o cache quente.
    await p.goto('/admin/clients')
    await expect(p.getByText(NOME)).toHaveCount(0)

    await p.goto('/admin/clients/new')
    await p.locator('input[name="name"]').fill(NOME)
    await p.locator('input[name="phone"]').fill('48990001234')
    await p.locator('input[name="email"]').fill(`e2e-lc${marca}@bellaris.invalid`)
    await p.locator('input[name="document"]').fill(cpfDeTeste())
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect.poll(async () => (await db().from('clients').select('id').eq('name', NOME)).data?.length ?? 0,
      { message: 'o cadastro grava', timeout: 20_000 }).toBe(1)

    await p.goto('/admin/clients')
    await expect(p.getByText(NOME).first(), 'a lista nova, já na primeira tela').toBeVisible()
  } finally { await ctx.close() }
})
