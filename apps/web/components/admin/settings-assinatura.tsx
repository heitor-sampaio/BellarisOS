import { reaisDe } from '@/lib/redes/valor'
import { rotuloDaSituacao } from '@/lib/redes/situacao'
import type { AssinaturaLida } from '@/lib/redes/assinatura'

/**
 * A assinatura do BellarisOS, do lado da CLÍNICA (Configurações → Assinatura):
 * o plano, o valor, a situação, o próximo vencimento e as faturas, cada uma
 * com o link do Asaas (Pix, boleto ou cartão — a clínica escolhe). Mudar de
 * plano é com o BellarisOS.
 */
const ROTULO_DA_FATURA: Record<string, string> = {
  PENDING: 'Em aberto', OVERDUE: 'Vencida', CONFIRMED: 'Paga', RECEIVED: 'Paga', RECEIVED_IN_CASH: 'Paga',
  REFUNDED: 'Estornada', CHARGEBACK_REQUESTED: 'Contestada',
}
const dia = (v: string | null) => v
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v.length === 10 ? `${v}T12:00:00` : v))
  : '—'

export function SettingsAssinatura({ dados, planoNome, carencia, podePagar }: {
  dados: AssinaturaLida; planoNome: string | null; carencia: number; podePagar: boolean
}) {
  const { rede, assinatura, faturas } = dados
  const suspendeEm = rede.emAtrasoDesde
    ? new Date(Date.parse(`${rede.emAtrasoDesde}T12:00:00-03:00`) + carencia * 86_400_000).toISOString()
    : null
  const visiveis = faturas.filter(f => !f.removida)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="overline">Situação</p>
        <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          <span className="sistema-situacao" data-situacao={rede.planStatus ?? ''}>{rotuloDaSituacao(rede.planStatus)}</span>
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
          {planoNome ? <>Plano <strong>{planoNome}</strong></> : 'Sem plano definido'}
          {assinatura && assinatura.valorCentavos > 0 && <> · {reaisDe(assinatura.valorCentavos)} por mês</>}
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {rede.planStatus === 'trial' && <>Período de teste até {dia(rede.trialEndsAt)}.</>}
          {rede.planStatus === 'active' && assinatura?.proximoVencimento && <>Próximo vencimento: {dia(assinatura.proximoVencimento)}.</>}
          {rede.planStatus === 'past_due' && <>Pagamento em atraso desde {dia(rede.emAtrasoDesde)}. Regularize até {dia(suspendeEm)} para o acesso não ser suspenso.</>}
        </p>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          A cobrança é feita pelo Asaas, por Pix, boleto ou cartão. Para mudar de plano, fale com o BellarisOS pela Ajuda.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <p className="overline" style={{ padding: '16px 16px 4px' }}>Faturas</p>
        {visiveis.length === 0 ? (
          <p style={{ padding: 'var(--card-pad)', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>Nenhuma fatura ainda.</p>
        ) : (
          <table className="cards-mobile suporte-tabela">
            <thead><tr><th>Vencimento</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {visiveis.map(f => {
                const aberta = f.situacao === 'PENDING' || f.situacao === 'OVERDUE'
                return (
                  <tr key={f.id}>
                    <td data-label="Vencimento" data-par>{dia(f.vencimento)}</td>
                    <td data-label="Valor" data-par>{reaisDe(f.valorCentavos)}</td>
                    <td data-label="Situação" data-par>{ROTULO_DA_FATURA[f.situacao] ?? f.situacao}{f.pagoEm ? ` em ${dia(f.pagoEm)}` : ''}</td>
                    <td data-label="">
                      {f.url && (aberta && podePagar
                        ? <a href={f.url} target="_blank" rel="noreferrer" className="btn-primary">Pagar</a>
                        : <a href={f.url} target="_blank" rel="noreferrer" className="btn-ghost">Ver fatura</a>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
