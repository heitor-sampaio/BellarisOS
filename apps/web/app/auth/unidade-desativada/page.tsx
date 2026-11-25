import { redirect } from 'next/navigation'
import { getTenantContext, unidadesDoContexto } from '@/lib/auth'
import { getCachedTodasAsUnidades, getCachedRede } from '@/lib/cached-queries'
import { unidadeDaTelaDesativada } from '@/lib/unidades/desativada-no-endereco'
import { logoutAction } from '@/actions/auth'

export const dynamic = 'force-dynamic'

/**
 * A pessoa da equipe que só tinha unidades desativadas (D5 da 30ª simulação;
 * plataforma:UN-13; princípio 7; decisão do Claude, 25/11). O endereço e o
 * login davam "Página não encontrada", sem saída. Aqui ela lê o fato e quem
 * procurar, e sai. A pessoa segue ativa: levá-la a outra unidade é da rede
 * ("Mudar a equipe de unidade", UN-11, ou a Equipe).
 *
 * O nome sai das unidades da rede, lidas no servidor — o `?unidade=` só
 * escolhe entre as DELA. Mora em `/auth/…`, fora do espaço dos slugs.
 */
export default async function UnidadeDesativadaPage({ searchParams }: { searchParams: Promise<{ unidade?: string }> }) {
  const ctx = await getTenantContext()
  if (ctx.isClient || !ctx.tenantId) redirect('/auth/redirect')
  const { unidade } = await searchParams
  const [todas, rede] = await Promise.all([getCachedTodasAsUnidades(ctx.tenantId), getCachedRede(ctx.tenantId)])
  const tela = unidadeDaTelaDesativada({ pedida: unidade ?? null, todas, unidades: unidadesDoContexto(ctx) })
  if (tela.tipo === 'redirecionar') redirect(tela.para)

  return (
    <main className="suporte-centro" style={{ minHeight: '100dvh', background: 'var(--bg-app)', padding: 'var(--content-pad-x)' }}>
      <div className="card suporte-cartao-estreito" data-unidade-desativada>
        {rede?.nome && <p className="overline">{rede.nome}</p>}
        <h1 className="suporte-titulo">Unidade desativada</h1>
        <p className="suporte-texto">
          {tela.nome ? `A unidade ${tela.nome}` : 'A sua unidade'} foi desativada. Fale com quem administra a rede.
        </p>
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">Sair</button>
        </form>
      </div>
    </main>
  )
}
