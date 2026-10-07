import { reaisDe } from '@/lib/redes/valor'
import { rotuloDaSituacao } from '@/lib/redes/situacao'
import type { AssinaturaLida } from '@/lib/redes/assinatura'
import { PlanoDaRede } from '@/components/admin/plano-da-rede'
import { AdicionaisDaClinica } from '@/components/admin/adicionais-da-clinica'
import { ADICIONAIS } from '@estetica-os/nucleo/lib/planos/recursos'
import { recursosEfetivos } from '@estetica-os/nucleo/lib/planos/adicionais'
import { brutoDosItens, descreverCondicao, totalComCondicoes, valorComCondicao, ITENS_DA_ASSINATURA } from '@estetica-os/nucleo/lib/planos/condicoes'

/**
 * A assinatura do BellarisOS, do lado da CLÍNICA (Configurações → Assinatura):
 * o plano, o valor, a situação, o próximo vencimento e as faturas, cada uma
 * com o link do Asaas (Pix, boleto ou cartão — a clínica escolhe). Mudar de
 * plano é com o BellarisOS; os ADICIONAIS (WhatsApp extra, Copilot avulso) a
 * própria rede contrata aqui (2026-10-07).
 */
const ROTULO_DA_FATURA: Record<string, string> = {
  PENDING: 'Em aberto', OVERDUE: 'Vencida', CONFIRMED: 'Paga', RECEIVED: 'Paga', RECEIVED_IN_CASH: 'Paga',
  REFUNDED: 'Estornada', CHARGEBACK_REQUESTED: 'Contestada',
}
const dia = (v: string | null) => v
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v.length === 10 ? `${v}T12:00:00` : v))
  : '—'

const ROTULO_DO_ITEM = { plano: 'Plano', whatsapp: 'Conexões de WhatsApp', copilot: 'Copilot avulso' } as const

/** A mensalidade com uma unidade a mais e a menos do adicional — com as condições, como o banco conta. */
function mensalidadeComMaisOuMenos(
  a: NonNullable<AssinaturaLida['assinatura']>, chave: 'whatsapp' | 'copilot', maximo: number,
): { totalSeMais: number | null; totalSeMenos: number | null } {
  const atual = a.adicionais[chave]
  const q = atual?.quantidade ?? 0
  const preco = atual?.valor_centavos ?? a.oferta[chave]?.valor_centavos ?? null
  const com = (n: number) => {
    const adicionais = { ...a.adicionais }
    if (n <= 0) delete adicionais[chave]
    else adicionais[chave] = { quantidade: n, valor_centavos: preco ?? 0 }
    return totalComCondicoes(a.valorCentavos, adicionais, a.condicoes)
  }
  return {
    totalSeMais: preco != null && q < maximo ? com(q + 1) : null,
    totalSeMenos: q > 0 ? com(q - 1) : null,
  }
}

export function SettingsAssinatura({ dados, planoNome, carencia, podePagar, uso, semContratar }: {
  dados: AssinaturaLida; planoNome: string | null; carencia: number; podePagar: boolean
  /** Por que esta pessoa não contrata adicional (null = contrata): unidade fixa, sem configurações, suporte. */
  semContratar: string | null
  /** Quantos de cada limite a rede usa hoje (os ATIVOS). */
  uso: Record<'unidades' | 'membros' | 'whatsapp', number>
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
          {assinatura && assinatura.totalCentavos > 0 && <> · {reaisDe(assinatura.totalCentavos)} por mês</>}
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {rede.planStatus === 'trial' && <>Período de teste até {dia(rede.trialEndsAt)}.</>}
          {rede.planStatus === 'active' && assinatura?.proximoVencimento && <>Próximo vencimento: {dia(assinatura.proximoVencimento)}.</>}
          {rede.planStatus === 'past_due' && <>Pagamento em atraso desde {dia(rede.emAtrasoDesde)}. Regularize até {dia(suspendeEm)} para o acesso não ser suspenso.</>}
        </p>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {assinatura?.planoId && assinatura.totalCentavos === 0
            ? 'Cortesia do BellarisOS: sem mensalidade. Para mudar de plano, fale com o BellarisOS pela Ajuda.'
            : 'A cobrança é feita pelo Asaas, por Pix, boleto ou cartão. Para mudar de plano, fale com o BellarisOS pela Ajuda.'}
        </p>
      </div>

      {assinatura && ITENS_DA_ASSINATURA.some(i => assinatura.condicoes[i]) && (
        <section className="card" aria-label="Condições do BellarisOS" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="overline">Condições do BellarisOS</p>
          <ul className="plano-da-rede-limites" style={{ flexDirection: 'column' }}>
            {ITENS_DA_ASSINATURA.filter(i => assinatura.condicoes[i]).map(i => {
              const bruto = brutoDosItens(assinatura.valorCentavos, assinatura.adicionais)[i]
              const c = assinatura.condicoes[i]!
              return (
                <li key={i}>
                  {ROTULO_DO_ITEM[i]}: {descreverCondicao(c)}
                  {bruto != null && (
                    <span className="plano-da-rede-estado"> · de <s>{reaisDe(bruto)}</s> por {reaisDe(valorComCondicao(bruto, c))}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <PlanoDaRede
        recursos={assinatura ? recursosEfetivos(assinatura.recursos, assinatura.adicionais) : null}
        extras={{ whatsapp: assinatura?.adicionais.whatsapp?.quantidade ?? 0, copilot: !!assinatura?.adicionais.copilot }}
        uso={uso}
      />

      {assinatura?.recursos && (
        <AdicionaisDaClinica
          semContratar={rede.planStatus === 'canceled' ? 'A assinatura está cancelada. Para voltar a contratar, fale com o BellarisOS pela Ajuda.' : semContratar}
          totalCentavos={assinatura.totalCentavos}
          cobranca={assinatura.cobranca}
          adicionais={ADICIONAIS.map(a => ({
            chave: a.chave, rotulo: a.rotulo, maximo: a.maximo, emBreve: 'emBreve' in a && !!a.emBreve,
            quantidade: assinatura.adicionais[a.chave]?.quantidade ?? 0,
            // Preço do sistema, cortesia ou desconto: condição especial.
            especial: !!assinatura.adicionais[a.chave]?.especial || !!assinatura.condicoes[a.chave],
            ...mensalidadeComMaisOuMenos(assinatura, a.chave, a.maximo),
            // A próxima unidade: o preço contratado (retrato), ou o que o plano oferece hoje.
            precoCentavos: assinatura.adicionais[a.chave]?.valor_centavos ?? assinatura.oferta[a.chave]?.valor_centavos ?? null,
          }))}
        />
      )}

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
