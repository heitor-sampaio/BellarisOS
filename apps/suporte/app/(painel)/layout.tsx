import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { lerClaims, marcaDaPlataforma, getCachedStaff } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { sair } from '@/actions/acesso'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'
import { NavDoSuporte } from '@/components/suporte/nav-do-suporte'
import { SeletorDePortal } from '@estetica-os/nucleo/components/plataforma/seletor-de-portal'
import { contagemDaFila } from '@estetica-os/nucleo/lib/suporte/chamados'
import { verificacaoDaSessao } from '@estetica-os/nucleo/lib/plataforma/verificacao-exigida'

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
  // O proxy já recusa quem não é da plataforma; isto é a segunda parede.
  if (!marcaDaPlataforma(claims)) redirect('/login')

  const staff = await getCachedStaff(claims.sub)
  const verificado = !(await verificacaoDaSessao()).pendente && !!staff?.is_active
  // Só com a pessoa verificada: a contagem é dado da plataforma.
  // O contador é acessório: falhar não derruba o portal (fica registrado).
  const naFila = verificado ? await contagemDaFila().catch(e => { console.error('[suporte] contagem da fila', e); return 0 }) : 0

  return (
    <div className="suporte-shell">
      <header className="suporte-topo">
        <div className="suporte-marca">
          BellarisOS <span aria-hidden>✦</span> <span className="suporte-marca-sub">Suporte</span>
        </div>
        {verificado && <NavDoSuporte naFila={naFila} />}
        <div className="suporte-quem">
          {verificado && staff?.papel === 'ADMIN' && <SeletorDePortal atual="suporte" urls={{ sistema: urlDoHost('sistema'), suporte: urlDoHost('suporte') }} />}
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
