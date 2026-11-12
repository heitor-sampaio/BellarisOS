'use server'

/**
 * As maquininhas da rede (C75 do levantamento das regras, F67): o cadastro
 * (Configurações → Comissões → Taxas), a taxa do Pix e a leitura de quem
 * recebe no cartão ("Qual maquininha?", o aviso da taxa, "Vezes no cartão").
 *
 * Gravar pede `financial: MANAGE` e abrangência de rede — as taxas valem para
 * a rede inteira (H7, a mesma régua das outras taxas). O servidor grava pelo cliente de serviço: a
 * sessão não lê nem grava `maquininhas` (sem política).
 *
 * Todo export é endpoint público: cada um confere a permissão e a rede.
 */

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, assertRecurso, podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, mensagemDoErro } from '@/lib/db'
import { falaDaRede } from '@/lib/unidades/uma-so'
import { veComissaoDeTodos } from '@/lib/comissoes/quem-ve'
import { maquininhasDaRede } from '@/lib/financeiro/vezes-da-rede'
import { EntradaDaMaquininha, ID_DA_MAQUININHA, linhaDaMaquininha, maximoDaMaquininha } from '@/lib/financeiro/maquininhas'
import { recusaDaTaxaDaMaquininha, TETO_DE_VEZES } from '@/lib/financeiro/vezes-do-cartao'
import type { CartaoPorBandeira } from '@/lib/financeiro/bandeiras'

type Resultado = { error?: string; ok?: true; id?: string }

function revalidar() {
  revalidatePath('/admin/settings')
  revalidatePath('/[slug]/settings', 'page')
}

async function travaDaConfig() {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'comissoes')
  assertPermission(ctx, 'financial', 'MANAGE')
  if (ctx.branchId !== null) {
    return { ctx, recusa: await falaDaRede(ctx.tenantId, 'As taxas valem para a rede inteira: quem muda é quem administra a rede.') }
  }
  return { ctx, recusa: null as string | null }
}

/** Cria (sem id) ou salva uma maquininha da rede. */
export async function salvarMaquininha(entrada: unknown): Promise<Resultado> {
  try {
    const { ctx, recusa } = await travaDaConfig()
    if (recusa) return { error: recusa }
    const lido = EntradaDaMaquininha.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const linha = { ...linhaDaMaquininha(lido.data), updated_at: new Date().toISOString() }
    if (lido.data.id) {
      const salvas = await gravar(admin.from('maquininhas').update(linha)
        .eq('id', lido.data.id).eq('tenant_id', ctx.tenantId!).select('id'), 'salvar a maquininha')
      if (!salvas?.length) return { error: 'Maquininha não encontrada.' }
      revalidar()
      return { ok: true, id: lido.data.id }
    }
    const existentes = await maquininhasDaRede(ctx.tenantId!)
    const ordem = existentes.reduce((m, x) => Math.max(m, x.ordem), 0) + 1
    const nova = await gravar(admin.from('maquininhas').insert({ ...linha, tenant_id: ctx.tenantId!, ordem })
      .select('id').single<{ id: string }>(), 'criar a maquininha')
    revalidar()
    return { ok: true, id: nova?.id }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Arquiva (ou volta) uma maquininha. Não apaga: as vendas feitas nela
 * continuam com as taxas dela. A última ativa não se arquiva — o cartão
 * precisa de uma.
 */
export async function arquivarMaquininha(id: unknown, arquivar: unknown = true): Promise<Resultado> {
  try {
    const { ctx, recusa } = await travaDaConfig()
    if (recusa) return { error: recusa }
    const lido = ID_DA_MAQUININHA.safeParse(id)
    if (!lido.success) return { error: 'Maquininha não encontrada.' }
    const lista = await maquininhasDaRede(ctx.tenantId!)
    const alvo = lista.find(m => m.id === lido.data)
    if (!alvo) return { error: 'Maquininha não encontrada.' }
    if (arquivar !== false && !alvo.arquivada && lista.filter(m => !m.arquivada).length <= 1) {
      return { error: 'A clínica precisa de ao menos uma maquininha ativa para o cartão.' }
    }
    await gravar(createAdminClient().from('maquininhas')
      .update({ arquivada_em: arquivar === false ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lido.data).eq('tenant_id', ctx.tenantId!).select('id').single(), 'arquivar a maquininha')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** A taxa do Pix (fora das maquininhas; padrão 0%). Vazio é 0%. */
export async function salvarTaxaDoPix(entrada: unknown): Promise<Resultado> {
  try {
    const { ctx, recusa } = await travaDaConfig()
    if (recusa) return { error: recusa }
    const n = entrada === null || entrada === '' || entrada === undefined ? 0 : Number(entrada)
    const recusaDaTaxa = recusaDaTaxaDaMaquininha(n)
    if (recusaDaTaxa) return { error: recusaDaTaxa }
    const linhas = await gravar(createAdminClient().from('tenants')
      .update({ pix_taxa_pct: Math.round(n * 1000) / 1000 }).eq('id', ctx.tenantId!).select('id'), 'salvar a taxa do Pix')
    if (!linhas?.length) return { error: 'Rede não encontrada.' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Uma maquininha como quem recebe a vê (o "Qual maquininha?" e o aviso da taxa). */
export interface MaquininhaNaVenda {
  id: string
  nome: string
  /** Até quantas vezes ela parcela no crédito. */
  maximo: number
  /** As taxas: com o valor a quem vê o financeiro de todos; 0 a quem só recebe (D7: só "está cadastrada"). */
  taxas: Record<string, number>
  cobraPorBandeira: boolean
  porBandeira: CartaoPorBandeira
}

/**
 * As maquininhas ATIVAS da rede para a venda no cartão, na ordem da tela, e
 * se a tela mostra a taxa e o líquido (A19 da 12ª: só a quem vê o financeiro
 * de todos). D7 (C3 do levantamento): a quem só recebe vai a PRESENÇA de cada
 * taxa (0), nunca o valor nem o prazo. Sem rede, nada.
 */
export async function maquininhasParaAVenda(): Promise<{ lista: MaquininhaNaVenda[]; mostra: boolean }> {
  const ctx = await getTenantContext()
  if (!ctx.tenantId) return { lista: [], mostra: false }
  const recebe = podeReceber(ctx)
  const mostra = recebe && veComissaoDeTodos(ctx)
  const presenca = (t: Record<string, number>) => Object.fromEntries(Object.keys(t).map(k => [k, mostra ? t[k]! : 0]))
  const lista = (await maquininhasDaRede(ctx.tenantId)).filter(m => !m.arquivada).map(m => ({
    id: m.id,
    nome: m.nome,
    maximo: Math.min(TETO_DE_VEZES, maximoDaMaquininha(m)),
    taxas: recebe ? presenca(m.taxas) : {},
    cobraPorBandeira: m.cobraPorBandeira,
    porBandeira: recebe && m.cobraPorBandeira
      ? Object.fromEntries(Object.entries(m.porBandeira).map(([b, r]) => [b, { taxas: presenca(r?.taxas ?? {}) }])) as CartaoPorBandeira
      : {},
  }))
  return { lista, mostra }
}
