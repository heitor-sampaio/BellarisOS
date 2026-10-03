import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { lerClaims, marcaDaPlataforma, getCachedStaff } from '@/lib/plataforma/contexto'
import { logoutAction } from '@/actions/auth'
import { NavDoSuporte } from '@/components/suporte/nav-do-suporte'

/**
 * O portal da PLATAFORMA — a equipe do BellarisOS atendendo as redes.
 *
 * Fora dos portais das redes de propósito: sem menu de rede, sem topbar de
 * clínica, sem busca universal. O layout só monta a moldura e desvia quem não
 * é da plataforma; cada página confere a pessoa por si (`getPlatformContext`),
 * porque layout e página renderizam em paralelo (§6).
 */
export default async function SuporteLayout({ children }: { children: ReactNode }) {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  if (!marcaDaPlataforma(claims)) redirect('/')

  const staff = await getCachedStaff(claims.sub)
  const verificado = claims.aal === 'aal2' && !!staff?.is_active

  return (
    <div className="suporte-shell">
      <header className="suporte-topo">
        <div className="suporte-marca">
          BellarisOS <span aria-hidden>✦</span> <span className="suporte-marca-sub">Suporte</span>
        </div>
        {verificado && <NavDoSuporte ehAdmin={staff?.papel === 'ADMIN'} />}
        <div className="suporte-quem">
          {staff && <span className="suporte-quem-nome">{staff.name}</span>}
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost">Sair</button>
          </form>
        </div>
      </header>
      <main className="suporte-conteudo">{children}</main>
    </div>
  )
}
