import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F70 — Clientes, do levantamento das regras.
 *
 * - C28: `cliente_por_telefone` e `fichas_do_telefone` (e o ramo de telefone
 *   de `importacao_cruzamento`) comparavam só os 8 últimos dígitos: o número
 *   de OUTRA cidade com os mesmos 8 finais era "a mesma ficha" — no webhook,
 *   no cadastro, no D11 e no Copilot. E o número sem o nono dígito (o do
 *   WhatsApp) não achava a ficha gravada com ele, e vice-versa. Agora é a
 *   regra única do telefone (`private.telefone_casa`), com o número inteiro.
 * - C29: a cliente que edita o próprio cadastro no portal (`updateClientSelf`)
 *   gravava qualquer coisa — telefone incompleto, e-mail sem "@" — e o erro
 *   cru do banco; e fora do núcleo, sem o "dados alterados".
 * - C31: o e-mail da aba Dados da ficha não era conferido.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const n8 = String(Date.now()).slice(-8)
// Gravada com a máscara e o nono dígito: (48) 9NNNN-NNNN.
const FONE = `(48) 9${n8.slice(0, 4)}-${n8.slice(4)}`
let rede: OutraRede | null = null
let ficha = ''
let cliente: ClienteDeTeste | null = null
let recepcao: MembroDeTeste | null = null

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`f70cli${marca}`)
  const { data, error } = await db().from('clients').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} Lúcia ${marca}`, phone: FONE,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  ficha = data!.id
  const { data: u } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  cliente = await clienteComSessao(`f70c${marca}`, { id: rede.branchId, slug: u!.slug }, { tenant: rede.tenantId })
  recepcao = await criarMembro(`f70r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => { await recepcao?.limpar(); await cliente?.limpar(); await rede?.limpar() })

test.describe('C28: o telefone acha a ficha pelo número inteiro', () => {
  const fichas = async (digitos: string) => {
    const { data, error } = await db().rpc('fichas_do_telefone', { p_tenant: rede!.tenantId, p_digitos: digitos })
    expect(error).toBeNull()
    return ((data ?? []) as { id: string }[]).map(f => f.id)
  }
  const porTelefone = async (digitos: string) => {
    const { data, error } = await db().rpc('cliente_por_telefone', { p_tenant: rede!.tenantId, p_digitos: digitos, p_sem_cpf: false })
    expect(error).toBeNull()
    return data as string | null
  }

  test('o mesmo número, com o 55 e sem o nono dígito, acha a ficha', async () => {
    expect(await fichas(`55489${n8}`)).toContain(ficha)
    expect(await fichas(`5548${n8}`), 'o do WhatsApp sem o nono dígito').toContain(ficha)
    expect(await porTelefone(`5548${n8}`)).toBe(ficha)
  })

  test('OUTRA cidade com os mesmos 8 finais não é a mesma ficha', async () => {
    expect(await fichas(`55119${n8}`)).not.toContain(ficha)
    expect(await porTelefone(`55119${n8}`)).toBeNull()
  })

  test('a importação também não cruza com outra cidade', async () => {
    const { data, error } = await db().rpc('importacao_cruzamento', {
      p_tenant: rede!.tenantId, p_destino: 'clientes',
      p_linhas: [{ numero: 1, fone: `55119${n8}`, fones: [`55119${n8}`] }, { numero: 2, fone: `5548${n8}`, fones: [`5548${n8}`] }],
    })
    expect(error).toBeNull()
    const achados = (data ?? []) as { numero: number; id: string }[]
    expect(achados.find(a => a.numero === 1), 'a de outra cidade não cruza').toBeUndefined()
    expect(achados.find(a => a.numero === 2)?.id, 'a sem o nono dígito cruza').toBe(ficha)
  })
})

test.describe('C29: a cliente edita o próprio cadastro pela mesma regra da ficha', () => {
  const perfil = () => `/${cliente!.slug}/cliente/perfil`
  const enviar = (browser: Browser, campos: Record<string, string>) => como(browser, cliente!.estado, p =>
    chamarAcaoComFormulario(p, 'actions/clients.ts', 'updateClientSelf', perfil(), [undefined], campos))
  const naFicha = async () => (await db().from('clients').select('phone, email').eq('id', cliente!.clientId)
    .single<{ phone: string; email: string }>()).data!

  test('o telefone incompleto e o e-mail sem "@" são recusados, e nada se grava', async ({ browser }) => {
    const antes = await naFicha()
    const curto = await enviar(browser, { phone: '(48) 99', email: antes.email })
    expect(curto.texto).toContain('Telefone incompleto')
    const semArroba = await enviar(browser, { phone: '(48) 99876-1234', email: 'nao-e-email' })
    expect(semArroba.texto).toContain('E-mail inválido')
    expect(await naFicha()).toEqual(antes)
  })

  test('o válido grava, e o "dados alterados" sai (o núcleo)', async ({ browser }) => {
    const antes = await naFicha()
    const r = await enviar(browser, { phone: `(48) 9${n8.slice(0, 4)}-${n8.slice(4, 7)}9`, email: antes.email, city: 'Floripa' })
    const depois = await naFicha()
    expect(depois.phone.replace(/\D/g, '')).toBe(`489${n8.slice(0, 7)}9`)
    const { count } = await db().from('domain_events').select('id', { count: 'exact', head: true })
      .eq('tenant_id', rede!.tenantId).eq('nome', 'cliente.dados_alterados').eq('entidade_id', cliente!.clientId)
    expect(count, 'o evento "dados alterados" da ficha').toBeGreaterThan(0)
  })
})

test('C31: o e-mail da aba Dados é conferido', async ({ browser }) => {
  const r = await como(browser, recepcao!.estado, p => chamarAcao(p, 'actions/clients.ts', 'updateClientContactData', `/admin/clients/${ficha}`,
    [ficha, { document: null, phone: FONE, email: 'sem-arroba', birthDate: null, zipCode: null, address: null, addressNumber: null,
      addressComplement: null, neighborhood: null, city: null, state: null }, '']))
  expect(r.texto).toContain('E-mail inválido')
  const { data } = await db().from('clients').select('email').eq('id', ficha).single<{ email: string | null }>()
  expect(data!.email).toBeNull()
})
