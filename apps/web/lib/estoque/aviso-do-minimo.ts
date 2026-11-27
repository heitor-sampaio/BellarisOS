import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { notificarInteressados } from '@/lib/notifications/interessados'
import {
  situacaoDoEstoque, saldoParaMostrar, minimoParaMostrar, formatarQuantidadeComUnidade, ROTULO_DA_SITUACAO,
  minimoEhDoCadastro, rotuloDoMinimo,
} from './situacao'

type Admin = ReturnType<typeof createAdminClient>
type Num = number | string

/**
 * O estoque no mínimo ou abaixo chega ao SINO (A48 da 11ª simulação,
 * 2026-11-10: o dashboard da Gisele dizia "2" e o sino "Tudo em dia"), UMA vez
 * a CADA cruzamento (ES-30 / NE-06).
 *
 * **O cruzamento se registra no banco, na hora do movimento** (D1 da 36ª
 * simulação, decisão do Claude, 27/11, quanto à forma): a Máscara, mínimo 5,
 * foi 6 → 4 → 3 → 7 → 4 numa hora — cruzou duas vezes —, e o sino teve um aviso
 * só, às 03:02. O aviso saía só da rotina de hora em hora, que olhava o ESTADO
 * da linha (`minimo_avisado_em`): o que cruza, repõe e cruza de novo entre duas
 * passadas era um aviso. Agora o gatilho de `branch_product_stock`
 * (`private.estoque_registrar_cruzamento_do_minimo`, migration
 * `20261215300001`), que todo caminho que mexe no saldo atravessa (conclusão,
 * desistência, venda, voucher, entrada, ajuste, perda, transferência, os
 * "desfazer", o mínimo salvo à mão), põe cada ENTRADA no mínimo na fila
 * `estoque_cruzamentos_do_minimo`, com o saldo daquele momento (o último,
 * enquanto ainda não avisado). Sair do mínimo (a reposição) rearma: a próxima
 * entrada é outro cruzamento.
 *
 * A régua é a da TELA (`situacaoDoEstoque`, princípio 3), espelhada no banco
 * em `private.estoque_avisa_no_minimo`: no rendimento, o "No mínimo" conta, e o
 * zerado também.
 *
 * Aqui sai o aviso de cada cruzamento da fila — logo depois do movimento
 * (`avisarOMinimoDepois`, pelo `after()`), e a rotina de hora em hora é a rede
 * de segurança. Cada cruzamento é reivindicado ANTES de avisar (CLAUDE.md §14:
 * duas passadas não avisam duas vezes). Vai para quem tem o Estoque em
 * Gerenciar na unidade (a regra de partes interessadas: a unidade ao alcance).
 *
 * `tenantId` recorta uma rede (a action e o teste passam a dela); o cron passa nulo.
 */
export async function avisarEstoqueMinimo(admin: Admin, opcoes: { tenantId?: string | null } = {}): Promise<{ pendentes: number; avisados: number }> {
  type Cruzamento = {
    id: string; branch_id: string; product_id: string; cruzou_em: string
    current_stock: Num; current_rendimento: Num | null; min_stock: Num
    branch_product_stock: {
      minimo_avisado_em: string | null
      products: { name: string; unit: string; consumption_unit: string | null; units_per_package: Num | null; is_active: boolean; min_stock: Num | null } | null
    } | null
  }
  const fila = await lerTodas<Cruzamento>((de, ate) => {
    let q = admin.from('estoque_cruzamentos_do_minimo')
      .select('id, branch_id, product_id, cruzou_em, current_stock, current_rendimento, min_stock, branch_product_stock!inner(minimo_avisado_em, products!inner(name, unit, consumption_unit, units_per_package, is_active, min_stock))')
      .is('avisado_em', null)
    if (opcoes.tenantId) q = q.eq('tenant_id', opcoes.tenantId)
    return q.order('cruzou_em').order('id').range(de, ate) as unknown as PromiseLike<{ data: Cruzamento[] | null; error: { message: string } | null }>
  }, 'carregar os cruzamentos do mínimo')

  let avisados = 0
  for (const c of fila) {
    // Reivindica ANTES de avisar: a passada que perde não avisa.
    const { data: minha, error } = await admin.from('estoque_cruzamentos_do_minimo').update({ avisado_em: new Date().toISOString() })
      .eq('id', c.id).is('avisado_em', null).select('id')
    if (error) throw new Error(`Não consegui marcar o aviso do mínimo: ${error.message}`)
    if (!minha?.length) continue

    const p = c.branch_product_stock?.products
    if (!p?.is_active) continue
    // A rotina de antes (o estado da linha) já avisou este cruzamento: a fila
    // nasceu com a migration, e o cron velho pode ter passado entre ela e o
    // código novo.
    const avisadoAntes = c.branch_product_stock?.minimo_avisado_em
    if (avisadoAntes && new Date(avisadoAntes).getTime() >= new Date(c.cruzou_em).getTime()) continue

    const saldo = { embalagens: Number(c.current_stock), rendimento: c.current_rendimento != null ? Number(c.current_rendimento) : null, minimo: Number(c.min_stock) }
    const medidas = { unit: p.unit ?? '', consumption_unit: p.consumption_unit ?? null, units_per_package: p.units_per_package ?? null }
    const situacao = situacaoDoEstoque(saldo, medidas)
    const textoDoSaldo = formatarQuantidadeComUnidade(saldoParaMostrar(saldo, medidas))
    // A15 da 14ª: o mínimo herdado do cadastro diz "(do cadastro)", como na tela.
    const textoDoMinimo = rotuloDoMinimo(minimoParaMostrar(saldo, medidas), minimoEhDoCadastro(saldo.minimo, p.min_stock != null ? Number(p.min_stock) : null))
    await notificarInteressados(admin,
      // Sem envolvido direto: estoque não é "de" ninguém. E sem ator: o saldo
      // pode ter caído por um atendimento de terceiros.
      { modulo: 'stock', branchId: c.branch_id },
      {
        type:  'stock_below_minimum',
        title: `Estoque ${ROTULO_DA_SITUACAO[situacao].toLowerCase()}`,
        body:  `${p.name ?? 'Produto'}: ${textoDoSaldo} em estoque, mínimo ${textoDoMinimo}.`,
        data:  { produto_id: c.product_id, branch_id: c.branch_id },
      })
    avisados++
  }
  return { pendentes: fila.length, avisados }
}

/**
 * Manda os avisos da fila da rede DEPOIS da resposta (o movimento já gravou e
 * o gatilho já pôs o cruzamento na fila). Toda action que mexe no saldo chama
 * isto; o que escapar, a rotina de hora em hora manda. Fora de um request
 * (script, teste) o `after()` lança, e o envio roda direto.
 */
export function avisarOMinimoDepois(tenantId: string | null): void {
  const enviar = async () => {
    try {
      await avisarEstoqueMinimo(createAdminClient(), { tenantId })
    } catch (e) {
      console.error('[aviso do mínimo]', (e as Error).message)
    }
  }
  try { after(enviar) } catch { void enviar() }
}
