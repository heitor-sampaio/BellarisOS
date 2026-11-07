'use client'

import { formatBRL } from '@estetica-os/utils'
import type { ComoEstornar, DestinoDaDevolucao, PagamentoEmParte } from '@/lib/pacotes/cancelamento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { CampoDaBandeira } from '@/components/shared/campo-da-bandeira'

/** As formas do pagamento novo do usado (r2-ven-05). */
export const FORMAS_DO_USADO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

/** O que a recepção escolhe sobre o que volta (pacote e pré-pago). */
export interface EscolhaDaDevolucaoEstado {
  destino:      DestinoDaDevolucao | null
  comoEstornar: ComoEstornar | null
  novoMetodo:   string
  novoVezes:    number
  novaBandeira: string
}

export const ESCOLHA_INICIAL: EscolhaDaDevolucaoEstado = {
  destino: null, comoEstornar: null, novoMetodo: '', novoVezes: 1, novaBandeira: '',
}

/**
 * "Estornar o pagamento inteiro e lançar o usado de novo", com a forma do
 * pagamento novo JÁ na forma original — o meio, as vezes e a bandeira (A41 da
 * 8ª simulação, 2026-11-06; decidido pelo princípio 5: o Pix de R$ 800 que a
 * Marta escolheu, no cancelamento do pacote pago em Crédito 3x, foi inventado).
 * A recepção troca, se a cliente pagar o que fica de outro jeito. O que já foi
 * escolhido não é desfeito.
 */
export function comOPagamentoInteiro(e: EscolhaDaDevolucaoEstado, parcial: PagamentoEmParte | null): EscolhaDaDevolucaoEstado {
  const original = parcial?.metodo && (FORMAS_DO_USADO as readonly string[]).includes(parcial.metodo) ? parcial.metodo : ''
  if (e.novoMetodo || !original) return { ...e, comoEstornar: 'INTEIRO' }
  return {
    ...e, comoEstornar: 'INTEIRO', novoMetodo: original,
    novoVezes: original === 'CREDIT_CARD' ? Math.max(1, parcial?.vezes ?? 1) : 1,
    novaBandeira: original === 'CREDIT_CARD' || original === 'DEBIT_CARD' ? parcial?.bandeira ?? '' : '',
  }
}

/** O pagamento pego em parte, se o que volta vai por estorno. */
export function pagamentoEmParte(devolver: number, parcial: PagamentoEmParte | null, e: EscolhaDaDevolucaoEstado) {
  return devolver > 0 && e.destino === 'ESTORNO' ? parcial : null
}

/** A escolha está completa (o que a tela pede antes de confirmar). */
export function escolhaCompleta(devolver: number, parcial: PagamentoEmParte | null, e: EscolhaDaDevolucaoEstado) {
  const emParte = pagamentoEmParte(devolver, parcial, e)
  return (devolver <= 0 || e.destino !== null)
    && (!emParte || (e.comoEstornar === 'PARCIAL' && !emParte.cartao) || (e.comoEstornar === 'INTEIRO' && e.novoMetodo !== ''))
}

/** O que vai à action: a forma de estornar e o pagamento novo. */
export function escolhaParaAAcao(devolver: number, parcial: PagamentoEmParte | null, e: EscolhaDaDevolucaoEstado) {
  const emParte = pagamentoEmParte(devolver, parcial, e)
  return {
    destino: devolver > 0 ? e.destino : null,
    estorno: emParte ? e.comoEstornar : null,
    novo: emParte && e.comoEstornar === 'INTEIRO'
      ? { metodo: e.novoMetodo, vezes: e.novoMetodo === 'CREDIT_CARD' ? e.novoVezes : 1, bandeira: e.novaBandeira || null }
      : null,
  }
}

/**
 * "Como devolver?" (estorno ou crédito na clínica) e, quando o estorno pega um
 * pagamento EM PARTE, "Como estornar?" — o mesmo nos cancelamentos do pacote
 * (F2b/F13) e da unidade do pré-pago (D1 da 6ª simulação). No cartão, o
 * estorno parcial fica desligado, com o motivo (r2-fin-03), e o inteiro já
 * vem escolhido (quem abre a janela o marca ao ler a prévia).
 */
