'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, PackagePlus, ArrowLeftRight, SlidersHorizontal,
  AlertTriangle, TrendingDown, Check, Loader2, PackageX,
} from 'lucide-react'
import {
  adminAddStock, adminTransferStock, adminAdjustStock, adminUpdateMinStock, registrarPerda,
  getProductMovements, desfazerEntradaDeEstoque, desfazerAjusteDeEstoque, desfazerPerdaDeEstoque, type MovimentoDeEstoque,
} from '@/actions/stock'
import { JanelaModal } from '@/components/shared/janela-modal'
import { MOTIVOS_DA_PERDA } from '@/lib/estoque/perda'
import { validadeNaTela, loteVencido } from '@/lib/estoque/validade'
import { saldoNaPrateleira } from '@/lib/estoque/saldo-em-texto'
import { medidaNoPlural as pl } from '@/lib/estoque/medidas'
import { minimoEhDoCadastro } from '@/lib/estoque/situacao'
import { lerNotaDaEntradaAnterior, guardarNotaDaEntrada } from '@/lib/estoque/nota-da-entrada'
import { erroParaTela } from '@/lib/erro-na-tela'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { SegSelect } from '@/components/shared/seg-select'
import { toast } from 'sonner'
import { parseDecimal } from '@estetica-os/utils'
import { useFuso } from '@/components/shared/fuso'
import { CampoDaLista, type ItemDaLista } from '@/components/admin/campo-da-lista'

type BranchStock = {
  branchId:     string
  branchName:   string
  currentStock: number
  minStock:     number
  /** O saldo em consumo (UI, ml), com unidade de consumo — o ajuste o mostra (D3 da 7ª). */
  currentRendimento?: number | null
}

type ProductInfo = {
  id:       string
  name:     string
  unit:     string
  branches: BranchStock[]
  /** Os lotes com saldo (a perda escolhe de qual lote sai — D-7). */
  lotes?:   { id: string; unidadeId: string; numero: string | null; validade: string | null; quantidade: number }[]
  /** A unidade de consumo (ml, UI) e quanto a embalagem rende: a perda aceita as duas (est-03). */
  consumptionUnit?: string | null
  unitsPerPackage?: number | null
  /** O mínimo do cadastro do produto: vale na unidade que ainda não tem linha (D11 da 12ª). */
  minimoDoCadastro?: number | null
}

/** `ativa: false` = a unidade desativada (F72): dela sai (transferir, ajustar, perda), para ela não entra. */
type AllBranch = { id: string; name: string; ativa?: boolean }
const soAtivas = (lista: AllBranch[]) => lista.filter(b => b.ativa !== false)

interface Props {
  product:         ProductInfo
  allBranches:     AllBranch[]
  defaultBranchId?: string
  /**
   * A unidade filtrada na tela (F72): a origem já escolhida da transferência —
   * o "Transferir o estoque" da janela de desativar chega aqui. E a unidade já
   * marcada na Entrada, no Ajuste e na Perda (A16 da 14ª).
   */
  origemSugerida?: string
  /** E14: as listas de marcas e de fornecedores da rede (a Entrada escolhe das duas). */
  marcas?:         ItemDaLista[]
  fornecedores?:   ItemDaLista[]
  /** C16: aberto pelo leitor de código de barras — só a Entrada. */
  somenteEntrada?: boolean
  onClose:         () => void
  onSuccess:       () => void
}

type Tab   = 'movimentacoes' | 'min-stock' | 'historico'
type MovOp = 'entrada' | 'transferencia' | 'ajuste' | 'perda'

// -- Primitivos --------------------------------------------------------
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
      {children}
    </label>
  )
}
function FieldWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
}
function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p style={{
      fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '8px 12px', borderRadius: 8,
      background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)',
    }}>{msg}</p>
  )
}

function UnitSuffix({ unit }: { unit: string }) {
  return (
    <span style={{
      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
      fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', pointerEvents: 'none',
    }}>{unit}</span>
  )
}

/** A única unidade da lista, ou vazio quando há escolha a fazer. */
const unicaUnidade = (lista: { id: string }[]) => lista.length === 1 ? lista[0]!.id : ''
/**
 * A unidade que já vem marcada (A16 da 14ª, princípio 7): com a tela filtrada
 * numa unidade (`?unidade=`), a Entrada, o Ajuste e a Perda já vêm com ela —
 * a dona filtrava a Pampulha e tinha de escolher a Pampulha de novo. Fora da
 * lista (a desativada, na Entrada), vale a regra de sempre: a única, ou nenhuma.
 */
const unidadeSugerida = (lista: { id: string }[], sugerida?: string) =>
  sugerida && lista.some(b => b.id === sugerida) ? sugerida : unicaUnidade(lista)

function BranchSelect({
  name, branches, allBranches, label, required, onChange, defaultValue,
}: {
  name:          string
  branches:      BranchStock[]
  allBranches:   AllBranch[]
  label:         string
  required?:     boolean
  onChange?:     (id: string) => void
  defaultValue?: string
}) {
  const stockMap = Object.fromEntries(branches.map(b => [b.branchId, b.currentStock]))
  return (
    <FieldWrap>
      <Label>{label}{required && ' *'}</Label>
      {/* Uma unidade só: já vem escolhida (F8 — era obrigatório e vazio). */}
      <select name={name} required={required} defaultValue={defaultValue ?? unicaUnidade(allBranches)} className="field"
        onChange={e => onChange?.(e.target.value)}>
        <option value="" disabled>Selecionar unidade…</option>
        {allBranches.map(b => (
          <option key={b.id} value={b.id}>
            {b.name}{stockMap[b.id] !== undefined ? ` · ${stockMap[b.id]!.toLocaleString('pt-BR')}` : ''}
          </option>
        ))}
      </select>
    </FieldWrap>
  )
}

