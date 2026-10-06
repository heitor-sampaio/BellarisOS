import crypto from 'node:crypto'
import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import { ensurePrivateBucket, getSignedUrls } from '../storage'
import { notifyUser } from '../notifications/notify'
import { ANEXO_MAXIMO, tipoDaImagem, type SituacaoDoChamado } from './chamados-regras'

/**
 * Os chamados de suporte, do lado do servidor: leitura, anexos e avisos.
 * Fora de `'use server'` — as actions (`actions/chamados.ts` da clínica,
 * `actions/chamados-suporte.ts` da plataforma) conferem quem pede.
 */
export const BUCKET_DOS_ANEXOS = 'suporte-anexos'

export interface AnexoDoChamado { path: string; nome: string; tipo: string; url?: string | null }

export interface MensagemDoChamado {
  id: string; autor: 'usuario' | 'suporte' | 'sistema'; nome: string; corpo: string
  anexos: AnexoDoChamado[]; interna: boolean; em: string
}

export interface ChamadoResumo {
  id: string; numero: number; assunto: string; status: SituacaoDoChamado
  rede: string; redeId: string; quem: string | null; quemId: string | null
  ultimaMensagem: string; atendente: string | null; respondidoPeloSuporte: boolean
}

export interface ChamadoCompleto extends ChamadoResumo {
  contexto: Record<string, unknown>
  criadoEm: string
  mensagens: MensagemDoChamado[]
  autorizacao: { id: string; expiraEm: string; clinico: boolean } | null
}

type LinhaDoChamado = {
  id: string; numero: number; assunto: string; status: SituacaoDoChamado; tenant_id: string
  opened_by_user_id: string | null; last_message_at: string; last_staff_reply_at: string | null
  contexto: Record<string, unknown>; created_at: string
  tenants: { name: string } | null; users: { name: string } | null; platform_staff: { name: string } | null
}

const SELECT_CHAMADO = 'id, numero, assunto, status, tenant_id, opened_by_user_id, last_message_at, last_staff_reply_at, contexto, created_at, tenants(name), users!support_tickets_opened_by_user_id_fkey(name), platform_staff(name)'

function resumo(t: LinhaDoChamado): ChamadoResumo {
  return {
    id: t.id, numero: t.numero, assunto: t.assunto, status: t.status,
    rede: t.tenants?.name ?? '—', redeId: t.tenant_id, quem: t.users?.name ?? null, quemId: t.opened_by_user_id,
    ultimaMensagem: t.last_message_at, atendente: t.platform_staff?.name ?? null,
    respondidoPeloSuporte: !!t.last_staff_reply_at,
  }
}

/** Os chamados de uma pessoa (ou da rede inteira, para quem administra). */
export async function chamadosDaClinica(tenantId: string, filtro: { userId?: string }): Promise<ChamadoResumo[]> {
  let q = createAdminClient().from('support_tickets').select(SELECT_CHAMADO).eq('tenant_id', tenantId)
  if (filtro.userId) q = q.eq('opened_by_user_id', filtro.userId)
  const linhas = await ler(q.order('last_message_at', { ascending: false }).limit(50), 'carregar os chamados') as unknown as LinhaDoChamado[] | null
  return (linhas ?? []).map(resumo)
}

/** A fila do suporte. */
export async function filaDoSuporte(filtro: { status?: SituacaoDoChamado | 'abertos' | 'todos' }): Promise<ChamadoResumo[]> {
  let q = createAdminClient().from('support_tickets').select(SELECT_CHAMADO)
  if (filtro.status === 'abertos' || !filtro.status) q = q.neq('status', 'resolvido')
  else if (filtro.status !== 'todos') q = q.eq('status', filtro.status)
  const linhas = await ler(q.order('last_message_at', { ascending: false }).limit(200), 'carregar a fila') as unknown as LinhaDoChamado[] | null
  return (linhas ?? []).map(resumo)
}

/** Quantos esperam o suporte: os de situação "aberto" (a clínica escreveu por último). */
export async function contagemDaFila(): Promise<number> {
  const { count, error } = await createAdminClient().from('support_tickets')
    .select('id', { count: 'exact', head: true }).eq('status', 'aberto')
  if (error) throw new Error(`Não consegui contar a fila: ${error.message}`)
  return count ?? 0
}

/**
 * Um chamado inteiro. `comInternas` só para o suporte: a clínica nunca recebe
 * as notas internas (filtradas no BANCO, não na tela).
 */
