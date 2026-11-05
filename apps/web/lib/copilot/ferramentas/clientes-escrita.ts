import 'server-only'
import { z } from 'zod/v4'
import { cpfValido, telefoneDoCadastro } from '@estetica-os/utils'
import { revalidateTag } from 'next/cache'
import { ler } from '@/lib/db'
import { atualizarClienteCore } from '@/lib/clients/atualizar'
import { darAcessoAoCliente, documentoDoAcesso, type DocumentoDoAcesso } from '@/lib/clients/acesso'
import { garantirClienteRapido } from '@/lib/clients/cliente-rapido'
import { fichasQueJaExistem, textoDaFichaQueJaExiste, rotuloDoAtualizar, type FichaQueJaExiste } from '@/lib/clients/ja-existe'
import { isUnitTag } from '@estetica-os/utils'
import { tagsAtivasDaRede } from '@/lib/tags/vocabulario'
import { temTag } from '@/lib/tags/escolha'
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

// O CPF pelos dígitos verificadores: a conta é UMA, `cpfValido` (@estetica-os/utils).

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

/**
 * O telefone que a pessoa disse ao Copilot, pela regra do cadastro
 * (`telefoneDoCadastro`): o brasileiro com DDD, ou o de outro país com "+" e o
 * código (cli-06, revisão do Heitor de 2026-11-02 — "a estrangeira também
 * chega pelo Copilot"). Antes só os dígitos, e o "+351…" virava um número
 * nacional sem sentido.
 */
export function telefoneDoCopilot(texto: string): { digitos: string; gravar: string } | { erro: string } {
  return telefoneDoCadastro(texto) ?? { erro: 'Informe o telefone com DDD (ou, de outro país, com + e o código do país).' }
}

interface ArgsCadastro { nome: string; telefone: string; email?: string; cpf?: string; nascimento?: string; unidade?: string; criar_acesso?: boolean }
interface PayloadCadastro { nome: string; telefone: string; branchId: string; email: string | null; cpf: string | null; nascimento: string | null; criarAcesso?: boolean; jaExisteId?: string; jaExisteNome?: string }

/**
 * As escolhas do cartão quando a ficha JÁ EXISTE (r2-cli-01, o Heitor em
 * 2026-11-03: "no Copilot, o cartão de confirmação mostra a mesma pergunta"):
 * "Cadastrar mesmo assim" (não no CPF: é único) e "Unificar com a ficha de X"
 * (ou "Reativar", na arquivada).
 */
export function escolhasDaFichaQueJaExiste(f: FichaQueJaExiste) {
  return [
    ...(f.podeCadastrarMesmoAssim ? [{ chave: 'cadastrar', rotulo: 'Cadastrar mesmo assim' }] : []),
    { chave: 'atualizar', rotulo: rotuloDoAtualizar(f) },
  ]
}

// Quem já usa o app em outra clínica (mesmo e-mail e CPF) entra na conta que tem (lib/clients/acesso.ts).
const linhaDoAcesso = (email: string, tipo: 'CPF' | 'PASSAPORTE' | 'RNE' = 'CPF') => ({
  rotulo: 'Acesso ao app',
  valor: `login ${email}, senha inicial = ${tipo === 'CPF' ? 'o CPF' : tipo === 'RNE' ? 'o número do RNE' : 'o número do passaporte'} (se ela já usa o app em outra clínica, a senha continua a dela)`,
})

