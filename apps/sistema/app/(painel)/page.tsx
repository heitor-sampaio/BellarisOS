import Link from 'next/link'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { reaisDe } from '@estetica-os/nucleo/lib/redes/valor'
import { SituacaoDaRede } from '@/components/sistema/situacao-da-rede'

/**
 * O PAINEL do negócio. Os números saem do banco, numa conta só
 * (`plataforma_indicadores`), sem as redes de teste ([e2e]); a lista "precisa
 * de atenção" é o que pede ação agora: atraso, suspensão, teste acabando.
 */
interface Indicadores {
  total: number; em_teste: number; ativas: number; em_atraso: number; suspensas: number
  canceladas: number; desligadas: number; mrr_centavos: number; recebido_mes_centavos: number
  novas_mes: number; canceladas_mes: number; teste_vencendo_7d: number; sem_cobranca: number
}

/** O instante daqui a N dias (o "teste acabando" da lista de atenção). */
function daquiADias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString()
}

const quando = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  : '—'

export default async function PainelDoSistemaPage() {
  const ctx = await getPlatformContext({ verSistema: true })
  const admin = createAdminClient()
  const em7 = daquiADias(7)
  const [ind, atencao] = await Promise.all([
    ler(admin.rpc('plataforma_indicadores', { p_somente_teste: false }), 'calcular os indicadores da plataforma') as Promise<Indicadores | null>,
    ler(admin.from('tenants')
      .select('id, name, is_active, plan_status, trial_ends_at, em_atraso_desde')
      .not('name', 'like', '[e2e]%')
      .or(`plan_status.in.(past_due,suspended),and(plan_status.eq.trial,trial_ends_at.lte.${em7}),is_active.eq.false`)
      .order('em_atraso_desde', { ascending: true, nullsFirst: false })
      .limit(30), 'listar as redes que precisam de atenção'),
  ])
  const i = ind ?? {} as Indicadores
  const redes = (atencao ?? []) as {
    id: string; name: string; is_active: boolean; plan_status: string | null; trial_ends_at: string | null; em_atraso_desde: string | null
  }[]

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Painel</h1>
          <p className="suporte-sub">{i.total ?? 0} {i.total === 1 ? 'rede' : 'redes'} no BellarisOS</p>
        </div>
        {ctx.podeEditar && <Link href="/redes/nova" className="btn-primary">Nova rede</Link>}
      </div>

      <div className="sistema-kpis">
        {/* O número que importa mais é o preenchido (§13). */}
        <div className="card-brand sistema-kpi">
          <p className="overline">Receita recorrente (MRR)</p>
          <p className="sistema-kpi-valor">{reaisDe(i.mrr_centavos ?? 0)}</p>
          <p className="sistema-kpi-nota">cobrança ligada no Asaas{i.sem_cobranca ? ` · ${i.sem_cobranca} com plano e sem cobrança` : ''}</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Recebido no mês</p>
          <p className="sistema-kpi-valor">{reaisDe(i.recebido_mes_centavos ?? 0)}</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Em dia</p>
          <p className="sistema-kpi-valor">{i.ativas ?? 0}</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Em teste</p>
          <p className="sistema-kpi-valor">{i.em_teste ?? 0}</p>
          <p className="sistema-kpi-nota">{i.teste_vencendo_7d ?? 0} acabam em 7 dias</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Em atraso</p>
          <p className="sistema-kpi-valor">{i.em_atraso ?? 0}</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Suspensas</p>
          <p className="sistema-kpi-valor">{i.suspensas ?? 0}</p>
          <p className="sistema-kpi-nota">{i.desligadas ?? 0} desligadas à mão</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Novas no mês</p>
          <p className="sistema-kpi-valor">{i.novas_mes ?? 0}</p>
        </div>
        <div className="card sistema-kpi">
          <p className="overline">Canceladas no mês</p>
          <p className="sistema-kpi-valor">{i.canceladas_mes ?? 0}</p>
          <p className="sistema-kpi-nota">{i.canceladas ?? 0} no total</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 className="overline suporte-secao-titulo">Precisam de atenção</h2>
        {redes.length === 0 ? <p className="suporte-vazio">Nada pendente.</p> : (
          <table className="cards-mobile suporte-tabela">
            <thead><tr><th>Rede</th><th>Situação</th><th>Em atraso desde</th><th>Teste até</th></tr></thead>
            <tbody>
              {redes.map(r => (
                <tr key={r.id}>
                  <td data-label=""><Link href={`/redes/${r.id}`} className="suporte-link-forte">{r.name}</Link></td>
                  <td data-label="Situação" data-par><SituacaoDaRede ativa={r.is_active} planStatus={r.plan_status} /></td>
                  <td data-label="Em atraso desde" data-par>{r.em_atraso_desde ? quando(`${r.em_atraso_desde}T12:00:00`) : '—'}</td>
                  <td data-label="Teste até" data-par>{quando(r.trial_ends_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
