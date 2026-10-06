'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  definirAssinatura, estenderTeste, marcarEmDia, cancelarAssinatura, reabrirAssinatura,
  ativarCobrancaNoAsaas, sincronizarComOAsaas,
} from '@/actions/sistema'
import { centavosDe, campoDeReais, reaisDe } from '@estetica-os/nucleo/lib/redes/valor'

/**
 * A assinatura de uma rede no /sistema: plano e valor (preço especial), teste,
 * a situação (em dia, cancelar, reabrir), a cobrança no Asaas e as faturas.
 * Cada ação passa pela action, que confere ADMIN e registra.
 */
type Res = { ok: true } | { ok: false; error: string }

const ROTULO_DA_FATURA: Record<string, string> = {
  PENDING: 'Em aberto', OVERDUE: 'Vencida', CONFIRMED: 'Paga (confirmando)', RECEIVED: 'Paga',
  RECEIVED_IN_CASH: 'Paga por fora', REFUNDED: 'Estornada', REFUND_REQUESTED: 'Estorno pedido',
  CHARGEBACK_REQUESTED: 'Contestada', CHARGEBACK_DISPUTE: 'Em disputa',
}
const dia = (ymd: string | null) => ymd
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${ymd.slice(0, 10)}T12:00:00`))
  : '—'
const hojeMais = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
/** O primeiro vencimento sugerido: o fim do teste, se ainda não passou; senão daqui a 3 dias. */
const vencimentoSugerido = (fimDoTeste: string | null) =>
  fimDoTeste && Date.parse(fimDoTeste) > Date.now() ? fimDoTeste.slice(0, 10) : hojeMais(3)

export function AssinaturaDaRede({ tenantId, rede, assinatura, faturas, planos, asaasPronto }: {
  tenantId: string
  rede: { planStatus: string | null; trialEndsAt: string | null; emAtrasoDesde: string | null; temDocumento: boolean }
  assinatura: { planoId: string | null; valorCentavos: number; cobranca: 'sem_cobranca' | 'ativa' | 'cancelada'; asaasSubscriptionId: string | null; proximoVencimento: string | null } | null
  faturas: { id: string; valorCentavos: number; vencimento: string; situacao: string; pagoEm: string | null; url: string | null; removida: boolean }[]
  planos: { id: string; nome: string; valorCentavos: number; ativo: boolean }[]
  asaasPronto: boolean
}) {
  const router = useRouter()
  const [planoId, setPlanoId] = useState(assinatura?.planoId ?? '')
  const [valor, setValor] = useState(assinatura ? campoDeReais(assinatura.valorCentavos) : '')
  const [teste, setTeste] = useState(rede.trialEndsAt ? rede.trialEndsAt.slice(0, 10) : hojeMais(14))
  const [vencimento, setVencimento] = useState(() => vencimentoSugerido(rede.trialEndsAt))
  const [motivo, setMotivo] = useState('')
  const [pendente, iniciar] = useTransition()

  function rodar(f: () => Promise<Res>, ok: string) {
    iniciar(async () => {
      const r = await f()
      if (!r.ok) { toast.error(r.error); return }
      toast.success(ok)
      setMotivo('')
      router.refresh()
    })
  }

  function salvarPlano() {
    const centavos = centavosDe(valor)
    if (centavos == null) { toast.error('Valor inválido.'); return }
    rodar(() => definirAssinatura(tenantId, { planoId: planoId || null, valorCentavos: centavos }), 'Plano e valor salvos.')
  }

  const cancelada = rede.planStatus === 'canceled'
  const cobrancaAtiva = assinatura?.cobranca === 'ativa'

  return (
    <div className="suporte-pilha-larga">
      {/* Plano e valor */}
      <div className="sistema-form">
        <label className="suporte-campo"><span className="field-label">Plano</span>
          <select className="filtro-select" value={planoId} onChange={e => {
            setPlanoId(e.target.value)
            const p = planos.find(x => x.id === e.target.value)
            if (p) setValor(campoDeReais(p.valorCentavos))
          }}>
            <option value="">Sem plano</option>
            {planos.filter(p => p.ativo || p.id === assinatura?.planoId).map(p => (
              <option key={p.id} value={p.id}>{p.nome} · {reaisDe(p.valorCentavos)}{p.ativo ? '' : ' (desativado)'}</option>
            ))}
          </select>
        </label>
        <label className="suporte-campo"><span className="field-label">Valor mensal desta rede (R$)</span>
          <input className="field" value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </label>
        <div className="sistema-acoes">
          <button type="button" className="btn-secondary" disabled={pendente} onClick={salvarPlano}>Salvar plano e valor</button>
        </div>
      </div>

      {/* Situação */}
      <div className="suporte-pilha">
        <p className="suporte-texto">
          {rede.planStatus === 'trial' && <>Em teste até <strong>{dia(rede.trialEndsAt)}</strong>.</>}
          {rede.planStatus === 'active' && <>Em dia{assinatura?.proximoVencimento ? <> · próximo vencimento <strong>{dia(assinatura.proximoVencimento)}</strong></> : null}.</>}
          {rede.planStatus === 'past_due' && <>Em atraso desde <strong>{dia(rede.emAtrasoDesde)}</strong> — suspende sozinha ao fim da carência.</>}
          {rede.planStatus === 'suspended' && <>Suspensa por atraso desde <strong>{dia(rede.emAtrasoDesde)}</strong>. Volta sozinha quando pagar.</>}
          {cancelada && <>Cancelada.</>}
        </p>
        <div className="sistema-acoes">
          <input className="field" type="date" value={teste} onChange={e => setTeste(e.target.value)} aria-label="Teste até" style={{ width: 'auto' }} />
          <button type="button" className="btn-secondary" disabled={pendente || cancelada}
            onClick={() => rodar(() => estenderTeste(tenantId, teste), 'Teste estendido.')}>Estender teste até a data</button>
        </div>
        <div className="sistema-acoes">
          <input className="field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (para marcar em dia ou cancelar)"
            aria-label="Motivo" style={{ flex: '1 1 260px' }} />
          {!cancelada && rede.planStatus !== 'active' && (
            <button type="button" className="btn-secondary" disabled={pendente || motivo.trim().length < 3}
              onClick={() => rodar(() => marcarEmDia(tenantId, motivo), 'Assinatura em dia.')}>Marcar como em dia</button>
          )}
          {!cancelada ? (
            <button type="button" className="btn-secondary" disabled={pendente || motivo.trim().length < 3}
              onClick={() => rodar(() => cancelarAssinatura(tenantId, motivo), 'Assinatura cancelada.')}>Cancelar assinatura</button>
          ) : (
            <button type="button" className="btn-secondary" disabled={pendente}
              onClick={() => rodar(() => reabrirAssinatura(tenantId), 'Assinatura reaberta.')}>Reabrir assinatura</button>
          )}
        </div>
      </div>

      {/* Cobrança no Asaas */}
      <div className="suporte-pilha">
        <h3 className="suporte-subtitulo">Cobrança no Asaas</h3>
        {!asaasPronto ? (
          <p className="suporte-texto-fraco">O Asaas ainda não está configurado (Configurações → Integração com o Asaas).</p>
        ) : cobrancaAtiva ? (
          <div className="sistema-acoes">
            <span className="suporte-ok">Cobrança ligada — mensal, a clínica escolhe Pix, boleto ou cartão.</span>
            <button type="button" className="btn-secondary" disabled={pendente}
              onClick={() => rodar(async () => { const r = await sincronizarComOAsaas(tenantId); return r.ok ? { ok: true } : r }, 'Faturas sincronizadas.')}>
              Sincronizar faturas
            </button>
          </div>
        ) : !assinatura || assinatura.valorCentavos <= 0 ? (
          <p className="suporte-texto-fraco">Defina o plano e o valor para ligar a cobrança.</p>
        ) : !rede.temDocumento ? (
          <p className="suporte-texto-fraco">A rede precisa de CPF ou CNPJ (Dados da rede) para ser cobrada.</p>
        ) : cancelada ? (
          <p className="suporte-texto-fraco">Reabra a assinatura para ligar a cobrança de novo.</p>
        ) : (
          <div className="sistema-acoes">
            <label className="suporte-texto-fraco" htmlFor="primeiro-vencimento">Primeiro vencimento</label>
            <input id="primeiro-vencimento" className="field" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} style={{ width: 'auto' }} />
            <button type="button" className="btn-primary" disabled={pendente}
              onClick={() => rodar(() => ativarCobrancaNoAsaas(tenantId, vencimento), 'Cobrança ligada no Asaas.')}>Ligar cobrança</button>
          </div>
        )}
      </div>

      {/* Faturas */}
      {faturas.length > 0 && (
        <table className="cards-mobile suporte-tabela">
          <thead><tr><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
          <tbody>
            {faturas.map(f => (
              <tr key={f.id}>
                <td data-label="Vencimento" data-par>{dia(f.vencimento)}</td>
                <td data-label="Valor" data-par>{reaisDe(f.valorCentavos)}</td>
                <td data-label="Situação" data-par>{f.removida ? 'Removida' : ROTULO_DA_FATURA[f.situacao] ?? f.situacao}</td>
                <td data-label="Pago em" data-par>{f.pagoEm ? dia(f.pagoEm) : '—'}</td>
                <td data-label="">{f.url && <a href={f.url} target="_blank" rel="noreferrer" className="suporte-voltar">Fatura ↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
