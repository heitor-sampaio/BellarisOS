'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ShoppingBag, X, AlertTriangle } from 'lucide-react'
import type { AtendimentoAReceber } from '@/lib/metrics/a-receber'
import { rotaDoRecebimento } from '@/components/shared/atendimentos-a-receber'
import { formatBRL } from '@estetica-os/utils'
import { venderProcedimento, agendarUnidadePrePaga } from '@/actions/pre-pago'
import { venderProduto } from '@/actions/produtos'
import { SessionScheduler } from '@/components/branch/treatment-sessions-modal'
import { SegSelect } from '@/components/shared/seg-select'
import { FormularioDoPacote, type PacoteAVenda } from '@/components/shared/vender-pacote'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento, recusaDoPagamento } from '@/components/shared/campos-do-pagamento'
import { CampoDoDesconto, SEM_DESCONTO, contaDoDesconto, descontoDoEstado } from '@/components/shared/campo-do-desconto'

/**
 * "Vender" (decisão do Heitor, 2026-09-30): um botão só, e a janela pergunta
 * o QUÊ — um procedimento (pré-pago: N unidades, agendadas depois) ou um
 * pacote do catálogo. Os dois são coisas separadas no banco; aqui só dividem a
 * porta. Agendar continua sendo o outro botão: vender é o que o cliente
 * compra e como paga; agendar é quando ele vem.
 */

export interface ProcedimentoAVenda { id: string; name: string; price: number }

/** O produto de revenda à venda (D4): o preço e quantas embalagens inteiras há na unidade. */
export interface ProdutoAVenda { id: string; name: string; price: number; unidade: string; disponivel: number }

type Aba = 'PROCEDIMENTO' | 'PACOTE' | 'PRODUTO'

export function Vender({ clienteId, branchId, pacotes, procedimentos, produtos = [], compacto = false, abrirSinal = 0, podeAgendar = false, aReceber = [], desativadoPorque = null }: {
  clienteId:     string
  branchId:      string
  pacotes:       PacoteAVenda[]
  procedimentos: ProcedimentoAVenda[]
  /** Os produtos de revenda (D4): a venda de produto exige a cliente — esta janela já é da ficha dela. */
  produtos?:     ProdutoAVenda[]
  /** Botão pequeno, como as ações do painel da conversa. */
  compacto?:     boolean
  /**
   * Abre a venda sem o clique (cada valor novo acima de zero abre uma vez).
   * É o "cadastrar e depois vender" do inbox: o cadastro termina e a venda
   * já abre para o cliente que acabou de nascer.
   */
  abrirSinal?:   number
  /** Depois de vender um procedimento, oferece "Agendar agora" (agenda: MANAGE). */
  podeAgendar?:  boolean
  /**
   * Os atendimentos concluídos e não pagos da cliente (D5, 2026-10-27): vender
   * o mesmo procedimento de novo cobraria duas vezes — a venda avisa.
   */
  aReceber?:     AtendimentoAReceber[]
  /** O botão aparece desligado, com o motivo (a ficha arquivada, J-23). */
  desativadoPorque?: string | null
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [abertura, setAbertura] = useState(0)
  const [aba, setAba] = useState<Aba>(procedimentos.length ? 'PROCEDIMENTO' : pacotes.length ? 'PACOTE' : 'PRODUTO')
  const abrir = useCallback(() => { setAbertura(n => n + 1); dialogRef.current?.showModal() }, [])
  const fechar = useCallback(() => dialogRef.current?.close(), [])
  useEffect(() => {
    if (abrirSinal > 0 && !dialogRef.current?.open) dialogRef.current?.showModal()
  }, [abrirSinal])

  if (!pacotes.length && !procedimentos.length && !produtos.length) return null
  const abas = [
    ...(procedimentos.length ? [{ key: 'PROCEDIMENTO', label: 'Procedimento' }] : []),
    ...(pacotes.length ? [{ key: 'PACOTE', label: 'Pacote' }] : []),
    ...(produtos.length ? [{ key: 'PRODUTO', label: 'Produto' }] : []),
  ]
  const chave = `${abertura}-${abrirSinal}`
  if (desativadoPorque) {
    return (
      <button type="button" className={compacto ? 'btn-ghost' : 'btn-secondary'} disabled title={desativadoPorque}
        style={compacto ? { fontSize: 'var(--text-2xs)', padding: '4px 7px' } : undefined}>
        <ShoppingBag size={compacto ? 12 : 15} aria-hidden /> Vender
      </button>
    )
  }
  return (
    <>
      {compacto ? (
        <button type="button" className="btn-ghost" onClick={abrir} style={{ fontSize: 'var(--text-2xs)', padding: '4px 7px' }}>
          <ShoppingBag size={12} aria-hidden /> Vender
        </button>
      ) : (
        <button type="button" className="btn-secondary" onClick={abrir}>
          <ShoppingBag size={15} aria-hidden /> Vender
        </button>
      )}
      <dialog ref={dialogRef} className="modal modal-flex" style={{ maxWidth: 560, textAlign: 'left' }}
        onClick={e => { if (e.target === dialogRef.current) fechar() }} aria-label="Vender">
        <div className="modal-container">
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--hairline)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Vender</h2>
            <button type="button" className="btn-ghost" onClick={fechar} style={{ padding: 6 }} aria-label="Fechar"><X size={16} /></button>
          </div>
          <div className="modal-body" style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {abas.length > 1 && (
              <SegSelect ariaLabel="O que vender" options={abas} value={aba} onSelect={k => setAba(k as Aba)} />
            )}
            {aba === 'PRODUTO' && produtos.length > 0
              ? <FormularioDoProduto key={chave} clienteId={clienteId} branchId={branchId} produtos={produtos} onFim={fechar} />
              : aba === 'PROCEDIMENTO' && procedimentos.length > 0
              ? <FormularioDoProcedimento key={chave} clienteId={clienteId} branchId={branchId} procedimentos={procedimentos} onFim={fechar} podeAgendar={podeAgendar} aReceber={aReceber} />
              : <FormularioDoPacote key={chave} clienteId={clienteId} branchId={branchId} pacotes={pacotes} onFim={fechar} />}
          </div>
        </div>
      </dialog>
    </>
  )
}