// -- Formulário: Entrada -----------------------------------------------
function EntradaForm({ product, allBranches, defaultBranchId, sugerida, marcas = [], fornecedores = [], onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  /** A unidade do filtro da tela (A16 da 14ª). */
  sugerida?: string
  marcas?: ItemDaLista[]
  fornecedores?: ItemDaLista[]
  onClose: () => void; onSuccess: () => void
}) {
  const envio = useEnvioUnico()
  // A validade passada pelo dia da unidade (F62b).
  const fuso = useFuso()
  const [error, setError]     = useState<string>()
  const [pending, setPending] = useState(false)
  // A51 da 11ª: a validade que já passou avisa (princípio 2 — não recusa).
  const [validade, setValidade] = useState('')
  const validadeVencida = !!validade && loteVencido(validade, new Date(), fuso)
  // A54 da 11ª: a nota com vários produtos — a próxima entrada traz a nota e o
  // fornecedor da anterior (na mesma aba, por 2 horas), e diz que dá para apagar.
  const [notaAnterior] = useState(() => lerNotaDaEntradaAnterior())

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      // A chave do envio (D10): o duplo clique movimenta uma vez só.
      fd.set('_envio', envio.chave())
      const res = await adminAddStock(undefined, fd)
      if (res?.success) {
        envio.renovar()
        const idEscolhido = String(fd.get('fornecedor_id') ?? '')
        const nomeDoFornecedor = fornecedores.find(f => f.id === idEscolhido)?.nome || ''
        guardarNotaDaEntrada(String(fd.get('nota_fiscal') ?? ''), nomeDoFornecedor)
        // A52 da 11ª: a entrada confirma — e diz o saldo DEPOIS (C16).
        const saldo = 'saldoAgora' in res && res.saldoAgora ? ` Saldo agora: ${res.saldoAgora}.` : ''
        toast.success(`Entrada registrada: +${Number(fd.get('quantity')).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${pl(product.unit, Number(fd.get('quantity')))} de ${product.name}.${saldo}`)
        onSuccess()
      }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={soAtivas(allBranches)}
          label="Unidade de destino" required defaultValue={unidadeSugerida(soAtivas(allBranches), sugerida)} />
      )}

      {/* A37 da 10ª: a Entrada diz a regra, como a Perda (D13 revisto, decisão do
          Heitor, 2026-10-28: movimentação de estoque nunca gera despesa). */}
      <p data-entrada-sem-despesa style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Não gera despesa: o custo é a base do insumo, do valor em estoque e da margem. A compra que a clínica pagou entra no
        Financeiro por um lançamento (Novo lançamento, categoria “Compra de estoque”).
      </p>

      <div className="form-2col">
        <FieldWrap>
          <Label htmlFor="entrada-quantidade">Quantidade *</Label>
          <div style={{ position: 'relative' }}>
            <input id="entrada-quantidade" name="quantity" type="number" step="0.001" min="0.001" required className="field"
              placeholder="0" style={{ paddingRight: 36 }} />
            <UnitSuffix unit={product.unit} />
          </div>
        </FieldWrap>
        <FieldWrap>
          <Label htmlFor="entrada-custo">Custo unitário</Label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', pointerEvents: 'none',
            }}>R$</span>
            <input id="entrada-custo" name="unit_cost" type="number" step="0.01" min="0" className="field"
              placeholder="0,00" style={{ paddingLeft: 28 }} />
          </div>
        </FieldWrap>
      </div>

      <div className="form-2col">
        <FieldWrap>
          <Label htmlFor="entrada-lote">Nº do lote</Label>
          <input id="entrada-lote" name="batch_number" type="text" className="field" placeholder="LOT-001" />
        </FieldWrap>
        <FieldWrap>
          <Label htmlFor="entrada-validade">Validade</Label>
          <input id="entrada-validade" name="expires_at" type="date" className="field" value={validade} onChange={e => setValidade(e.target.value)} />
        </FieldWrap>
      </div>
      {validadeVencida && (
        <p data-validade-vencida role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)', lineHeight: 1.45 }}>
          Esta validade já passou ({validadeNaTela(validade)}): o lote entra vencido. Confira a data na embalagem — se estiver certa, a entrada vale assim.
        </p>
      )}

      {/* E14 (o Heitor, 13/11: "Não existe fornecedor de costume. Na entrada no
          estoque, escolhe fornecedor e marca"): os dois das listas da rede, com
          busca — o que falta se cria ali mesmo. O fornecedor da nota trazida da
          entrada anterior vem escolhido (é a mesma nota, A54 da 11ª). */}
      <div className="form-2col">
        <CampoDaLista lista="marcas" rotulo="Marca" nome="marca_id" itens={marcas} placeholder="Buscar ou criar marca…" />
        <CampoDaLista lista="fornecedores" rotulo="Fornecedor" nome="fornecedor_id" itens={fornecedores}
          inicial={notaAnterior?.fornecedor ?? null} placeholder="Buscar ou criar fornecedor…" />
      </div>
      <FieldWrap>
        <Label htmlFor="entrada-nota">Nota fiscal</Label>
        <input id="entrada-nota" name="nota_fiscal" type="text" maxLength={60} className="field" placeholder="Número da nota"
          defaultValue={notaAnterior?.nota ?? ''} />
      </FieldWrap>
      {notaAnterior && (
        <p data-nota-da-entrada-anterior style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          A nota {notaAnterior.nota} veio da entrada anterior (outro produto da mesma nota) — apague se esta for outra.
        </p>
      )}

      <FieldWrap>
        <Label htmlFor="entrada-obs">Observações</Label>
        <textarea id="entrada-obs" name="notes" className="field" rows={2} placeholder="Ex.: chegou com a caixa amassada"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          <PackagePlus size={14} />
          {pending ? 'Salvando…' : 'Registrar entrada'}
        </button>
      </div>
    </form>
  )
}

// -- Formulário: Transferência -----------------------------------------
function TransferenciaForm({ product, allBranches, defaultBranchId, origemSugerida, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  /** Unidade de quem esta operando: a origem e ela, e nao ha o que escolher. */
  defaultBranchId?: string
  /** F72: a unidade filtrada na tela, já escolhida como origem. */
  origemSugerida?: string
  onClose: () => void; onSuccess: () => void
}) {
  const origemInicial = defaultBranchId ?? (origemSugerida && allBranches.some(b => b.id === origemSugerida) ? origemSugerida : undefined)
  const envio = useEnvioUnico()
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)
  const [fromId,  setFromId]  = useState(origemInicial ?? '')
  const [toId,    setToId]    = useState('')

  // C18: o disponível é o que a origem RENDE — o frasco aberto conta pelo que
  // sobra nele (era o saldo em embalagens arredondado, e 1,5 frasco deixava
  // transferir 2). Em embalagens, com a fração, e a prateleira por extenso.
  const rende     = product.consumptionUnit && Number(product.unitsPerPackage) > 0 ? Number(product.unitsPerPackage) : null
  const daOrigem  = fromId ? product.branches.find(b => b.branchId === fromId) : undefined
  const rendOrigem = rende ? (daOrigem?.currentRendimento ?? (daOrigem?.currentStock ?? 0) * rende) : null
  const fromStock = fromId
    ? (rende ? Math.max(0, Math.floor(rendOrigem! / rende * 1000) / 1000) : (daOrigem?.currentStock ?? 0))
    : null
  const naPrateleira = fromId && rende ? saldoNaPrateleira(rendOrigem!, rende, product.unit, product.consumptionUnit!) : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      // A chave do envio (D10): o duplo clique movimenta uma vez só.
      fd.set('_envio', envio.chave())
      const res = await adminTransferStock(undefined, fd)
      if (res?.success) {
        envio.renovar()
        // A16 da 8ª simulação: o saldo do destino, que a gerente de unidade fixa não vê.
        if (res.saldos) {
          const nome = (id: string) => allBranches.find(b => b.id === id)?.name ?? 'A unidade'
          const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
          toast(`Transferido: ${nome(String(fd.get('toBranchId')))} agora tem ${n(res.saldos.destino)} ${pl(product.unit, res.saldos.destino)}; ${nome(String(fd.get('fromBranchId')))} ficou com ${n(res.saldos.origem)} ${pl(product.unit, res.saldos.origem)}.`)
        }
        onSuccess()
      }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex-wrap-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: 8 }}>
        <BranchSelect name="fromBranchId" branches={product.branches}
          allBranches={defaultBranchId ? allBranches.filter(b => b.id === defaultBranchId) : allBranches}
          label="Origem" required onChange={setFromId} defaultValue={origemInicial} />
        <div style={{ paddingBottom: 10, color: 'var(--text-faint)' }}>
          <ArrowLeftRight size={16} />
        </div>
        <BranchSelect name="toBranchId" branches={product.branches}
          allBranches={soAtivas(allBranches).filter(b => b.id !== fromId)}
          label="Destino" required onChange={setToId} />
      </div>

      {fromStock !== null && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border)',
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
        }}>
          Disponível na origem:&nbsp;
          <strong data-disponivel-na-origem style={{ color: 'var(--text)' }}>
            {fromStock.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {pl(product.unit, fromStock)}
          </strong>
          {naPrateleira && <span> ({naPrateleira})</span>}
        </div>
      )}

      <FieldWrap>
        <Label>Quantidade *</Label>
        <div style={{ position: 'relative' }}>
          <input name="quantity" type="number" step="0.001" min="0.001" required className="field"
            placeholder="0" max={fromStock ?? undefined} style={{ paddingRight: 36 }} />
          <UnitSuffix unit={product.unit} />
        </div>
      </FieldWrap>

      <FieldWrap>
        <Label>Observações</Label>
        <textarea name="notes" className="field" rows={2} placeholder="Motivo da transferência…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending || fromId === toId}>
          <ArrowLeftRight size={14} />
          {pending ? 'Transferindo…' : 'Confirmar transferência'}
        </button>
      </div>
    </form>
  )
}

