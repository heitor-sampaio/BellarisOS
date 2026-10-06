import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { PlanosDoCatalogo } from '@/components/sistema/planos-do-catalogo'

/**
 * O catálogo de planos que o BellarisOS vende. A rede guarda o RETRATO do
 * valor ao escolher um plano (mudar o catálogo não muda o combinado); plano
 * não se apaga, desativa.
 */
export default async function PlanosPage() {
  await getPlatformContext({ papel: 'ADMIN' })
  const admin = createAdminClient()
  const [planos, usos] = await Promise.all([
    ler(admin.from('platform_plans').select('id, nome, descricao, valor_centavos, ativo, ordem').order('ordem').order('nome'), 'carregar os planos'),
    ler(admin.from('tenant_subscriptions').select('plan_id'), 'contar as redes por plano'),
  ])
  const quantas = new Map<string, number>()
  for (const u of (usos ?? []) as { plan_id: string | null }[]) if (u.plan_id) quantas.set(u.plan_id, (quantas.get(u.plan_id) ?? 0) + 1)
  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Planos</h1>
          <p className="suporte-sub">O que o BellarisOS vende. Cada rede guarda o valor combinado; mudar aqui vale para as próximas.</p>
        </div>
      </div>
      <PlanosDoCatalogo planos={((planos ?? []) as { id: string; nome: string; descricao: string | null; valor_centavos: number; ativo: boolean; ordem: number }[])
        .map(p => ({ id: p.id, nome: p.nome, descricao: p.descricao, valorCentavos: p.valor_centavos, ativo: p.ativo, ordem: p.ordem, redes: quantas.get(p.id) ?? 0 }))} />
    </div>
  )
}
