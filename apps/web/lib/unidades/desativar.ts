import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getValorEmEstoque } from '@/lib/metrics/unidade'
import { getAReceberEmAberto } from '@/lib/metrics/queries'
import { getTotalDosAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { resumoDasComissoes } from '@/lib/comissoes/leitura'
import { totaisDoResumoDasComissoes } from '@/lib/metrics/comissoes'
import type { OQueFicaNaUnidade } from '@/lib/unidades/o-que-fica'
import { dayKeyTZ } from '@/lib/datetime'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'

export { resumoDoQueFica, temOQueFicou, caminhosDoQueFica, NADA_FICA, type OQueFicaNaUnidade } from '@/lib/unidades/o-que-fica'

type Admin = ReturnType<typeof createAdminClient>

const ABERTOS = ['SCHEDULED', 'CONFIRMED']

/**
 * O que fica para trás quando uma unidade sai do ar (C67 da F70; H6 = a, o
 * Heitor; D2 e A32 da 14ª, F72): a equipe fixa só nela, os agendamentos
 * futuros, o estoque com saldo, o a receber e a comissão a pagar. Cada número
 * sai da MESMA conta da tela que o mostra (o valor em estoque, o "em aberto" do
 * Financeiro, o "a pagar" das Comissões) — a janela e a tela dizem o mesmo.
 * Também decide se a unidade DESATIVADA continua nas telas de leitura
 * (`unidadesParaLer`, `lib/unidades/da-tela.ts`).
 */
export async function oQueFicaNaUnidade(admin: Admin, tenantId: string, branchId: string): Promise<OQueFicaNaUnidade> {
  const agora = new Date()
  const [fixos, primeiro, contagem, itens, valor, aReceber, semPagamento, comissoes] = await Promise.all([
    ler(admin.from('users').select('id, name')
      .eq('tenant_id', tenantId).eq('branch_id', branchId).eq('is_active', true).order('name'), 'carregar a equipe fixa da unidade') as
      Promise<{ id: string; name: string }[] | null>,
    ler(admin.from('appointments').select('scheduled_at')
      .eq('branch_id', branchId).in('status', ABERTOS).gte('scheduled_at', agora.toISOString())
      .order('scheduled_at').limit(1), 'achar o próximo agendamento da unidade') as Promise<{ scheduled_at: string }[] | null>,
    admin.from('appointments').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).in('status', ABERTOS).gte('scheduled_at', agora.toISOString()),
    admin.from('branch_product_stock').select('product_id', { count: 'exact', head: true })
      .eq('branch_id', branchId).or('current_stock.gt.0,current_rendimento.gt.0'),
    getValorEmEstoque([branchId]),
    getAReceberEmAberto({ tenantId, branchIds: [branchId] }),
    getTotalDosAtendimentosAReceber({ tenantId, unidadeId: branchId }),
    resumoDasComissoes({ tenantId, branchIds: [branchId], inicio: new Date(0), fim: agora, profissionalId: null }),
  ])
  if (contagem.error) throw new Error(`contar os agendamentos da unidade: ${contagem.error.message}`)
  if (itens.error) throw new Error(`contar o estoque da unidade: ${itens.error.message}`)
  const primeiroEm = primeiro?.[0]?.scheduled_at ?? null
  const diaDoPrimeiro = primeiroEm ? dayKeyTZ(primeiroEm, await fusoDaUnidade(tenantId, branchId)) : null
  return {
    fixos: (fixos ?? []).map(f => ({ id: f.id, nome: f.name })),
    agendamentos: contagem.count ?? 0,
    primeiroAgendamento: primeiroEm,
    diaDoPrimeiro,
    estoque: { itens: itens.count ?? 0, valor },
    aReceber: aReceber.total,
    atendimentosSemPagamento: semPagamento,
    comissaoAPagar: totaisDoResumoDasComissoes(comissoes).aPagar,
  }
}