// -- Formulário: Ajuste ------------------------------------------------
function AjusteForm({ product, allBranches, defaultBranchId, sugerida, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  sugerida?: string
  onClose: () => void; onSuccess: () => void
}) {
  // C24: a chave do envio — o duplo clique ajusta uma vez só.
  const envio = useEnvioUnico()
  const [error,     setError]     = useState<string>()
  const [pending,   setPending]   = useState(false)
  const [branchId,  setBranchId]  = useState(defaultBranchId ?? unidadeSugerida(allBranches, sugerida))
  const [newQty,    setNewQty]    = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loteDoAjuste, setLoteDoAjuste] = useState('')
  const lotesDaUnidade = (product.lotes ?? []).filter(l => l.unidadeId === branchId)

  // D3 da 7ª simulação: a toxina tinha 780 UI e o ajuste mostrava "8 frasco"
  // (a embalagem aberta arredondada); a contagem de 7,7 virava 750 UI. O saldo
  // aparece em consumo E em embalagens, e a contagem vale EXATA na unidade
  // escolhida — em embalagens, a fração é o frasco aberto (7,7 = 770 UI).
  const rende        = product.consumptionUnit && Number(product.unitsPerPackage) > 0 ? Number(product.unitsPerPackage) : null
  // D5 da 11ª: o "Contar em" nasce na EMBALAGEM, como o da Perda e o que se
  // conta na prateleira (a Gisele digitou 15 querendo refis, com o campo em g).
  const [emConsumo, setEmConsumo] = useState(false)
  const contaEmConsumo = !!rende && emConsumo
  const linha        = branchId ? product.branches.find(b => b.branchId === branchId) : undefined
  const embalagens   = branchId ? (linha?.currentStock ?? 0) : null
  const rendimento   = rende && branchId ? (linha?.currentRendimento ?? (embalagens ?? 0) * rende) : null
  // O saldo de agora na unidade da contagem: em consumo, o rendimento; em embalagens, o equivalente exato.
  const currentStock = embalagens === null ? null
    : rende ? (contaEmConsumo ? rendimento! : Math.round(rendimento! / rende * 10_000) / 10_000) : embalagens
  const unidadeDaContagem = contaEmConsumo ? product.consumptionUnit! : product.unit
  const lidaNova     = newQty !== '' ? parseDecimal(newQty, 4) : NaN
  const parsedNew    = Number.isFinite(lidaNova) ? lidaNova : null
  const delta        = currentStock !== null && parsedNew !== null ? Math.round((parsedNew - currentStock) * 10_000) / 10_000 : null
  const fmtQ = (n: number, casas = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas })
  const equivale = rende && parsedNew !== null && parsedNew >= 0
    ? (contaEmConsumo
      ? `${fmtQ(parsedNew)} ${product.consumptionUnit} = ${fmtQ(parsedNew / rende, 4)} ${pl(product.unit, parsedNew / rende)}`
      : `${fmtQ(parsedNew, 4)} ${pl(product.unit, parsedNew)} = ${fmtQ(parsedNew * rende)} ${product.consumptionUnit}. O ${product.unit} aberto entra pelo que sobra nele: pela metade, 0,5.`)
    : null
  // D5 da 11ª: a variação de mais da metade do saldo avisa forte, com a conta
  // na outra unidade — −98% passava só com a caixa genérica.
  const variacaoPct = delta !== null && currentStock !== null && currentStock > 0 ? Math.abs(delta) / currentStock * 100 : null
  const variacaoGrande = variacaoPct !== null && variacaoPct > 50 && parsedNew !== null
  const naOutraUnidade = rende && parsedNew !== null
    ? (contaEmConsumo ? `${fmtQ(parsedNew)} ${product.consumptionUnit} são ${fmtQ(parsedNew / rende, 4)} ${pl(product.unit, parsedNew / rende)}`
                      : `${fmtQ(parsedNew, 4)} ${pl(product.unit, parsedNew)} são ${fmtQ(parsedNew * rende)} ${product.consumptionUnit}`)
    : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!confirmed) return
    setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      fd.set('unidade', contaEmConsumo ? 'CONSUMO' : 'EMBALAGEM')
      if (parsedNew !== null) fd.set('new_quantity', String(parsedNew))
      fd.set('_envio', envio.chave())
      const res = await adminAdjustStock(undefined, fd)
      if (res?.success) {
        envio.renovar()
        // A52 da 11ª: o ajuste confirma.
        toast.success(`Ajuste aplicado: ${product.name} agora tem ${fmtQ(parsedNew ?? 0, 4)} ${pl(unidadeDaContagem, parsedNew ?? 0)}.`)
        onSuccess()
      }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '10px 13px', borderRadius: 9,
        background: 'var(--cat-5-soft)', border: '1.5px solid var(--cat-5-soft)',
        display: 'flex', gap: 9, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
        {/* A49 da 11ª: era "Operação crítica… inconsistência" — assustava numa contagem de rotina. */}
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', lineHeight: 1.5 }}>
          <strong>Contagem do inventário.</strong> Digite o que há na prateleira agora: o saldo passa a ser a contagem.
          A diferença a mais entra num lote; a menos vai para Perdas (Inventário). Errou? Desfaça no Histórico.
        </p>
      </div>

      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches} defaultValue={branchId}
          label="Unidade" required onChange={id => { setBranchId(id); setConfirmed(false) }} />
      )}

      {currentStock !== null && (
        <div className="form-2col" style={{
          padding: '10px 13px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border)',
        }}>
          <div>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
              ESTOQUE ATUAL
            </p>
            <p data-saldo-do-ajuste style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {rende ? fmtQ(rendimento ?? 0) : fmtQ(embalagens ?? 0, 3)}{' '}
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-faint)' }}>{rende ? product.consumptionUnit : product.unit}</span>
              {rende && (
                <span style={{ display: 'block', fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0 }}>
                  {`${fmtQ((rendimento ?? 0) / rende, 4)} ${pl(product.unit, (rendimento ?? 0) / rende)}`}
                </span>
              )}
            </p>
          </div>
          {delta !== null && !isNaN(delta) && (
            <div>
              <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
                VARIAÇÃO
              </p>
              <p style={{
                fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.01em',
                color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-faint)',
              }}>
                {delta > 0 ? '+' : ''}{fmtQ(delta, 4)}
                <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-faint)', marginLeft: 4 }}>{unidadeDaContagem}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {rende && (
        <div role="group" aria-label="Contar em" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Contar em</span>
          <SegSelect ariaLabel="Contar em" value={contaEmConsumo ? 'CONSUMO' : 'EMBALAGEM'}
            options={[{ key: 'EMBALAGEM', label: product.unit }, { key: 'CONSUMO', label: product.consumptionUnit! }]}
            onSelect={k => { setEmConsumo(k === 'CONSUMO'); setNewQty(''); setConfirmed(false) }} />
        </div>
      )}

      <FieldWrap>
        <label htmlFor="ajuste-contagem" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {rende ? 'Contagem' : 'Novo estoque'} *
        </label>
        <div style={{ position: 'relative' }}>
          <input id="ajuste-contagem" name="new_quantity" type="text" inputMode="decimal" required className="field"
            placeholder="0" value={newQty}
            onChange={e => { setNewQty(e.target.value); setConfirmed(false) }}
            style={{ paddingRight: 48 }} />
          <UnitSuffix unit={unidadeDaContagem} />
        </div>
        {equivale && <span data-ajuste-equivale style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{equivale}</span>}
      </FieldWrap>

      {variacaoGrande && (
        <div data-variacao-grande role="alert" style={{
          padding: '10px 13px', borderRadius: 9, background: 'var(--danger-soft)', border: '1.5px solid var(--danger)',
          display: 'flex', gap: 9, alignItems: 'flex-start',
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', lineHeight: 1.5 }}>
            <strong>A contagem muda o saldo em {fmtQ(variacaoPct!, 0)}%.</strong>{' '}
            Confira se contou na unidade certa: a contagem está em {unidadeDaContagem}
            {naOutraUnidade ? ` (${naOutraUnidade})` : ''}. Errado, o ajuste vira perda — e se desfaz no Histórico enquanto nada sair do lote.
          </p>
        </div>
      )}

      {/* D5 da 10ª simulação: o que a contagem achou a MAIS entra num lote (era
          saldo sem lote, sem validade); o que achou a MENOS sai pelo lote que
          vence primeiro e é perda ("Inventário"), ao custo do lote. */}
      {delta !== null && delta > 0 && (
        <>
          <FieldWrap>
            <label htmlFor="ajuste-lote" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              Em qual lote entra a diferença
            </label>
            <select id="ajuste-lote" name="loteId" className="field" value={loteDoAjuste} onChange={e => setLoteDoAjuste(e.target.value)}>
              <option value="">Um lote novo, sem número</option>
              {lotesDaUnidade.map(l => (
                <option key={l.id} value={l.id}>
                  {l.numero ? `Lote ${l.numero}` : 'Lote sem número'}
                  {l.validade ? ` · vence ${validadeNaTela(l.validade)}` : ''}
                  {` · ${fmtQ(l.quantidade)} ${product.unit}`}
                </option>
              ))}
            </select>
          </FieldWrap>
          {loteDoAjuste === '' && (
            <FieldWrap>
              <label htmlFor="ajuste-lote-validade" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                Validade do lote novo (opcional)
              </label>
              <input id="ajuste-lote-validade" name="lote_validade" type="date" className="field" />
            </FieldWrap>
          )}
        </>
      )}
      {delta !== null && delta < 0 && (
        <>
          {/* A38 da 10ª: o ajuste a menos escolhe o lote (desfazer duas entradas
              erradas zerou o lote real pelo FEFO). Sem escolha, o que vence primeiro. */}
          {lotesDaUnidade.length > 0 && (
            <FieldWrap>
              <label htmlFor="ajuste-lote-saida" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                De qual lote sai a diferença
              </label>
              <select id="ajuste-lote-saida" name="loteId" className="field" value={loteDoAjuste} onChange={e => setLoteDoAjuste(e.target.value)}>
                <option value="">O que vence primeiro</option>
                {lotesDaUnidade.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.numero ? `Lote ${l.numero}` : 'Lote sem número'}
                    {l.validade ? ` · vence ${validadeNaTela(l.validade)}` : ''}
                    {` · ${fmtQ(l.quantidade)} ${product.unit}`}
                  </option>
                ))}
              </select>
            </FieldWrap>
          )}
          <p data-ajuste-negativo style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            A diferença sai {loteDoAjuste ? 'do lote escolhido (o que faltar nele, do que vence primeiro)' : 'do lote que vence primeiro'} e entra em Relatórios → Estoque, “Perdas no período”, como Inventário, ao custo do lote. Não gera despesa.
            Entrada, ajuste ou perda lançados errados se desfazem no Histórico (“Desfazer entrada”, “Desfazer ajuste”, “Desfazer perda”).
          </p>
        </>
      )}

      <FieldWrap>
        <label htmlFor="ajuste-motivo" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Motivo *</label>
        <textarea id="ajuste-motivo" name="reason" required className="field" rows={2}
          placeholder="Ex: Inventário físico realizado, divergência identificada…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
        borderRadius: 8, cursor: 'pointer', transition: 'all 150ms',
        border: `1.5px solid ${confirmed ? 'var(--brand)' : 'var(--border)'}`,
        background: confirmed ? 'var(--brand-soft)' : 'var(--bg-app)',
      }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--brand)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, lineHeight: 1.4,
          color: confirmed ? 'var(--brand)' : 'var(--text-muted)' }}>
          Confirmo que contei na prateleira.
        </span>
      </label>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" disabled={pending || !confirmed} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 'var(--text-base-sz)', fontWeight: 700, padding: '8px 16px', borderRadius: 10,
          border: 'none', cursor: pending || !confirmed ? 'not-allowed' : 'pointer',
          background: confirmed ? 'var(--danger)' : 'var(--border)',
          color: confirmed ? 'var(--on-brand)' : 'var(--text-faint)',
          transition: 'all 150ms',
        }}>
          <SlidersHorizontal size={14} />
          {pending ? 'Ajustando…' : 'Aplicar ajuste'}
        </button>
      </div>
    </form>
  )
}

