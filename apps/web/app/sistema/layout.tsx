import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { lerClaims, marcaDaPlataforma, getCachedStaff } from '@/lib/plataforma/contexto'
import { logoutAction } from '@/actions/auth'
import { NavDoSistema } from '@/components/sistema/nav-do-sistema'
import { SeletorDePortal } from '@/components/plataforma/seletor-de-portal'

/**
 * A ADMINISTRAÇÃO DO SISTEMA — o negócio BellarisOS: painel, redes (criar,
 * editar, assinatura, suspender), planos, cobrança, a equipe da plataforma,
 * auditoria e configurações. Só ADMIN; o atendimento é o /suporte.
 *
 * O layout só monta a moldura e desvia quem não é ADMIN; cada página confere a
 * pessoa por si (`getPlatformContext({ papel: 'ADMIN' })`), porque layout e
 * página renderizam em paralelo (§6).
 */
export default async function SistemaLayout({ children }: { children: ReactNode }) {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  const marca = marcaDaPlataforma(claims)
  if (!marca) redirect('/')
  if (marca !== 'ADMIN') redirect('/suporte')

  const staff = await getCachedStaff(claims.sub)
  const verificado = claims.aal === 'aal2' && !!staff?.is_active && staff.papel === 'ADMIN'

  return (
    <div className="suporte-shell">
      <header className="suporte-topo">
        <div className="suporte-marca">
          BellarisOS <span aria-hidden>✦</span> <span className="suporte-marca-sub">Sistema</span>
        </div>
        {verificado && <NavDoSistema />}
        <div className="suporte-quem">
          {verificado && <SeletorDePortal />}
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
