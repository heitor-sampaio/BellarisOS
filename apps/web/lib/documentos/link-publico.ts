import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { sha256 } from './renderizar'
import { documentoParaExibir } from './leitura'
import { ipEAparelho, dadosDoAssinante, depoisDeAssinar, COLUNAS_ASSINAVEIS, type DocumentoAssinavel } from './assinar'
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
}

/** O que a página mostra antes da identidade: a clínica, e o que vai pedir. */
export async function espiarLink(token: string): Promise<Espiada> {
  if (!tokenValido(token)) return { estado: 'invalido', clinica: null, pede: 'CPF' }
  const admin = createAdminClient()
  const r = await ler(admin.rpc('documento_link_espiar', { p_token_hash: hashDoToken(token) }), 'abrir o link de assinatura') as
    { estado: EstadoDoLink; clinica?: string | null; pede?: 'CPF' | 'NASCIMENTO' }
  return { estado: r.estado, clinica: r.clinica ?? null, pede: r.pede ?? 'CPF' }
}

export interface Identidade { token: unknown; cpf?: unknown; nascimento?: unknown }

type Conferida =
  | { ok: true; documento: string; tenant: string; link: string; metodo: 'CPF' | 'NASCIMENTO' }
  | { ok: false; erro: string; status: number }

const ERRO: Record<string, string> = {
  ...MENSAGEM_DO_ESTADO,
  limite:         'Muitas tentativas a partir desta conexão. Tente de novo em uma hora.',
  sem_identidade: 'Não foi possível conferir a sua identidade por este link. Fale com a clínica.',
}

// A rota responde com o status certo: 404 link que não existe, 410 o que já
// não vale, 429 o limite do IP, 403 identidade que não confere.
const STATUS: Record<string, number> = { invalido: 404, usado: 410, revogado: 410, vencido: 410, indisponivel: 410, limite: 429 }

async function conferir(input: Identidade): Promise<Conferida> {
  if (!tokenValido(input.token)) return { ok: false, erro: ERRO.invalido!, status: 404 }
  const cpf = soDigitos(input.cpf)
  const nascimento = dataIso(input.nascimento)
  if (!cpf && !nascimento) return { ok: false, erro: 'Informe o dado pedido para continuar.', status: 400 }
  const { ip, ua } = await ipEAparelho()
  const admin = createAdminClient()
  const r = await gravar(admin.rpc('documento_link_abrir', {
    p_token_hash: hashDoToken(input.token), p_cpf: cpf, p_nascimento: nascimento, p_ip: ip, p_ua: ua,
  }), 'conferir a identidade') as { ok?: true; erro?: string; restantes?: number; documento?: string; tenant?: string; link?: string; metodo?: 'CPF' | 'NASCIMENTO' }
  if (r.ok) return { ok: true, documento: r.documento!, tenant: r.tenant!, link: r.link!, metodo: r.metodo! }
  if (r.erro === 'identidade') {
    const n = r.restantes ?? 0
    return { ok: false, erro: `Os dados não conferem com o cadastro. ${n === 1 ? 'Resta 1 tentativa' : `Restam ${n} tentativas`} antes de o link ser bloqueado.`, status: 403 }
  }
  return { ok: false, erro: ERRO[r.erro ?? 'invalido'] ?? ERRO.invalido!, status: STATUS[r.erro ?? 'invalido'] ?? 403 }
}

/** Confere a identidade e devolve o documento para ler e assinar. */
export async function abrirPorLink(input: Identidade): Promise<{ erro?: string; status?: number; doc?: DocumentoNaTela }> {
  const c = await conferir(input)
  if (!c.ok) return { erro: c.erro, status: c.status }
  // Montado de novo ao abrir, como no portal: assina-se com os dados de agora.
  const d = await documentoParaExibir(c.tenant, c.documento, { montarDeNovo: true })
  if (!d || d.resumo.status !== 'PENDENTE') return { erro: ERRO.indisponivel, status: 410 }
  return {
    doc: {
      id: d.resumo.id, titulo: d.resumo.titulo, tipo: d.resumo.tipo, status: d.resumo.status,
      faltando: [], codigo: d.resumo.codigo, motivo: null,
      cliente: { nome: d.cliente.nome }, conteudo: d.conteudo, pdfUrl: d.pdfUrl, assinatura: null,
    },
  }
}

/** Assina pelo link: confere de novo, e `documento_assinar` consome o link. */
export async function assinarPorLink(input: Identidade & {
  assinatura: unknown; hashExibido: unknown; aceite: unknown
}): Promise<{ erro?: string; status?: number; codigo?: string | null }> {
  if (typeof input.assinatura !== 'string' || !input.assinatura.startsWith('data:image/png;base64,')) {
    return { erro: 'Faça a sua assinatura antes de confirmar.', status: 400 }
  }
  if (input.assinatura.length > 400_000) return { erro: 'A imagem da assinatura ficou grande demais. Limpe e assine de novo.', status: 400 }
  if (typeof input.hashExibido !== 'string') return { erro: 'Abra o documento de novo para assinar.', status: 400 }

  const c = await conferir(input)
  if (!c.ok) return { erro: c.erro, status: c.status }

  const admin = createAdminClient()
  const doc = await ler(admin.from('issued_documents').select(COLUNAS_ASSINAVEIS)
    .eq('id', c.documento).eq('tenant_id', c.tenant).single(), 'buscar o documento') as unknown as DocumentoAssinavel
  const [assinante, rede] = await Promise.all([dadosDoAssinante(doc.client_id), ipEAparelho()])
  const r = await gravar(admin.rpc('documento_assinar', {
    p_doc:           doc.id,
    p_tenant:        doc.tenant_id,
    p_canal:         'LINK',
    p_identidade:    c.metodo,
    p_hash_exibido:  input.hashExibido,
    p_png:           input.assinatura,
    p_png_sha256:    sha256(input.assinatura),
    p_nome:          assinante.nome,
    p_documento:     assinante.documento,
    p_ip:            rede.ip,
    p_ua:            rede.ua,
    p_conduzido_por: null,
    p_link:          c.link,
    p_scan_path:     null,
    p_scan_sha256:   null,
    p_aceite:        typeof input.aceite === 'string' ? input.aceite.slice(0, 300) || null : null,
  }), 'registrar a assinatura') as { codigo: string | null }

  await depoisDeAssinar(doc, null)
  return { codigo: r.codigo }
}