// -- Formulário: Perda -------------------------------------------------
// D-7 (decisão do Heitor): o que saiu por vencido, quebrou, amostra ou uso
// interno — pelo LOTE escolhido (o vencido sai dele, não do que vence
// primeiro) e SEM despesa. A quantidade é em embalagens, como a entrada.
function PerdaForm({ product, allBranches, defaultBranchId, sugerida, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  sugerida?: string
  onClose: () => void; onSuccess: () => void
}) {
  const envio = useEnvioUnico()
  const [error,    setError]    = useState<string>()
  const [pending,  setPending]  = useState(false)
  const [branchId, setBranchId] = useState(defaultBranchId ?? unidadeSugerida(allBranches, sugerida))
  const lotes = (product.lotes ?? []).filter(l => l.unidadeId === branchId)
  // est-03: com unidade de consumo, a perda também se digita nela ("30 UI").
  const rende = product.consumptionUnit && Number(product.unitsPerPackage) > 0 ? Number(product.unitsPerPackage) : null
  const [emConsumo, setEmConsumo] = useState(false)
  const [quantidade, setQuantidade] = useState('')
  const lida = parseDecimal(quantidade, 4)
  const equivale = rende && Number.isFinite(lida) && lida > 0
    ? (emConsumo ? `= ${(lida / rende).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${pl(product.unit, lida / rende)}`
                 : `= ${(lida * rende).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${product.consumptionUnit}`)
    : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      fd.set('unidade', emConsumo ? 'CONSUMO' : 'EMBALAGEM')
      // A chave do envio (D10): o duplo clique movimenta uma vez só.
      fd.set('_envio', envio.chave())
      const res = await registrarPerda(undefined, fd)
      if (res?.success) {
        envio.renovar()
        // A52 da 11ª: a perda confirma.
        toast.success(`Perda registrada: −${quantidade.trim()} ${emConsumo && product.consumptionUnit ? product.consumptionUnit : pl(product.unit, lida)} de ${product.name}.`)
        onSuccess()
      }
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const rotulo: React.CSSProperties = { fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        O que saiu do estoque sem ser usado num atendimento. Não gera despesa: o custo entra no relatório de perdas.
      </p>
      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches} defaultValue={branchId}
          label="Unidade" required onChange={setBranchId} />
      )}

      <FieldWrap>
        <label htmlFor="perda-lote" style={rotulo}>Lote</label>
        <select id="perda-lote" name="loteId" className="field" defaultValue="">
          <option value="">Sem lote — sai o que vence primeiro</option>
          {lotes.map(l => (
            <option key={l.id} value={l.id}>
              {l.numero ? `Lote ${l.numero}` : 'Lote sem número'}
              {l.validade ? ` · vence ${validadeNaTela(l.validade)}` : ''}
              {` · ${fmt(l.quantidade)} ${product.unit}`}
            </option>
          ))}
        </select>
      </FieldWrap>

      {rende && (
        <div role="group" aria-label="Unidade da perda" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={rotulo}>Em</span>
          <SegSelect ariaLabel="Unidade da perda" value={emConsumo ? 'CONSUMO' : 'EMBALAGEM'}
            options={[{ key: 'EMBALAGEM', label: product.unit }, { key: 'CONSUMO', label: product.consumptionUnit! }]}
            onSelect={k => setEmConsumo(k === 'CONSUMO')} />
        </div>
      )}
      <div className="form-2col">
        <FieldWrap>
          <label htmlFor="perda-quantidade" style={rotulo}>Quantidade</label>
          <div style={{ position: 'relative' }}>
            <input id="perda-quantidade" name="quantity" type="text" inputMode="decimal" required className="field"
              placeholder="0" style={{ paddingRight: 48 }} value={quantidade} onChange={e => setQuantidade(e.target.value)} />
            <UnitSuffix unit={emConsumo && product.consumptionUnit ? product.consumptionUnit : product.unit} />
          </div>
          {equivale && <span data-equivale style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{equivale}</span>}
        </FieldWrap>
        <FieldWrap>
          <label htmlFor="perda-motivo" style={rotulo}>Motivo</label>
          <select id="perda-motivo" name="motivo" required className="field" defaultValue="">
            <option value="" disabled>Selecione…</option>
            {MOTIVOS_DA_PERDA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </FieldWrap>
      </div>

      <FieldWrap>
        <label htmlFor="perda-obs" style={rotulo}>Observação</label>
        <textarea id="perda-obs" name="notes" className="field" rows={2} placeholder="Ex: frasco caiu no chão"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          <PackageX size={14} />
          {pending ? 'Registrando…' : 'Registrar perda'}
        </button>
      </div>
    </form>
  )
}

