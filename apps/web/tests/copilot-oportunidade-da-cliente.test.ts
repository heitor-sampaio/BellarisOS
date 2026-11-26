import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * A oportunidade da cliente pelo Copilot é a da tela (CX-10: o Copilot grava o
 * que a tela gravaria; `docs/regras/crm-inbox.md` §9.2.1). Na 34ª simulação a
 * Francielle (CRM em Gerenciar, Clientes em Ver) pediu "uma oportunidade de
 * Pacote de drenagem para a Zilma Moura": a ferramenta só aceitava `nome` (a
 * pessoa) e um contato, não a ficha achada — e, em 6 tentativas, a oportunidade
 * e o contato nasceram com o nome "Pacote de drenagem".
 *
 * Agora `criar_oportunidade` aceita a CLIENTE (o id achado pela busca, o nome
 * ou o telefone): o nome, o telefone e o e-mail vêm da ficha, e a oportunidade
 * nasce ligada a ela (`leads.client_id`, como o "Sim, é a mesma pessoa" da
 * janela), pelo núcleo da tela (`criarOportunidadeCore`). O assunto não é o
 * nome da pessoa.
 */

const ZILMA = { id: '22222222-2222-4222-8222-222222222222', name: 'Zilma Moura', phone: '(62) 99876-5432' }
const nucleo = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/crm/oportunidade', async orig => ({
  ...(await orig<typeof import('@/lib/crm/oportunidade')>()),
  criarOportunidadeCore: nucleo,
}))
// O telefone da Zilma é dela: a janela perguntaria "É a mesma pessoa?".
vi.mock('@/lib/crm/ficha-do-telefone', () => ({ fichasDoTelefoneDoLead: async () => [{ id: ZILMA.id, nome: ZILMA.name }] }))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverCliente: async (_c: unknown, pedido: string) => (/zilma|2222/i.test(pedido) ? ZILMA : { erro: `Nenhum cliente com "${pedido}".` }),
}))

function admin() {
  const from = () => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'is', 'order', 'limit']) b[op] = () => b
    b.single = () => b
    b.maybeSingle = () => b
    b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: { ...ZILMA, email: 'zilma@exemplo.com', is_active: true }, error: null }).then(ok)
    return b
  }
  return { from }
}
function contexto(permissions: Partial<ResolvedPermissions>) {
  const ctx = {
    userId: 'auth', internalUserId: 'u1', userName: 'Francielle', tenantId: 't1', branchId: null, unidades: null,
    role: 'RECEPTIONIST', roleId: 'r1', clientId: null, reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...permissions } as ResolvedPermissions,
  } as unknown as TenantContext
  return { ctx, admin: admin(), pagina: '/admin/oportunidades', slugDoPortal: null } as never
}
type Preparado = { resumo: { linhas: { rotulo: string; valor: string }[]; aviso?: string; escolhas?: unknown[] }; payload: Record<string, unknown> }
const linha = (r: Preparado, rotulo: string) => r.resumo.linhas.find(l => l.rotulo === rotulo)?.valor

beforeEach(() => { nucleo.mockReset(); nucleo.mockResolvedValue({ leadId: 'l1', createdAt: '2026-11-26T12:00:00Z' }) })

describe('criar_oportunidade: a da cliente achada, com o nome e o contato da ficha', () => {
  it('a ferramenta aceita a cliente (o id da busca), e o telefone ou o e-mail não se pedem', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(criarOportunidade.parametros.safeParse({ cliente: ZILMA.id }).success).toBe(true)
    const r = await criarOportunidade.preparar(contexto({ crm: 'MANAGE', clients: 'VIEW' }), { cliente: ZILMA.id }) as unknown as Preparado
    expect(r).not.toHaveProperty('erro')
    expect(linha(r, 'Nome')).toBe('Zilma Moura')
    expect(r.payload).toMatchObject({ nome: 'Zilma Moura', email: 'zilma@exemplo.com', clientId: ZILMA.id })
    expect(String(r.payload.telefone)).toMatch(/62998765432$/)
    // A pessoa já disse quem é: o cartão não pergunta "É a mesma pessoa?".
    expect(r.resumo.escolhas).toBeUndefined()
  })

  it('o assunto que veio como nome não vira o nome da cliente', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await criarOportunidade.preparar(contexto({ crm: 'MANAGE', clients: 'VIEW' }), { cliente: 'Zilma Moura', nome: 'Pacote de drenagem' }) as unknown as Preparado
    expect(linha(r, 'Nome')).toBe('Zilma Moura')
    expect(r.payload.nome).toBe('Zilma Moura')
  })

  it('o Confirmar grava pelo núcleo da tela, ligada à ficha', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const c = contexto({ crm: 'MANAGE', clients: 'VIEW' })
    const r = await criarOportunidade.preparar(c, { cliente: ZILMA.id }) as unknown as Preparado
    await criarOportunidade.efetivar(c, r.payload as never)
    expect(nucleo).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      expect.objectContaining({ nome: 'Zilma Moura', email: 'zilma@exemplo.com' }), { clientId: ZILMA.id })
  })

  it('a descrição diz que o nome é o da pessoa e que a cliente vai em "cliente"', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(criarOportunidade.descricao).toMatch(/cliente/)
    expect(criarOportunidade.descricao).toMatch(/nunca o assunto/)
  })

  it('sem Clientes em Ver, a ficha não se procura pelo Copilot', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await criarOportunidade.preparar(contexto({ crm: 'MANAGE' }), { cliente: 'Zilma Moura' })
    expect(r).toHaveProperty('erro')
    expect(nucleo).not.toHaveBeenCalled()
  })

  it('sem a cliente, segue como a janela: nome e um contato', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(await criarOportunidade.preparar(contexto({ crm: 'MANAGE', clients: 'VIEW' }), { nome: 'Ana' })).toEqual({ erro: 'Qual o telefone ou o e-mail?' })
  })
})
