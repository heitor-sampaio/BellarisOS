import Link from 'next/link'
import { getPlatformContext } from '@/lib/plataforma/contexto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { contemSemAcento, termoDaUrl } from '@/lib/texto'
import { rotuloDaSituacao } from '@/lib/plataforma/plano'
import { BuscaNaUrl } from '@/components/shared/busca-na-url'

/**
 * Todas as redes que assinam o BellarisOS — a única tela do sistema que
 * cruza redes. Agregada no banco (`suporte_resumo_redes`, só service role).
 *
 * As redes de teste (`[e2e]`) ficam escondidas até se pedir `?teste=1`: o E2E
 * roda no banco da produção, e elas seriam metade da lista.
 */
interface Rede {
  id: string; name: string; slug: string; email: string | null
  plan_name: string | null; plan_status: string | null; trial_ends_at: string | null; is_active: boolean
  created_at: string; onboarding_completed_at: string | null
  unidades: number; membros: number; clientes: number; ultimo_uso: string | null
}

const data = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
  : '—'

export default async function RedesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; teste?: string }>
}) {
  await getPlatformContext()
  const { q, teste } = await searchParams
  const termo = termoDaUrl(q)
  const comTeste = teste === '1'

  const todas = (await ler(createAdminClient().rpc('suporte_resumo_redes'), 'carregar as redes') ?? []) as Rede[]
  const redes = todas
    .filter(r => comTeste || !r.name.startsWith('[e2e]'))
    .filter(r => contemSemAcento([r.name, r.slug, r.email], termo))

  return (
    <div className="suporte-pilha-larga">
      <div className="suporte-cabecalho">
        <div>
          <h1 className="suporte-titulo">Redes</h1>
          <p className="suporte-sub">{redes.length} {redes.length === 1 ? 'rede' : 'redes'}{termo ? ' encontradas' : ''}</p>
        </div>
        <div className="suporte-filtros">
          <BuscaNaUrl inicial={termo} placeholder="Buscar rede, endereço ou e-mail…" rotulo="Buscar rede" />
          <Link
            href={comTeste ? '/suporte/redes' : '/suporte/redes?teste=1'}
            className="filtro-toggle"
            aria-pressed={comTeste}
          >
            Redes de teste
          </Link>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {redes.length === 0 ? (
          <p className="suporte-vazio">Nenhuma rede encontrada.</p>
        ) : (
          <table className="cards-mobile suporte-tabela">
            <thead>
              <tr>
                <th>Rede</th><th>Situação</th><th>Unidades</th><th>Membros</th><th>Clientes</th><th>Último uso</th>
              </tr>
            </thead>
            <tbody>
              {redes.map(r => (
                <tr key={r.id}>
                  <td data-label="">
                    <Link href={`/suporte/redes/${r.id}`} className="suporte-link-forte">{r.name}</Link>
                    <span className="suporte-texto-fraco"> · {r.slug}{r.email ? ` · ${r.email}` : ''}</span>
                  </td>
                  <td data-label="Situação">
                    <span className="chip suporte-chip">{rotuloDaSituacao(r.plan_status)}</span>
                    {r.plan_name && <span className="suporte-texto-fraco"> {r.plan_name}</span>}
                  </td>
                  <td data-label="Unidades" data-par>{r.unidades}</td>
                  <td data-label="Membros" data-par>{r.membros}</td>
                  <td data-label="Clientes" data-par>{r.clientes}</td>
                  <td data-label="Último uso" data-par>{data(r.ultimo_uso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
