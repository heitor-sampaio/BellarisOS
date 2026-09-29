import { can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { PacotesCatalogo } from '@/components/admin/pacotes-catalogo'
import { catalogoDePacotes } from '@/lib/pacotes/leitura'

/**
 * Vendas → Pacotes, o corpo dos dois portais. O catálogo é da REDE: edita quem
 * tem `procedures: MANAGE` e abrangência de rede; na unidade ele é consulta
 * (mais os pacotes locais dela, se houver). A venda é na ficha do cliente.
 */
export async function PacotesDaRede({ ctx, unidadeId }: { ctx: TenantContext; unidadeId?: string }) {
  const podeEditar = can(ctx, 'procedures', 'MANAGE') && ctx.branchId === null
  const [pacotes, procedimentos] = await Promise.all([
    catalogoDePacotes(ctx.tenantId!, { branchId: unidadeId ?? null }),
    podeEditar
      ? ler(createAdminClient().from('procedures').select('id, name')
          .eq('tenant_id', ctx.tenantId!).is('branch_id', null).eq('is_active', true).order('name'), 'carregar os procedimentos')
      : Promise.resolve([] as { id: string; name: string }[]),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
          Pacotes
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          Sessões de um procedimento vendidas juntas. A venda é na ficha do cliente, em “Vender pacote”.
        </p>
      </div>
      <PacotesCatalogo
        pacotes={pacotes}
        procedimentos={(procedimentos ?? []) as { id: string; name: string }[]}
        podeEditar={podeEditar}
      />
    </div>
  )
}
