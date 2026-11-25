import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O Copilot ao dar acesso à cliente segue a decisão do Heitor de 24/11 (R1 da
 * 27ª — "E-mail para criar a senha"): o documento recusado como senha pelo
 * sistema de login vira o e-mail para a cliente criar a senha. O núcleo
 * (`darAcessoAoCliente`, lib/clients/acesso.ts) já faz isso; a mensagem do
 * Copilot dizia "com acesso ao app" — a senha inicial do cartão, que não vale.
 * Agora diz o mesmo aviso da tela (`avisoDoAcessoCriado`).
 */

let resposta: Record<string, unknown> = { ok: true, contaLigada: false }

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/clients/acesso', () => ({
  darAcessoAoCliente: vi.fn(async () => resposta),
  documentoDoAcesso: () => null,
}))
vi.mock('@/lib/clients/cliente-rapido', () => ({
  garantirClienteRapido: vi.fn(async () => ({ clientId: 'cl1', criado: true })),
}))

const c = () => ({
  ctx: { tenantId: 't1', internalUserId: 'u1', userName: 'Bia (via Copilot)', permissions: { clients: 'MANAGE' } },
  admin: {}, pagina: '/admin/clients', slugDoPortal: null,
}) as never

const DOC = { tipo: 'PASSAPORTE' as const, numero: 'AB123' }

beforeEach(() => { resposta = { ok: true, contaLigada: false } })

describe('criar_acesso_ao_app: o documento recusado como senha', () => {
  it('diz que a cliente recebeu o e-mail para criar a senha', async () => {
    resposta = { ok: true, contaLigada: false, emailParaCriarSenha: 'enviado' }
    const { criarAcessoAoApp } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    const r = await criarAcessoAoApp.efetivar(c(), { clientId: 'cl1', email: 'sophie@x.com', documento: DOC }) as { mensagem: string }
    expect(r.mensagem).toContain('enviamos a ele o e-mail para criar a senha')
    expect(r.mensagem).not.toMatch(/senha inicial/)
  })

  it('o e-mail que não saiu: diz o caminho do "Esqueci a senha"', async () => {
    resposta = { ok: true, contaLigada: false, emailParaCriarSenha: 'falhou' }
    const { criarAcessoAoApp } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    const r = await criarAcessoAoApp.efetivar(c(), { clientId: 'cl1', email: 'sophie@x.com', documento: DOC }) as { mensagem: string }
    expect(r.mensagem).toContain('Esqueci a senha')
  })

  it('o de sempre continua', async () => {
    const { criarAcessoAoApp } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    const r = await criarAcessoAoApp.efetivar(c(), { clientId: 'cl1', email: 'sophie@x.com', documento: DOC }) as { mensagem: string }
    expect(r.mensagem).toBe('Acesso ao app criado.')
  })
})

describe('cadastrar_cliente com o acesso: o documento recusado como senha', () => {
  it('a ficha criada diz o e-mail para criar a senha', async () => {
    resposta = { ok: true, contaLigada: false, emailParaCriarSenha: 'enviado' }
    const { cadastrarCliente } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    const r = await cadastrarCliente.efetivar(c(), {
      nome: 'Sophie', telefone: '11999990000', branchId: 'b1', email: 'sophie@x.com', cpf: null, nascimento: null,
      estrangeiro: DOC, criarAcesso: true,
    }) as { mensagem: string }
    expect(r.mensagem).toMatch(/^Ficha de Sophie criada/)
    expect(r.mensagem).toContain('enviamos a ele o e-mail para criar a senha')
  })

  it('o cartão diz que, recusado o documento, vai o e-mail para criar a senha', async () => {
    const fonte = (await import('node:fs')).readFileSync(
      (await import('node:path')).join(__dirname, '..', 'lib', 'copilot', 'ferramentas', 'clientes-escrita.ts'), 'utf8')
    expect(fonte).toMatch(/const linhaDoAcesso[\s\S]{0,400}e-mail para criar a senha/)
  })
})
