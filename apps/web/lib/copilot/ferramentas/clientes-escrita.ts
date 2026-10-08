import 'server-only'
import { z } from 'zod/v4'
import { revalidateTag } from 'next/cache'
import { ler } from '@/lib/db'
import { atualizarClienteCore } from '@/lib/clients/atualizar'
import { darAcessoAoCliente } from '@/lib/clients/acesso'
import { garantirClienteRapido, digitosDoTelefone } from '@/lib/clients/cliente-rapido'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import { DATA, hojeEmBrasilia, resolverCliente, resolverUnidade, rota } from '@/lib/copilot/ferramentas/comum'

/**
 * As GRAVAÇÕES de clientes.
 *
 * Decisão de 2026-10-08: o Copilot cadastra pelo caminho RÁPIDO (o mesmo do
 * agendar e do inbox: `garantirClienteRapido`, nome + telefone) e completa
 * e-mail, CPF e nascimento quando a pessoa der. O ACESSO ao app (login =
 * e-mail, senha inicial = CPF) também, quando pedido (a dívida da primeira
 * entrega, 2026-10-08): no cadastro (`criar_acesso`) ou para quem já é cliente
 * (`criar_acesso_ao_app`), sempre pelo cartão e pelo núcleo da tela
 * (`lib/clients/acesso.ts`).
 */

function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dig = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10])
}

const EMAIL = z.string().max(160).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'e-mail inválido')

interface Complemento { email?: string; cpf?: string; nascimento?: string }

/** Confere CPF (dígitos e duplicidade na rede) e e-mail. Devolve o erro, ou null. */
async function conferirComplemento(c: ContextoDaFerramenta, x: Complemento, clienteId?: string): Promise<string | null> {
  if (x.cpf) {
    if (!cpfValido(x.cpf)) return 'CPF inválido.'
    let q = c.admin.from('clients').select('id, name').eq('tenant_id', c.ctx.tenantId!).eq('document', x.cpf.replace(/\D/g, ''))
    if (clienteId) q = q.neq('id', clienteId)
    const dup = await ler(q.maybeSingle(), 'conferir o CPF') as { id: string; name: string } | null
    if (dup) return `CPF já cadastrado para ${dup.name}.`
  }
  if (x.email) {
    // Único na rede (o login do portal, criado depois pela tela, é o e-mail).
    let q = c.admin.from('clients').select('id, name').eq('tenant_id', c.ctx.tenantId!).ilike('email', x.email.trim())
    if (clienteId) q = q.neq('id', clienteId)
    const dup = await ler(q.limit(1), 'conferir o e-mail') as { id: string; name: string }[] | null
    if (dup?.length) return `E-mail já cadastrado para ${dup[0]!.name}.`
  }
  if (x.nascimento && (x.nascimento > hojeEmBrasilia() || x.nascimento < '1900-01-01')) return 'Data de nascimento inválida.'
  return null
}

const emailNormalizado = (e?: string) => e?.trim().toLowerCase() || null

