import 'server-only'
import { z } from 'zod/v4'
import { revalidateTag } from 'next/cache'
import { ler } from '@/lib/db'
import { atualizarClienteCore } from '@/lib/clients/atualizar'
import { garantirClienteRapido, digitosDoTelefone } from '@/lib/clients/cliente-rapido'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import { DATA, hojeEmBrasilia, resolverCliente, resolverUnidade, rota } from '@/lib/copilot/ferramentas/comum'

/**
 * As GRAVAÇÕES de clientes.
 *
 * Decisão de 2026-10-08: o Copilot cadastra pelo caminho RÁPIDO (o mesmo do
 * agendar e do inbox: `garantirClienteRapido`, nome + telefone) e completa
 * e-mail, CPF e nascimento quando a pessoa der. O LOGIN do portal (usuário =
 * e-mail, senha = CPF) continua só na tela "Cadastrar cliente": criar acesso
 * de alguém é gesto que a recepção faz olhando a ficha, não por conversa.
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

interface ArgsCadastro { nome: string; telefone: string; email?: string; cpf?: string; nascimento?: string; unidade?: string }
interface PayloadCadastro { nome: string; telefone: string; branchId: string; email: string | null; cpf: string | null; nascimento: string | null }

export const cadastrarCliente: FerramentaDeEscrita<ArgsCadastro, PayloadCadastro> = {
  nome: 'cadastrar_cliente',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Cadastra um cliente novo: nome e telefone com DDD (obrigatórios); e-mail, CPF e data de nascimento (AAAA-MM-DD) se a pessoa der. Não cria o acesso ao app do cliente (isso é na tela de cadastro). Se o telefone já for de um cliente, diz quem é em vez de duplicar.',
  parametros: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(10).max(20),
    email: EMAIL.optional(),
    cpf: z.string().max(20).optional(),
    nascimento: DATA.optional(),
    unidade: z.string().max(80).optional(),
  }),
  async preparar(c, a) {
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
        ],
      },
      payload: {
        nome: a.nome.trim(), telefone, branchId: u.unidade!.id,
        email: emailNormalizado(a.email), cpf: a.cpf?.replace(/\D/g, '') || null, nascimento: a.nascimento ?? null,
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
    return { mensagem: `${p.nome} cadastrado.`, href: rota(c, `/clients/${r.clientId}`), rotuloDoLink: 'Abrir a ficha' }
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
