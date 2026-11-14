import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { abertosNaTela } from './momento'
import { ipEAparelho, assinarJuntos, itensDaAssinatura, recusaDaImagem, COLUNAS_ASSINAVEIS, type DocumentoAssinavel } from './assinar'
import { hashDoToken, tokenValido, soDigitos, dataIso, MENSAGEM_DO_ESTADO, type EstadoDoLink } from './link'
import type { DocumentoNaTela } from '@/components/shared/tela-de-assinatura'

/**
 * O link público de assinatura, do lado de quem o ABRE — sem sessão.
 *
 * A identidade (CPF, ou data de nascimento) é conferida pelo banco, em
 * `documento_link_abrir`, com o link travado: é lá que as tentativas contam,
 * o link cai na 5ª errada e o IP para na 20ª da hora. Assinar confere tudo de
 * novo — a rota de assinar é tão pública quanto a de abrir, e não pode confiar
 * que quem chega nela passou pela outra.
 */

export interface Espiada {
  estado:  EstadoDoLink
  clinica: string | null
  pede:    'CPF' | 'NASCIMENTO'
  /** Quantos documentos o link pede (a página diz "2 documentos", sem os títulos). */
  documentos: number
}

/** O que a página mostra antes da identidade: a clínica, quantos documentos e o que vai pedir. */
export async function espiarLink(token: string): Promise<Espiada> {
  if (!tokenValido(token)) return { estado: 'invalido', clinica: null, pede: 'CPF', documentos: 1 }
  const admin = createAdminClient()
  const r = await ler(admin.rpc('documento_link_espiar', { p_token_hash: hashDoToken(token) }), 'abrir o link de assinatura') as
    { estado: EstadoDoLink; clinica?: string | null; pede?: 'CPF' | 'NASCIMENTO'; documentos?: number }
  return { estado: r.estado, clinica: r.clinica ?? null, pede: r.pede ?? 'CPF', documentos: Math.max(1, r.documentos ?? 1) }
}

export interface Identidade { token: unknown; cpf?: unknown; nascimento?: unknown }

type Conferida =
  | { ok: true; documentos: string[]; tenant: string; metodo: 'CPF' | 'NASCIMENTO' }
  | { ok: false; erro: string; status: number }

const ERRO: Record<string, string> = {
  ...MENSAGEM_DO_ESTADO,
  limite:         'Muitas tentativas a partir desta conexão. Tente de novo em uma hora.',
  sem_identidade: 'Não foi possível conferir a sua identidade por este link. Fale com a clínica.',
}

// A rota responde com o status certo: 404 link que não existe, 410 o que já
// não vale, 429 o limite do IP, 403 identidade que não confere.
const STATUS: Record<string, number> = { invalido: 404, usado: 410, revogado: 410, vencido: 410, indisponivel: 410, limite: 429 }

/**
 * A identidade, conferida pelo banco para o LINK inteiro (DC3, leva 2): as
 * tentativas contam no link, e a 5ª errada derruba todos os documentos dele.
 */
async function conferir(input: Identidade): Promise<Conferida> {
  if (!tokenValido(input.token)) return { ok: false, erro: ERRO.invalido!, status: 404 }
  const cpf = soDigitos(input.cpf)
  const nascimento = dataIso(input.nascimento)
  if (!cpf && !nascimento) return { ok: false, erro: 'Informe o dado pedido para continuar.', status: 400 }
  const { ip, ua } = await ipEAparelho()
  const admin = createAdminClient()
  const r = await gravar(admin.rpc('documento_link_abrir', {
    p_token_hash: hashDoToken(input.token), p_cpf: cpf, p_nascimento: nascimento, p_ip: ip, p_ua: ua,
  }), 'conferir a identidade') as { ok?: true; erro?: string; restantes?: number; documentos?: string[]; tenant?: string; metodo?: 'CPF' | 'NASCIMENTO' }
  if (r.ok) return { ok: true, documentos: r.documentos ?? [], tenant: r.tenant!, metodo: r.metodo! }
  if (r.erro === 'identidade') {
    const n = r.restantes ?? 0
    return { ok: false, erro: `Os dados não conferem com o cadastro. ${n === 1 ? 'Resta 1 tentativa' : `Restam ${n} tentativas`} antes de o link ser bloqueado.`, status: 403 }
  }
  return { ok: false, erro: ERRO[r.erro ?? 'invalido'] ?? ERRO.invalido!, status: STATUS[r.erro ?? 'invalido'] ?? 403 }
}

/**
 * Confere a identidade e devolve os documentos do link para ler e assinar —
 * todos os abertos dele, montados de novo (assina-se com os dados de agora).
 * `doc` é o primeiro, para quem só conhece o link de um documento.
 */
export async function abrirPorLink(input: Identidade): Promise<{ erro?: string; status?: number; documentos?: DocumentoNaTela[]; doc?: DocumentoNaTela }> {
  const c = await conferir(input)
  if (!c.ok) return { erro: c.erro, status: c.status }
  const documentos = await abertosNaTela(c.tenant, c.documentos)
  if (!documentos.length) return { erro: ERRO.indisponivel, status: 410 }
  return { documentos, doc: documentos[0] }
}

/**
 * Assina pelo link: confere a identidade de novo, e `documentos_assinar`
 * consome o link — os documentos assinados têm de ser exatamente os abertos
 * dele (o banco recusa a mais e a menos). `itens` traz o hash de cada um; o
 * `hashExibido` sozinho vale para o link de um documento só.
 */
export async function assinarPorLink(input: Identidade & {
  assinatura: unknown; itens?: unknown; hashExibido?: unknown
}): Promise<{ erro?: string; status?: number; codigo?: string | null; documentos?: { id: string; codigo: string | null }[] }> {
  const recusa = recusaDaImagem(input.assinatura)
  if (recusa) return { erro: recusa, status: 400 }

  const c = await conferir(input)
  if (!c.ok) return { erro: c.erro, status: c.status }

  const itens = input.itens != null
    ? itensDaAssinatura(input.itens)
    : typeof input.hashExibido === 'string' && c.documentos.length === 1
      ? [{ id: c.documentos[0]!, hashExibido: input.hashExibido }]
      : null
  if (!itens) return { erro: 'Abra o documento de novo para assinar.', status: 400 }

  const admin = createAdminClient()
  const docs = (await ler(admin.from('issued_documents').select(COLUNAS_ASSINAVEIS)
    .in('id', itens.map(i => i.id)).eq('tenant_id', c.tenant), 'buscar os documentos') ?? []) as unknown as DocumentoAssinavel[]
  // Um id de fora do link (de outra cliente, de outra rede): nada se assina.
  const doLink = new Set(c.documentos)
  if (docs.length !== itens.length || !itens.every(i => doLink.has(i.id))) {
    return { erro: 'Os documentos deste link mudaram. Abra o link de novo para assinar.', status: 409 }
  }
  const documentos = await assinarJuntos({
    docs, itens, canal: 'LINK', identidade: c.metodo, assinatura: input.assinatura as string,
    conduzidoPor: null, linkHash: hashDoToken(input.token as string), ator: null,
  })
  return { codigo: documentos[0]?.codigo ?? null, documentos }
}