/**
 * Produto (D4, decisão do Heitor, 2026-10-29): o produto de revenda, quantas
 * embalagens, o desconto e como vai ser pago. O estoque baixa na hora, pelo
 * lote que vence primeiro; sem estoque suficiente, o servidor recusa.
 */
function FormularioDoProduto({ clienteId, branchId, produtos, onFim }: {
  clienteId: string; branchId: string; produtos: ProdutoAVenda[]; onFim: () => void
}) {
  const router = useRouter()
  const [prodId, setProdId] = useState(produtos[0]!.id)
  const [quantidade, setQuantidade] = useState('1')
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA'))
  const [desconto, setDesconto] = useState(SEM_DESCONTO)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const prod = produtos.find(p => p.id === prodId) ?? produtos[0]!
  const qtd = Math.max(0, Math.trunc(Number(quantidade) || 0))
  const tabela = Math.round(prod.price * 100) * qtd / 100
  const conta = contaDoDesconto(tabela, desconto)

  function vender() {
    setErro(recusaDoPagamento(estado))
    if (recusaDoPagamento(estado)) return
    iniciar(async () => {
      const r = await venderProduto(clienteId, prod.id, branchId, qtd, montarPagamento(estado), descontoDoEstado(desconto))
      if (r.error) { setErro(r.error); return }
      router.refresh()
      onFim()
    })
  }

  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="overline">Produto</span>
        <select className="field" aria-label="Produto" value={prodId} onChange={e => setProdId(e.target.value)}>
          {produtos.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatBRL(p.price)} · {p.disponivel > 0 ? `${p.disponivel} ${p.unidade} em estoque` : 'sem estoque'}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
        <span style={rotulo}>Quantidade ({prod.unidade})</span>
        <input className="field" type="number" min={1} max={100} step={1} inputMode="numeric" aria-label="Quantidade"
          value={quantidade} onChange={e => setQuantidade(e.target.value)} />
      </label>
      <p data-resumo-do-produto style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
        {qtd} × {formatBRL(prod.price)} = {formatBRL(tabela)} · sai do estoque agora, pelo lote que vence primeiro
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={tabela} />
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} />
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={vender} disabled={pendente || !!conta.recusa || qtd < 1 || qtd > 100}>
          {pendente ? 'Vendendo…' : `Vender por ${formatBRL(conta.liquido)}`}
        </button>
      </div>
    </div>
  )
}

