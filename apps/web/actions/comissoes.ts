'use server'

/**
 * Comissões — a configuração da rede, as taxas da maquininha e as regras de
 * cada profissional (padrão + exceções por procedimento). Decisões do Heitor
 * de 2026-09-30.
 *
 * Tudo pede `financial: MANAGE` (o módulo é "Financeiro e comissões"). A
 * configuração e as taxas valem para a REDE inteira: só quem tem abrangência
 * de rede muda. As regras de um profissional: quem é da rede muda de qualquer
 * um; quem tem unidade fixa, só dos da unidade dele.
 *
 * Todo export é endpoint público: cada um confere a permissão, a rede e o
 * alcance antes de gravar.
 */

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade, ownerFilter, assertRecurso, podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { recusaDeMexerNaAdmin } from '@/lib/equipe/admin-da-rede'
import { EntradaDaConfigDeComissao, EntradaDasTaxas, EntradaDasRegras, EntradaDaComissaoDoProcedimento, type ComissaoNoCadastroDoProduto } from '@/lib/comissoes/config'
import { configDeComissaoDaRede } from '@/lib/comissoes/leitura'
import { gravarComissaoDoProcedimento, recusaDaComissaoDaAdmin, podeMudarComissaoDoProcedimento } from '@/lib/comissoes/gravacao'
import { periodoDaChave } from '@/lib/comissoes/periodo'
import { maximoDeVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { TETO_DE_VEZES, recusaDoPrazoDaOperadora } from '@/lib/financeiro/vezes-do-cartao'
import { EntradaDoCartaoPorBandeira, semBandeirasVazias, lerCartaoPorBandeira, type CartaoPorBandeira } from '@/lib/financeiro/bandeiras'
import { falaDaRede } from '@/lib/unidades/uma-so'

type Resultado = { error?: string; ok?: true }

function revalidar() {
  revalidatePath('/admin/settings')
  revalidatePath('/admin/team')
  revalidatePath('/[slug]/team', 'page')
  revalidatePath('/admin/procedures')
}

export async function salvarConfigDeComissao(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'A configuração de comissões vale para a rede inteira: quem muda é quem administra a rede.') }
    const lido = EntradaDaConfigDeComissao.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const c = lido.data
    const admin = createAdminClient()
    await gravar(admin.from('commission_configs').upsert({
      tenant_id: ctx.tenantId!, modo: c.modo, desconta_insumos: c.desconta_insumos, desconta_taxa: c.desconta_taxa,
      base_com_pontos: c.base_com_pontos, periodo: c.periodo, produto_pct: c.produto_pct && c.produto_pct > 0 ? c.produto_pct : null,
      produto_modo: c.produto_modo, plano_pct: c.plano_pct && c.plano_pct > 0 ? c.plano_pct : null,
      updated_at: new Date().toISOString(), updated_by: ctx.internalUserId ?? null,
    }, { onConflict: 'tenant_id' }).select('tenant_id').single(), 'salvar a configuração de comissões')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function salvarTaxasDaMaquininha(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'As taxas valem para a rede inteira: quem muda é quem administra a rede.') }
    const lido = EntradaDasTaxas.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    await gravar(createAdminClient().rpc('comissao_taxas_definir', { p_tenant: ctx.tenantId!, p_taxas: lido.data }),
      'salvar as taxas da maquininha')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * "Parcelar no crédito até" (D-15): nulo volta ao padrão (a maior parcela com
 * taxa). Vale para a rede inteira, como as taxas — mesma permissão e
 * abrangência.
 */