// -- Tab: Estoque mínimo -----------------------------------------------
function MinStockTab({ product, allBranches, defaultBranchId }: {
  product:          ProductInfo
  allBranches:      AllBranch[]
  defaultBranchId?: string
}) {
  const stockMap = Object.fromEntries(product.branches.map(b => [b.branchId, b]))
  const visibleBranches = defaultBranchId ? allBranches.filter(b => b.id === defaultBranchId) : allBranches

  const [values,  setValues]  = useState<Record<string, string>>(() =>
    Object.fromEntries(allBranches.map(b => [
      b.id,
      // D11 da 12ª: sem a linha da unidade (nada entrou ainda), o mínimo é o do
      // cadastro — o mesmo que a linha herda ao nascer (D2 da 11ª). Era 0.
      String(stockMap[b.id]?.minStock ?? product.minimoDoCadastro ?? 0),
    ])),
  )
  const [saving,  setSaving]  = useState<Record<string, boolean>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [errors,  setErrors]  = useState<Record<string, string>>({})

  async function save(branchId: string) {
    const raw = values[branchId] ?? '0'
    const v   = parseFloat(raw.replace(',', '.'))
    if (isNaN(v) || v < 0) {
      setErrors(p => ({ ...p, [branchId]: 'Valor inválido.' }))
      return
    }
    setSaving(p => ({ ...p, [branchId]: true }))
    setErrors(p => ({ ...p, [branchId]: '' }))
    const res = await adminUpdateMinStock(product.id, branchId, v)
    setSaving(p => ({ ...p, [branchId]: false }))
    if (res?.success) {
      setSaved(p => ({ ...p, [branchId]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [branchId]: false })), 5000)
    } else {
      setErrors(p => ({ ...p, [branchId]: res?.error ?? 'Erro.' }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Configure o estoque mínimo desejável de <strong style={{ color: 'var(--text)' }}>{product.name}</strong> em
        cada unidade. No mínimo ou abaixo deste valor, o produto é sinalizado como alerta.
      </p>

      {visibleBranches.map(b => {
        const bs           = stockMap[b.id]
        const currentStock = bs?.currentStock ?? 0
        const isBusy       = saving[b.id]
        const isDone       = saved[b.id]
        const errMsg       = errors[b.id]

        return (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '11px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            {/* Branch info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{b.name}</p>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 1 }}>
                {/* A50 da 11ª: "Atual: 11 frasco" valia 10,84 — a aberta contava inteira. */}
                Atual: {product.consumptionUnit && Number(product.unitsPerPackage) > 0 && bs?.currentRendimento != null
                  ? saldoNaPrateleira(Number(bs.currentRendimento), Number(product.unitsPerPackage), product.unit, product.consumptionUnit)
                  : `${currentStock.toLocaleString('pt-BR')} ${pl(product.unit, currentStock)}`}
              </p>
              {!bs && (product.minimoDoCadastro ?? 0) > 0 && (
                <p data-minimo-do-cadastro style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                  Ainda sem estoque nesta unidade: vale o mínimo do cadastro do produto ({product.minimoDoCadastro!.toLocaleString('pt-BR')} {pl(product.unit, product.minimoDoCadastro!)}).
                </p>
              )}
              {/* A15 da 14ª: a linha diz "(do cadastro)"; aqui, o mesmo, dito por extenso. */}
              {bs && minimoEhDoCadastro(Number(bs.minStock), product.minimoDoCadastro) && (
                <p data-minimo-igual-ao-cadastro style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                  O mesmo do cadastro do produto. Mudar aqui vale só nesta unidade.
                </p>
              )}
            </div>

            {/* Input */}
            <div style={{ position: 'relative', width: 110 }}>
              <input
                aria-label={`Estoque mínimo em ${b.name}`}
                type="number" step="0.001" min="0"
                value={values[b.id] ?? '0'}
                onChange={e => {
                  setValues(p => ({ ...p, [b.id]: e.target.value }))
                  setSaved(p => ({ ...p, [b.id]: false }))
                }}
                onKeyDown={e => e.key === 'Enter' && save(b.id)}
                className="field"
                style={{ paddingRight: 36, textAlign: 'right' }}
              />
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 'var(--text-overline)', color: 'var(--text-faint)', pointerEvents: 'none',
              }}>{product.unit}</span>
            </div>

            {/* A41 da 10ª: era um ícone sem rótulo nem confirmação. */}
            <button
              type="button"
              onClick={() => save(b.id)}
              disabled={isBusy}
              className="btn-secondary"
              style={{ flexShrink: 0, gap: 6, whiteSpace: 'nowrap' }}
            >
              {isBusy
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />
                : <TrendingDown size={14} aria-hidden />}
              Salvar mínimo
            </button>

            {isDone && (
              <span role="status" data-minimo-salvo style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-2xs)', color: 'var(--success)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                <Check size={12} aria-hidden /> Mínimo salvo
              </span>
            )}
            {errMsg && (
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 700 }}>{errMsg}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// -- Modal principal ---------------------------------------------------
export function AdminStockManageModal({ product, allBranches, defaultBranchId, origemSugerida, marcas = [], fornecedores = [], somenteEntrada = false, onClose, onSuccess }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [tab,   setTab]   = useState<Tab>('movimentacoes')
  // F72: aberto na unidade DESATIVADA, começa no que resolve o saldo dela — transferir.
  const [movOp, setMovOp] = useState<MovOp>(() =>
    !somenteEntrada && !defaultBranchId && allBranches.find(b => b.id === origemSugerida)?.ativa === false ? 'transferencia' : 'entrada')

  useEffect(() => {
    const dialogo = dialogRef.current
    dialogo?.showModal()
    return () => dialogo?.close()
  }, [])

  const allMovOpts: { op: MovOp; label: string; icon: React.ReactNode; color: string }[] = [
    { op: 'entrada',       label: 'Entrada',       icon: <PackagePlus      size={13} />, color: 'var(--success)' },
    { op: 'transferencia', label: 'Transferência',  icon: <ArrowLeftRight   size={13} />, color: 'var(--info)' },
    { op: 'ajuste',        label: 'Ajuste',         icon: <SlidersHorizontal size={13}/>, color: 'var(--warning)' },
    { op: 'perda',         label: 'Perda',          icon: <PackageX         size={13} />, color: 'var(--danger)' },
  ]
  // Transferir some so quando nao ha para onde: a filial mandava produto para
  // lugar nenhum porque recebia apenas a propria unidade na lista.
  const MOV_OPTS = allBranches.length > 1
    ? allMovOpts
    : allMovOpts.filter(o => o.op !== 'transferencia')

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClick={e => { if (e.target === dialogRef.current) onClose() }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1,
        background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
        padding: '16px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
            {somenteEntrada ? 'Entrada por código de barras' : 'Gerenciar estoque'}
          </h2>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>{product.name}</p>
        </div>
        <button type="button" onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} />
        </button>
      </div>

      {/* Tabs (o leitor abre só a Entrada — C16) */}
      {!somenteEntrada && <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
        padding: '0 22px',
        background: 'var(--surface)',
      }}>
        {([
          ['movimentacoes', 'Movimentações'],
          ['historico',     'Histórico'],
          ['min-stock',     'Estoque mínimo'],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: '10px 16px', fontSize: 'var(--text-base-sz)', fontWeight: 700,
            border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? 'var(--brand)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 120ms',
          }}>
            {l}
          </button>
        ))}
      </div>}

      <div style={{ padding: '20px 22px 26px' }}>
        {somenteEntrada ? (
          <EntradaForm product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} sugerida={origemSugerida} marcas={marcas} fornecedores={fornecedores} onClose={onClose} onSuccess={onSuccess} />
        ) : tab === 'movimentacoes' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sub-tabs de operação */}
            <div style={{
              display: 'flex', gap: 6,
              background: 'var(--bg-app)', padding: 4, borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              {MOV_OPTS.map(o => (
                <button key={o.op} type="button" onClick={() => setMovOp(o.op)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '6px 10px', borderRadius: 7,
                  border: 'none', cursor: 'pointer', transition: 'all 100ms',
                  background: movOp === o.op ? 'var(--surface)' : 'transparent',
                  color: movOp === o.op ? o.color : 'var(--text-muted)',
                  boxShadow: movOp === o.op ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>

            {movOp === 'entrada'       && <EntradaForm       product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} sugerida={origemSugerida} marcas={marcas} fornecedores={fornecedores} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'transferencia' && <TransferenciaForm product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} origemSugerida={origemSugerida} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'ajuste'        && <AjusteForm        product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} sugerida={origemSugerida} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'perda'         && <PerdaForm         product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} sugerida={origemSugerida} onClose={onClose} onSuccess={onSuccess} />}
          </div>
        ) : tab === 'historico' ? (
          <HistoricoTab product={product} defaultBranchId={defaultBranchId} onAlterou={() => router.refresh()} />
        ) : (
          <MinStockTab product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} />
        )}
      </div>
    </dialog>
  )
}

