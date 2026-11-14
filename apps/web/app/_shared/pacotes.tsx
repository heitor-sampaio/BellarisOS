import { can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { PacotesCatalogo } from '@/components/admin/pacotes-catalogo'
import { catalogoDePacotes } from '@/lib/pacotes/leitura'
import { podeMudarComissaoDoProcedimento } from '@/lib/comissoes/gravacao'
import { TEXTO_DA_VENDA_DO_PACOTE } from '@/lib/permissions-copy'

/**
 * Vendas → Pacotes, o corpo dos dois portais. O catálogo é da REDE: edita quem
 * tem Procedimentos em Gerenciar, e só isso (PC6, a revisão do Heitor de
 * 2026-11-13), dos dois portais. A venda é no PDV.
 */
export async function PacotesDaRede({ ctx, unidadeId, busca }: { ctx: TenantContext; unidadeId?: string; busca?: string }) {
  const podeEditar = can(ctx, 'procedures', 'MANAGE')
  // A comissão do pacote (2026-10-30) é do financeiro, como a do procedimento.
  const podeComissao = podeEditar && podeMudarComissaoDoProcedimento(ctx)
  const [pacotes, procedimentos] = await Promise.all([
    catalogoDePacotes(ctx.tenantId!, { branchId: unidadeId ?? null }),
    podeEditar
      ? ler(createAdminClient().from('procedures').select('id, name, price')
          .eq('tenant_id', ctx.tenantId!).is('branch_id', null).eq('is_active', true).order('name'), 'carregar os procedimentos')
      : Promise.resolve([] as { id: string; name: string; price: number }[]),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
          Pacotes
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Um conjunto de procedimentos, iguais ou não, vendido por um preço só. {TEXTO_DA_VENDA_DO_PACOTE}
        </p>
      </div>
      <PacotesCatalogo
        pacotes={pacotes}
        procedimentos={((procedimentos ?? []) as { id: string; name: string; price: number | null }[]).map(p => ({ id: p.id, name: p.name, price: Number(p.price ?? 0) }))}
        podeEditar={podeEditar}
        podeComissao={podeComissao}
        buscaInicial={busca}
      />
    </div>
  )
}