export async function lerChamado(chamadoId: string, opcoes: { comInternas: boolean; tenantId?: string }): Promise<ChamadoCompleto | null> {
  const admin = createAdminClient()
  let q = admin.from('support_tickets').select(SELECT_CHAMADO).eq('id', chamadoId)
  if (opcoes.tenantId) q = q.eq('tenant_id', opcoes.tenantId)
  const t = await ler(q.maybeSingle(), 'carregar o chamado') as unknown as LinhaDoChamado | null
  if (!t) return null

  let qm = admin.from('support_ticket_messages')
    .select('id, author_kind, body, anexos, interna, created_at, users(name), platform_staff(name)')
    .eq('ticket_id', chamadoId)
  if (!opcoes.comInternas) qm = qm.eq('interna', false)
  const [msgs, grant] = await Promise.all([
    ler(qm.order('created_at'), 'carregar as mensagens do chamado'),
    t.opened_by_user_id
      ? ler(admin.from('support_grants').select('id, expires_at, includes_clinical')
          .eq('target_user_id', t.opened_by_user_id).is('revoked_at', null)
          .gt('expires_at', new Date().toISOString()).maybeSingle(), 'conferir a autorização')
      : null,
  ])
  const linhas = (msgs ?? []) as unknown as {
    id: string; author_kind: MensagemDoChamado['autor']; body: string; anexos: AnexoDoChamado[] | null; interna: boolean
    created_at: string; users: { name: string } | null; platform_staff: { name: string } | null
  }[]
  const caminhos = linhas.flatMap(m => (m.anexos ?? []).map(a => a.path))
  const urls = caminhos.length ? await getSignedUrls(BUCKET_DOS_ANEXOS, caminhos, 60 * 30) : {}

  return {
    ...resumo(t),
    contexto: t.contexto ?? {},
    criadoEm: t.created_at,
    mensagens: linhas.map(m => ({
      id: m.id, autor: m.author_kind, corpo: m.body, interna: m.interna, em: m.created_at,
      nome: m.author_kind === 'suporte' ? `${m.platform_staff?.name ?? 'Suporte'} · Suporte BellarisOS`
        : m.author_kind === 'sistema' ? 'BellarisOS' : (m.users?.name ?? 'Clínica'),
      anexos: (m.anexos ?? []).map(a => ({ ...a, url: urls[a.path] ?? null })),
    })),
    autorizacao: grant ? (() => {
      const g = grant as { id: string; expires_at: string; includes_clinical: boolean }
      return { id: g.id, expiraEm: g.expires_at, clinico: g.includes_clinical }
    })() : null,
  }
}

/**
 * Guarda o anexo (imagem PNG/JPEG até 5 MB, conferida pelo cabeçalho) no
 * bucket privado. `null` sem arquivo; erro de texto se inválido.
 */
export async function guardarAnexo(tenantId: string, arquivo: unknown): Promise<AnexoDoChamado | null | { error: string }> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (arquivo.size > ANEXO_MAXIMO) return { error: 'O anexo pode ter até 5 MB.' }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const tipo = tipoDaImagem(bytes)
  if (!tipo) return { error: 'O anexo precisa ser uma imagem PNG ou JPEG (um print da tela).' }
  await ensurePrivateBucket(BUCKET_DOS_ANEXOS)
  const path = `${tenantId}/${crypto.randomUUID()}.${tipo}`
  const { error } = await createAdminClient().storage.from(BUCKET_DOS_ANEXOS)
    .upload(path, bytes, { contentType: tipo === 'png' ? 'image/png' : 'image/jpeg', upsert: false })
  if (error) return { error: `Não consegui guardar o anexo: ${error.message}` }
  return { path, nome: arquivo.name.slice(0, 120) || `anexo.${tipo}`, tipo: `image/${tipo === 'png' ? 'png' : 'jpeg'}` }
}

/** Tira do bucket o anexo de uma gravação que não aconteceu. */
export async function removerAnexo(anexo: AnexoDoChamado | null): Promise<void> {
  if (!anexo) return
  const { error } = await createAdminClient().storage.from(BUCKET_DOS_ANEXOS).remove([anexo.path])
  if (error) console.error('[chamados] anexo órfão no bucket:', anexo.path, error.message)
}

/**
 * Avisa quem abriu que o suporte respondeu (o sino abre a Ajuda no chamado).
 * O texto é GENÉRICO: o push aparece na tela de bloqueio, e a resposta pode
 * citar cliente — ela se lê dentro do sistema.
 */
export async function avisarResposta(chamado: { id: string; numero: number; quemId: string | null }): Promise<void> {
  if (!chamado.quemId) return
  await notifyUser(createAdminClient(), chamado.quemId, {
    type:  'suporte.chamado',
    title: `O suporte respondeu o chamado #${chamado.numero}`,
    body:  'Abra a Ajuda para ler a resposta.',
    data:  { chamadoId: chamado.id },
  })
}