export function EscolhaDaDevolucao({ prefixo, devolver, parcial, fidelidade, estado, aoMudar, desligado, opcoesDeVezes, soEstorno = false }: {
  /** O prefixo dos ids dos grupos ("cancelar-pacote", "cancelar-unidade"). */
  prefixo:       string
  devolver:      number
  parcial:       PagamentoEmParte | null
  fidelidade:    boolean
  estado:        EscolhaDaDevolucaoEstado
  aoMudar:       (e: EscolhaDaDevolucaoEstado) => void
  desligado:     boolean
  opcoesDeVezes: number[]
  /**
   * Sem o "Como devolver?": o que volta só pode voltar por estorno (a venda do
   * próprio crédito na clínica — decisão 1 da 9ª). Quem chama já escolhe o ESTORNO.
   */
  soEstorno?:    boolean
}) {
  const opcao = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' } as const
  const muda = (parte: Partial<EscolhaDaDevolucaoEstado>) => aoMudar({ ...estado, ...parte })
  const emParte = pagamentoEmParte(devolver, parcial, estado)
  if (devolver <= 0) return null
  return (
    <>
      {!soEstorno && <div role="radiogroup" aria-labelledby={`${prefixo}-destino`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span id={`${prefixo}-destino`} className="field-label">Como devolver {formatBRL(devolver)}? *</span>
        <label style={opcao}>
          <input type="radio" name={`${prefixo}-destino`} checked={estado.destino === 'ESTORNO'} disabled={desligado}
            onChange={() => muda({ destino: 'ESTORNO' })} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
          <span>Estorno <span style={{ color: 'var(--text-muted)' }}>— o dinheiro volta à cliente na forma em que ela pagou{fidelidade ? ', e os pontos dele saem do saldo' : ''}</span></span>
        </label>
        <label style={opcao}>
          <input type="radio" name={`${prefixo}-destino`} checked={estado.destino === 'CREDITO'} disabled={desligado}
            onChange={() => muda({ destino: 'CREDITO' })} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
          <span>Crédito na clínica <span style={{ color: 'var(--text-muted)' }}>— fica de saldo para ela usar em outro atendimento</span></span>
        </label>
      </div>}

      {emParte && (
        <div data-como-estornar role="radiogroup" aria-labelledby={`${prefixo}-como-estornar`} style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
          borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)',
        }}>
          <span id={`${prefixo}-como-estornar`} className="field-label">
            Como estornar o {rotuloDaForma(emParte.metodo, emParte.vezes)} de {formatBRL(emParte.valor)}? *
          </span>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
            Voltam {formatBRL(emParte.volta)} deste pagamento; {formatBRL(emParte.fica)} ficam pagos.
          </p>
          <label style={{ ...opcao, cursor: emParte.cartao ? 'not-allowed' : 'pointer', opacity: emParte.cartao ? 0.6 : 1 }}>
            <input type="radio" name={`${prefixo}-como-estornar`} checked={estado.comoEstornar === 'PARCIAL'}
              disabled={desligado || emParte.cartao}
              onChange={() => muda({ comoEstornar: 'PARCIAL' })} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
            <span>
              Estorno parcial{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                — o pagamento passa a valer {formatBRL(emParte.fica)} e um “Estorno parcial” de {formatBRL(emParte.volta)} leva o resto
              </span>
              {emParte.cartao && (
                <span data-motivo-sem-parcial style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  No cartão, a operadora estorna o pagamento inteiro: o estorno parcial não existe.
                </span>
              )}
            </span>
          </label>
          <label style={opcao}>
            <input type="radio" name={`${prefixo}-como-estornar`} checked={estado.comoEstornar === 'INTEIRO'} disabled={desligado}
              onChange={() => aoMudar(comOPagamentoInteiro(estado, emParte))} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
            <span>
              Estornar o pagamento inteiro e lançar o usado de novo{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                — {formatBRL(emParte.valor)} voltam e {formatBRL(emParte.fica)} entram de novo, na forma que você escolher
              </span>
            </span>
          </label>
          {estado.comoEstornar === 'INTEIRO' && (
            <div className="form-2col" style={{ paddingLeft: 24 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="field-label">Forma do pagamento do usado *</span>
                <select className="field" aria-label="Forma do pagamento do usado" value={estado.novoMetodo} disabled={desligado}
                  onChange={e => muda({ novoMetodo: e.target.value, novoVezes: 1 })}>
                  <option value="">Selecione…</option>
                  {FORMAS_DO_USADO.map(f => <option key={f} value={f}>{rotuloDaForma(f, null, { longo: true })}</option>)}
                </select>
              </label>
              {estado.novoMetodo === 'CREDIT_CARD' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="field-label">Vezes no cartão</span>
                  <select className="field" aria-label="Vezes no cartão" value={estado.novoVezes} disabled={desligado}
                    onChange={e => muda({ novoVezes: Number(e.target.value) })}>
                    {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : n + 'x'}</option>)}
                  </select>
                  <DicaDasVezes total={emParte.fica} vezes={estado.novoVezes} opcoes={opcoesDeVezes} />
                </label>
              )}
              <CampoDaBandeira metodo={estado.novoMetodo} valor={estado.novaBandeira} aoMudar={b => muda({ novaBandeira: b })} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