// -- Histórico ---------------------------------------------------------
//
// De onde saiu e para onde entrou. Existia no back-end (`getProductMovements`)
// e não tinha porta nenhuma na interface desde que a filial passou a usar este
// modal — dava para movimentar sem nunca ver o que já tinha sido movimentado.

const MOV_LABEL: Record<string, string> = {
  PURCHASE:          'Entrada',
  TRANSFER_IN:       'Transferência recebida',
  TRANSFER_OUT:      'Transferência enviada',
  PROCEDURE_USAGE:   'Consumo em atendimento',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  LOSS:              'Perda',
  SALE:              'Venda',
  SALE_RETURN:       'Devolução de venda',
}

/** O que se digita em embalagens (§9.5): o Histórico o destaca nelas (A50 da 11ª). */
const EM_EMBALAGENS = new Set(['PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT'])

function HistoricoTab({ product, defaultBranchId, podeDesfazer = true, onAlterou }: {
  product: ProductInfo
  defaultBranchId?: string
  /** O modal é de quem tem o Estoque em Gerenciar (o botão da engrenagem). */
  podeDesfazer?: boolean
  /** O saldo mudou (a entrada desfeita): a tela de trás recarrega. */
  onAlterou?: () => void
}) {
  const fuso = useFuso()
  const [movs,    setMovs]    = useState<MovimentoDeEstoque[] | null>(null)
  const [erro,    setErro]    = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [aDesfazer, setADesfazer] = useState<MovimentoDeEstoque | null>(null)
  const [ajusteADesfazer, setAjusteADesfazer] = useState<MovimentoDeEstoque | null>(null)
  const [perdaADesfazer, setPerdaADesfazer] = useState<MovimentoDeEstoque | null>(null)
  // C26: as 80 mais recentes, e "Ver mais antigas" (era um corte calado em 80).
  const [limite, setLimite] = useState(POR_PAGINA)

  useEffect(() => {
    let vivo = true
    getProductMovements(product.id, defaultBranchId ?? '', limite)
      .then(r => { if (vivo) setMovs(r) })
      .catch(e => { if (vivo) setErro(erroParaTela(e, 'Não foi possível carregar as movimentações.')) })
    return () => { vivo = false }
  }, [product.id, defaultBranchId, recarga, limite])

  if (erro)   return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>
  if (!movs)  return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Carregando…</p>
  if (movs.length === 0) {
    return (
      <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', textAlign: 'center', padding: '28px 0' }}>
        Nenhuma movimentação registrada para este produto.
      </p>
    )
  }

  const temMais = movs.length > limite
  const visiveis = temMais ? movs.slice(0, limite) : movs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
      {perdaADesfazer && (
        <DesfazerPerda movimento={perdaADesfazer}
          onFechar={() => setPerdaADesfazer(null)}
          onDesfeita={() => { setPerdaADesfazer(null); setRecarga(n => n + 1); onAlterou?.() }} />
      )}
      {aDesfazer && (
        <DesfazerEntrada movimento={aDesfazer} unidade={product.unit}
          onFechar={() => setADesfazer(null)}
          onDesfeita={() => { setADesfazer(null); setRecarga(n => n + 1); onAlterou?.() }} />
      )}
      {ajusteADesfazer && (
        <DesfazerAjuste movimento={ajusteADesfazer}
          onFechar={() => setAjusteADesfazer(null)}
          onDesfeito={() => { setAjusteADesfazer(null); setRecarga(n => n + 1); onAlterou?.() }} />
      )}
      {visiveis.map(m => {
        const entrada = m.quantity >= 0
        const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
        const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        // D6 da 11ª: o custo da unidade de CONSUMO tem até 4 casas (R$ 0,0395/g
        // saía "R$ 0,04/g"); o da embalagem, os centavos de sempre.
        const fmtBRL4 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
        // O lote e o custo do movimento (J-45): de qual lote saiu (ou qual a
        // entrada criou) e quanto custou a unidade de consumo e a embalagem.
        const lotes = m.lotes.map(l => [
          l.numero ? `Lote ${l.numero}` : 'Lote sem número',
          l.validade ? `val. ${validadeNaTela(l.validade)}` : null,
        ].filter(Boolean).join(' ')).join(' · ')
        const custo = m.custoUnitario != null && m.custoUnitario > 0
          ? (m.porEmbalagem
            ? `${fmtBRL4(m.custoUnitario)}/${m.unidade} (${fmtBRL(m.custoPorEmbalagem ?? 0)}/${m.embalagem})`
            : `${fmtBRL(m.custoUnitario)}/${m.unidade}`)
          : null
        return (
          <div key={m.id} data-movimento style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 12px', borderRadius: 9,
            border: '1px solid var(--hairline)', background: 'var(--surface)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                {m.type === 'PURCHASE' && m.quantity < 0 ? 'Entrada desfeita'
                  : m.type === 'LOSS' && m.quantity > 0 ? 'Perda desfeita'
                  : m.desfazAjuste ? 'Ajuste desfeito'
                  : m.brinde ? 'Brinde da fidelidade'
                  : (MOV_LABEL[m.type] ?? m.type)}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {m.branchName}</span>
              </p>
              {/* A37 da 10ª + E14: a nota, a marca e o fornecedor da entrada (o nome gravado nela). */}
              {(m.fornecedor || m.marca || m.notaFiscal) && (
                <p data-nota-da-entrada style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                  {[m.notaFiscal ? `NF ${m.notaFiscal}` : null, m.marca, m.fornecedor].filter(Boolean).join(' · ')}
                </p>
              )}
              {m.desfeita && (
                <p data-entrada-desfeita style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 700, marginTop: 1 }}>
                  {m.type === 'MANUAL_ADJUSTMENT' ? 'Desfeito' : 'Desfeita'} em {new Date(m.desfeita.em).toLocaleDateString('pt-BR', { timeZone: fuso })}{m.desfeita.motivo ? ` — ${m.desfeita.motivo}` : ''}
                </p>
              )}
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
                {new Date(m.createdAt).toLocaleString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {m.notes ? ` · ${m.notes}` : ''}
              </p>
              {(lotes || custo) && (
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                  {[lotes, custo ? `custo ${custo}` : null].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {/* A50 da 11ª: o que se DIGITA em embalagens (entrada, transferência) se destaca nelas —
                  "+50.000 g" para 50 refis tinha o "50 refil" pequeno embaixo. */}
              {m.emEmbalagens != null && EM_EMBALAGENS.has(m.type) ? (
                <>
                  <p data-quantidade-principal style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: entrada ? 'var(--success)' : 'var(--danger)' }}>
                    {entrada ? '+' : '−'}{fmt(Math.abs(m.emEmbalagens))} {pl(m.embalagem, m.emEmbalagens)}
                  </p>
                  <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)' }}>
                    {fmt(Math.abs(m.quantity))} {m.unidade}
                  </p>
                </>
              ) : (
                <>
                  <p data-quantidade-principal style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: entrada ? 'var(--success)' : 'var(--danger)' }}>
                    {entrada ? '+' : ''}{fmt(m.quantity)} {m.unidade}
                  </p>
                  {/* O movimento também em embalagens (J-44): −32 UI = 0,32 frasco. */}
                  {m.emEmbalagens != null && (
                    <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)' }}>
                      {fmt(Math.abs(m.emEmbalagens))} {pl(m.embalagem, m.emEmbalagens)}
                    </p>
                  )}
                </>
              )}
              {/* O movimento está na unidade de consumo (ml, UI); o saldo
                  mostra também a equivalência em embalagens. */}
              <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)' }}>
                saldo {m.balanceAfter.toLocaleString('pt-BR')} {m.unidade}
                {m.saldoEmEmbalagens != null ? ` · ${m.saldoEmEmbalagens.toLocaleString('pt-BR')} ${pl(m.embalagem, m.saldoEmEmbalagens)}` : ''}
              </p>
              {/* A38 da 10ª: a entrada errada se desfaz enquanto o lote dela não teve saída. */}
              {m.desfazivel && podeDesfazer && (
                <button type="button" className="btn-ghost" onClick={() => setADesfazer(m)}
                  style={{ marginTop: 4, fontSize: 'var(--text-2xs)', padding: '2px 6px', color: 'var(--danger)', fontWeight: 700 }}>
                  Desfazer entrada
                </button>
              )}
              {/* D5 da 11ª: o ajuste errado se desfaz enquanto nada saiu do lote dele depois. */}
              {m.ajusteDesfazivel && podeDesfazer && (
                <button type="button" className="btn-ghost" onClick={() => setAjusteADesfazer(m)}
                  style={{ marginTop: 4, fontSize: 'var(--text-2xs)', padding: '2px 6px', color: 'var(--danger)', fontWeight: 700 }}>
                  Desfazer ajuste
                </button>
              )}
              {/* C69 (H12): a última perda do produto na unidade se desfaz. */}
              {m.perdaDesfazivel && podeDesfazer && (
                <button type="button" className="btn-ghost" onClick={() => setPerdaADesfazer(m)}
                  style={{ marginTop: 4, fontSize: 'var(--text-2xs)', padding: '2px 6px', color: 'var(--danger)', fontWeight: 700 }}>
                  Desfazer perda
                </button>
              )}
              {/* A13 da 14ª: a perda sem o botão diz por quê. */}
              {m.perdaSemDesfazer && podeDesfazer && (
                <p data-sem-desfazer style={{ marginTop: 4, fontSize: 'var(--text-overline)', color: 'var(--text-muted)', maxWidth: 220, marginLeft: 'auto' }}>
                  {m.perdaSemDesfazer}
                </p>
              )}
            </div>
          </div>
        )
      })}
      {temMais && (
        <button type="button" className="btn-secondary" data-ver-mais-antigas onClick={() => setLimite(n => n + POR_PAGINA)}
          style={{ alignSelf: 'center', marginTop: 4 }}>
          Ver mais antigas
        </button>
      )}
    </div>
  )
}

