import { redirect } from 'next/navigation'
import { lerClaims, marcaDaPlataforma } from '@/lib/plataforma/contexto'
import { getCachedMember, getCachedRede, getCachedRedeDoCliente, getCachedRolePermissions } from '@/lib/cached-queries'
import { resolvePermissions } from '@/lib/permissions'
import { motivoDoBloqueio } from '@/lib/redes/situacao'
import { lerAssinatura, faturaEmAberto } from '@/lib/redes/assinatura'
import { reaisDe } from '@/lib/redes/valor'
import { logoutAction } from '@/actions/auth'
import { sessaoDeSuporteAtual } from '@/lib/suporte/requisicao'

/**
 * A tela de quem é de uma rede BLOQUEADA (desligada, assinatura suspensa ou
 * cancelada) — o único lugar que a equipe abre (`buildContext` manda para
 * cá). Fora dos layouts das redes, e sem `getTenantContext` (que mandaria de
 * volta para cá): lê a pessoa pelos claims, no servidor.
 *
 * Quem administra a rede vê a fatura em aberto e o "Pagar"; os outros, o
 * aviso. O paciente vê que a clínica está indisponível. Rede que voltou a
 * ficar em dia sai daqui sozinha.
 */
export const dynamic = 'force-dynamic'

const dia = (ymd: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${ymd.slice(0, 10)}T12:00:00`))

export default async function ContaSuspensaPage() {
  const claims = await lerClaims()
  if (!claims) redirect('/login')
  const marca = marcaDaPlataforma(claims)
  // A equipe da plataforma não entra na clínica (os apps dela são outros hosts).
  if (marca) redirect('/login?acesso=plataforma')

  const meta = (claims.app_metadata ?? {}) as { tenant_id?: string | null; client_id?: string | null; role?: string; role_id?: string | null }
  const ehCliente = !meta.tenant_id && !!meta.client_id
  const tenantId = ehCliente ? await getCachedRedeDoCliente(meta.client_id!) : meta.tenant_id ?? null
  const rede = tenantId ? await getCachedRede(tenantId) : null
  const motivo = rede ? motivoDoBloqueio(rede) : null
  if (!rede || !motivo) redirect('/auth/redirect')

  // Quem administra a rede: o cargo de admin, ou rede + configurações MANAGE.
  let administra = false
  if (!ehCliente) {
    const membro = await getCachedMember(claims.sub)
    if (meta.role === 'NETWORK_ADMIN') administra = true
    else if (membro && membro.branchId === null && membro.roleId && tenantId) {
      const perms = resolvePermissions(await getCachedRolePermissions(tenantId, membro.roleId))
      administra = perms.settings === 'MANAGE'
    }
  }
  // O atendente do suporte entrando na conta não paga pela clínica.
  const doSuporte = !!(await sessaoDeSuporteAtual())
  const fatura = administra && !doSuporte && motivo === 'suspensa' ? faturaEmAberto(await lerAssinatura(rede.id)) : null

  const titulo = ehCliente ? 'Portal indisponível'
    : motivo === 'suspensa' ? 'Acesso suspenso por falta de pagamento'
    : motivo === 'cancelada' ? 'Assinatura cancelada'
    : 'Acesso desligado'
  const texto = ehCliente
    ? `O portal de ${rede.nome} está temporariamente indisponível. Fale com a clínica para agendar.`
    : motivo === 'suspensa'
      ? (administra && fatura
          ? 'A assinatura do BellarisOS ficou em atraso além do prazo. Assim que a fatura for paga, o acesso volta sozinho — em alguns minutos.'
          : administra
            ? 'O período de teste ou a assinatura do BellarisOS terminou sem pagamento. Fale com o BellarisOS para regularizar.'
            : 'A assinatura do BellarisOS está em atraso. Avise o responsável pela clínica: assim que for paga, o acesso volta sozinho.')
      : motivo === 'cancelada'
        ? 'A assinatura do BellarisOS desta clínica foi cancelada. Para voltar, fale com o BellarisOS.'
        : 'O acesso desta clínica ao BellarisOS foi desligado. Fale com o BellarisOS para entender e regularizar.'

  return (
    <main className="suporte-centro" style={{ minHeight: '100dvh', background: 'var(--bg-app)', padding: 'var(--content-pad-x)' }}>
      <div className="card suporte-cartao-estreito">
        <p className="overline">{rede.nome}</p>
        <h1 className="suporte-titulo">{titulo}</h1>
        <p className="suporte-texto">{texto}</p>
        {fatura && (
          <div className="suporte-pilha">
            <p className="suporte-texto">Fatura em aberto: <strong>{reaisDe(fatura.valorCentavos)}</strong>, vencida em {dia(fatura.vencimento)}.</p>
            {fatura.url && <a href={fatura.url} target="_blank" rel="noreferrer" className="btn-primary" style={{ justifyContent: 'center' }}>Pagar agora (Pix, boleto ou cartão)</a>}
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">Sair</button>
        </form>
      </div>
    </main>
  )
}
