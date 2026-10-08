import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { gravar, ler, tentar } from '@/lib/db'
import type { Admin } from '@/lib/copilot/ferramentas/tipos'
import type { ItemDaConversa } from '@/lib/copilot/openai'
import type {
  AnexoNaTela, Cartao, ConversaNaLista, MensagemNaTela, ResultadoDaAcao, StatusDaAcao,
} from '@/lib/copilot/tipos'

/**
 * A conversa do Copilot no banco (`copilot_conversas`, `copilot_mensagens`).
 * Tudo pelo service role, sempre com a rede E a pessoa conferidas: a conversa
 * é de quem a abriu — nem o dono da rede lê a de outro membro.
 */

/** Quantas mensagens antigas voltam ao modelo (o resto fica só na tela). */
const HISTORICO_PARA_O_MODELO = 40

export type PapelNoBanco = 'user' | 'assistant' | 'ferramenta' | 'nota'

export interface ConteudoDoUsuario { texto: string; anexos?: (AnexoNaTela & { caminho?: string })[]; transcricao?: string }
export interface ConteudoDoAssistente { texto: string; cartoes?: Cartao[] }
export interface ConteudoDaFerramenta { itens: ItemDaConversa[] }
export interface ConteudoDaNota { texto: string }

export async function gravarMensagem(admin: Admin, m: {
  conversaId: string; tenantId: string; papel: PapelNoBanco
  conteudo: ConteudoDoUsuario | ConteudoDoAssistente | ConteudoDaFerramenta | ConteudoDaNota
  tokensEntrada?: number; tokensSaida?: number
}): Promise<void> {
  await gravar(admin.from('copilot_mensagens').insert({
    conversa_id: m.conversaId, tenant_id: m.tenantId, papel: m.papel, conteudo: m.conteudo,
    tokens_entrada: m.tokensEntrada ?? 0, tokens_saida: m.tokensSaida ?? 0,
  }).select('id'), 'gravar a mensagem do Copilot')
  await tentar(admin.from('copilot_conversas').update({ atualizada_em: new Date().toISOString() })
    .eq('id', m.conversaId), 'atualizar a conversa do Copilot')
}

export async function criarConversa(admin: Admin, ctx: TenantContext, titulo: string): Promise<{ id: string; titulo: string }> {
  const t = titulo.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Nova conversa'
  const linha = await gravar(admin.from('copilot_conversas').insert({
    tenant_id: ctx.tenantId!, user_id: ctx.internalUserId!, titulo: t,
  }).select('id, titulo').single(), 'abrir a conversa do Copilot') as { id: string; titulo: string }
  return linha
}

/** A conversa, se for DESTA pessoa nesta rede. */
export async function conversaDaPessoa(admin: Admin, ctx: TenantContext, id: string): Promise<{ id: string; titulo: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  return await ler(admin.from('copilot_conversas').select('id, titulo')
    .eq('id', id).eq('tenant_id', ctx.tenantId!).eq('user_id', ctx.internalUserId!)
    .maybeSingle(), 'ler a conversa do Copilot') as { id: string; titulo: string } | null
}

export async function listarConversas(admin: Admin, ctx: TenantContext): Promise<ConversaNaLista[]> {
  const linhas = await ler(admin.from('copilot_conversas').select('id, titulo, atualizada_em')
    .eq('tenant_id', ctx.tenantId!).eq('user_id', ctx.internalUserId!)
    .order('atualizada_em', { ascending: false }).limit(30), 'listar as conversas do Copilot') as
    { id: string; titulo: string; atualizada_em: string }[] | null
  return (linhas ?? []).map(l => ({ id: l.id, titulo: l.titulo, atualizadaEm: l.atualizada_em }))
}

interface LinhaDeMensagem { id: string; papel: PapelNoBanco; conteudo: Record<string, unknown>; criada_em: string }

