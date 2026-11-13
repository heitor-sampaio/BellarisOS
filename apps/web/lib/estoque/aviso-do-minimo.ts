import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, lerTodas } from '@/lib/db'
import { notificarInteressados } from '@/lib/notifications/interessados'
import {
  situacaoDoEstoque, estoqueBaixo, saldoParaMostrar, minimoParaMostrar, formatarQuantidadeComUnidade, ROTULO_DA_SITUACAO,
  minimoEhDoCadastro, rotuloDoMinimo,
} from './situacao'

type Admin = ReturnType<typeof createAdminClient>
type Num = number | string

/**
 * O estoque no mínimo ou abaixo chega ao SINO (A48 da 11ª simulação,
 * 2026-11-10: o dashboard da Gisele dizia "2" e o sino "Tudo em dia").
 *
 * A régua é a da TELA (`situacaoDoEstoque`, a mesma do quadro do dashboard e
 * do Estoque — princípio 3): no rendimento, com o "No mínimo" contando. O
 * evento `estoque.abaixo_do_minimo` do gatilho compara as embalagens (o frasco
 * aberto conta inteiro) e só o "abaixo" estrito: a Lâmina com 190 un (3,8
 * caixas) contra o mínimo de 4 caixas nunca o emitia. O evento continua, para
 * as automações; o sino sai daqui.
 *
 * UMA vez por cruzamento: a linha avisada ganha `minimo_avisado_em`
 * (reivindicada antes de avisar — duas passadas do cron não avisam duas
 * vezes); a que sai do mínimo (a reposição) a perde, e volta a poder avisar.
 * Vai para quem responde pelo Estoque na unidade (a regra de partes
 * interessadas: Gerenciar, a unidade ao alcance).
 *
 * `tenantId` recorta uma rede (o teste passa a `[e2e]`); o cron passa nulo.
 */
export async function avisarEstoqueMinimo(admin: Admin, opcoes: { tenantId?: string | null } = {}): Promise<{ abaixo: number; avisados: number; limpos: number }> {
  type Linha = {
    product_id: string; branch_id: string; current_stock: Num; min_stock: Num; current_rendimento: Num | null
    minimo_avisado_em: string | null
    products: { name: string; unit: string; consumption_unit: string | null; units_per_package: Num | null; tenant_id: string; min_stock: Num | null } | null
  }
  const linhas = await lerTodas<Linha>((de, ate) => {
    let q = admin.from('branch_product_stock')
      .select('product_id, branch_id, current_stock, min_stock, current_rendimento, minimo_avisado_em, products!inner(name, unit, consumption_unit, units_per_package, tenant_id, is_active, min_stock)')
      .gt('min_stock', 0)
      .eq('products.is_active', true)
    if (opcoes.tenantId) q = q.eq('products.tenant_id', opcoes.tenantId)
    return q.order('product_id').order('branch_id').range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>
  }, 'carregar os saldos com mínimo')

  let abaixo = 0
  let avisados = 0
  let limpos = 0
  for (const l of linhas) {
    const saldo = { embalagens: Number(l.current_stock), rendimento: l.current_rendimento != null ? Number(l.current_rendimento) : null, minimo: Number(l.min_stock) }
    const medidas = { unit: l.products?.unit ?? '', consumption_unit: l.products?.consumption_unit ?? null, units_per_package: l.products?.units_per_package ?? null }
    const situacao = situacaoDoEstoque(saldo, medidas)
    const baixo = situacao === 'SEM_ESTOQUE' || estoqueBaixo(situacao)

    if (!baixo) {
      // Saiu do mínimo: o próximo cruzamento avisa de novo.
      if (l.minimo_avisado_em) {
        await gravar(admin.from('branch_product_stock').update({ minimo_avisado_em: null })
          .eq('product_id', l.product_id).eq('branch_id', l.branch_id), 'liberar o aviso do mínimo')
        limpos++
      }
      continue
    }
    abaixo++
    if (l.minimo_avisado_em) continue
    // Reivindica ANTES de avisar: a passada que perde não avisa.
    const { data: minha, error } = await admin.from('branch_product_stock').update({ minimo_avisado_em: new Date().toISOString() })
      .eq('product_id', l.product_id).eq('branch_id', l.branch_id).is('minimo_avisado_em', null).select('product_id')
    if (error) throw new Error(`Não consegui marcar o aviso do mínimo: ${error.message}`)
    if (!minha?.length) continue

    const produto = l.products?.name ?? 'Produto'
    const textoDoSaldo = formatarQuantidadeComUnidade(saldoParaMostrar(saldo, medidas))
    // A15 da 14ª: o mínimo herdado do cadastro diz "(do cadastro)", como na tela.
    const textoDoMinimo = rotuloDoMinimo(minimoParaMostrar(saldo, medidas), minimoEhDoCadastro(saldo.minimo, l.products?.min_stock != null ? Number(l.products.min_stock) : null))
    await notificarInteressados(admin,
      // Sem envolvido direto: estoque não é "de" ninguém. E sem ator: o saldo
      // pode ter caído por um atendimento de terceiros.
      { modulo: 'stock', branchId: l.branch_id },
      {
        type:  'stock_below_minimum',
        title: `Estoque ${ROTULO_DA_SITUACAO[situacao].toLowerCase()}`,
        body:  `${produto}: ${textoDoSaldo} em estoque, mínimo ${textoDoMinimo}.`,
        data:  { produto_id: l.product_id, branch_id: l.branch_id },
      })
    avisados++
  }
  return { abaixo, avisados, limpos }
}
