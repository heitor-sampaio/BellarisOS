import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verificacaoDaSessao } from '@estetica-os/nucleo/lib/plataforma/verificacao-exigida'
import { getPlatformContext, lerClaims } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { estadoDaVerificacao } from '@estetica-os/nucleo/lib/plataforma/verificacao'
import { Verificacao } from '@estetica-os/nucleo/components/plataforma/verificacao'
import { iniciarVerificacao, confirmarVerificacao } from '@/actions/verificacao'

/**
 * A verificação em duas etapas da plataforma: o cadastro do autenticador e o
 * código em cada login. É OPÇÃO do admin do sistema (2026-10-06): quando não
 * está pendente (`verificacao-exigida.ts`), a pessoa cadastra se quiser, e
 * "Agora não" volta ao painel.
 * A sessão é deste host — quem é ADMIN verifica no sistema e no suporte.
 */
export default async function VerificacaoPage() {
  await getPlatformContext({ semVerificacao: true, papel: 'ADMIN' })
  const claims = await lerClaims()
  if (claims?.aal === 'aal2') redirect('/')
  const { pendente } = await verificacaoDaSessao()
  const estado = await estadoDaVerificacao({ papel: 'ADMIN' })
  return (
    <div className="suporte-centro">
      <div className="card suporte-cartao-estreito">
        <h1 className="suporte-titulo">Verificação em duas etapas</h1>
        <p className="suporte-sub">
          {pendente
            ? <>A plataforma enxerga todas as clínicas: além da senha, ela pede o código do seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).</>
            : <>Opcional: com um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…), além da senha a plataforma passa a pedir o código dele em cada login.</>}
        </p>
        <Verificacao inicial={estado} destino="/" acoes={{ iniciar: iniciarVerificacao, confirmar: confirmarVerificacao }} />
        {!pendente && <Link href="/" className="btn-ghost" style={{ justifyContent: 'center' }}>Agora não</Link>}
      </div>
    </div>
  )
}