/** O histórico no formato do modelo: as últimas mensagens, na ordem. */
export async function historicoParaOModelo(admin: Admin, conversaId: string): Promise<ItemDaConversa[]> {
  const linhas = (await ler(admin.from('copilot_mensagens').select('id, papel, conteudo, criada_em')
    .eq('conversa_id', conversaId).order('criada_em', { ascending: false })
    .limit(HISTORICO_PARA_O_MODELO), 'ler o histórico do Copilot') as LinhaDeMensagem[] | null ?? []).reverse()

  // Começa numa fala da pessoa: uma saída de ferramenta solta (sem a chamada
  // dela, que ficou fora do recorte) a API recusa.
  const inicio = linhas.findIndex(l => l.papel === 'user')
  const itens: ItemDaConversa[] = []
  for (const l of inicio >= 0 ? linhas.slice(inicio) : []) {
    if (l.papel === 'user') {
      const c = l.conteudo as unknown as ConteudoDoUsuario
      const anexos = (c.anexos ?? []).map(a => `[${a.tipo === 'audio' ? 'áudio' : a.tipo}: ${a.nome}]`).join(' ')
      const texto = [c.texto, c.transcricao ? `(áudio transcrito) ${c.transcricao}` : '', anexos].filter(Boolean).join('\n')
      itens.push({ role: 'user', content: texto || '(sem texto)' })
    } else if (l.papel === 'assistant') {
      const texto = String((l.conteudo as { texto?: string }).texto ?? '')
      if (texto) itens.push({ role: 'assistant', content: texto })
    } else if (l.papel === 'ferramenta') {
      for (const i of ((l.conteudo as unknown as ConteudoDaFerramenta).itens ?? [])) itens.push(i)
    } else if (l.papel === 'nota') {
      itens.push({ role: 'developer', content: String((l.conteudo as { texto?: string }).texto ?? '') })
    }
  }
  return itens
}

/** As mensagens para a TELA (a pessoa e o Copilot), com o estado atual de cada cartão. */
export async function mensagensParaATela(admin: Admin, ctx: TenantContext, conversaId: string): Promise<MensagemNaTela[]> {
  const linhas = await ler(admin.from('copilot_mensagens').select('id, papel, conteudo, criada_em')
    .eq('conversa_id', conversaId).eq('tenant_id', ctx.tenantId!)
    .in('papel', ['user', 'assistant']).order('criada_em', { ascending: true })
    .limit(200), 'ler as mensagens do Copilot') as LinhaDeMensagem[] | null

  const acoes = await ler(admin.from('copilot_acoes').select('id, status, resultado, expira_em')
    .eq('conversa_id', conversaId).eq('tenant_id', ctx.tenantId!), 'ler as ações do Copilot') as
    { id: string; status: StatusDaAcao; resultado: ResultadoDaAcao | null; expira_em: string }[] | null
  const estado = new Map((acoes ?? []).map(a => [a.id, a]))
  const agora = Date.now()

  return (linhas ?? []).map(l => {
    if (l.papel === 'user') {
      const c = l.conteudo as unknown as ConteudoDoUsuario
      return {
        id: l.id, papel: 'user' as const, criadaEm: l.criada_em,
        texto: c.transcricao ? [c.texto, c.transcricao].filter(Boolean).join('\n') : c.texto,
        anexos: (c.anexos ?? []).map(a => ({ nome: a.nome, tipo: a.tipo })),
      }
    }
    const c = l.conteudo as unknown as ConteudoDoAssistente
    const cartoes = (c.cartoes ?? []).map(cartao => {
      if (cartao.tipo !== 'acao') return cartao
      const a = estado.get(cartao.acaoId)
      if (!a) return cartao
      const venceu = a.status === 'pendente' && new Date(a.expira_em).getTime() <= agora
      return { ...cartao, status: venceu ? 'vencida' as const : a.status, resultado: a.resultado }
    })
    return { id: l.id, papel: 'assistant' as const, criadaEm: l.criada_em, texto: c.texto ?? '', cartoes }
  })
}

export async function apagarConversa(admin: Admin, ctx: TenantContext, id: string): Promise<boolean> {
  const apagadas = await ler(admin.from('copilot_conversas').delete()
    .eq('id', id).eq('tenant_id', ctx.tenantId!).eq('user_id', ctx.internalUserId!)
    .select('id'), 'apagar a conversa do Copilot') as { id: string }[] | null
  return !!apagadas?.length
}
