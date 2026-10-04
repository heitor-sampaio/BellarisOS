import { redirect } from 'next/navigation'
import { getPlatformContext, lerClaims } from '@/lib/plataforma/contexto'
import { estadoDaVerificacao } from '@/actions/plataforma-verificacao'
import { Verificacao } from '@/components/suporte/verificacao'
import { inicioDaPlataforma } from '@/lib/plataforma/destino'

/**
 * A verificação em duas etapas, obrigatória para entrar nos portais da
 * plataforma (`/sistema` e `/suporte`): o cadastro do autenticador no
 * primeiro acesso, e o código em cada login. Depois, cada um vai ao seu início.
 */
export default async function VerificacaoPage() {
  const ctx = await getPlatformContext({ semVerificacao: true })
  const destino = inicioDaPlataforma(ctx.papel)
  const claims = await lerClaims()
  if (claims?.aal === 'aal2') redirect(destino)
  const estado = await estadoDaVerificacao()
  return (
    <div className="suporte-centro">
      <div className="card suporte-cartao-estreito">
        <h1 className="suporte-titulo">Verificação em duas etapas</h1>
        <p className="suporte-sub">
          A plataforma enxerga todas as clínicas: além da senha, ele pede o código do seu
          aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).
        </p>
        <Verificacao inicial={estado} destino={destino} />
      </div>
    </div>
  )
}