function linhasDoComplemento(x: Complemento) {
  return [
    ...(x.email ? [{ rotulo: 'E-mail', valor: x.email }] : []),
    ...(x.cpf ? [{ rotulo: 'CPF', valor: x.cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') }] : []),
    ...(x.nascimento ? [{ rotulo: 'Nascimento', valor: x.nascimento.split('-').reverse().join('/') }] : []),
  ]
}

interface ArgsCadastro { nome: string; telefone: string; email?: string; cpf?: string; nascimento?: string; unidade?: string; criar_acesso?: boolean }
interface PayloadCadastro { nome: string; telefone: string; branchId: string; email: string | null; cpf: string | null; nascimento: string | null; criarAcesso?: boolean }

const linhaDoAcesso = (email: string) => ({ rotulo: 'Acesso ao app', valor: `login ${email}, senha inicial = o CPF` })

export const cadastrarCliente: FerramentaDeEscrita<ArgsCadastro, PayloadCadastro> = {
  nome: 'cadastrar_cliente',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Cadastra um cliente novo: nome e telefone com DDD (obrigatórios); e-mail, CPF e data de nascimento (AAAA-MM-DD) se a pessoa der. Com criar_acesso, também cria o acesso ao app do cliente (precisa de e-mail e CPF; a senha inicial é o CPF). Se o telefone já for de um cliente, diz quem é em vez de duplicar.',
  parametros: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(10).max(20),
    email: EMAIL.optional(),
    cpf: z.string().max(20).optional(),
    nascimento: DATA.optional(),
    unidade: z.string().max(80).optional(),
    criar_acesso: z.boolean().optional(),
  }),
  async preparar(c, a) {
    if (a.criar_acesso && (!a.email || !a.cpf)) return { erro: 'Para criar o acesso ao app, preciso do e-mail e do CPF do cliente.' }
    const telefone = digitosDoTelefone(a.telefone)
    if (telefone.length < 10) return { erro: 'Informe o telefone com DDD.' }
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const { data: existente, error } = await c.admin.rpc('cliente_por_telefone', { p_tenant: c.ctx.tenantId!, p_digitos: telefone })
    if (error) return { erro: 'Não consegui conferir o telefone agora.' }
    if (existente) {
      const ja = await ler(c.admin.from('clients').select('id, name').eq('id', existente as string).single(), 'ler o cliente') as { id: string; name: string }
      return { erro: `Esse telefone já é de ${ja.name} (id ${ja.id}, ${rota(c, `/clients/${ja.id}`)}). Não cadastrei de novo.` }
    }
    const recusa = await conferirComplemento(c, a)
    if (recusa) return { erro: recusa }
    return {
      resumo: {
        titulo: 'Cadastrar cliente',
        linhas: [
          { rotulo: 'Nome', valor: a.nome.trim() },
          { rotulo: 'Telefone', valor: telefone },
          ...linhasDoComplemento(a),
          { rotulo: 'Unidade', valor: u.unidade!.name },
          ...(a.criar_acesso ? [linhaDoAcesso(emailNormalizado(a.email)!)] : []),
        ],
      },
      payload: {
        nome: a.nome.trim(), telefone, branchId: u.unidade!.id,
        email: emailNormalizado(a.email), cpf: a.cpf?.replace(/\D/g, '') || null, nascimento: a.nascimento ?? null,
        ...(a.criar_acesso ? { criarAcesso: true } : {}),
      },
    }
  },
  async efetivar(c, p) {
    // Num insert só: e-mail, CPF e nascimento entram junto (sem update depois).
    const r = await garantirClienteRapido(c.admin, c.ctx, {
      nome: p.nome, telefone: p.telefone, branchId: p.branchId,
      complemento: { email: p.email, document: p.cpf, birthDate: p.nascimento },
    })
    if (r.error || !r.clientId) return { erro: r.error ?? 'Não foi possível cadastrar.' }
    if (!r.criado) return { erro: 'Esse telefone acabou de ser cadastrado para outro cliente.' }
    revalidateTag(`clients:${c.ctx.tenantId!}`, 'max')
    const ficha = { href: rota(c, `/clients/${r.clientId}`), rotuloDoLink: 'Abrir a ficha' }
    // O acesso ao app, depois da ficha: falhar aqui não desfaz o cadastro (o
    // acesso sai depois, pela ficha ou de novo pelo Copilot).
    if (p.criarAcesso && p.email && p.cpf) {
      const acesso = await darAcessoAoCliente(c.admin, c.ctx, r.clientId, p.email, p.cpf)
      if ('error' in acesso) return { mensagem: `${p.nome} cadastrado, mas o acesso ao app não saiu: ${acesso.error}`, ...ficha }
      return { mensagem: `${p.nome} cadastrado, com acesso ao app.`, ...ficha }
    }
    return { mensagem: `${p.nome} cadastrado.`, ...ficha }
  },
}

const deP = (de: string | null, para: string) => (de ? `${de} → ${para}` : para)

interface ArgsContato { cliente: string; nome?: string; telefone?: string; email?: string; cpf?: string; nascimento?: string }
interface PayloadContato { clientId: string; campos: Record<string, string> }

export const atualizarContato: FerramentaDeEscrita<ArgsContato, PayloadContato> = {
  nome: 'atualizar_contato',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Corrige ou completa os dados de contato de um cliente (id, nome ou telefone): nome, telefone, e-mail, CPF e data de nascimento. Só os campos informados mudam.',
  parametros: z.object({
    cliente: z.string().min(2).max(120),
    nome: z.string().min(2).max(120).optional(),
    telefone: z.string().min(10).max(20).optional(),
    email: EMAIL.optional(),
    cpf: z.string().max(20).optional(),
    nascimento: DATA.optional(),
  }),
  async preparar(c, a) {
    const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
    if ('erro' in cl) return { erro: cl.erro }
    const atual = await ler(c.admin.from('clients').select('name, phone, email, document, birth_date')
      .eq('id', cl.id).eq('tenant_id', c.ctx.tenantId!).single(), 'ler o cliente') as {
        name: string; phone: string | null; email: string | null; document: string | null; birth_date: string | null
      }
    const campos: Record<string, string> = {}
    if (a.nome) campos.name = a.nome.trim()
    if (a.telefone) {
      const t = digitosDoTelefone(a.telefone)
      if (t.length < 10) return { erro: 'O telefone precisa do DDD.' }
      campos.phone = t
    }
    if (a.email) campos.email = emailNormalizado(a.email)!
    if (a.cpf) campos.document = a.cpf.replace(/\D/g, '')
    if (a.nascimento) campos.birth_date = a.nascimento
    if (!Object.keys(campos).length) return { erro: 'O que mudar? (nome, telefone, e-mail, CPF ou nascimento)' }
    const recusa = await conferirComplemento(c, a, cl.id)
    if (recusa) return { erro: recusa }
    return {
      resumo: {
        titulo: 'Atualizar dados do cliente',
        // De → Para: a pessoa vê o que vai ser sobrescrito.
        linhas: [
          { rotulo: 'Cliente', valor: cl.name },
          ...(a.nome ? [{ rotulo: 'Nome', valor: deP(atual.name, campos.name!) }] : []),
          ...(a.telefone ? [{ rotulo: 'Telefone', valor: deP(atual.phone, campos.phone!) }] : []),
          ...(a.email ? [{ rotulo: 'E-mail', valor: deP(atual.email, campos.email!) }] : []),
          ...(a.cpf ? [{ rotulo: 'CPF', valor: deP(atual.document ? '(já tinha)' : null, linhasDoComplemento({ cpf: a.cpf })[0]!.valor) }] : []),
          ...(a.nascimento ? [{ rotulo: 'Nascimento', valor: deP(atual.birth_date?.slice(0, 10).split('-').reverse().join('/') ?? null, a.nascimento.split('-').reverse().join('/')) }] : []),
        ],
      },
      payload: { clientId: cl.id, campos },
    }
  },
  async efetivar(c, p) {
    // O mesmo núcleo da ficha (lib/clients/atualizar.ts).
    const r = await atualizarClienteCore(c.admin, c.ctx, p.clientId, p.campos)
    if (r.error) return { erro: r.error }
    return { mensagem: 'Dados atualizados.', href: rota(c, `/clients/${p.clientId}`), rotuloDoLink: 'Abrir a ficha' }
  },
}

interface ArgsAcesso { cliente: string; email?: string; cpf?: string }
interface PayloadAcesso { clientId: string; email: string; cpf: string }

export const criarAcessoAoApp: FerramentaDeEscrita<ArgsAcesso, PayloadAcesso> = {
  nome: 'criar_acesso_ao_app',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Cria o acesso ao app de quem JÁ é cliente (id, nome ou telefone) e ainda não tem: login = e-mail, senha inicial = o CPF. Usa o e-mail e o CPF da ficha, ou os informados (que passam para a ficha).',
  parametros: z.object({
    cliente: z.string().min(2).max(120),
    email: EMAIL.optional(),
    cpf: z.string().max(20).optional(),
  }),
  async preparar(c, a) {
    const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
    if ('erro' in cl) return { erro: cl.erro }
    const ficha = await ler(c.admin.from('clients').select('email, document, auth_id')
      .eq('id', cl.id).eq('tenant_id', c.ctx.tenantId!).single(), 'ler o cliente') as { email: string | null; document: string | null; auth_id: string | null }
    if (ficha.auth_id) return { erro: `${cl.name} já tem acesso ao app.` }
    const email = emailNormalizado(a.email) ?? ficha.email
    const cpf = a.cpf?.replace(/\D/g, '') || ficha.document
    if (!email || !cpf) return { erro: 'Para criar o acesso, preciso do e-mail e do CPF do cliente.' }
    if (!cpfValido(cpf)) return { erro: 'CPF inválido.' }
    const recusa = await conferirComplemento(c, { email: a.email ? email : undefined, cpf: a.cpf ? cpf : undefined }, cl.id)
    if (recusa) return { erro: recusa }
    return {
      resumo: {
        titulo: 'Acesso ao app do cliente',
        linhas: [
          { rotulo: 'Cliente', valor: cl.name },
          ...linhasDoComplemento({ email, cpf }),
          linhaDoAcesso(email),
        ],
      },
      payload: { clientId: cl.id, email, cpf },
    }
  },
  async efetivar(c, p) {
    // O mesmo núcleo da tela de cadastro (lib/clients/acesso.ts).
    const r = await darAcessoAoCliente(c.admin, c.ctx, p.clientId, p.email, p.cpf)
    if ('error' in r) return { erro: r.error }
    revalidateTag(`clients:${c.ctx.tenantId!}`, 'max')
    return { mensagem: 'Acesso ao app criado.', href: rota(c, `/clients/${p.clientId}`), rotuloDoLink: 'Abrir a ficha' }
  },
}