export async function salvarMaximoDeVezes(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'O parcelamento vale para a rede inteira: quem muda é quem administra a rede.') }
    const n = entrada === null || entrada === '' ? null : Number(entrada)
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= TETO_DE_VEZES)) {
      return { error: `Escolha de 1 a ${TETO_DE_VEZES} vezes.` }
    }
    const linhas = await gravar(createAdminClient().from('tenants')
      .update({ cartao_max_vezes: n }).eq('id', ctx.tenantId!).select('id'), 'salvar o limite de vezes no crédito')
    if (!linhas?.length) return { error: 'Rede não encontrada.' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * O que o CADASTRO do produto mostra da comissão de venda dele (r2-ven-10; o
 * Heitor, 03/11: "se cada produto pode ter uma comissão diferente, o que faz
 * sentido é que em cada produto se possa registrar uma comissão diferente"):
 * como a clínica comissiona, a regra geral e a regra do produto. Nulo para quem
 * não muda comissão — o cadastro esconde a seção, e `updateProduct` recusa o
 * campo (`comissaoDoProdutoNoFormulario`). Só lê; produto de outra rede vem
 * sem regra.
 */
export async function comissaoNoCadastroDoProduto(productId: string | null): Promise<ComissaoNoCadastroDoProduto | null> {
  const ctx = await getTenantContext()
  if (!podeMudarComissaoDoProcedimento(ctx)) return null
  const config = await configDeComissaoDaRede(ctx.tenantId!)
  const produto = productId && /^[0-9a-f-]{36}$/i.test(productId)
    ? await ler(createAdminClient().from('products').select('comissao_tipo, comissao_valor')
        .eq('id', productId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'ler a comissão do produto') as { comissao_tipo: string | null; comissao_valor: number | null } | null
    : null
  const tipo = produto?.comissao_tipo === 'PERCENTAGE' || produto?.comissao_tipo === 'FIXED_AMOUNT' ? produto.comissao_tipo : null
  return {
    modo:     config.produto_modo,
    geralPct: config.produto_pct,
    tipo,
    valor:    tipo && produto?.comissao_valor != null ? Number(produto.comissao_valor) : null,
  }
}

/**
 * O prazo da operadora (r2-fin-01): a cada quantos dias corridos, contados da
 * venda, ela deposita cada parcela do cartão em N vezes. Vale para a rede
 * inteira e para as PRÓXIMAS vendas (o vencimento é retratado na parcela) —
 * mesma permissão e abrangência das taxas.
 */
export async function salvarPrazoDaOperadora(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'O prazo da operadora vale para a rede inteira: quem muda é quem administra a rede.') }
    const n = Number(entrada)
    const recusa = recusaDoPrazoDaOperadora(n)
    if (recusa) return { error: recusa }
    const linhas = await gravar(createAdminClient().from('tenants')
      .update({ cartao_prazo_dias: n }).eq('id', ctx.tenantId!).select('id'), 'salvar o prazo da operadora')
    if (!linhas?.length) return { error: 'Rede não encontrada.' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * O prazo da operadora e as taxas da maquininha de cada BANDEIRA (r3-f13-01;
 * o Heitor, 2026-11-03: "Lembre-se, flexibilidade. Prazo por bandeira. Taxas
 * também configuráveis por bandeira."). O que a bandeira não tem é a regra
 * geral (as taxas e o prazo de sempre). Grava o conjunto inteiro, de uma vez
 * (`tenants.cartao_por_bandeira`); a mesma permissão e abrangência das taxas.
 */
export async function salvarCartaoPorBandeira(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'As taxas valem para a rede inteira: quem muda é quem administra a rede.') }
    const lido = EntradaDoCartaoPorBandeira.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const valor = semBandeirasVazias(lido.data as CartaoPorBandeira)
    const linhas = await gravar(createAdminClient().from('tenants')
      .update({ cartao_por_bandeira: valor }).eq('id', ctx.tenantId!).select('id'), 'salvar o cartão por bandeira')
    if (!linhas?.length) return { error: 'Rede não encontrada.' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** As taxas de cada bandeira, para o aviso de quem recebe (`AvisoDaTaxa`). */
export async function cartaoPorBandeiraDaRede(): Promise<CartaoPorBandeira> {
  const ctx = await getTenantContext()
  if (!ctx.tenantId) return {}
  const rede = await ler(createAdminClient().from('tenants').select('cartao_por_bandeira').eq('id', ctx.tenantId).maybeSingle(),
    'ler o cartão por bandeira') as { cartao_por_bandeira: unknown } | null
  return lerCartaoPorBandeira(rede?.cartao_por_bandeira)
}

/**
 * Até quantas vezes o seletor de "Vezes no cartão" oferece (D-15). Leitura
 * da própria rede; sem rede (a cliente), o teto.
 */
export async function maximoDeVezesNoCartao(): Promise<number> {
  const ctx = await getTenantContext()
  if (!ctx.tenantId) return TETO_DE_VEZES
  return (await maximoDeVezesDaRede(ctx.tenantId)).maximo
}

export async function salvarRegrasDoProfissional(profissionalId: string, entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (typeof profissionalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profissionalId)) return { error: 'Profissional não encontrado.' }
    const lido = EntradaDasRegras.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }

    const admin = createAdminClient()
    const membro = await ler(admin.from('users').select('id, branch_id, role_id')
      .eq('id', profissionalId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o profissional')
    // De outra rede, ou de uma unidade fora do alcance: como se não existisse.
    if (!membro || !alcancaUnidade(ctx, (membro.branch_id as string | null) ?? null)) return { error: 'Profissional não encontrado.' }
    // A comissão de uma Admin da rede só outra Admin muda (revisão do Heitor,
    // 2026-10-29: "somente admin pode alterar admin").
    const recusa = await recusaDeMexerNaAdmin(admin, ctx, membro as { id: string; role_id: string | null })
    if (recusa) return { error: recusa }

    const { padrao, excecoes } = lido.data
    await gravar(admin.rpc('comissao_regras_definir', {
      p_tenant: ctx.tenantId!, p_profissional: profissionalId,
      p_padrao: padrao, p_excecoes: excecoes, p_ator: ctx.internalUserId ?? null,
    }), 'salvar as regras de comissão')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * A comissão de um procedimento (2026-10-15): a GERAL, a mesma para todos, ou
 * um valor para cada profissional (as exceções; quem fica sem valor segue o
 * padrão dele). Substitui o conjunto inteiro do procedimento — os valores de
 * profissionais de todas as unidades —, então só quem é da rede muda, como o
 * catálogo.
 */
export async function salvarComissaoDoProcedimento(procedimentoId: string, entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'A comissão do procedimento vale para a rede inteira: quem muda é quem administra a rede.') }
    if (typeof procedimentoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(procedimentoId)) return { error: 'Procedimento não encontrado.' }
    const lido = EntradaDaComissaoDoProcedimento.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }

    // O valor de uma Admin da rede só outra Admin muda (CLAUDE.md §11).
    const recusa = await recusaDaComissaoDaAdmin(ctx, procedimentoId, lido.data)
    if (recusa) return { error: recusa }
    // A função confere que o procedimento e cada profissional são da rede.
    await gravarComissaoDoProcedimento(ctx, procedimentoId, lido.data)
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

const METODOS_DO_FECHAMENTO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

/**
 * Fecha e paga o que está a pagar a um profissional numa unidade, até o fim
 * do período (ou até agora, se o período ainda corre). Uma função no banco
 * (`comissao_fechar`) grava tudo junto — o fechamento, a DESPESA paga no
 * financeiro e os lançamentos marcados pagos — e dois cliques fecham uma vez.
 *
 * `lancamentos` (A21 da 10ª; decisão do Heitor, 2026-11-10: "concordo com
 * marcar e desmarcar"): os lançamentos MARCADOS na janela. Só eles se pagam,
 * inteiros; o desmarcado continua a pagar e volta no próximo fechamento. O
 * banco confere que cada um é desta pessoa, desta unidade e ainda está aberto
 * (`comissao_fechar_escolhidos`). Sem a lista (chamador antigo), tudo o que está a pagar.
 */
export async function fecharComissoes(
  profissionalId: string, branchId: string, periodoChave: string, metodo: string,
  lancamentos?: string[] | null,
): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    // Quem só vê as próprias não fecha nem as próprias.
    if (ownerFilter(ctx, 'financial')) return { error: 'Seu cargo vê só as próprias comissões: quem fecha é o financeiro.' }
    const uuid = /^[0-9a-f-]{36}$/i
    if (!uuid.test(profissionalId) || !uuid.test(branchId)) return { error: 'Profissional ou unidade inválidos.' }
    if (!(METODOS_DO_FECHAMENTO as readonly string[]).includes(metodo)) return { error: 'Escolha a forma de pagamento.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }

    const { periodo: tipo } = await configDeComissaoDaRede(ctx.tenantId!)
    const periodo = periodoDaChave(periodoChave, tipo)
    if (!periodo) return { error: 'Período inválido.' }
    const agora = new Date()
    const fim = periodo.fim.getTime() < agora.getTime() ? periodo.fim : agora

    if (lancamentos != null) {
      if (!Array.isArray(lancamentos) || lancamentos.some(id => typeof id !== 'string' || !uuid.test(id))) {
        return { error: 'Lançamentos inválidos.' }
      }
      if (!lancamentos.length) return { error: 'Escolha ao menos um lançamento para pagar.' }
      await gravar(admin.rpc('comissao_fechar_escolhidos', {
        p_tenant: ctx.tenantId!, p_profissional: profissionalId, p_unidade: branchId,
        p_fim: fim.toISOString(), p_ator: ctx.internalUserId ?? null, p_metodo: metodo, p_lancamentos: lancamentos,
      }), 'fechar as comissões')
    } else {
      await gravar(admin.rpc('comissao_fechar', {
        p_tenant: ctx.tenantId!, p_profissional: profissionalId, p_unidade: branchId,
        p_fim: fim.toISOString(), p_ator: ctx.internalUserId ?? null, p_metodo: metodo,
      }), 'fechar as comissões')
    }

    revalidatePath('/admin/financeiro')
    revalidatePath('/admin/financeiro/comissoes')
    revalidatePath('/[slug]/financeiro', 'page')
    revalidatePath('/[slug]/financeiro/comissoes', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Estorna um fechamento pago (decisão do Heitor, 2026-09-30): a despesa é
 * estornada como qualquer lançamento e os lançamentos daquele fechamento voltam
 * a "a pagar". Uma função no banco faz tudo junto, e é a ÚNICA porta: a
 * despesa de um fechamento não se estorna pelo financeiro comum.
 */
export async function estornarFechamento(fechamentoId: string, motivo: string): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'comissoes')
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ownerFilter(ctx, 'financial')) return { error: 'Seu cargo vê só as próprias comissões: quem estorna é o financeiro.' }
    if (typeof fechamentoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(fechamentoId)) return { error: 'Fechamento não encontrado.' }
    const texto = typeof motivo === 'string' ? motivo.trim() : ''
    if (!texto) return { error: 'Diga o motivo do estorno.' }
    if (texto.length > 300) return { error: 'Motivo longo demais (até 300 caracteres).' }

    const admin = createAdminClient()
    const fechamento = await ler(admin.from('commission_payouts').select('branch_id')
      .eq('id', fechamentoId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o fechamento')
    if (!fechamento || !alcancaUnidade(ctx, fechamento.branch_id as string)) return { error: 'Fechamento não encontrado.' }

    await gravar(admin.rpc('comissao_estornar_fechamento', {
      p_tenant: ctx.tenantId!, p_fechamento: fechamentoId, p_ator: ctx.internalUserId ?? null, p_motivo: texto,
    }), 'estornar o fechamento')

    revalidatePath('/admin/financeiro')
    revalidatePath('/admin/financeiro/comissoes')
    revalidatePath('/[slug]/financeiro', 'page')
    revalidatePath('/[slug]/financeiro/comissoes', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * As taxas da maquininha do cartão de crédito, para o aviso de quem recebe
 * (A33 da simulação de 2026-10-27): escolher "3x" sem a taxa de 3x cadastrada
 * não dizia nada, e a comissão usava outra. Só leitura; pede quem recebe.
 */
/**
 * A taxa da maquininha do DÉBITO na regra geral (A34 da 9ª simulação): o débito
 * com a bandeira "Não informada" aplica a regra geral, e a tela não dizia qual.
 * Nula = não cadastrada (vale 0%, F16-2). Para quem recebe.
 */
export async function taxaDoDebito(): Promise<number | null> {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) return null
  const linha = await ler(createAdminClient().from('payment_fees')
    .select('taxa_pct, taxa_pct_sem_teto').eq('tenant_id', ctx.tenantId!).eq('metodo', 'DEBIT_CARD').eq('parcelas', 1).maybeSingle(),
  'carregar a taxa do débito') as { taxa_pct: number | string; taxa_pct_sem_teto: number | string | null } | null
  return linha ? Number(linha.taxa_pct_sem_teto ?? linha.taxa_pct) : null
}

export async function taxasDoCartaoDeCredito(): Promise<{ parcelas: number; taxa_pct: number }[]> {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) return []
  const linhas = await ler(createAdminClient().from('payment_fees')
    .select('parcelas, taxa_pct, taxa_pct_sem_teto').eq('tenant_id', ctx.tenantId!).eq('metodo', 'CREDIT_CARD'),
  'carregar as taxas do cartão')
  // F16-3: a taxa sem teto, como a clínica digitou.
  return ((linhas ?? []) as { parcelas: number; taxa_pct: number | string; taxa_pct_sem_teto: number | string | null }[])
    .map(t => ({ parcelas: Number(t.parcelas), taxa_pct: Number(t.taxa_pct_sem_teto ?? t.taxa_pct) }))
}
