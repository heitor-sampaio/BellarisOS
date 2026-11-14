'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { avisoDaVenda } from '@/lib/vendas/aviso-da-venda'
import Link from 'next/link'
import { X, AlertTriangle, Plus } from 'lucide-react'
import type { AtendimentoAReceber } from '@/lib/metrics/a-receber'
import { rotaDoRecebimento } from '@/components/shared/atendimentos-a-receber'
import { formatBRL, parseDinheiro, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { venderProcedimento, agendarUnidadePrePaga } from '@/actions/pre-pago'
import { venderCredito, acessoDaClienteAoApp } from '@/actions/credito-na-clinica'
import { textoDoBonus } from '@/lib/creditos/bonus'
import { rotaCliente } from '@/lib/rotas'
import { venderProduto } from '@/actions/produtos'
import { SessionScheduler } from '@/components/branch/treatment-sessions-modal'
import { SegSelect } from '@/components/shared/seg-select'
import { FormularioDoPacote, type PacoteAVenda } from '@/components/shared/vender-pacote'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento, useRecusaDoPagamento } from '@/components/shared/campos-do-pagamento'
import { CampoDoDesconto, SEM_DESCONTO, contaDoDesconto, descontoDoEstado } from '@/components/shared/campo-do-desconto'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { CampoQuemVendeu, PerguntaDaVenda } from '@/components/shared/pergunta-da-venda'
import { textoDaComissaoDaVenda, type RegraDeVenda } from '@/lib/comissoes/comissao-da-venda'
import { useFuso } from '@/components/shared/fuso'

/**
 * Vender (decisão do Heitor, 2026-09-30; desde 2026-11-13, só pelo PDV — PDV7):
 * a tela pergunta o QUÊ — um procedimento (pré-pago: N unidades, agendadas
 * depois), um pacote do catálogo, um produto ou crédito na rede — e como paga.
 * São coisas separadas no banco; aqui só dividem a porta.
 */

export interface ProcedimentoAVenda { id: string; name: string; price: number }

/** O produto de revenda à venda (D4): o preço e quantas embalagens inteiras há na unidade. */
export interface ProdutoAVenda {
  id: string; name: string; price: number; unidade: string; disponivel: number
  /** Se a venda de produto pontua (A48): `null` com a fidelidade da rede desligada. */
  fidelidade?: 'PONTUA' | 'NAO_PONTUA' | null
  /** A18 da 12ª: a comissão de venda DO PRODUTO (só no "Por produto"); nula = sem a dele. */
  comissaoDoItem?: RegraDeVenda | null
  /** A18 da 12ª: a "Venda de produto" da clínica (%), a que vale sem a do produto e a da pessoa. */
  comissaoDaClinicaPct?: number | null
}

/** Alguém da equipe numa venda (com-04/com-06): a responsável do pacote sai de quem atende. */
export interface MembroDaVenda {
  id: string; nome: string
  /** Atende NESTA unidade (o "Atende" por unidade, decisão 2 da 8ª). */
  atende: boolean
  /** Recebe (o caixa ou o financeiro em Gerenciar): vem logo depois de quem atende em "Quem vendeu" (A15 da 8ª). */
  recebe?: boolean
  /** A42 da 11ª: tem o grupo Vendas no cargo (`crm` ou `procedures`). Só fica na lista quem atende, recebe ou vende. */
  vende?: boolean
  /** É quem está registrando ("(você)" em "Quem vendeu", que nasce vazio — r2-ven-12). */ eu?: boolean
  /**
   * A comissão de venda da pessoa (%), A18 da 12ª: nula = nenhuma; AUSENTE = o
   * cargo de quem vende não a vê (é de outra pessoa e ele só vê as próprias).
   */
  comissaoVendaPct?: number | null
}

type Aba = 'PROCEDIMENTO' | 'PACOTE' | 'PRODUTO' | 'CREDITO'

