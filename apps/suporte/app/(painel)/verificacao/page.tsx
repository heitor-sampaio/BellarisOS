import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verificacaoDaSessao } from '@estetica-os/nucleo/lib/plataforma/verificacao-exigida'
import { getPlatformContext, lerClaims } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { estadoDaVerificacao } from '@estetica-os/nucleo/lib/plataforma/verificacao'
import { Verificacao } from '@estetica-os/nucleo/components/plataforma/verificacao'
import { iniciarVerificacao, confirmarVerificacao } from '@/actions/verificacao'
import { Dica } from '@estetica-os/nucleo/components/dica'

/**
 * A verificação em duas etapas da plataforma: o cadastro do autenticador e o
 * código em cada login. É OPÇÃO do admin do sistema (2026-10-06): quando não
 * está pendente (`verificacao-exigida.ts`), a pessoa cadastra se quiser, e
 * "Agora não" volta ao painel.
 * A sessão é deste host — quem é ADMIN verifica no sistema e no suporte.
 */
export default async function VerificacaoPage() {
  await getPlatformContext({ semVerificacao: true })
  const claims = await lerClaims()
  if (claims?.aal === 'aal2') redirect('/')
  const { pendente } = await verificacaoDaSessao()
  const estado = await estadoDaVerificacao()
  return (
    <div className="suporte-centro">
      <div className="card suporte-cartao-estreito">
        {/* A apresentação mora na dica (2026-11-16); os passos (o QR, o código)
            seguem à vista no componente. Fora do h1, o título não muda de nome. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h1 className="suporte-titulo">Verificação em duas etapas</h1>
          <Dica rotulo="Sobre a verificação em duas etapas">
            {pendente
              ? <>A plataforma enxerga todas as redes: além da senha, ela pede o código do seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).</>
              : <>Opcional: com um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…), além da senha a plataforma passa a pedir o código dele em cada login.</>}
          </Dica>
        </div>
        <Verificacao inicial={estado} destino="/" acoes={{ iniciar: iniciarVerificacao, confirmar: confirmarVerificacao }} />
        {!pendente && <Link href="/" className="btn-ghost" style={{ justifyContent: 'center' }}>Agora não</Link>}
      </div>
    </div>
  )
}