const POR_PAGINA = 80

/**
 * "Desfazer perda" (C69, H12 = a do levantamento das regras): a perda lançada
 * errada volta ao MESMO lote de onde saiu; o movimento fica, marcado, e sai de
 * "Perdas no período". Só a última perda do produto na unidade — o banco
 * confere de novo (estoque_desfazer_perda).
 */
function DesfazerPerda({ movimento, onFechar, onDesfeita }: {
  movimento: MovimentoDeEstoque; onFechar: () => void; onDesfeita: () => void
}) {
  const fuso = useFuso()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()
  const fmt = (n: number, casas = 3) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas })
  const qtd = `${fmt(Math.abs(movimento.quantity))} ${movimento.unidade}`
    + (movimento.emEmbalagens != null ? ` (${fmt(Math.abs(movimento.emEmbalagens))} ${pl(movimento.embalagem, movimento.emEmbalagens)})` : '')
  function desfazer() {
    setErro(null)
    iniciar(async () => {
      const r = await desfazerPerdaDeEstoque(movimento.id, motivo)
      if (r.error) { setErro(r.error); return }
      toast.success('Perda desfeita.')
      onDesfeita()
    })
  }
  return (
    <JanelaModal rotulo="Desfazer a perda" largura={440} travado={gravando} onFechar={onFechar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Desfazer a perda</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Voltam {qtd} que a perda de{' '}
          {new Date(movimento.createdAt).toLocaleDateString('pt-BR', { timeZone: fuso })} tirou, ao lote de onde saíram.
          A perda fica no histórico, marcada como desfeita, e sai de “Perdas no período”.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="field-label">Motivo *</span>
          <input className="field" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={gravando}
            placeholder="Ex.: o frasco não tinha quebrado" />
          {!motivo.trim() && (
            <span data-motivo-obrigatorio style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Escreva o motivo para desfazer: ele fica no histórico.
            </span>
          )}
        </label>
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 700 }}>{erro}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={gravando}>Voltar</button>
          <button type="button" className="btn-primary" onClick={desfazer} disabled={gravando || !motivo.trim()}>
            {gravando ? 'Desfazendo…' : 'Desfazer perda'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}

