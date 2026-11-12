'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { vendaParaDevolver, previaDaDevolucao, devolverParteDaVenda } from '@/actions/devolucao-de-produto'
import type { PreviaDaDevolucao, VendaParaDevolver } from '@/lib/produtos/devolucao'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import {
  EscolhaDaDevolucao, ESCOLHA_INICIAL, escolhaCompleta, escolhaParaAAcao, comOPagamentoInteiro, type EscolhaDaDevolucaoEstado,
} from '@/components/shared/escolha-da-devolucao'

/**
 * "Devolver parte da venda" (A34 da 8ª simulação, 2026-11-06; decidido pelo
 * princípio 3): a cliente levou 2 séruns e devolveu 1. Por linha — quantas de
 * cada produto voltam, e se voltaram ao estoque —, com a conta que o BANCO fez
 * (`produto_devolver_itens` simulando): o que a venda passa a valer, o a
 * receber que cai antes e o que volta. A devolução do dinheiro é a escolha de
 * sempre (`EscolhaDaDevolucao`): estorno — no cartão, o pagamento inteiro e o
 * que fica lançado de novo, na forma ORIGINAL já escolhida (A41) — ou crédito
 * na clínica. Era estornar a venda inteira e vender de novo.
 */
export function DevolverParteDaVenda({ transacaoId, onFechar }: { transacaoId: string; onFechar: () => void }) {
  const router = useRouter()
  const [venda, setVenda] = useState<VendaParaDevolver | null>(null)
  const [quantas, setQuantas] = useState<Record<string, number>>({})
  const [previa, setPrevia] = useState<PreviaDaDevolucao | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [voltou, setVoltou] = useState<boolean | null>(null)
  const [escolha, setEscolha] = useState<EscolhaDaDevolucaoEstado>(ESCOLHA_INICIAL)
  const [motivo, setMotivo] = useState('')
  const opcoesDeVezes = useOpcoesDeVezes()
  const [devolvendo, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    vendaParaDevolver(transacaoId).then(r => {
      if (!vivo) return
      if (r.error || !r.venda) setErro(r.error ?? 'Não consegui ler a venda.')
      else setVenda(r.venda)
    })
    return () => { vivo = false }
  }, [transacaoId])

  const pedidosDe = (q: Record<string, number>) =>
    Object.entries(q).filter(([, n]) => n > 0).map(([item, quantidade]) => ({ item, quantidade }))
  const pedidos = pedidosDe(quantas)
  const ultimaConta = useRef(0)

  /** A conta do banco a cada mudança das quantidades (a última pedida vale). */
  function mudarQuantas(item: string, n: number) {
    const novas = { ...quantas, [item]: n }
    setQuantas(novas)
    const itens = pedidosDe(novas)
    const vez = ++ultimaConta.current
    if (!venda || itens.length === 0) { setPrevia(null); setCalculando(false); return }
    setCalculando(true)
    previaDaDevolucao(venda.id, itens).then(r => {
      if (vez !== ultimaConta.current) return
      setCalculando(false)
      if (r.error || !r.previa) { setPrevia(null); setErro(r.error ?? 'Não consegui calcular a devolução.'); return }
      setErro(null)
      setPrevia(r.previa)
      // No cartão só existe o estorno inteiro: já vem escolhido, na forma original (A41).
      setEscolha(e => r.previa!.parcial?.cartao ? comOPagamentoInteiro({ ...e, comoEstornar: null }, r.previa!.parcial) : e)
    })
  }

  const pronto = !!previa && !calculando && voltou !== null && motivo.trim().length > 0
    && escolhaCompleta(previa.devolver, previa.parcial, escolha)

  function confirmar() {
    if (!previa || !venda || voltou === null) return
    setErro(null)
    iniciar(async () => {
      const r = await devolverParteDaVenda(venda.id, {
        itens: pedidos, voltou, motivo: motivo.trim(),
        ...escolhaParaAAcao(previa.devolver, previa.parcial, escolha),
        esperado: previa.devolver,
      })
      if (r.error) { setErro(r.error); return }
      toast.success(r.devolver && r.devolver > 0
        ? r.destino === 'CREDITO'
          ? `Devolução registrada (${previa.devolvido}). ${formatBRL(r.devolver)} ficaram de crédito na clínica.`
          : `Devolução registrada (${previa.devolvido}). ${formatBRL(r.devolver)} estornados à cliente.`
        : `Devolução registrada (${previa.devolvido}).`)
      onFechar()
      router.refresh()
    })
  }

  const linha = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' } as const
  const valor = { color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' } as const
  const opcao = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' } as const

  return (
    <JanelaModal rotulo="Devolver parte da venda" largura={500} travado={devolvendo} onFechar={onFechar} fechaNoFundo={false}>
      <div data-devolver-parte style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Devolver parte da venda</h2>

        {!venda && !erro ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…
          </p>
        ) : venda && (
          <>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{venda.descricao}</strong>. Diga quantas de cada produto voltam: o resto continua vendido.
            </p>
            <div role="group" aria-label="O que voltou" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {venda.itens.map(i => {
                const restam = i.quantidade - i.devolvidas
                return (
                  <label key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                    <span>
                      {i.produto}{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        ({i.quantidade} vendida{i.quantidade > 1 ? 's' : ''}{i.devolvidas > 0 ? `, ${i.devolvidas} já devolvida${i.devolvidas > 1 ? 's' : ''}` : ''})
                      </span>
                    </span>
                    <select className="field" aria-label={`Quantas de ${i.produto} voltam`} style={{ width: 90 }}
                      value={quantas[i.id] ?? 0} disabled={devolvendo || restam <= 0}
                      onChange={e => mudarQuantas(i.id, Number(e.target.value))}>
                      {Array.from({ length: Math.max(restam, 0) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )
              })}
            </div>

            <div role="radiogroup" aria-labelledby="devolver-parte-voltou" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span id="devolver-parte-voltou" className="field-label">O produto voltou ao estoque? *</span>
              <label style={opcao}>
                <input type="radio" name="devolver-parte-voltou" checked={voltou === true} disabled={devolvendo}
                  onChange={() => setVoltou(true)} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                <span>Sim, voltou ao estoque <span style={{ color: 'var(--text-muted)' }}>— entra de novo nos lotes de onde saiu</span></span>
              </label>
              <label style={opcao}>
                <input type="radio" name="devolver-parte-voltou" checked={voltou === false} disabled={devolvendo}
                  onChange={() => setVoltou(false)} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                <span>Não voltou <span style={{ color: 'var(--text-muted)' }}>— o estoque fica como está, e o produto entra nas perdas</span></span>
              </label>
            </div>

            {calculando && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calculando…
              </p>
            )}
            {previa && !calculando && (
              <>
                <div data-conta-da-devolucao style={{
                  display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
                  borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
                }}>
                  <div style={linha}><span>Volta: {previa.devolvido}</span><span style={valor}>{formatBRL(previa.valorDevolvido)}</span></div>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                    A venda ({formatBRL(previa.vendido)}{previa.devolvidoAntes > 0 ? `, ${formatBRL(previa.devolvidoAntes)} já devolvidos` : ''}) passa a valer {formatBRL(previa.valorNovo)}.
                  </p>
                  <div style={linha}><span>Pago</span><span style={valor}>{formatBRL(previa.pago)}</span></div>
                  {previa.aReceber > 0 && (
                    <div style={linha}><span>A receber</span><span style={valor}>{formatBRL(previa.aReceber)}</span></div>
                  )}
                  {previa.cai > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={linha}><span>Parcelas a receber que caem</span><span style={valor}>{formatBRL(previa.cai)}</span></div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {previa.parcelas.map(p => (
                          <li key={p.id} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                            {p.descricao}{p.vencimento ? ` (vence ${formatarNoFuso(p.vencimento, 'dd/MM')})` /* a âncora do vencimento se lê em Brasília */ : ''}:{' '}
                            {p.fica > 0 ? `de ${formatBRL(p.valor)} passa a ${formatBRL(p.fica)}` : `${formatBRL(p.valor)} cancelada`}
                          </li>
                        ))}
                      </ul>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                        O a receber que passa do que a venda vale cai antes de devolver qualquer coisa.
                      </p>
                    </div>
                  )}
                  <div data-a-devolver style={{ ...linha, borderTop: '1px solid var(--hairline)', paddingTop: 6 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>A devolver</span>
                    <span style={valor}>{formatBRL(previa.devolver)}</span>
                  </div>
                </div>

                <EscolhaDaDevolucao prefixo="devolver-parte" devolver={previa.devolver} parcial={previa.parcial}
                  fidelidade={previa.fidelidade} estado={escolha} aoMudar={setEscolha} desligado={devolvendo} opcoesDeVezes={opcoesDeVezes} />
              </>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="field-label">Motivo da devolução *</span>
              <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={devolvendo}
                onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a cliente devolveu um lacrado" />
            </label>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              A comissão de quem vendeu e as Vendas passam a valer o que ficou. Não se desfaz.
            </p>
          </>
        )}
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={devolvendo} onClick={onFechar}>Voltar</button>
          {venda && (
            <button type="button" className="btn-primary" disabled={devolvendo || !pronto} onClick={confirmar}>
              {devolvendo ? 'Devolvendo…' : 'Devolver'}
            </button>
          )}
        </div>
      </div>
    </JanelaModal>
  )
}
