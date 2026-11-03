import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D10 da 5ª simulação (2026-11-01): um "Cadastrar cliente" criou duas fichas
 * "Valdir Duplicado", com 0,7 s de diferença. O botão só se desligava com o
 * `pending`, e `addClient` não tinha trava de reenvio.
 *
 * - O MESMO envio (a chave `_envio`, gerada pela tela) grava uma vez só, mesmo
 *   chegando duas vezes ao mesmo tempo; o segundo recebe a mesma ficha.
 * - Sem a chave (outro caminho, outra aba), as chegadas do mesmo nome com o
 *   mesmo telefone se ENFILEIRAM: a primeira grava, e as outras caem na
 *   pergunta "Já existe a ficha de X" (r2-cli-01, 2026-11-03 — era a trava
 *   calada dos 60 s, que devolvia a mesma ficha).
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const nome = (r: string) => `${PREFIXO} Uma vez ${r} ${marca}`
let seq = 0
const telefone = () => `(47) 9${String(Date.now()).slice(-4)}-${String(1000 + ++seq).slice(-4)}`

const fichasDe = async (n: string) => ((await db().from('clients').select('id, name, is_active')
  .eq('tenant_id', rede!.tenantId).eq('name', n)).data ?? []) as { id: string; name: string; is_active: boolean }[]

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const cadastrar = (p: Page, campos: Record<string, string>) => chamarAcaoComFormulario(
  p, 'actions/clients.ts', 'addClient', '/admin/clients/new', [undefined],
  { _branchId: rede!.branchId, _slug: 'admin', tags: '[]', email: '', document: '', document_type: 'CPF', birth_date: '', gender: '', notes: '', ...campos },
)
const idDa = (texto: string) => /"clientId":"([0-9a-f-]{36})"/.exec(texto)?.[1] ?? null

test.beforeAll(async () => {
  rede = await criarOutraRede(`uv${marca}`)
  recepcao = await criarMembro(`uv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id').eq('tenant_id', rede!.tenantId).like('name', `%Uma vez%${marca}`)
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('D10: o mesmo envio chegando duas vezes ao mesmo tempo grava UMA ficha, e os dois recebem a mesma', async ({ browser }) => {
  const n = nome('mesmo envio')
  const campos = { name: n, phone: telefone(), _envio: crypto.randomUUID() }
  await como(browser, async p => {
    await p.goto('/admin/clients/new')
    const [a, b] = await Promise.all([cadastrar(p, campos), cadastrar(p, campos)])
    expect(idDa(a.texto), a.texto.slice(0, 300)).not.toBeNull()
    expect(idDa(b.texto), b.texto.slice(0, 300)).toBe(idDa(a.texto))
    // E de novo, depois: a resposta guardada, sem gravar outra.
    const c = await cadastrar(p, campos)
    expect(idDa(c.texto)).toBe(idDa(a.texto))
  })
  expect((await fichasDe(n)).length).toBe(1)
})

test('D10: sem a chave, o mesmo nome e telefone ao mesmo tempo também viram uma ficha só — as outras chegadas perguntam', async ({ browser }) => {
  const n = nome('sem chave')
  const campos = { name: n, phone: telefone() }
  await como(browser, async p => {
    await p.goto('/admin/clients/new')
    const respostas = await Promise.all([cadastrar(p, campos), cadastrar(p, campos), cadastrar(p, campos)])
    const ids = new Set(respostas.map(r => idDa(r.texto)).filter(Boolean))
    expect(ids.size, respostas.map(r => r.texto.slice(0, 200)).join('\n')).toBe(1)
    expect(respostas.filter(r => r.texto.includes('"jaExiste"')), 'as outras duas perguntam').toHaveLength(2)
  })
  expect((await fichasDe(n)).length).toBe(1)
})

test('D10: um envio que volta com pergunta não prende a chave — respondido, grava', async ({ browser }) => {
  // A primeira ficha faz o segundo cadastro perguntar "Já existe a ficha de X" (r2-cli-01).
  const fone = telefone()
  const primeira = nome('primeira')
  const segunda = nome('segunda')
  const envio = crypto.randomUUID()
  await como(browser, async p => {
    await p.goto('/admin/clients/new')
    expect(idDa((await cadastrar(p, { name: primeira, phone: fone, _envio: crypto.randomUUID() })).texto)).not.toBeNull()
    const pergunta = await cadastrar(p, { name: segunda, phone: fone, _envio: envio })
    expect(pergunta.texto).toContain('"jaExiste"')
    const outra = (await fichasDe(primeira))[0]!.id
    const resposta = await cadastrar(p, { name: segunda, phone: fone, _envio: envio, _jaExiste: `cadastrar:${outra}` })
    expect(idDa(resposta.texto), resposta.texto.slice(0, 300)).not.toBeNull()
  })
  expect((await fichasDe(segunda)).length).toBe(1)
})
