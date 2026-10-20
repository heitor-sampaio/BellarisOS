import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { hashDoToken, tokenValido, soDigitos, dataIso } from '@/lib/documentos/link'
import { ipEAparelho } from '@/lib/documentos/assinar'
import { paraAnamneseGeral, type FichaDePreAtendimento, type RespostaDaAnamnese } from '@/lib/anamnese-geral'
import { gravarAnamneseGeral, preAtendimentoPendente } from './ficha'

/**
 * O link do pré-atendimento, do lado de quem o ABRE — sem sessão (2026-10-20).
 *
 * O molde é o link de assinatura (`lib/documentos/link-publico.ts`): a
 * identidade (CPF, ou nascimento) é conferida pelo banco em
 * `pre_atendimento_link_abrir`, com o link travado — é lá que as tentativas
 * contam. Responder confere TUDO de novo: a rota de responder é tão pública
 * quanto a de abrir, e não pode confiar que quem chega nela passou pela outra.
 */

export type EstadoDoLinkDaFicha = 'valido' | 'invalido' | 'usado' | 'revogado' | 'vencido' | 'indisponivel'

export const MENSAGEM_DO_LINK_DA_FICHA: Record<Exclude<EstadoDoLinkDaFicha, 'valido'>, string> = {
  invalido:     'Este link não existe. Confira se ele foi copiado inteiro, ou peça um novo à clínica.',
  usado:        'A sua ficha já chegou à clínica. Obrigada!',
  revogado:     'Este link não vale mais. Peça um novo à clínica.',
  vencido:      'Este link venceu. Peça um novo à clínica.',
  indisponivel: 'Esta ficha não está mais esperando resposta. Fale com a clínica.',
}

export interface EspiadaDaFicha {
  estado:  EstadoDoLinkDaFicha
  clinica: string | null
  pede:    'CPF' | 'NASCIMENTO'
}

/** O que a página mostra antes da identidade: a clínica, e o que vai pedir. */
export async function espiarLinkDaFicha(token: string): Promise<EspiadaDaFicha> {
  if (!tokenValido(token)) return { estado: 'invalido', clinica: null, pede: 'CPF' }
  const admin = createAdminClient()
  const r = await ler(admin.rpc('pre_atendimento_link_espiar', { p_token_hash: hashDoToken(token) }), 'abrir o link da ficha') as
    { estado: EstadoDoLinkDaFicha; clinica?: string | null; pede?: 'CPF' | 'NASCIMENTO' }
  return { estado: r.estado, clinica: r.clinica ?? null, pede: r.pede ?? 'CPF' }
}

export interface IdentidadeDaFicha { token: unknown; cpf?: unknown; nascimento?: unknown }

type Conferida =
  | { ok: true; pre: string; tenant: string; cliente: string; link: string }
  | { ok: false; erro: string; status: number }

const ERRO: Record<string, string> = {
  ...MENSAGEM_DO_LINK_DA_FICHA,
  limite:         'Muitas tentativas a partir desta conexão. Tente de novo em uma hora.',
  sem_identidade: 'Não foi possível conferir a sua identidade por este link. Fale com a clínica.',
}
const STATUS: Record<string, number> = { invalido: 404, usado: 410, revogado: 410, vencido: 410, indisponivel: 410, limite: 429 }

async function conferir(input: IdentidadeDaFicha): Promise<Conferida> {
  if (!tokenValido(input.token)) return { ok: false, erro: ERRO.invalido!, status: 404 }
  const cpf = soDigitos(input.cpf)
  const nascimento = dataIso(input.nascimento)
  if (!cpf && !nascimento) return { ok: false, erro: 'Informe o dado pedido para continuar.', status: 400 }
  const { ip } = await ipEAparelho()
  const admin = createAdminClient()
  const r = await gravar(admin.rpc('pre_atendimento_link_abrir', {
    p_token_hash: hashDoToken(input.token), p_cpf: cpf, p_nascimento: nascimento, p_ip: ip,
  }), 'conferir a identidade') as { ok?: true; erro?: string; restantes?: number; pre?: string; tenant?: string; cliente?: string; link?: string }
  if (r.ok) return { ok: true, pre: r.pre!, tenant: r.tenant!, cliente: r.cliente!, link: r.link! }
  if (r.erro === 'identidade') {
    const n = r.restantes ?? 0
    return { ok: false, erro: `Os dados não conferem com o cadastro. ${n === 1 ? 'Resta 1 tentativa' : `Restam ${n} tentativas`} antes de o link ser bloqueado.`, status: 403 }
  }
  return { ok: false, erro: ERRO[r.erro ?? 'invalido'] ?? ERRO.invalido!, status: STATUS[r.erro ?? 'invalido'] ?? 403 }
}

export interface FichaPeloLink {
  modo: 'COMPLETO' | 'CONFIRMAR'
  ficha: FichaDePreAtendimento
  respostasAnteriores: Record<string, RespostaDaAnamnese>
}

/** O pendente conferido — e a anamnese de agora, para o "nada mudou". */
async function pendenteConferido(c: Extract<Conferida, { ok: true }>) {
  const admin = createAdminClient()
  const pendente = await preAtendimentoPendente(admin, c.cliente)
  if (!pendente || pendente.id !== c.pre) return null
  const registro = await ler(admin.from('medical_records').select('general_anamnesis')
    .eq('client_id', c.cliente).maybeSingle(), 'buscar a anamnese')
  return { pendente, atual: paraAnamneseGeral(registro?.general_anamnesis ?? null, pendente.ficha) }
}

/** Confere a identidade e devolve a ficha para responder. */
export async function abrirFichaPorLink(input: IdentidadeDaFicha): Promise<{ erro?: string; status?: number; ficha?: FichaPeloLink }> {
  const c = await conferir(input)
  if (!c.ok) return { erro: c.erro, status: c.status }
  const p = await pendenteConferido(c)
  if (!p) return { erro: ERRO.indisponivel, status: 410 }
  return {
    ficha: {
      // Sem resposta anterior, "nada mudou" não tem o que confirmar.
      modo: p.pendente.modo === 'CONFIRMAR' && p.atual ? 'CONFIRMAR' : 'COMPLETO',
      ficha: p.pendente.ficha,
      respostasAnteriores: p.atual?.respostas ?? {},
    },
  }
}

/**
 * Responde pelo link: confere de novo e grava pelo núcleo de sempre
 * (`gravarAnamneseGeral`, que fecha o pendente — e o link morre com ele).
 * `nadaMudou` regrava as respostas de agora, como no app.
 */
export async function responderPorLink(input: IdentidadeDaFicha & { respostas?: unknown; nadaMudou?: unknown }): Promise<{ erro?: string; status?: number }> {
  const c = await conferir(input)
  if (!c.ok) return { erro: c.erro, status: c.status }
  const p = await pendenteConferido(c)
  if (!p) return { erro: ERRO.indisponivel, status: 410 }
  const nadaMudou = input.nadaMudou === true
  if (nadaMudou && !p.atual) return { erro: 'Não há respostas anteriores para confirmar. Responda a ficha.', status: 400 }
  const admin = createAdminClient()
  await gravarAnamneseGeral(admin, {
    tenantId: p.pendente.tenantId, clientId: c.cliente, origem: 'CLIENTE_LINK', porUsuario: null,
    ficha: p.pendente.ficha,
    respostas: nadaMudou ? p.atual!.respostas : input.respostas,
  })
  await gravar(admin.from('pre_atendimento_links').update({ used_at: new Date().toISOString() }).eq('id', c.link), 'fechar o link da ficha')
  return {}
}
