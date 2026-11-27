import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'

/**
 * D4 da 38ª simulação (crm-inbox:CL-14, IN-06; princípio 3 — uma pessoa, um
 * dado): cadastrar a cliente pela conversa ("Cadastrar como cliente" do
 * painel do inbox) deixava o CONTATO com o nome do WhatsApp ("Lena ✨") e o
 * outro e-mail, com a ficha "Helena Zanella": a conversa seguia "Lena ✨", e a
 * busca pelo nome da ficha não a achava. Quem cadastra pela conversa já disse
 * quem é (não há a pergunta "É a mesma pessoa?"), e o efeito é o do "Sim": o
 * contato recebe o nome e o e-mail da ficha — o nome também nas conversas e
 * nas oportunidades dela (`propagarDadosDaPessoa`, como a ficha renomeada).
 * Nunca o contato que já é de outra ficha.
 */

type Resultado = { data: unknown; error: { message: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }

const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: null, error: null })

function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'update', 'insert', 'eq', 'is', 'in', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(responder(p)).then(ok, falhou)
  return b
}

const propagar = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('@/lib/contatos/propagar', () => ({ propagarDadosDaPessoa: (...a: unknown[]) => propagar(...a) }))

const ctx = { tenantId: 't', internalUserId: 'u', userName: 'Kamila' } as TenantContext
const admin = { from: construtor } as never

function banco(contato: { client_id: string | null; name: string; email: string | null }, ficha: { name: string; email: string | null }) {
  responder = p => {
    const lendo = p.ops.some(o => o.op === 'maybeSingle')
    if (p.tabela === 'conversations' && lendo) return { data: { contato_id: 'k1' }, error: null }
    if (p.tabela === 'contacts' && lendo) return { data: contato, error: null }
    if (p.tabela === 'clients' && lendo) return { data: ficha, error: null }
    return { data: null, error: null }
  }
}

const updatesDoContato = () => pedidos
  .filter(p => p.tabela === 'contacts' && p.ops.some(o => o.op === 'update'))
  .map(p => p.ops.find(o => o.op === 'update')!.args[0] as Record<string, unknown>)

beforeEach(() => { pedidos.length = 0; propagar.mockReset() })

describe('D4: o cadastro pela conversa leva o nome e o e-mail da ficha ao contato', () => {
  it('o contato "Lena ✨" passa a ser Helena Zanella, com o e-mail da ficha', async () => {
    banco({ client_id: 'c1', name: 'Lena ✨', email: 'lena@outro.com' }, { name: 'Helena Zanella', email: 'helena@exemplo.com' })
    const { levarAFichaAoContato } = await import('@/lib/contatos/ficha-no-contato')
    await levarAFichaAoContato(admin, ctx, { conversationId: 'conv1' }, 'c1')
    expect(updatesDoContato().some(u => u.email === 'helena@exemplo.com')).toBe(true)
    expect(propagar).toHaveBeenCalledWith(admin, ctx, 'k1', { nome: 'Helena Zanella' })
  })

  it('a ficha sem e-mail não apaga o do contato', async () => {
    banco({ client_id: null, name: 'Lena ✨', email: 'lena@outro.com' }, { name: 'Helena Zanella', email: null })
    const { levarAFichaAoContato } = await import('@/lib/contatos/ficha-no-contato')
    await levarAFichaAoContato(admin, ctx, { conversationId: 'conv1' }, 'c1')
    expect(updatesDoContato().some(u => 'email' in u)).toBe(false)
    expect(propagar).toHaveBeenCalledWith(admin, ctx, 'k1', { nome: 'Helena Zanella' })
  })

  it('o mesmo nome não regrava nada nas oportunidades', async () => {
    banco({ client_id: 'c1', name: 'Helena Zanella', email: 'helena@exemplo.com' }, { name: 'Helena Zanella', email: 'helena@exemplo.com' })
    const { levarAFichaAoContato } = await import('@/lib/contatos/ficha-no-contato')
    await levarAFichaAoContato(admin, ctx, { conversationId: 'conv1' }, 'c1')
    expect(propagar).not.toHaveBeenCalled()
    expect(updatesDoContato().some(u => 'email' in u)).toBe(false)
  })

  it('pelo card do quadro (sem conversa), o contato da oportunidade', async () => {
    banco({ client_id: 'c1', name: 'Lena ✨', email: null }, { name: 'Helena Zanella', email: 'helena@exemplo.com' })
    const base = responder
    responder = p => (p.tabela === 'leads' && p.ops.some(o => o.op === 'maybeSingle')) ? { data: { contato_id: 'k1' }, error: null } : base(p)
    const { levarAFichaAoContato } = await import('@/lib/contatos/ficha-no-contato')
    await levarAFichaAoContato(admin, ctx, { leadId: 'l1' }, 'c1')
    expect(pedidos.some(p => p.tabela === 'conversations')).toBe(false)
    expect(updatesDoContato().some(u => u.email === 'helena@exemplo.com')).toBe(true)
    expect(propagar).toHaveBeenCalledWith(admin, ctx, 'k1', { nome: 'Helena Zanella' })
  })

  it('o contato que já é de OUTRA ficha não muda', async () => {
    banco({ client_id: 'outra', name: 'Lena ✨', email: 'lena@outro.com' }, { name: 'Helena Zanella', email: 'helena@exemplo.com' })
    const { levarAFichaAoContato } = await import('@/lib/contatos/ficha-no-contato')
    await levarAFichaAoContato(admin, ctx, { conversationId: 'conv1' }, 'c1')
    expect(propagar).not.toHaveBeenCalled()
    expect(updatesDoContato()).toEqual([])
  })

  it('o cadastro (a ficha nova, o Unificar e o Reativar) chama pela conversa e pelo card', () => {
    const f = readFileSync(join(__dirname, '..', 'actions', 'clients.ts'), 'utf8')
    const novo = f.slice(f.indexOf('async function addClientInterno'), f.indexOf('type RespostasDoTelefone'))
    expect(novo).toMatch(/levarAFichaAoContato\(admin, ctx, \{ conversationId \}, client\.id as string\)/)
    expect(novo).toMatch(/if \(leadId && !conversationId\) await levarAFichaAoContato\(admin, ctx, \{ leadId \}, client\.id as string\)/)
    // O Unificar termina no reativarPeloCadastro, que liga a conversa à ficha que existe.
    const reativar = f.slice(f.indexOf('async function reativarPeloCadastro'))
    expect(reativar).toMatch(/levarAFichaAoContato\(admin, ctx, \{ conversationId: de\.conversationId \}, clientId\)/)
    expect(reativar).toMatch(/if \(!de\.conversationId\) await levarAFichaAoContato\(admin, ctx, \{ leadId: de\.leadId \}, clientId\)/)
  })
  it('o "Agendar" do painel da conversa (a ficha rápida) também leva a ficha ao contato, nos três caminhos', () => {
    const f = readFileSync(join(__dirname, '..', 'lib', 'clients', 'cliente-rapido.ts'), 'utf8')
    const corpo = f.slice(f.indexOf('export async function garantirClienteRapido'), f.indexOf('export async function clienteRapidoDoTelefone'))
    expect(corpo).not.toMatch(/ligarContatoAoCliente\(/)
    expect(corpo.match(/ligarFichaAConversa\(admin, ctx, input\.conversationId, /g)?.length).toBe(3)
    expect(f).toMatch(/async function ligarFichaAConversa[\s\S]*?levarAFichaAoContato\(admin, ctx, \{ conversationId \}, clientId\)/)
  })
})
