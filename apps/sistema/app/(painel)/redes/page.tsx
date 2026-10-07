import Link from 'next/link'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'
import { contemSemAcento, termoDaUrl } from '@estetica-os/nucleo/lib/texto'
import { reaisDe } from '@estetica-os/nucleo/lib/redes/valor'
import { BuscaNaUrl } from '@estetica-os/nucleo/components/shared/busca-na-url'
import { FiltroNaUrl } from '@/components/sistema/filtro-na-url'
import { SituacaoDaRede } from '@/components/sistema/situacao-da-rede'

/**
 * Todas as redes, para ADMINISTRAR: situação, plano, valor e próximo
 * vencimento. A contagem vem de `suporte_resumo_redes` (agregada no banco); a
 * assinatura, de `tenant_subscriptions`. As redes de teste ([e2e]) só com
 * `?teste=1`.
 */
interface Rede {
  id: string; name: string; slug: string; email: string | null; plan_name: string | null
  plan_status: string | null; trial_ends_at: string | null; is_active: boolean; created_at: string
  unidades: number; membros: number; clientes: number; ultimo_uso: string | null
}

const SITUACOES = [
  { valor: '',          rotulo: 'Todas as situações' },
  { valor: 'trial',     rotulo: 'Em teste' },
  { valor: 'active',    rotulo: 'Em dia' },
  { valor: 'past_due',  rotulo: 'Em atraso' },
  { valor: 'suspended', rotulo: 'Suspensas' },
  { valor: 'canceled',  rotulo: 'Canceladas' },
  { valor: 'desligada', rotulo: 'Desligadas' },
]

const quando = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  : '—'

export default async function RedesDoSistemaPage({ searchParams }: {
  searchParams: Promise<{ q?: string; teste?: string; situacao?: string }>
}) {
  const ctx = await getPlatformContext({ verSistema: true })
  const { q, teste, situacao } = await searchParams
  const termo = termoDaUrl(q)
  const comTeste = teste === '1'
  const filtro = SITUACOES.some(s => s.valor === situacao) ? situacao ?? '' : ''

  const admin = createAdminClient()
  const [todas, subs] = await Promise.all([
    ler(admin.rpc('suporte_resumo_redes'), 'carregar as redes'),
    ler(admin.from('tenant_subscriptions').select('tenant_id, valor_total_centavos, proximo_vencimento, cobranca'), 'carregar as assinaturas'),
  ])
  const assinatura = new Map(((subs ?? []) as { tenant_id: string; valor_total_centavos: number; proximo_vencimento: string | null; cobranca: string }[])
    .map(s => [s.tenant_id, s]))
  const redes = ((todas ?? []) as Rede[])
    .filter(r => comTeste || !r.name.startsWith('[e2e]'))
    .filter(r => !filtro || (filtro === 'desligada' ? !r.is_active : r.is_active && r.plan_status === filtro))
    .filter(r => contemSemAcento([r.name, r.slug, r.email, r.plan_name], termo))

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Redes</h1>
          <p className="suporte-sub">{redes.length} {redes.length === 1 ? 'rede' : 'redes'}</p>
        </div>
        <div className="suporte-filtros">
          <BuscaNaUrl inicial={termo} placeholder="Buscar rede, e-mail ou plano…" rotulo="Buscar rede" />
          <FiltroNaUrl nome="situacao" valor={filtro} opcoes={SITUACOES} rotulo="Situação" />
          <Link href={comTeste ? '/redes' : '/redes?teste=1'} className="filtro-toggle" aria-pressed={comTeste}>
            Redes de teste
          </Link>
          {ctx.podeEditar && <Link href="/redes/nova" className="btn-primary">Nova rede</Link>}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {redes.length === 0 ? <p className="suporte-vazio">Nenhuma rede encontrada.</p> : (
          <table className="cards-mobile suporte-tabela">
            <thead>
              <tr><th>Rede</th><th>Situação</th><th>Plano</th><th>Valor</th><th>Próx. vencimento</th><th>Unidades</th><th>Membros</th><th>Último uso</th></tr>
            </thead>
            <tbody>
              {redes.map(r => {
                const s = assinatura.get(r.id)
                return (
                  <tr key={r.id}>
                    <td data-label="">
                      <Link href={`/redes/${r.id}`} className="suporte-link-forte">{r.name}</Link>
                      <span className="suporte-texto-fraco"> · {r.email ?? r.slug}</span>
                    </td>
                    <td data-label="Situação" data-par><SituacaoDaRede ativa={r.is_active} planStatus={r.plan_status} /></td>
                    <td data-label="Plano" data-par>{r.plan_name ?? '—'}</td>
                    <td data-label="Valor" data-par>{s ? reaisDe(s.valor_total_centavos) : '—'}</td>
                    <td data-label="Próx. vencimento" data-par>
                      {s?.proximo_vencimento ? quando(`${s.proximo_vencimento}T12:00:00`) : r.plan_status === 'trial' ? `teste até ${quando(r.trial_ends_at)}` : '—'}
                    </td>
                    <td data-label="Unidades" data-par>{r.unidades}</td>
                    <td data-label="Membros" data-par>{r.membros}</td>
                    <td data-label="Último uso" data-par>{quando(r.ultimo_uso)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
