import { redirect } from 'next/navigation'
import { getPlatformContext, lerClaims } from '@/lib/plataforma/contexto'
import { estadoDaVerificacao } from '@/actions/plataforma-verificacao'
import { Verificacao } from '@/components/suporte/verificacao'

/**
 * A verificação em duas etapas, obrigatória para entrar no `/suporte`: o
 * cadastro do autenticador no primeiro acesso, e o código em cada login.
 */
export default async function VerificacaoPage() {
  await getPlatformContext({ semVerificacao: true })
  const claims = await lerClaims()
  if (claims?.aal === 'aal2') redirect('/suporte')
  const estado = await estadoDaVerificacao()
  return (
    <div className="suporte-centro">
      <div className="card suporte-cartao-estreito">
        <h1 className="suporte-titulo">Verificação em duas etapas</h1>
        <p className="suporte-sub">
          O painel do suporte enxerga todas as clínicas: além da senha, ele pede o código do seu
          aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).
        </p>
        <Verificacao inicial={estado} />
      </div>
    </div>
  )
}
