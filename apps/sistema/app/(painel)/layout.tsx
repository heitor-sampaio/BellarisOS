import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { lerClaims, marcaDaPlataforma, getCachedStaff } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { sair } from '@/actions/acesso'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'
import { NavDoSistema } from '@/components/sistema/nav-do-sistema'
import { SeletorDePortal } from '@estetica-os/nucleo/components/plataforma/seletor-de-portal'
import { verificacaoDaSessao } from '@estetica-os/nucleo/lib/plataforma/verificacao-exigida'

/**
 * A ADMINISTRAÇÃO DO SISTEMA — o negócio BellarisOS: painel, redes (criar,
 * editar, assinatura, suspender), planos, cobrança, a equipe da plataforma,
 * auditoria e configurações. Só ADMIN; o atendimento é o app do suporte (outro host).
 *
 * O layout só monta a moldura e desvia quem não é ADMIN; cada página confere a
 * pessoa por si (`getPlatformContext({ papel: 'ADMIN' })`), porque layout e
 * página renderizam em paralelo (§6).
 */
export default async function SistemaLayout({ children }: { children: ReactNode }) {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  const marca = marcaDaPlataforma(claims)
  // O proxy já recusa quem não é ADMIN; isto é a segunda parede.
  if (marca !== 'ADMIN') redirect('/login')

  const staff = await getCachedStaff(claims.sub)
  const verificado = !(await verificacaoDaSessao()).pendente && !!staff?.is_active && staff.papel === 'ADMIN'

  return (
    <div className="suporte-shell">
      <header className="suporte-topo">
        <div className="suporte-marca">
          BellarisOS <span aria-hidden>✦</span> <span className="suporte-marca-sub">Sistema</span>
        </div>
        {verificado && <NavDoSistema />}
        <div className="suporte-quem">
          {verificado && <SeletorDePortal atual="sistema" urls={{ sistema: urlDoHost('sistema'), suporte: urlDoHost('suporte') }} />}
          {staff && <span className="suporte-quem-nome">{staff.name}</span>}
          <form action={sair}>
            <button type="submit" className="btn-ghost">Sair</button>
          </form>
        </div>
      </header>
      <main className="suporte-conteudo">{children}</main>
    </div>
  )
}
