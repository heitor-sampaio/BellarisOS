'use server'

import { after } from 'next/server'
import { updateTag } from 'next/cache'
import { getTenantContext, assertPermission, assertRecurso, can, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { CAMPOS, type ChaveDeCampo, type Destino } from '@/lib/importacao/campos'
import { processarImportacao, manterImportacoes } from '@/lib/importacao/processar'
import { podeTrocarResponsavel } from '@/lib/crm/responsavel'

/**
 * O importador de contatos (CSV), 2026-10-13. O navegador lê o arquivo, mapeia
 * as colunas e mostra a prévia; aqui chega o pedido, que é conferido INTEIRO
 * (permissão por destino, a unidade da sessão, o mapeamento, os limites, o
 * funil) e gravado para rodar em segundo plano (`lib/importacao/processar.ts`).
 * Cada linha é validada de novo lá: a prévia não é confiável.
 */

const MAX_LINHAS = 10_000
const MAX_COLUNAS = 100
const MAX_VALOR = 2_000

type Ctx = Awaited<ReturnType<typeof getTenantContext>>

export interface PedidoDeImportacao {
  destino:      Destino
  /** A unidade dos clientes (no portal da unidade, vale a da sessão). */
  branchId?:    string | null
  nomeArquivo:  string
  mapeamento:   (ChaveDeCampo | null)[]
  linhas:       string[][]
  /** A linha da planilha de cada registro (o relatório cita esta); sem ela, a posição. */
  numeros?:     number[]
  /** `responsavelId: null` é "Sem responsável"; ausente, quem importa. */
  oportunidade: { etapaId: string; responsavelId?: string | null } | null
}

/** A etapa é da rede E de um funil ativo: a de funil arquivado sumiria do quadro. */
async function etapaAtivaDaRede(tenantId: string, etapaId: string): Promise<boolean> {
  const e = await ler(createAdminClient().from('crm_stages').select('id, crm_funnels(archived_at)')
    .eq('id', etapaId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a etapa')
  if (!e) return false
  const f = (e as unknown as { crm_funnels: { archived_at: string | null } | { archived_at: string | null }[] | null }).crm_funnels
  const funil = Array.isArray(f) ? f[0] : f
  return !!funil && !funil.archived_at
}

export async function importarContatos(pedido: PedidoDeImportacao): Promise<{ ok: true; importacaoId: string } | { ok: false; error: string }> {
  const ctx = await getTenantContext()
  const destino: Destino = pedido?.destino === 'contatos' ? 'contatos' : 'clientes'
  assertPermission(ctx, destino === 'clientes' ? 'clients' : 'crm', 'MANAGE')

  // O mapeamento: só campos do destino, cada um uma vez, e os obrigatórios.
  const permitidos = new Set(CAMPOS[destino].map(c => c.chave))
  const mapa = Array.isArray(pedido?.mapeamento) ? pedido.mapeamento.slice(0, MAX_COLUNAS) : []
  const mapeamento = mapa.map(c => (typeof c === 'string' && permitidos.has(c as ChaveDeCampo) ? c as ChaveDeCampo : null))
  const usados = mapeamento.filter(Boolean)
  if (new Set(usados).size !== usados.length) return { ok: false, error: 'Cada campo do sistema vai para uma coluna só.' }
  for (const c of CAMPOS[destino]) {
    if (c.obrigatorio && !mapeamento.includes(c.chave)) return { ok: false, error: `Escolha a coluna de ${c.rotulo}.` }
  }

  const linhas = Array.isArray(pedido?.linhas) ? pedido.linhas : []
  if (!linhas.length) return { ok: false, error: 'O arquivo não tem linhas para importar.' }
  if (linhas.length > MAX_LINHAS) return { ok: false, error: `No máximo ${MAX_LINHAS.toLocaleString('pt-BR')} linhas por importação.` }
  const limpas = linhas.map(l => (Array.isArray(l) ? l : []).slice(0, mapeamento.length).map(v => String(v ?? '').slice(0, MAX_VALOR)))
  // Os números da planilha: inteiros, crescentes, um por linha — senão a posição.
  const nums = Array.isArray(pedido?.numeros) ? pedido.numeros : []
  const numerosValem = nums.length === limpas.length
    && nums.every((n, i) => Number.isInteger(n) && n > 1 && (i === 0 || n > nums[i - 1]!))
  const numeroDa = (i: number) => (numerosValem ? nums[i]! : i + 2)

  // A unidade dos clientes: a da sessão vence a do pedido, e tem de ser da rede.
  let branchId: string | null = null
  if (destino === 'clientes') {
    branchId = ctx.branchId ?? pedido.branchId ?? null
    if (!branchId) return { ok: false, error: 'Escolha a unidade dos clientes.' }
    const unidade = await ler(createAdminClient().from('branches').select('id')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { ok: false, error: 'Unidade não encontrada.' }
  }

  // A oportunidade: o CRM em Gerenciar, o recurso do plano, a etapa (da rede,
  // de funil ativo) e o responsável — outro que não quem importa (ou ninguém)
  // só com o "todos" do CRM.
  let oportunidade: { etapaId: string; responsavelId: string | null } | null = null
  if (pedido.oportunidade) {
    assertPermission(ctx, 'crm', 'MANAGE')
    assertRecurso(ctx, 'oportunidades')
    const etapaId = String(pedido.oportunidade.etapaId ?? '')
    if (!etapaId || !(await etapaAtivaDaRede(ctx.tenantId!, etapaId))) return { ok: false, error: 'Etapa do funil não encontrada.' }
    const escolhido = pedido.oportunidade.responsavelId
    const responsavelId = escolhido === undefined ? (ctx.internalUserId ?? null) : (escolhido || null)
    if (responsavelId !== (ctx.internalUserId ?? null)) {
      if (!podeTrocarResponsavel(ctx)) return { ok: false, error: 'Seu cargo não define o responsável de outra pessoa.' }
      if (responsavelId) {
        const membro = await ler(createAdminClient().from('users').select('id, is_active')
          .eq('id', responsavelId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o responsável')
        if (!membro || !(membro as { is_active: boolean }).is_active) return { ok: false, error: 'Responsável não encontrado nesta rede.' }
      }
    }
    oportunidade = { etapaId, responsavelId }
  }

  const admin = createAdminClient()
  const { data: imp, error } = await admin.from('importacoes').insert({
    tenant_id: ctx.tenantId!, branch_id: branchId, criada_por: ctx.internalUserId ?? null, destino,
    nome_arquivo: String(pedido.nomeArquivo ?? 'arquivo.csv').slice(0, 200),
    mapeamento, oportunidade, total: limpas.length,
  }).select('id').single<{ id: string }>()
  if (error) return { ok: false, error: `Não foi possível começar a importação: ${error.message}` }

  // As linhas do arquivo. Falhou no meio: a importação sai inteira — retomar
  // uma pela metade importaria um arquivo truncado sem ninguém saber.
  try {
    for (let i = 0; i < limpas.length; i += 1000) {
      await gravar(admin.from('importacao_linhas').insert(
        limpas.slice(i, i + 1000).map((valores, j) => ({ importacao_id: imp.id, numero: numeroDa(i + j), valores })),
      ), 'guardar as linhas da importação')
    }
  } catch (e) {
    await admin.from('importacoes').delete().eq('id', imp.id)
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível guardar o arquivo.' }
  }

  after(() => processarImportacao(imp.id, ctx))
  return { ok: true, importacaoId: imp.id }
}

export interface AndamentoDaImportacao {
  status: string; total: number; processadas: number; novas: number; completadas: number
  sem_mudanca: number; com_erro: number; oportunidades: number; erro: string | null
  erros: { linha: number; motivo: string }[]
}

type ImportacaoLida = AndamentoDaImportacao & {
  id: string; destino: Destino; branch_id: string | null; erros_expiram_em: string | null
}

/**
 * A importação desta rede que ESTA pessoa alcança: o módulo do destino em
 * Gerenciar e, nos clientes, a unidade. O relatório de erros já vencido não
 * volta (é dado pessoal, 7 dias).
 */
async function importacaoAoAlcance(ctx: Ctx, id: string): Promise<ImportacaoLida | null> {
  const imp = await ler(createAdminClient().from('importacoes')
    .select('id, destino, branch_id, status, total, processadas, novas, completadas, sem_mudanca, com_erro, oportunidades, erro, erros, erros_expiram_em')
    .eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'ler a importação') as ImportacaoLida | null
  if (!imp) return null
  if (!can(ctx, imp.destino === 'clientes' ? 'clients' : 'crm', 'MANAGE')) return null
  if (imp.destino === 'clientes' && !alcancaUnidade(ctx, imp.branch_id)) return null
  if (imp.erros_expiram_em && imp.erros_expiram_em < new Date().toISOString()) imp.erros = []
  return imp
}

/** A tela do importador acompanha a sua importação (a das Ações em lote é a lista). */
export async function andamentoDaImportacao(id: string): Promise<AndamentoDaImportacao | null> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'clients', 'MANAGE') && !can(ctx, 'crm', 'MANAGE')) return null
  await manterImportacoes(ctx.tenantId!)
  const a = await importacaoAoAlcance(ctx, id)
  if (!a) return null
  // Terminou: a lista de clientes (cache, lib/cached-queries) precisa ver o que
  // entrou. Do `after()` a invalidação não chega à tela; daqui, sim — e a tela
  // recarrega ao ver "concluída".
  if (a.status === 'concluida' || a.status === 'falhou') updateTag(`clients:${ctx.tenantId!}`)
  return {
    status: a.status, total: a.total, processadas: a.processadas, novas: a.novas, completadas: a.completadas,
    sem_mudanca: a.sem_mudanca, com_erro: a.com_erro, oportunidades: a.oportunidades, erro: a.erro,
    erros: (a.erros ?? []).slice(0, 50),
  }
}

/** "Tentar de novo" da importação interrompida: continua de onde parou. */
export async function retomarImportacao(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  const imp = await importacaoAoAlcance(ctx, id)
  if (!imp) return { ok: false, error: 'Importação não encontrada nesta rede.' }
  if (imp.status !== 'falhou') return { ok: false, error: 'Só a importação que falhou ou parou continua.' }
  const admin = createAdminClient()
  const { count, error } = await admin.from('importacao_linhas').select('numero', { count: 'exact', head: true }).eq('importacao_id', id)
  if (error) return { ok: false, error: `Não foi possível conferir o que falta: ${error.message}` }
  if (!count) return { ok: false, error: 'Não sobrou linha para importar.' }
  const reaberta = await ler(admin.from('importacoes')
    .update({ status: 'pendente', concluida_em: null, atualizada_em: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', ctx.tenantId!).eq('status', 'falhou').select('id').maybeSingle(), 'reabrir a importação')
  if (!reaberta) return { ok: false, error: 'A importação já voltou a rodar.' }
  after(() => processarImportacao(id, ctx))
  return { ok: true }
}
