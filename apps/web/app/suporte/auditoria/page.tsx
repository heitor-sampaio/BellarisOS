import Link from 'next/link'
import { getPlatformContext } from '@/lib/plataforma/contexto'
import { ROTULO_DO_REGISTRO, type TipoDeRegistroDaPlataforma } from '@/lib/plataforma/auditoria'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/** Tudo o que a plataforma fez, do mais recente — só admin. */
const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

export default async function AuditoriaPage() {
  await getPlatformContext({ papel: 'ADMIN' })
  const registros = (await ler(createAdminClient().from('platform_audit_log')
    .select('id, kind, at, dados, target_user_id, tenant_id, platform_staff(name), tenants(name)')
    .order('at', { ascending: false }).limit(200), 'carregar a auditoria') ?? []) as unknown as {
      id: string; kind: TipoDeRegistroDaPlataforma; at: string; dados: Record<string, unknown>; target_user_id: string | null
      tenant_id: string | null; platform_staff: { name: string } | null; tenants: { name: string } | null
    }[]

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Auditoria da plataforma</h1>
          <p className="suporte-sub">Os 200 registros mais recentes. Nada daqui se altera.</p>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {registros.length === 0 ? <p className="suporte-vazio">Nenhum registro ainda.</p> : (
          <table className="cards-mobile suporte-tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Rede</th></tr></thead>
            <tbody>
              {registros.map(r => (
                <tr key={r.id}>
                  <td data-label="Quando" data-par>{quando(r.at)}</td>
                  <td data-label="Quem" data-par>{r.platform_staff?.name ?? '—'}</td>
                  <td data-label="O quê">{ROTULO_DO_REGISTRO[r.kind] ?? r.kind}</td>
                  <td data-label="Rede">
                    {r.tenant_id ? <Link href={`/suporte/redes/${r.tenant_id}`}>{r.tenants?.name ?? 'rede'}</Link> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