/**
 * "Desfazer entrada" (A38 da 10ª simulação): a entrada lançada errada, enquanto
 * o lote dela não teve saída. A janela diz o que acontece antes — sai do lote
 * dela, não é perda — e pede o motivo; o banco confere o lote de novo.
 */
function DesfazerEntrada({ movimento, unidade, onFechar, onDesfeita }: {
  movimento: MovimentoDeEstoque; unidade: string; onFechar: () => void; onDesfeita: () => void
}) {
  const fuso = useFuso()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()
  const qtd = Math.abs(movimento.emEmbalagens ?? movimento.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  const lote = movimento.lotes[0]
  const doLote = lote ? ` do ${lote.numero ? `lote ${lote.numero}` : 'lote sem número'}` : ''
  function desfazer() {
    setErro(null)
    iniciar(async () => {
      const r = await desfazerEntradaDeEstoque(movimento.id, motivo)
      if (r.error) { setErro(r.error); return }
      toast.success('Entrada desfeita.')
      onDesfeita()
    })
  }
  return (
    <JanelaModal rotulo="Desfazer a entrada" largura={420} travado={gravando} onFechar={onFechar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Desfazer a entrada</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Saem {qtd} {pl(unidade, movimento.emEmbalagens ?? movimento.quantity)}{doLote}, que entraram em{' '}
          {new Date(movimento.createdAt).toLocaleDateString('pt-BR', { timeZone: fuso })}. Não é perda: a entrada fica no
          histórico, marcada como desfeita, e o valor em estoque volta ao de antes dela.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* A48 da 12ª: o motivo é obrigatório — o asterisco, e o botão desligado diz por quê. */}
          <span className="field-label">Motivo *</span>
          <input className="field" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={gravando}
            placeholder="Ex.: lançada em dobro" />
          {!motivo.trim() && (
            <span data-motivo-obrigatorio style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Escreva o motivo para desfazer: ele fica no histórico.
            </span>
          )}
        </label>
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 700 }}>{erro}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={gravando}>Voltar</button>
          <button type="button" className="btn-primary" onClick={desfazer} disabled={gravando || !motivo.trim()}>
            {gravando ? 'Desfazendo…' : 'Desfazer entrada'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}

/**
 * "Desfazer ajuste" (D5 da 11ª simulação): o inventário lançado errado,
 * enquanto nada saiu do lote dele depois. A janela diz o que acontece antes —
 * o saldo e os lotes voltam ao de antes dele e a perda que ele gerou sai de
 * "Perdas no período" — e pede o motivo; o banco confere os lotes de novo.
 */
function DesfazerAjuste({ movimento, onFechar, onDesfeito }: {
  movimento: MovimentoDeEstoque; onFechar: () => void; onDesfeito: () => void
}) {
  const fuso = useFuso()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()
  const fmt = (n: number, casas = 3) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas })
  const qtd = `${fmt(Math.abs(movimento.quantity))} ${movimento.unidade}`
    + (movimento.emEmbalagens != null ? ` (${fmt(Math.abs(movimento.emEmbalagens))} ${pl(movimento.embalagem, movimento.emEmbalagens)})` : '')
  const achouAMais = movimento.quantity > 0
  function desfazer() {
    setErro(null)
    iniciar(async () => {
      const r = await desfazerAjusteDeEstoque(movimento.id, motivo)
      if (r.error) { setErro(r.error); return }
      toast.success('Ajuste desfeito.')
      onDesfeito()
    })
  }
  return (
    <JanelaModal rotulo="Desfazer o ajuste" largura={440} travado={gravando} onFechar={onFechar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Desfazer o ajuste</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {achouAMais ? `Saem ${qtd} que o ajuste pôs` : `Voltam ${qtd} que o ajuste tirou`} em{' '}
          {new Date(movimento.createdAt).toLocaleDateString('pt-BR', { timeZone: fuso })}
          {achouAMais ? ', do lote em que entraram' : ', aos lotes de onde saíram'}. O ajuste fica no histórico,
          marcado como desfeito, e não fica em Perdas.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* A48 da 12ª: o motivo é obrigatório — o asterisco, e o botão desligado diz por quê. */}
          <span className="field-label">Motivo *</span>
          <input className="field" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={gravando}
            placeholder="Ex.: contei em gramas, era em refis" />
          {!motivo.trim() && (
            <span data-motivo-obrigatorio style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Escreva o motivo para desfazer: ele fica no histórico.
            </span>
          )}
        </label>
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 700 }}>{erro}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={gravando}>Voltar</button>
          <button type="button" className="btn-primary" onClick={desfazer} disabled={gravando || !motivo.trim()}>
            {gravando ? 'Desfazendo…' : 'Desfazer ajuste'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
