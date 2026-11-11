import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { configDaRede } from '@/lib/fidelidade/leitura'
import { situacaoDoPremio } from '@/lib/fidelidade/indicacao'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'

/**
 * A indicação na ficha (decisão do Heitor, 2026-11-10): quem a indicou ("Indicada
 * por", a ligação a outra ficha — ou o texto da importação que não ligou) e quem
 * ELA indicou, com o prêmio ("Indicou: Marina (prêmio dado em 10/11)"). Quem
 * chama já conferiu que a ficha é da rede e que pode abri-la.
 */
export interface IndicacaoDaFicha {
  indicadaPor:      { id: string; nome: string } | null
  /** O "Indicado por" da planilha que não bateu com ficha nenhuma. */
  indicadaPorTexto: string | null
  indicou:          { id: string; nome: string; premio: string | null }[]
}

export async function indicacaoDaFicha(
  tenantId: string, clientId: string, raw: { indicada_por?: string | null; referred_by?: string | null },
): Promise<IndicacaoDaFicha> {
  const admin = createAdminClient()
  const [quem, indicadas, cfg] = await Promise.all([
    raw.indicada_por
      ? ler(admin.from('clients').select('id, name').eq('id', raw.indicada_por).eq('tenant_id', tenantId).maybeSingle(),
          'buscar quem indicou') as Promise<{ id: string; name: string } | null>
      : Promise.resolve(null),
    lerTodas<{ indicada_id: string; nome: string; premio_em: string | null; estornado_em: string | null; ja_pagou: boolean }>(
      (de, ate) => admin.rpc('indicacoes_da_ficha', { p_tenant: tenantId, p_cliente: clientId }).order('nome').order('indicada_id').range(de, ate),
      'ler quem a cliente indicou'),
    configDaRede(tenantId, admin),
  ])
  // A fidelidade é da rede: o dia do prêmio no fuso dela (F62b).
  const fuso = await fusoDaRede(tenantId)
  const regra = { fidelidadeLigada: cfg.enabled, premio: cfg.indicacao_premio }
  return {
    indicadaPor:      quem ? { id: quem.id, nome: quem.name } : null,
    indicadaPorTexto: quem ? null : (raw.referred_by?.trim() || null),
    indicou: (indicadas ?? []).map(i => ({
      id: i.indicada_id, nome: i.nome,
      premio: situacaoDoPremio({ id: i.indicada_id, nome: i.nome, premioEm: i.premio_em, estornadoEm: i.estornado_em, jaPagou: i.ja_pagou }, regra, fuso),
    })),
  }
}
