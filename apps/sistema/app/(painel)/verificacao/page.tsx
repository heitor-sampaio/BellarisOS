import { redirect } from 'next/navigation'
import { getPlatformContext, lerClaims } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { estadoDaVerificacao } from '@estetica-os/nucleo/lib/plataforma/verificacao'
import { Verificacao } from '@estetica-os/nucleo/components/plataforma/verificacao'
import { iniciarVerificacao, confirmarVerificacao } from '@/actions/verificacao'

/**
 * A verificação em duas etapas, obrigatória para entrar na plataforma: o
 * cadastro do autenticador no primeiro acesso, e o código em cada login.
 * A sessão é deste host — quem é ADMIN verifica no sistema e no suporte.
 */
export default async function VerificacaoPage() {
  await getPlatformContext({ semVerificacao: true, papel: 'ADMIN' })
  const claims = await lerClaims()
  if (claims?.aal === 'aal2') redirect('/')
  const estado = await estadoDaVerificacao({ papel: 'ADMIN' })
  return (
    <div className="suporte-centro">
      <div className="card suporte-cartao-estreito">
        <h1 className="suporte-titulo">Verificação em duas etapas</h1>
        <p className="suporte-sub">
          A plataforma enxerga todas as clínicas: além da senha, ela pede o código do seu
          aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).
        </p>
        <Verificacao inicial={estado} destino="/" acoes={{ iniciar: iniciarVerificacao, confirmar: confirmarVerificacao }} />
      </div>
    </div>
  )
}
