import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { lerRegrasDoPacote, pacoteVencidoParaCancelar, type RegrasDoPacote, type PacoteVencidoDaFicha } from '@/lib/pacotes/regras'

/** As regras do pacote da rede (itens 8 e 9 da auditoria; `lib/pacotes/regras.ts`). */
export async function regrasDoPacoteDaRede(tenantId: string): Promise<RegrasDoPacote> {
  return lerRegrasDoPacote(await ler(createAdminClient().from('tenants')
    .select('pacote_crediario_libera, pacote_vencido_cancela').eq('id', tenantId).maybeSingle(), 'ler as regras do pacote da rede'))
}

/**
 * Item 9: o pacote vencido que a ficha oferece cancelar (a rede com a regra
 * ligada), dos pacotes que a ficha já leu — com o nome, as sessões que
 * sobraram e o dia em que venceu, no fuso da unidade dele.
 */
export async function pacoteVencidoDaFicha(
  tenantId: string,
  pacotes: { id: string; branch_id?: string | null; cancelado_em?: string | null; expires_at?: string | null
    package_sessions?: { status: string }[] | null; service_packages?: unknown }[],
  regras: RegrasDoPacote,
): Promise<PacoteVencidoDaFicha | null> {
  const p = pacoteVencidoParaCancelar(pacotes, regras)
  if (!p) return null
  const nome = (p.service_packages as { name?: string } | null)?.name ?? 'Pacote'
  return {
    id: p.id, nome,
    restantes: (p.package_sessions ?? []).filter(s => s.status === 'AVAILABLE').length,
    venceuEm: formatarNoFuso(p.expires_at!, 'dd/MM/yyyy', await fusoDaUnidade(tenantId, p.branch_id ?? null)),
  }
}