/** O crédito na clínica (decisão 1 da 9ª) se vende em qualquer unidade: a aba existe sempre. */
const ABA_DO_CREDITO = { key: 'CREDITO', label: 'Crédito na rede' }

/**
 * A venda NA TELA do PDV (PDV2, a revisão do Heitor de 2026-11-13: "só vende
 * pelo PDV"): o mesmo conteúdo da janela "Vender" — o que vender e como paga —,
 * sem a janela, numa unidade só (a do PDV). Toda venda vira a comanda dela no
 * banco (o gatilho `comanda_da_venda`).
 */
export function VendaNaTela({ clienteId, branchId, pacotes, procedimentos, produtos, equipe, podeAgendar = false, aReceber = [], onFim }: {
  clienteId:     string
  branchId:      string
  pacotes:       PacoteAVenda[]
  procedimentos: ProcedimentoAVenda[]
  produtos:      ProdutoAVenda[]
  equipe:        MembroDaVenda[]
  podeAgendar?:  boolean
  aReceber?:     AtendimentoAReceber[]
  onFim:         () => void
}) {
  const [aba, setAba] = useState<Aba>(procedimentos.length ? 'PROCEDIMENTO' : pacotes.length ? 'PACOTE' : produtos.length ? 'PRODUTO' : 'CREDITO')
  const abas = [
    ...(procedimentos.length ? [{ key: 'PROCEDIMENTO', label: 'Procedimento' }] : []),
    ...(pacotes.length ? [{ key: 'PACOTE', label: 'Pacote' }] : []),
    ...(produtos.length ? [{ key: 'PRODUTO', label: 'Produto' }] : []),
    ABA_DO_CREDITO,
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {abas.length > 1 && (
        <SegSelect ariaLabel="O que vender" options={abas} value={aba} onSelect={k => setAba(k as Aba)} />
      )}
      {aba === 'CREDITO'
        ? <FormularioDoCredito key={aba} clienteId={clienteId} branchId={branchId} onFim={onFim} />
        : aba === 'PRODUTO' && produtos.length > 0
        ? <FormularioDoProduto key={aba} clienteId={clienteId} branchId={branchId} produtos={produtos} onFim={onFim} equipe={equipe} />
        : aba === 'PROCEDIMENTO' && procedimentos.length > 0
        ? <FormularioDoProcedimento key={aba} clienteId={clienteId} branchId={branchId} procedimentos={procedimentos} onFim={onFim} podeAgendar={podeAgendar} aReceber={aReceber} equipe={equipe} />
        : <FormularioDoPacote key={aba} clienteId={clienteId} branchId={branchId} pacotes={pacotes} onFim={onFim} equipe={equipe} podeAgendar={podeAgendar} />}
    </div>
  )
}

/**
 * Produto (D4, decisão do Heitor, 2026-10-29): os produtos de revenda, quantas
 * embalagens de cada, o desconto e como vai ser pago. Vários produtos numa
 * venda só, com um pagamento (ven-04, 2026-11-02: "a Carla leva 2 séruns e 1
 * protetor"). O estoque baixa na hora, pelo lote que vence primeiro; sem
 * estoque suficiente de um deles, o servidor recusa a venda inteira.
 */