/**
 * Procedimento pré-pago: o procedimento, quantas unidades e (opcional) por
 * quantos dias valem; o desconto e como vai ser pago. As unidades ficam na
 * ficha, para agendar.
 */
function FormularioDoProcedimento({ clienteId, branchId, procedimentos, onFim, podeAgendar, aReceber }: {
  clienteId: string; branchId: string; procedimentos: ProcedimentoAVenda[]; onFim: () => void; podeAgendar: boolean
  aReceber: AtendimentoAReceber[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  // Depois da venda: a primeira unidade, para o "Agendar agora".
  const [vendida, setVendida] = useState<string | null>(null)
  const [procId, setProcId] = useState(procedimentos[0]!.id)
  const [quantidade, setQuantidade] = useState('1')
  const [validade, setValidade] = useState('')
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA'))
  const [desconto, setDesconto] = useState(SEM_DESCONTO)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const proc = procedimentos.find(p => p.id === procId) ?? procedimentos[0]!
  const qtd = Math.max(0, Math.trunc(Number(quantidade) || 0))
  const tabela = Math.round(proc.price * 100) * qtd / 100
  const conta = contaDoDesconto(tabela, desconto)
  // O mesmo procedimento já foi atendido e não foi pago: a venda nova cobraria de novo.
  const jaAtendido = aReceber.find(a => a.procedureId === proc.id) ?? null

  function vender() {
    setErro(recusaDoPagamento(estado))
    if (recusaDoPagamento(estado)) return
    iniciar(async () => {
      const r = await venderProcedimento(clienteId, proc.id, branchId, qtd, validade.trim() ? Number(validade) : null,
        montarPagamento(estado), descontoDoEstado(desconto))
      if (r.error) { setErro(r.error); return }
      router.refresh()
      if (podeAgendar && r.primeiraUnidadeId) { setVendida(r.primeiraUnidadeId); return }
      onFim()
    })
  }

  if (vendida) return (
    <div data-agendar-agora style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        Venda registrada. Agendar a primeira unidade agora? As outras ficam na ficha, para agendar depois.
      </p>
      <SessionScheduler
        branches={[{ id: branchId, name: '' }]}
        currentBranchId={branchId}
        onCancel={onFim}
        onSave={async ({ branchId: unidade, professionalId, scheduledAt }) => {
          const r = await agendarUnidadePrePaga({ unidadeId: vendida, branchId: unidade, professionalId, scheduledAt })
          if (r.error) return { error: r.error }
          router.refresh()
          onFim()
          return {}
        }}
      />
    </div>
  )

  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="overline">Procedimento</span>
        <select className="field" aria-label="Procedimento" value={procId} onChange={e => setProcId(e.target.value)}>
          {procedimentos.map(p => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
        </select>
      </label>
      <div className="form-2col">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Quantidade</span>
          <input className="field" type="number" min={1} max={100} step={1} inputMode="numeric" aria-label="Quantidade"
            value={quantidade} onChange={e => setQuantidade(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Validade em dias (opcional)</span>
          <input className="field" type="number" min={1} max={3650} step={1} inputMode="numeric" aria-label="Validade em dias"
            placeholder="Sem validade" value={validade} onChange={e => setValidade(e.target.value)} />
        </label>
      </div>
      {jaAtendido && (
        <div data-aviso-a-receber role="note" style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} aria-hidden />
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.45 }}>
            Esta cliente tem {jaAtendido.procedureName ?? 'este procedimento'} de {new Date(jaAtendido.scheduledAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} concluído
            e <strong>a receber ({formatBRL(jaAtendido.price)})</strong>. Para cobrar esse atendimento, receba por ele —
            vender de novo cobraria duas vezes.{' '}
            <Link href={rotaDoRecebimento(pathname, jaAtendido.branchSlug, jaAtendido.appointmentId)} style={{ color: 'var(--brand)', fontWeight: 700 }}>
              Receber o atendimento
            </Link>
          </p>
        </div>
      )}
      <p data-resumo-do-procedimento style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
        {qtd} × {formatBRL(proc.price)} = {formatBRL(tabela)} · as unidades ficam na ficha para agendar
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={tabela} />
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} />
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={vender} disabled={pendente || !!conta.recusa || qtd < 1 || qtd > 100}>
          {pendente ? 'Vendendo…' : `Vender por ${formatBRL(conta.liquido)}`}
        </button>
      </div>
    </div>
  )
}