export const cadastrarCliente: FerramentaDeEscrita<ArgsCadastro, PayloadCadastro> = {
  nome: 'cadastrar_cliente',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Cadastra um cliente novo: nome e telefone com DDD (obrigatórios); e-mail, CPF e data de nascimento (AAAA-MM-DD) se a pessoa der. Com criar_acesso, também cria o acesso ao app do cliente (precisa de e-mail e CPF; a senha inicial é o CPF). Se já existir a ficha (mesmo CPF, mesmo telefone, ou mesmo nome e nascimento), o cartão pergunta à pessoa: cadastrar mesmo assim ou unificar com a ficha que existe.',
  parametros: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(24),
    email: EMAIL.optional(),
    cpf: z.string().max(20).optional(),
    nascimento: DATA.optional(),
    unidade: z.string().max(80).optional(),
    criar_acesso: z.boolean().optional(),
  }),
  async preparar(c, a) {
    if (a.criar_acesso && (!a.email || !a.cpf)) return { erro: 'Para criar o acesso ao app, preciso do e-mail e do CPF do cliente.' }
    const fone = telefoneDoCopilot(a.telefone)
    if ('erro' in fone) return { erro: fone.erro }
    const telefone = fone.gravar
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    // A ficha que JÁ EXISTE (r2-cli-01): o cartão pergunta, como a tela.
    const cpf = a.cpf?.replace(/\D/g, '') || null
    const [jaExiste] = await fichasQueJaExistem(c.admin, c.ctx.tenantId!, {
      cpf: cpf && cpfValido(cpf) ? cpf : null, digitos: fone.digitos, nome: a.nome, nascimento: a.nascimento ?? null,
    }, { comArquivadas: true })
    const recusa = await conferirComplemento(c, a, jaExiste?.id)
    if (recusa) return { erro: recusa }
    return {
      resumo: {
        titulo: 'Cadastrar cliente',
        ...(jaExiste ? {
          aviso: `${textoDaFichaQueJaExiste(jaExiste)} Nada foi gravado: cadastre mesmo assim ou unifique com a ficha que existe (só o que foi informado agora entra nela; nada dela se apaga, e o nome continua o dela).`,
          escolhas: escolhasDaFichaQueJaExiste(jaExiste),
        } : {}),
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
        ...(jaExiste ? { jaExisteId: jaExiste.id, jaExisteNome: jaExiste.nome } : {}),
      },
    }
  },
  async efetivar(c, p, escolha) {
    // A ficha que já existia: a escolha do cartão decide (r2-cli-01).
    if (p.jaExisteId && escolha !== 'cadastrar' && escolha !== 'atualizar') return { erro: 'Escolha no cartão: cadastrar mesmo assim ou unificar com a ficha que existe.' }
    // Num insert só: e-mail, CPF e nascimento entram junto (sem update depois).
    const r = await garantirClienteRapido(c.admin, c.ctx, {
      nome: p.nome, telefone: p.telefone, branchId: p.branchId,
      complemento: { email: p.email, document: p.cpf, birthDate: p.nascimento },
      jaExiste: p.jaExisteId ? `${escolha}:${p.jaExisteId}` : null,
    })
    if (r.jaExiste) return { erro: `${textoDaFichaQueJaExiste(r.jaExiste)} Nada foi gravado: peça de novo ao Copilot para escolher.` }
    if (r.error || !r.clientId) return { erro: r.error ?? 'Não foi possível cadastrar.' }
    if (!r.criado) revalidateTag(`clients:${c.ctx.tenantId!}`, { expire: 0 })
    if (!r.criado && !p.criarAcesso) {
      return { mensagem: `Unificado com a ficha de ${p.jaExisteNome ?? p.nome}: o que foi informado entrou nela, nada dela se apagou, e o nome continua o dela.`, href: rota(c, `/clients/${r.clientId}`), rotuloDoLink: 'Abrir a ficha' }
    }
    revalidateTag(`clients:${c.ctx.tenantId!}`, { expire: 0 })
    const ficha = { href: rota(c, `/clients/${r.clientId}`), rotuloDoLink: 'Abrir a ficha' }
    // O acesso ao app, depois da ficha: falhar aqui não desfaz o cadastro (o
    // acesso sai depois, pela ficha ou de novo pelo Copilot).
    if (p.criarAcesso && p.email && p.cpf) {
      const acesso = await darAcessoAoCliente(c.admin, c.ctx, r.clientId, p.email, { tipo: 'CPF', numero: p.cpf })
      if ('error' in acesso) return { mensagem: `${p.nome} cadastrado, mas o acesso ao app não saiu: ${acesso.error}`, ...ficha }
      return { mensagem: acesso.contaLigada
        ? `${p.nome} cadastrado, e a ficha entrou na conta que ela já tem no app (a senha continua a dela).`
        : `${p.nome} cadastrado, com acesso ao app.`, ...ficha }
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
    telefone: z.string().min(8).max(24).optional(),
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
      const t = telefoneDoCopilot(a.telefone)
      if ('erro' in t) return { erro: t.erro }
      campos.phone = t.gravar
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

interface ArgsTags { cliente: string; adicionar?: string[]; remover?: string[] }
interface PayloadTags { clientId: string; adicionar: string[]; remover: string[] }

/**
 * Marcar e desmarcar tags (o vocabulário da rede, 2026-10-13). Marca só o que
 * EXISTE no vocabulário, com o nome dele ("vip" vira "VIP"); criar tag é de
 * Configurações → Tags. As "Unidade: …" são do sistema e ficam como estão.
 */
export const marcarTags: FerramentaDeEscrita<ArgsTags, PayloadTags> = {
  nome: 'marcar_tags',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Marca e/ou desmarca tags de um cliente (id, nome ou telefone). Só tags que já existem no vocabulário da rede (sem diferença de maiúsculas); tag nova se cria em Configurações → Tags.',
  parametros: z.object({
    cliente: z.string().min(2).max(120),
    adicionar: z.array(z.string().min(1).max(60)).max(10).optional(),
    remover: z.array(z.string().min(1).max(60)).max(10).optional(),
  }),
  async preparar(c, a) {
    const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
    if ('erro' in cl) return { erro: cl.erro }
    if (!a.adicionar?.length && !a.remover?.length) return { erro: 'Quais tags marcar ou desmarcar?' }
    const atuais = await tagsDoCliente(c, cl.id)
    const vocabulario = await tagsAtivasDaRede(c.ctx.tenantId!)
    const adicionar: string[] = []
    for (const pedida of a.adicionar ?? []) {
      if (isUnitTag(pedida)) return { erro: 'A tag de unidade é do sistema: ela segue a unidade que o cliente frequenta.' }
      const nome = vocabulario.find(v => temTag([v], pedida))
      if (!nome) return { erro: `A tag "${pedida}" não existe na rede — crie em Configurações → Tags. Tags: ${vocabulario.join(', ') || 'nenhuma'}.` }
      if (!temTag(atuais, nome) && !temTag(adicionar, nome)) adicionar.push(nome)
    }
    const remover: string[] = []
    for (const pedida of a.remover ?? []) {
      if (isUnitTag(pedida)) return { erro: 'A tag de unidade é do sistema: ela segue a unidade que o cliente frequenta.' }
      const tem = atuais.find(t => temTag([t], pedida))
      if (tem && !temTag(remover, tem)) remover.push(tem)
    }
    if (!adicionar.length && !remover.length) return { erro: `Nada a mudar: ${cl.name} já está assim.` }
    return {
      resumo: {
        titulo: 'Marcar tags',
        linhas: [
          { rotulo: 'Cliente', valor: cl.name },
          ...(adicionar.length ? [{ rotulo: 'Marcar', valor: adicionar.join(', ') }] : []),
          ...(remover.length ? [{ rotulo: 'Desmarcar', valor: remover.join(', ') }] : []),
        ],
      },
      payload: { clientId: cl.id, adicionar, remover },
    }
  },
  async efetivar(c, p) {
    // Sobre as tags de AGORA: outra tela pode ter mexido desde o cartão.
    const atuais = await tagsDoCliente(c, p.clientId)
    const tags = [...atuais.filter(t => !temTag(p.remover, t)), ...p.adicionar.filter(t => !temTag(atuais, t))]
    // O mesmo núcleo da ficha (lib/clients/atualizar.ts).
    const r = await atualizarClienteCore(c.admin, c.ctx, p.clientId, { tags })
    if (r.error) return { erro: r.error }
    return { mensagem: 'Tags atualizadas.', href: rota(c, `/clients/${p.clientId}`), rotuloDoLink: 'Abrir a ficha' }
  },
}

async function tagsDoCliente(c: ContextoDaFerramenta, clientId: string): Promise<string[]> {
  const linha = await ler(c.admin.from('clients').select('tags').eq('id', clientId).eq('tenant_id', c.ctx.tenantId!).single(), 'ler as tags do cliente') as { tags: string[] | null }
  return linha.tags ?? []
}

interface ArgsAcesso { cliente: string; email?: string; cpf?: string }
interface PayloadAcesso { clientId: string; email: string; documento: DocumentoDoAcesso }

export const criarAcessoAoApp: FerramentaDeEscrita<ArgsAcesso, PayloadAcesso> = {
  nome: 'criar_acesso_ao_app',
  tipo: 'escrita',
  modulo: 'clients', nivel: 'MANAGE',
  descricao: 'Cria o acesso ao app de quem JÁ é cliente (id, nome ou telefone) e ainda não tem: login = e-mail, senha inicial = o CPF — ou, sem CPF, o número do passaporte ou do RNE da ficha. Usa o e-mail e o documento da ficha, ou o e-mail e o CPF informados (que passam para a ficha).',
  parametros: z.object({
    cliente: z.string().min(2).max(120),
    email: EMAIL.optional(),
    cpf: z.string().max(20).optional(),
  }),
  async preparar(c, a) {
    const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
    if ('erro' in cl) return { erro: cl.erro }
    const ficha = await ler(c.admin.from('clients').select('email, document, documento_tipo, documento_numero, auth_id')
      .eq('id', cl.id).eq('tenant_id', c.ctx.tenantId!).single(), 'ler o cliente') as {
        email: string | null; document: string | null; documento_tipo: string | null; documento_numero: string | null; auth_id: string | null
      }
    if (ficha.auth_id) return { erro: `${cl.name} já tem acesso ao app.` }
    const email = emailNormalizado(a.email) ?? ficha.email
    // Sem CPF, o passaporte ou o RNE da ficha (decisão 1 do Heitor, 2026-11-05).
    const cpf = a.cpf?.replace(/\D/g, '') || ficha.document
    const documento: DocumentoDoAcesso | null = cpf ? { tipo: 'CPF', numero: cpf } : documentoDoAcesso(ficha)
    if (!email || !documento) return { erro: 'Para criar o acesso, preciso do e-mail e de um documento do cliente (CPF, passaporte ou RNE).' }
    if (documento.tipo === 'CPF' && !cpfValido(documento.numero)) return { erro: 'CPF inválido.' }
    const recusa = await conferirComplemento(c, { email: a.email ? email : undefined, cpf: a.cpf ? cpf ?? undefined : undefined }, cl.id)
    if (recusa) return { erro: recusa }
    return {
      resumo: {
        titulo: 'Acesso ao app do cliente',
        linhas: [
          { rotulo: 'Cliente', valor: cl.name },
          ...linhasDoComplemento({ email, ...(documento.tipo === 'CPF' ? { cpf: documento.numero } : {}) }),
          ...(documento.tipo === 'CPF' ? [] : [{ rotulo: documento.tipo === 'RNE' ? 'RNE' : 'Passaporte', valor: documento.numero }]),
          linhaDoAcesso(email, documento.tipo),
        ],
      },
      payload: { clientId: cl.id, email, documento },
    }
  },
  async efetivar(c, p) {
    // O mesmo núcleo da tela de cadastro (lib/clients/acesso.ts).
    const r = await darAcessoAoCliente(c.admin, c.ctx, p.clientId, p.email, p.documento)
    if ('error' in r) return { erro: r.error }
    revalidateTag(`clients:${c.ctx.tenantId!}`, { expire: 0 })
    return { mensagem: r.contaLigada ? 'A ficha entrou na conta que ela já tem no app (a senha continua a dela).' : 'Acesso ao app criado.', href: rota(c, `/clients/${p.clientId}`), rotuloDoLink: 'Abrir a ficha' }
  },
}