function FormularioDoProduto({ clienteId, branchId, produtos, onFim, equipe }: {
  clienteId: string; branchId: string; produtos: ProdutoAVenda[]; onFim: () => void; equipe: MembroDaVenda[]
}) {
  const fuso = useFuso()
  // "Quem vendeu" (com-06): nasce VAZIO (r2-ven-12); vazio, a venda pergunta.
  const [vendedorId, setVendedorId] = useState('')
  const [pergunta, setPergunta] = useState<string | null>(null)
  const router = useRouter()
  const [itens, setItens] = useState<{ prodId: string; quantidade: string }[]>(() => [{ prodId: produtos[0]!.id, quantidade: '1' }])
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA', fuso))
  // C75: com mais de uma maquininha, o cartão não segue sem "Qual maquininha?".
  const recusaDoPagamento = useRecusaDoPagamento()
  const [desconto, setDesconto] = useState(SEM_DESCONTO)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const linhas = itens.map(i => {
    const prod = produtos.find(p => p.id === i.prodId) ?? produtos[0]!
    const qtd = Math.max(0, Math.trunc(Number(i.quantidade) || 0))
    return { prod, qtd, subtotal: Math.round(prod.price * 100) * qtd / 100 }
  })
  const tabela = Math.round(linhas.reduce((s, l) => s + Math.round(l.subtotal * 100), 0)) / 100
  const conta = contaDoDesconto(tabela, desconto)
  const quantidadesValidas = linhas.every(l => l.qtd >= 1 && l.qtd <= 100)
  const livres = produtos.filter(p => !itens.some(i => i.prodId === p.id))
  // A chave do envio (D10): o duplo clique vende uma vez só.
  const envio = useEnvioUnico()
  const mudar = (n: number, parte: Partial<{ prodId: string; quantidade: string }>) =>
    setItens(xs => xs.map((x, i) => (i === n ? { ...x, ...parte } : x)))

  function vender(semVendedor = false) {
    setErro(recusaDoPagamento(estado, conta.liquido))
    if (recusaDoPagamento(estado, conta.liquido)) return
    iniciar(async () => {
      const r = await venderProduto(clienteId, linhas.map(l => ({ produtoId: l.prod.id, quantidade: l.qtd })), branchId, null,
        montarPagamento(estado), descontoDoEstado(desconto), envio.chave(), { vendedorId: vendedorId || null, semVendedor })
      if (r.confirmarSemVendedor) { setPergunta(r.confirmarSemVendedor); return }
      if (r.error) { setErro(r.error); return }
      envio.renovar()
      router.refresh()
      // A46 da 8ª: a janela fechava calada.
      toast.success(avisoDaVenda(linhas.map(l => `${l.qtd}× ${l.prod.name}`).join(' + '), conta.liquido, estado.forma))
      onFim()
    })
  }

  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  const fidelidade = produtos[0]?.fidelidade
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {itens.map((item, n) => {
        const sufixo = n === 0 ? '' : ` ${n + 1}`
        const linha = linhas[n]!
        return (
          <div key={n} data-item-da-venda style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 240px', minWidth: 0 }}>
              <span className="overline">Produto{sufixo}</span>
              <select className="field" aria-label={`Produto${sufixo}`} value={item.prodId} onChange={e => mudar(n, { prodId: e.target.value })}>
                {produtos.filter(p => p.id === item.prodId || !itens.some(i => i.prodId === p.id)).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBRL(p.price)} · {p.disponivel > 0 ? `${p.disponivel} ${p.unidade} em estoque` : 'sem estoque'}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 130 }}>
              <span style={rotulo}>Quantidade ({linha.prod.unidade})</span>
              <input className="field" type="number" min={1} max={100} step={1} inputMode="numeric" aria-label={`Quantidade${sufixo}`}
                value={item.quantidade} onChange={e => mudar(n, { quantidade: e.target.value })} />
            </label>
            {itens.length > 1 && (
              <button type="button" className="btn-ghost" aria-label={`Tirar o produto${sufixo || ' 1'}`} style={{ padding: 8 }}
                onClick={() => setItens(xs => xs.filter((_, i) => i !== n))}>
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
        )
      })}
      {livres.length > 0 && itens.length < 20 && (
        <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 'var(--text-sm-sz)' }}
          onClick={() => setItens(xs => [...xs, { prodId: livres[0]!.id, quantidade: '1' }])}>
          <Plus size={14} aria-hidden /> Adicionar produto
        </button>
      )}
      <p data-resumo-do-produto style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
        {linhas.map(l => `${l.qtd} × ${formatBRL(l.prod.price)}`).join(' + ')} = {formatBRL(tabela)} · sai do estoque agora, pelo lote que vence primeiro
      </p>
      <CampoQuemVendeu equipe={equipe} valor={vendedorId} aoMudar={id => { setVendedorId(id); setPergunta(null) }}
        comissao={comissaoDosProdutos(equipe.find(m => m.id === vendedorId), linhas.map(l => l.prod))} />
      {/* A48 da 5ª simulação: a venda de produto nasce sem pontuar, e a tela não dizia. */}
      {fidelidade && (
        <p data-pontos-do-produto style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {fidelidade === 'PONTUA'
            ? 'A venda gera pontos de fidelidade quando for paga.'
            : 'A venda de produto não gera pontos de fidelidade (Configurações → Fidelidade).'}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={tabela} comMotivo />
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} total={conta.liquido} clienteId={clienteId} />
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {pergunta ? (
        <PerguntaDaVenda texto={pergunta} pendente={pendente} aoConfirmar={() => vender(true)} aoVoltar={() => setPergunta(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => vender()} disabled={pendente || !!conta.recusa || !!recusaDoPagamento(estado, conta.liquido) || !quantidadesValidas}>
            {pendente ? 'Vendendo…' : `Vender por ${formatBRL(conta.liquido)}`}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Crédito na clínica — o "vale" (decisão 1 do Heitor sobre a 9ª simulação,
 * 2026-11-07): a cliente paga agora para usar depois em qualquer coisa. Entra
 * no caixa hoje, na forma escolhida; o uso depois não conta como receita de
 * novo. Sem "Quem vendeu": não tem comissão de venda.
 */
function FormularioDoCredito({ clienteId, branchId, onFim }: { clienteId: string; branchId: string; onFim: () => void }) {
  const fuso = useFuso()
  const router = useRouter()
  const pathname = usePathname()
  const [valor, setValor] = useState('')
  // A20 da 11ª (decisão do Heitor): o bônus, opcional — nasce vazio (princípio 6).
  const [bonus, setBonus] = useState('')
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA', fuso))
  // C75: com mais de uma maquininha, o cartão não segue sem "Qual maquininha?".
  const recusaDoPagamento = useRecusaDoPagamento()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  // A55 da 11ª: a cliente sem acesso ao app não vê o saldo pelo celular.
  const [semAcessoAoApp, setSemAcessoAoApp] = useState(false)
  const envio = useEnvioUnico()
  const lido = parseDinheiro(valor)
  const reais = Number.isFinite(lido) && lido > 0 ? Math.round(lido * 100) / 100 : 0
  const ilegivel = valor.trim() !== '' && !Number.isFinite(lido)
  const bonusLido = bonus.trim() === '' ? 0 : parseDinheiro(bonus)
  const bonusIlegivel = bonus.trim() !== '' && (!Number.isFinite(bonusLido) || bonusLido < 0)
  const bonusEmReais = !bonusIlegivel && bonusLido > 0 ? Math.round(bonusLido * 100) / 100 : 0

  useEffect(() => {
    let vivo = true
    acessoDaClienteAoApp(clienteId).then(r => { if (vivo) setSemAcessoAoApp(r.semAcesso) }).catch(() => {})
    return () => { vivo = false }
  }, [clienteId])

  function vender() {
    const recusa = recusaDoPagamento(estado, reais)
    setErro(recusa)
    if (recusa || reais <= 0 || bonusIlegivel) return
    iniciar(async () => {
      const r = await venderCredito(clienteId, branchId, valor, montarPagamento(estado), envio.chave(), bonus.trim())
      if (r.error) { setErro(r.error); return }
      envio.renovar()
      router.refresh()
      toast.success(avisoDaVenda(bonusEmReais > 0 ? `Crédito na clínica (${textoDoBonus(reais, bonusEmReais)})` : 'Crédito na clínica', reais, estado.forma))
      onFim()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
        <span className="field-label">Valor do crédito</span>
        <input className="field" inputMode="decimal" placeholder="0,00" value={valor} aria-invalid={ilegivel}
          onChange={e => setValor(e.target.value)} />
        {ilegivel && (
          <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{DINHEIRO_INVALIDO}</span>
        )}
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
        <span className="field-label">Bônus (opcional)</span>
        <input className="field" inputMode="decimal" placeholder="0,00" value={bonus} aria-invalid={bonusIlegivel}
          onChange={e => setBonus(e.target.value)} />
        {bonusIlegivel && (
          <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>
            {Number.isFinite(bonusLido) ? 'O bônus não pode ser negativo.' : DINHEIRO_INVALIDO}
          </span>
        )}
      </label>
      {/* A20 da 11ª: a conta do bônus antes de vender — o caixa recebe só o pago. */}
      {bonusEmReais > 0 && reais > 0 && (
        <p data-conta-do-bonus style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.45 }}>
          A cliente fica com <strong>{formatBRL(Math.round((reais + bonusEmReais) * 100) / 100)}</strong> de crédito: {textoDoBonus(reais, bonusEmReais)}.
          {' '}O caixa recebe só os {formatBRL(reais)} pagos, e os pontos são sobre eles. Se a venda for estornada, o bônus sai junto.
        </p>
      )}
      {/* A55 da 11ª: sem acesso ao app, ela não vê o saldo pelo celular. */}
      {semAcessoAoApp && (
        <p data-sem-acesso-ao-app style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.45, padding: '8px 10px', borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--hairline)' }}>
          Esta cliente não tem acesso ao app: ela não vai ver o saldo do crédito pelo celular.{' '}
          <Link href={`${rotaCliente(pathname, pathname.split('/')[1], clienteId)}?aba=dados`} style={{ color: 'var(--brand)', fontWeight: 700 }}>
            Dar acesso ao app
          </Link> na aba Dados da ficha.
        </p>
      )}
      {/* A regra na tela (princípio 3): onde o dinheiro conta e o que acontece no uso. */}
      <p data-regra-do-credito style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.45 }}>
        Entra no caixa hoje, na forma escolhida, e fica de saldo para a cliente usar em qualquer atendimento ou produto.
        Usar depois não conta como receita de novo. Sem comissão de venda.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA']} total={reais} semCredito />
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={vender} disabled={pendente || reais <= 0 || bonusIlegivel || !!recusaDoPagamento(estado, reais)}>
          {pendente ? 'Vendendo…' : `Vender por ${formatBRL(reais)}`}
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
function FormularioDoProcedimento({ clienteId, branchId, procedimentos, onFim, podeAgendar, aReceber, equipe }: {
  clienteId: string; branchId: string; procedimentos: ProcedimentoAVenda[]; onFim: () => void; podeAgendar: boolean
  aReceber: AtendimentoAReceber[]; equipe: MembroDaVenda[]
}) {
  const fuso = useFuso()
  // "Quem vendeu" (com-06): nasce VAZIO (r2-ven-12); vazio, a venda pergunta.
  const [vendedorId, setVendedorId] = useState('')
  const [pergunta, setPergunta] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  // Depois da venda: a primeira unidade, para o "Agendar agora".
  const [vendida, setVendida] = useState<string | null>(null)
  const [procId, setProcId] = useState(procedimentos[0]!.id)
  const [quantidade, setQuantidade] = useState('1')
  const [validade, setValidade] = useState('')
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA', fuso))
  // C75: com mais de uma maquininha, o cartão não segue sem "Qual maquininha?".
  const recusaDoPagamento = useRecusaDoPagamento()
  const [desconto, setDesconto] = useState(SEM_DESCONTO)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const proc = procedimentos.find(p => p.id === procId) ?? procedimentos[0]!
  const qtd = Math.max(0, Math.trunc(Number(quantidade) || 0))
  const tabela = Math.round(proc.price * 100) * qtd / 100
  const conta = contaDoDesconto(tabela, desconto)
  // O mesmo procedimento já foi atendido e não foi pago: a venda nova cobraria de novo.
  const jaAtendido = aReceber.find(a => a.procedureId === proc.id) ?? null
  // A chave do envio (D10): o duplo clique vende uma vez só.
  const envio = useEnvioUnico()

  function vender(semVendedor = false) {
    setErro(recusaDoPagamento(estado, conta.liquido))
    if (recusaDoPagamento(estado, conta.liquido)) return
    iniciar(async () => {
      const r = await venderProcedimento(clienteId, proc.id, branchId, qtd, validade.trim() ? Number(validade) : null,
        montarPagamento(estado), descontoDoEstado(desconto), envio.chave(), { vendedorId: vendedorId || null, semVendedor })
      if (r.confirmarSemVendedor) { setPergunta(r.confirmarSemVendedor); return }
      if (r.error) { setErro(r.error); return }
      envio.renovar()
      router.refresh()
      if (podeAgendar && r.primeiraUnidadeId) { setVendida(r.primeiraUnidadeId); return }
      toast.success(avisoDaVenda(`${qtd}× ${proc.name}`, conta.liquido, estado.forma))
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
            Esta cliente tem {jaAtendido.procedureName ?? 'este procedimento'} de {new Date(jaAtendido.scheduledAt).toLocaleDateString('pt-BR', { timeZone: fuso })} concluído
            e <strong>a receber ({formatBRL(jaAtendido.price)})</strong>. Para cobrar esse atendimento, receba por ele —
            vender de novo cobraria duas vezes.{' '}
            <Link href={rotaDoRecebimento(pathname, jaAtendido.branchSlug, jaAtendido.appointmentId)} style={{ color: 'var(--brand)', fontWeight: 700 }}>
              Receber o atendimento
            </Link>
          </p>
        </div>
      )}
      <CampoQuemVendeu equipe={equipe} valor={vendedorId} aoMudar={id => { setVendedorId(id); setPergunta(null) }}
        comissao={comissaoDoPrePago(equipe.find(m => m.id === vendedorId))} />
      <p data-resumo-do-procedimento style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
        {qtd} × {formatBRL(proc.price)} = {formatBRL(tabela)} · as unidades ficam na ficha para agendar
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={tabela} comMotivo />
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} total={conta.liquido} clienteId={clienteId} />
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {pergunta ? (
        <PerguntaDaVenda texto={pergunta} pendente={pendente} aoConfirmar={() => vender(true)} aoVoltar={() => setPergunta(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => vender()} disabled={pendente || !!conta.recusa || !!recusaDoPagamento(estado, conta.liquido) || qtd < 1 || qtd > 100}>
            {pendente ? 'Vendendo…' : `Vender por ${formatBRL(conta.liquido)}`}
          </button>
        </div>
      )}
    </div>
  )
}

/** A18 da 12ª: a comissão de venda do produto (cada um do kit com a sua), dita embaixo de "Quem vendeu". */
function comissaoDosProdutos(quem: MembroDaVenda | undefined, produtos: ProdutoAVenda[]): string | null {
  if (!quem) return null
  return textoDaComissaoDaVenda({
    tipo: 'PRODUTO', pessoa: { nome: quem.nome, pct: quem.comissaoVendaPct },
    clinicaPct: produtos[0]?.comissaoDaClinicaPct ?? null,
    itens: produtos.map(p => ({ nome: p.name, regra: p.comissaoDoItem ?? null })),
  })
}

/** A18 da 12ª: o pré-pago só tem a comissão de venda da pessoa. */
function comissaoDoPrePago(quem: MembroDaVenda | undefined): string | null {
  if (!quem) return null
  return textoDaComissaoDaVenda({ tipo: 'PRE_PAGO', pessoa: { nome: quem.nome, pct: quem.comissaoVendaPct }, itens: [{ regra: null }] })
}
