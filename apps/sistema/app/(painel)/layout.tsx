import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { lerClaims, marcaDaPlataforma, getCachedStaff } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { sair } from '@/actions/acesso'
import { NavDoSistema } from '@/components/sistema/nav-do-sistema'
import { verificacaoDaSessao } from '@estetica-os/nucleo/lib/plataforma/verificacao-exigida'
import { aceitaNoHost, papelAlcanca } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * A ADMINISTRAÇÃO DO SISTEMA — o negócio BellarisOS: painel, redes (criar,
 * editar, assinatura, suspender), planos, cobrança, a equipe da plataforma,
 * auditoria e configurações. O ADMIN administra; o GERENTE (2026-10-07) só vê.
 * O atendimento é o app do suporte (outro host).
 *
 * O layout só monta a moldura e desvia quem não é do sistema; cada página
 * confere a pessoa por si (`getPlatformContext({ verSistema: true })`, e as
 * actions `{ papel: 'ADMIN' }`), porque layout e página renderizam em
 * paralelo (§6).
 */
export default async function SistemaLayout({ children }: { children: ReactNode }) {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  const marca = marcaDaPlataforma(claims)
  // O proxy já recusa quem não é do sistema; isto é a segunda parede.
  if (!aceitaNoHost('sistema', marca)) redirect('/login')

  const staff = await getCachedStaff(claims.sub)
  const verificado = !(await verificacaoDaSessao()).pendente && !!staff?.is_active && papelAlcanca(staff.papel, 'ver-sistema')

  return (
    <div className="suporte-shell">
      <header className="suporte-topo">
        <div className="suporte-marca">
          BellarisOS <span aria-hidden>✦</span> <span className="suporte-marca-sub">Sistema</span>
        </div>
        {verificado && <NavDoSistema />}
        <div className="suporte-quem">
          {staff && <span className="suporte-quem-nome">{staff.name}</span>}
          <form action={sair}>
            <button type="submit" className="btn-ghost">Sair</button>
          </form>
        </div>
      </header>
      <main className="suporte-conteudo">
        {verificado && staff?.papel === 'GERENTE' && (
          <p className="sistema-somente-leitura" role="note">Só para ver: o Gerente não edita.</p>
        )}
        {children}
      </main>
    </div>
  )
}
