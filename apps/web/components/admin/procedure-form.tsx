'use client'

import { useActionState, useState, useEffect, useEffectEvent } from 'react'
import { Plus, Trash2, CheckCircle2, ChevronDown } from 'lucide-react'
import { addProcedure, updateProcedure } from '@/actions/procedures'
import { parseDinheiro, formatDinheiroCampo, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { custoDoInsumoNoCampo, lerCustoDoInsumo } from '@/lib/estoque/custo-do-insumo'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { rotaNoPortal } from '@/lib/rotas'
import { useUmaUnidade } from '@/components/shared/uma-unidade'
import {
  EditorDeComissao, entradaDaComissao, estadoInicialDaComissao, type DadosDaComissao,
} from '@/components/admin/comissao-do-procedimento'

/**
 * As categorias vêm da REDE (Procedimentos → Categorias, 2026-10-14). Eram
 * quinze fixas aqui, e o procedimento numa categoria de fora delas abria como
 * "Selecione…" — salvar trocava a categoria. A do procedimento entra sempre,
 * mesmo arquivada.
 */
function opcoesDeCategoria(categorias: string[], atual: string | undefined): string[] {
  if (!atual || categorias.some(c => c.toLowerCase() === atual.toLowerCase())) return categorias
  return [...categorias, atual].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}

interface Branch { id: string; name: string }
interface Product {
  id:                string
  name:              string
  /** O SKU (A6 da 9ª): dois produtos de mesmo nome se distinguem no seletor. */
  sku?:              string | null
  unit:              string
  /** A unidade do insumo; nulo = da clínica toda (sem sufixo). */
  branch_name:       string | null
  cost_price?:       number | null
  consumption_unit?: string | null
  units_per_package?: number | null
}

interface BranchPricingOverride {
  branch_id:  string
  price:      number | null
  labor_cost: number | null
}

interface ExistingProcedure {
  id: string
  name: string
  category: string
  description?: string | null
  duration_min: number
  price: string | number
  labor_cost?: string | number
  other_costs?: string | number
  visible_on_client_app: boolean
  is_active: boolean
  branch_ids: string[]
  procedure_products: { product_id: string; quantity: number; unit_cost?: number | null }[]
  branch_pricing?: BranchPricingOverride[]
  form_id?: string | null
  consent_template_id?: string | null
  contract_template_id?: string | null
  loyalty_points?: number | null
  /** As salas em que é feito (D5). */
  room_ids?: string[]
  /** Quem realiza (por-01). Vazio = todas as que atendem. */
  professional_ids?: string[]
}

/** Quem atende na rede: o "Quem realiza" do procedimento (por-01). */
export interface ProfissionalDoCadastro { id: string; name: string }

/** Uma sala ativa da rede, com a unidade dela (D5). */
export interface SalaDoCadastro { id: string; name: string; unidade: string }

/** Um modelo de termo ou contrato que o procedimento pode ligar. */
export interface OpcaoDeModeloDoProcedimento {
  id:        string
  nome:      string
  momento:   'AGENDAMENTO' | 'INICIO_ATENDIMENTO' | null
  exigencia: 'BLOQUEIA' | 'AVISA'
  ativo:     boolean
}
export interface ModelosDoProcedimento {
  termos:    OpcaoDeModeloDoProcedimento[]
  contratos: OpcaoDeModeloDoProcedimento[]
}

interface ProcedureFormProps {
  /** As salas ativas da rede (D5): o procedimento se liga às em que é feito. */
  salas?: SalaDoCadastro[]
  /** Quem atende na rede (por-01): as que realizam o procedimento. */
  profissionais?: ProfissionalDoCadastro[]
  branches: Branch[]
  products: Product[]
  fichas?: { id: string; name: string }[]
  existing?: ExistingProcedure
  onSuccess?: () => void
  onCancel?: () => void
  /** A rede ganha pontos POR PROCEDIMENTO: o campo aparece. Fora disso, nem é enviado. */
  pontosDeFidelidade?: boolean
  /** Termos e contratos da rede (Configurações → Documentos). */
  modelos?: ModelosDoProcedimento
  /** As categorias ativas da rede. */
  categorias?: string[]
  /** A comissão do procedimento — só para quem muda (financeiro da rede). Ausente, a seção nem aparece. */
  comissao?: DadosDaComissao
}

/**
 * O rótulo ENVOLVE o campo (A11 da 5ª simulação; docs/regras/design.md,
 * "Formulários"): solto, "Duração" e "Preço" não chegavam ao leitor de tela
 * nem ao clique. A dica fica fora, para não entrar no nome do campo.
 */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {children}
      </label>
      {hint && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{hint}</p>}
    </div>
  )
}

/** O que cabe num campo de dinheiro enquanto se digita: dígitos, vírgula e ponto. */
const soDinheiro = (v: string) => v.replace(/[^\d.,]/g, '')
/**
 * Ao sair do campo: o valor em reais no formato do sistema ("180" -> "180,00",
 * "1.400" -> "1.400,00"); vazio fica vazio. O que não se lê sem adivinhar
 * ("0.012") fica como foi escrito, com o aviso (D3, 2026-10-29): apagar ou
 * formatar escondia o erro.
 */
function fechaDinheiro(v: string) {
  const n = parseDinheiro(v)
  return Number.isFinite(n) ? formatDinheiroCampo(n) : v.trim()
}
/**
 * O custo do insumo como todo dinheiro do sistema (A11 da 5ª simulação): era
 * um campo numérico, e o insumo de R$ 380 aparecia "380", sem centavos. O texto
 * acompanha o produto escolhido (o custo muda com ele) e fecha no formato ao
 * sair do campo. É o custo por unidade de CONSUMO, com até 4 casas (D6 da 11ª:
 * R$ 0,038/g da cera virava R$ 0,04).
 */
function CustoDoInsumo({ valor, onValor }: { valor: number; onValor: (n: number) => void }) {
  const [texto, setTexto] = useState(() => custoDoInsumoNoCampo(valor))
  const [visto, setVisto] = useState(valor)
  if (valor !== visto) { setVisto(valor); setTexto(custoDoInsumoNoCampo(valor)) }
  return (
    <input
      type="text" inputMode="decimal" className="field"
      style={{ width: 100, paddingLeft: 28 }}
      value={texto}
      onChange={e => {
        const t = soDinheiro(e.target.value)
        const n = lerCustoDoInsumo(t)
        const numero = Number.isFinite(n) ? n : 0
        setTexto(t); setVisto(numero); onValor(numero)
      }}
      onBlur={() => { const n = lerCustoDoInsumo(texto); setTexto(Number.isFinite(n) ? custoDoInsumoNoCampo(n) : texto.trim()) }}
      placeholder="0,00"
      title="Custo por unidade"
    />
  )
}

/** O campo tem texto que não é dinheiro. */
const dinheiroInvalido = (v: string) => v.trim() !== '' && !Number.isFinite(parseDinheiro(v))

function AvisoDoDinheiro({ valor }: { valor: string }) {
  if (!dinheiroInvalido(valor)) return null
  return (
    <p role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>
      {DINHEIRO_INVALIDO}
    </p>
  )
}

function formatPrice(raw: string | number) {
  const n = parseFloat(String(raw))
  if (isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type ActionState = { error?: string; success?: boolean; procedureId?: string } | undefined
type InnerProps  = ProcedureFormProps & { isEdit: boolean; state: ActionState; formAction: (f: FormData) => void; pending: boolean }

function CreateProcedureForm(props: ProcedureFormProps) {
  const [state, formAction, pending] = useActionState(addProcedure, undefined)
  return <ProcedureFormInner {...props} isEdit={false} state={state} formAction={formAction} pending={pending} />
}
function EditProcedureForm(props: ProcedureFormProps) {
  const [state, formAction, pending] = useActionState(updateProcedure, undefined)
  return <ProcedureFormInner {...props} isEdit={true} state={state} formAction={formAction} pending={pending} />
}

export function ProcedureForm(props: ProcedureFormProps) {
  return props.existing ? <EditProcedureForm {...props} /> : <CreateProcedureForm {...props} />
}

function ProcedureFormInner({ salas = [], profissionais = [], branches, products, fichas = [], existing, onSuccess, onCancel, isEdit, state, formAction, pending, pontosDeFidelidade = false, modelos, categorias, comissao }: InnerProps) {
  const pathname = usePathname()
  // A clínica de uma unidade (D-19, F8): "disponível nas unidades" e o preço
  // por unidade só fazem sentido com duas.
  const umaUnidade = useUmaUnidade()

  // As salas em que é feito (D5, 2026-10-30): opcional. Só as ativas se
  // oferecem; sem marcada numa unidade, qualquer sala dela serve.
  const [salasMarcadas, setSalasMarcadas] = useState<string[]>(
    () => (existing?.room_ids ?? []).filter(id => salas.some(s => s.id === id)))
  const variasUnidades = new Set(salas.map(s => s.unidade)).size > 1
  function alternarSala(id: string) {
    setSalasMarcadas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  // Quem realiza (por-01, revisão do Heitor de 2026-11-02): opcional. Sem
  // ninguém marcado, todas as que atendem realizam (o de antes).
  const [quemRealiza, setQuemRealiza] = useState<string[]>(
    () => (existing?.professional_ids ?? []).filter(id => profissionais.some(p => p.id === id)))
  function alternarQuemRealiza(id: string) {
    setQuemRealiza(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  // A comissão (2026-10-15): o mesmo editor do chip da tabela. Só vai ao
  // servidor se MUDOU — editar a descrição não regrava a comissão.
  const [estadoComissao, setEstadoComissao] = useState(() => comissao ? estadoInicialDaComissao(comissao) : null)
  const [erroComissao, setErroComissao] = useState<string | null>(null)
  const [comissaoInicial] = useState(() => {
    if (!comissao) return null
    const r = entradaDaComissao(estadoInicialDaComissao(comissao), comissao.profissionais)
    return 'entrada' in r ? JSON.stringify(r.entrada) : null
  })
  const lidaComissao = comissao && estadoComissao ? entradaDaComissao(estadoComissao, comissao.profissionais) : null
  const comissaoMudou = !!lidaComissao && 'entrada' in lidaComissao && JSON.stringify(lidaComissao.entrada) !== comissaoInicial

  const [selectedBranches, setSelectedBranches] = useState<string[]>(existing?.branch_ids ?? [])
  const [insumos, setInsumos] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>(
    (existing?.procedure_products ?? []).map(pp => ({
      ...pp,
      unit_cost: pp.unit_cost ?? products.find(p => p.id === pp.product_id)?.cost_price ?? 0,
    }))
  )
  const [price,      setPrice]      = useState(existing ? formatPrice(existing.price)      : '')
  const [laborCost,  setLaborCost]  = useState(existing?.labor_cost  ? formatPrice(existing.labor_cost)  : '')
  const [otherCosts, setOtherCosts] = useState(existing?.other_costs ? formatPrice(existing.other_costs) : '')
  const [marginPct,  setMarginPct]  = useState('')  // % — vinculado ao preço (bidirecional)
  // Qual dos dois a pessoa digitou por último — é ele que fica fixo quando o
  // custo muda. Estado (e não ref): é lido no render, logo abaixo.
  const [ancora, setAncora] = useState<'margin' | 'price'>('price')

  type BranchOverrideState = { branch_id: string; price: string; labor_cost: string }
  const [branchPricing, setBranchPricing] = useState<BranchOverrideState[]>(
    (existing?.branch_pricing ?? []).map(b => ({
      branch_id:  b.branch_id,
      price:      b.price      != null ? formatPrice(b.price)      : '',
      labor_cost: b.labor_cost != null ? formatPrice(b.labor_cost) : '',
    }))
  )

  const [branchPricingOpen, setBranchPricingOpen] = useState(false)

  function setBranchOverride(branchId: string, field: 'price' | 'labor_cost', value: string) {
    setBranchPricing(prev => {
      const idx = prev.findIndex(b => b.branch_id === branchId)
      if (idx >= 0) return prev.map((b, i) => i === idx ? { ...b, [field]: value } : b)
      return [...prev, { branch_id: branchId, price: '', labor_cost: '', [field]: value }]
    })
  }

  function branchOverrideInput(branchId: string, field: 'price' | 'labor_cost') {
    return (e: React.ChangeEvent<HTMLInputElement>) => setBranchOverride(branchId, field, soDinheiro(e.target.value))
  }
  function branchOverrideBlur(branchId: string, field: 'price' | 'labor_cost') {
    return (e: React.FocusEvent<HTMLInputElement>) => setBranchOverride(branchId, field, fechaDinheiro(e.target.value))
  }

  // Serializa apenas overrides com pelo menos um valor preenchido
  const branchPricingPayload = JSON.stringify(
    branchPricing
      .filter(b => b.price !== '')
      .map(b => ({
        branch_id:  b.branch_id,
        price:      b.price !== '' ? parseBRL(b.price) : null,
        labor_cost: null,
      }))
  )

  const productsCostCalc = insumos.reduce((sum, ins) => sum + (ins.unit_cost ?? 0) * ins.quantity, 0)

  function parseBRL(v: string) { const n = parseDinheiro(v); return Number.isFinite(n) ? n : 0 }
  const laborCostNum  = parseBRL(laborCost)
  const otherCostsNum = parseBRL(otherCosts)
  const totalCost     = laborCostNum + otherCostsNum + productsCostCalc

  const fmtMargin = (pct: number) => pct.toFixed(1).replace('.', ',')
  const priceFromMargin = (m: number) => (m < 100 ? totalCost / (1 - m / 100) : 0)
  const marginFromPrice = (p: number) => (p > 0 ? ((p - totalCost) / p) * 100 : 0)

  // Quando o custo muda (mão de obra, insumos, outros), reprojeta mantendo a
  // última intenção do usuário: margem fixa → recalcula preço; preço fixo → recalcula margem.
  //
  // No render, com o custo anterior guardado. Começa em `null` para rodar
  // também na primeira vez — é o que preenche a margem de um procedimento que
  // já tem preço.
  const [custoAnterior, setCustoAnterior] = useState<number | null>(null)
  if (custoAnterior !== totalCost) {
    setCustoAnterior(totalCost)
    if (ancora === 'margin') {
      const m = parseFloat(marginPct.replace(',', '.')) || 0
      if (m < 100) setPrice(formatPrice(priceFromMargin(m)))
    } else {
      const p = parseBRL(price)
      setMarginPct(p > 0 ? fmtMargin(marginFromPrice(p)) : '')
    }
  }

  function handleMarginInput(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',')
    setAncora('margin')
    setMarginPct(cleaned)
    const m = parseFloat(cleaned.replace(',', '.')) || 0
    setPrice(m > 0 && m < 100 ? formatPrice(priceFromMargin(m)) : (m <= 0 ? formatPrice(totalCost) : ''))
  }
  // Dinheiro como em todo o sistema (D10): "180" é R$ 180,00. Escreve-se livre
  // e formata ao sair do campo.
  function handlePriceCalcInput(e: React.ChangeEvent<HTMLInputElement>) {
    const texto = soDinheiro(e.target.value)
    const num   = parseBRL(texto)
    setAncora('price')
    setPrice(texto)
    setMarginPct(num > 0 ? fmtMargin(marginFromPrice(num)) : '')
  }

  // Avisa o pai UMA vez por sucesso: `onSuccess` costuma vir inline, e nas
  // dependências o efeito rodaria a cada render do pai.
  const aoSalvar = useEffectEvent(() => onSuccess?.())
  useEffect(() => {
    if (state?.success) aoSalvar()
  }, [state?.success])

  function toggleBranch(id: string) {
    setSelectedBranches(p => p.includes(id) ? p.filter(b => b !== id) : [...p, id])
  }

  function calcUnitCost(prod: Product): number {
    const cp  = parseFloat(String(prod.cost_price ?? 0)) || 0
    const upp = parseFloat(String(prod.units_per_package ?? 0)) || 0
    if (upp > 0 && prod.consumption_unit) return cp / upp
    return cp
  }

  function addInsumo() {
    if (products.length === 0) return
    const first = products[0]!
    setInsumos(p => [...p, { product_id: first.id, quantity: 1, unit_cost: calcUnitCost(first) }])
  }

  function removeInsumo(i: number) {
    setInsumos(p => p.filter((_, idx) => idx !== i))
  }

  const handleLaborCostInput  = (e: React.ChangeEvent<HTMLInputElement>) => setLaborCost(soDinheiro(e.target.value))
  const handleOtherCostsInput = (e: React.ChangeEvent<HTMLInputElement>) => setOtherCosts(soDinheiro(e.target.value))

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      onSubmit={e => {
        // Dinheiro que não se lê (D3): o aviso já está junto do campo; não envia
        // (o preço por unidade iria como R$ 0).
        if ([price, laborCost, otherCosts, ...branchPricing.map(b => b.price)].some(dinheiroInvalido)) { e.preventDefault(); return }
        // Valor faltando na comissão: barra aqui, antes de criar o procedimento.
        if (lidaComissao && 'erro' in lidaComissao) { e.preventDefault(); setErroComissao(lidaComissao.erro) }
        else setErroComissao(null)
      }}>
      {comissaoMudou && lidaComissao && 'entrada' in lidaComissao && (
        <input type="hidden" name="comissao" value={JSON.stringify(lidaComissao.entrada)} />
      )}
      {isEdit && <input type="hidden" name="_procedureId" value={existing!.id} />}
      <input type="hidden" name="branch_ids"     value={JSON.stringify(selectedBranches)} />
      <input type="hidden" name="products"       value={JSON.stringify(insumos)} />
      <input type="hidden" name="branch_pricing" value={branchPricingPayload} />
      {/* Sem sala na rede o campo não vai: a ação não mexe nas ligações. */}
      {salas.length > 0 && <input type="hidden" name="room_ids" value={JSON.stringify(salasMarcadas)} />}
      {/* Sem ninguém que atenda na rede, o campo não vai: a ação não mexe nas ligações. */}
      {profissionais.length > 0 && <input type="hidden" name="professional_ids" value={JSON.stringify(quemRealiza)} />}

      {/* -- Dados básicos -- */}
      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Nome *">
            <input name="name" type="text" required className="field"
              defaultValue={existing?.name} placeholder="Ex: Toxina botulínica" />
          </Field>
        </div>

        <Field label="Categoria *">
          <select name="category" required className="field" defaultValue={existing?.category ?? ''}>
            <option value="" disabled>Selecione…</option>
            {opcoesDeCategoria(categorias ?? [], existing?.category).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Duração (minutos) *">
          <input name="duration_min" type="number" required className="field"
            min={1} defaultValue={existing?.duration_min ?? 60} />
        </Field>

        {/* Um rótulo só, LIGADO à caixa (J-10, 2026-10-30): o título "Visível no
            app do cliente" e a caixa "Permitir agendamento self-service" pareciam
            duas coisas. A explicação vai pelo aria-describedby. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 18 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" name="visible_on_client_app" aria-describedby="proc-visivel-no-app-dica"
              defaultChecked={existing?.visible_on_client_app ?? false}
              style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
              Visível no app do cliente
            </span>
          </label>
          <p id="proc-visivel-no-app-dica" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
            A cliente vê o procedimento no app e agenda sozinha.
          </p>
        </div>

        {/* UMA ficha. Eram duas — "de anamnese" e "de atendimento" —, com os
            mesmos campos possíveis e o mesmo momento de preenchimento: quem
            cadastrava um procedimento tinha de escolher em qual das duas pôr
            cada pergunta, e a escolha não mudava nada (2026-09-25). */}
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Ficha" hint="Opcional — preenchida pelo profissional durante o atendimento. Se o procedimento for uma avaliação, os campos são os da avaliação.">
            <select name="form_id" className="field" defaultValue={existing?.form_id ?? ''}>
              <option value="">Nenhuma</option>
              {fichas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        </div>

        {/* Até UM termo e UM contrato por procedimento (decisão do Heitor,
            2026-09-29). No plano, o cliente assina o termo de cada
            procedimento e o contrato de plano da rede — o contrato daqui é o
            do atendimento avulso. */}
        <SeletorDeModelo
          nome="consent_template_id" rotulo="Termo de consentimento"
          opcoes={modelos?.termos ?? []} inicial={existing?.consent_template_id ?? null}
          vazio="Nenhum termo cadastrado ainda — crie em Configurações → Documentos."
        />
        <SeletorDeModelo
          nome="contract_template_id" rotulo="Contrato"
          opcoes={modelos?.contratos ?? []} inicial={existing?.contract_template_id ?? null}
          vazio="Nenhum contrato de procedimento cadastrado — crie em Configurações → Documentos."
        />

        {/* Só no modo "por procedimento": ausente do formulário, o servidor não
            mexe no valor gravado (ver pontosDeFidelidade em actions/procedures). */}
        {pontosDeFidelidade && (
          <Field label="Pontos de fidelidade" hint="Quantos pontos o cliente ganha quando este procedimento é pago. Vazio = nenhum.">
            <input
              name="loyalty_points" type="number" min={0} step={1} inputMode="numeric"
              className="field" defaultValue={existing?.loyalty_points ?? ''} placeholder="0"
            />
          </Field>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Descrição">
            <textarea name="description" rows={2} className="field"
              defaultValue={existing?.description ?? ''}
              placeholder="Descrição opcional para a equipe…"
              style={{ resize: 'vertical' }} />
          </Field>
        </div>
      </div>

      {/* -- Disponibilidade por unidade (só com duas ou mais) -- */}
      {!umaUnidade && <div>
        <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 8 }}>
          DISPONÍVEL NAS UNIDADES
        </p>
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 10 }}>
          Sem seleção = disponível em todas as unidades
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {branches.map(b => {
            const on = selectedBranches.includes(b.id)
            return (
              <button
                key={b.id}
                type="button"
                className={on ? 'chip-filtro is-ativo' : 'chip-filtro'}
                aria-pressed={on}
                onClick={() => toggleBranch(b.id)}
              >
                {b.name}
              </button>
            )
          })}
        </div>
      </div>}

      {/* -- Quem realiza (por-01) -- */}
      {profissionais.length > 0 && (
        <div>
          <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 8 }}>
            QUEM REALIZA
          </p>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 10 }}>
            {quemRealiza.length
              ? 'O app da cliente e o "Sem preferência" oferecem só as marcadas; a agenda avisa quando a escolhida não realiza.'
              : 'Opcional. Sem ninguém marcado, todas as profissionais que atendem realizam este procedimento.'}
          </p>
          <div role="group" aria-label="Quem realiza" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {profissionais.map(p => {
              const on = quemRealiza.includes(p.id)
              return (
                <button key={p.id} type="button" className={on ? 'chip-filtro is-ativo' : 'chip-filtro'}
                  aria-pressed={on} onClick={() => alternarQuemRealiza(p.id)}>
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* -- Salas em que é feito (D5) -- */}
      {salas.length > 0 && (
        <div>
          <p id="salas-do-procedimento" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 8 }}>
            SALAS EM QUE É FEITO
          </p>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 10 }}>
            Opcional. Sem sala marcada numa unidade, qualquer sala dela serve; com sala marcada, o agendar oferece só as marcadas.
          </p>
          <div role="group" aria-label="Salas em que é feito" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {salas.map(s => {
              const on = salasMarcadas.includes(s.id)
              return (
                <button key={s.id} type="button" className={on ? 'chip-filtro is-ativo' : 'chip-filtro'}
                  aria-pressed={on} onClick={() => alternarSala(s.id)}>
                  {variasUnidades ? `${s.name} · ${s.unidade}` : s.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* -- Insumos -- */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            INSUMOS UTILIZADOS
          </p>
          {products.length > 0 && (
            <button type="button" onClick={addInsumo} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              <Plus size={13} /> Adicionar insumo
            </button>
          )}
        </div>

        {products.length === 0 && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', padding: '8px 0' }}>
            Nenhum produto cadastrado no estoque ainda.{' '}
            <Link href={rotaNoPortal(pathname, null, '/estoque')} style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>
              Cadastrar produto no Estoque
            </Link>
            {' '}— o insumo precisa existir lá antes de entrar aqui.
          </p>
        )}

        {insumos.length === 0 && products.length > 0 && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', padding: '8px 0' }}>
            Nenhum insumo adicionado. Clique em “Adicionar insumo” para vincular produtos do estoque.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insumos.map((ins, i) => {
            const prod = products.find(p => p.id === ins.product_id)
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Produto */}
                <select
                  className="field"
                  style={{ flex: 1 }}
                  value={ins.product_id}
                  onChange={e => {
                    const newProd = products.find(p => p.id === e.target.value)
                    setInsumos(p => p.map((x, idx) => idx === i ? {
                      ...x,
                      product_id: e.target.value,
                      unit_cost: newProd ? calcUnitCost(newProd) : 0,
                    } : x))
                  }}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit}){p.sku ? ` · ${p.sku}` : ''}{p.branch_name ? ` — ${p.branch_name}` : ''}</option>
                  ))}
                </select>

                {/* Quantidade */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number" min={0.001} step={0.001} className="field"
                    style={{ width: 80 }}
                    value={ins.quantity}
                    onChange={e => setInsumos(p => p.map((x, idx) => idx === i ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))}
                  />
                  <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', minWidth: 24 }}>
                    {(prod?.consumption_unit && prod?.units_per_package) ? prod.consumption_unit : (prod?.unit ?? '')}
                  </span>
                </div>

                {/* Custo unitário */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
                  <CustoDoInsumo valor={ins.unit_cost}
                    onValor={n => setInsumos(p => p.map((x, idx) => idx === i ? { ...x, unit_cost: n } : x))} />
                </div>

                <button type="button" onClick={() => removeInsumo(i)} style={{
                  width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg-app)', color: 'var(--text-faint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
        {/* A13 da 11ª (princípio 3): R$ 7,95/U era o último custo, e o lote que
            sai primeiro custa R$ 7,80 — a tela diz de onde vem o número. */}
        {insumos.length > 0 && (
          <p data-custo-do-insumo-e-o-ultimo style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            O custo de cada insumo é o último custo de compra, por unidade de consumo: é ele que a margem do catálogo usa.
            No atendimento, a baixa sai ao custo do lote que é usado (o que vence primeiro), que pode ser diferente.
          </p>
        )}
      </div>

      {/* -- Calculadora de custos -- */}
      <div>
        <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
          Calculadora de custos
        </p>
        <div className="form-3col">
          {/* Mão de obra */}
          <Field label="Mão de obra">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
              <input name="labor_cost" type="text" className="field" value={laborCost} onChange={handleLaborCostInput} onBlur={e => setLaborCost(fechaDinheiro(e.target.value))} inputMode="decimal" placeholder="0,00" style={{ paddingLeft: 30 }} />
            </div>
            <AvisoDoDinheiro valor={laborCost} />
          </Field>

          {/* Insumos — calculado da lista de insumos */}
          <Field label="Insumos" hint="Calculado dos insumos">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
              <div className="field" style={{ paddingLeft: 30, background: 'var(--surface)', color: 'var(--text)', cursor: 'default', userSelect: 'none' }}>
                {formatPrice(productsCostCalc)}
              </div>
            </div>
          </Field>

          {/* Outros custos */}
          <Field label="Outros custos">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
              <input name="other_costs" type="text" className="field" value={otherCosts} onChange={handleOtherCostsInput} onBlur={e => setOtherCosts(fechaDinheiro(e.target.value))} inputMode="decimal" placeholder="0,00" style={{ paddingLeft: 30 }} />
            </div>
            <AvisoDoDinheiro valor={otherCosts} />
          </Field>
        </div>

        {/* Custo total + margem desejada */}
        <div className="form-2col" style={{ marginTop: 12 }}>
          <Field label="Custo total" hint="Mão de obra + insumos + outros">
            <div className="field" style={{ background: 'var(--surface)', cursor: 'default', userSelect: 'none', fontWeight: 800 }}>
              R$ {formatPrice(totalCost)}
            </div>
          </Field>
          <Field label="Margem de lucro" hint="Defina a margem e o preço se ajusta">
            <div style={{ position: 'relative' }}>
              <input type="text" inputMode="decimal" className="field" value={marginPct} onChange={handleMarginInput} placeholder="0,0" style={{ paddingRight: 26 }} />
              <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>%</span>
            </div>
          </Field>
        </div>
      </div>

      {/* -- Preço do procedimento (abaixo da calculadora, vinculado à margem) -- */}
      <Field label="Preço do procedimento (R$) *" hint="Edite a margem ou o preço — o outro se ajusta automaticamente.">
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
          {/* A1 da 6ª simulação: sem `required` — o vazio é R$ 0,00 (princípio 4), e a linha abaixo diz isso. */}
          <input name="price" type="text" className="field" value={price} onChange={handlePriceCalcInput} onBlur={e => setPrice(fechaDinheiro(e.target.value))} inputMode="decimal" placeholder="0,00" style={{ paddingLeft: 30, fontWeight: 700 }} />
        </div>
        <AvisoDoDinheiro valor={price} />
        {!dinheiroInvalido(price) && (!price.trim() || parseDinheiro(price) === 0) && (
          <p data-preco-gratuito style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-semibold)' }}>
            {price.trim() ? 'R$ 0,00' : 'Sem preço, vale R$ 0,00'}: o procedimento fica gratuito — o atendimento não tem o que cobrar.
          </p>
        )}
      </Field>

      {/* -- Personalizar valores por unidade (acordeão) -- */}
      {branches.length > 0 && !umaUnidade && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Gatilho do acordeão */}
          <button
            type="button"
            onClick={() => setBranchPricingOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 14px', background: 'var(--bg-app)', border: 'none', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Personalizar valores por unidade
              </span>
              {branchPricing.some(b => b.price !== '') && (
                <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, background: 'var(--brand-soft)', color: 'var(--brand)', border: '1px solid var(--brand-soft-border)', borderRadius: 99, padding: '1px 7px' }}>
                  {(n => `${n} ${n === 1 ? 'unidade' : 'unidades'} com preço próprio`)(branchPricing.filter(b => b.price !== '').length)}
                </span>
              )}
            </div>
            <ChevronDown
              size={15}
              color="var(--text-muted)"
              style={{ transform: branchPricingOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }}
            />
          </button>

          {/* Conteúdo do acordeão */}
          {branchPricingOpen && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', padding: '8px 14px 6px' }}>
                Deixe em branco para usar os valores base do procedimento.
              </p>
              {/* Header da tabela */}
              <div className="form-2col" style={{ background: 'var(--bg-app)', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--border)', padding: '6px 12px' }}>
                {['Unidade', 'Preço'].map(h => (
                  <span key={h} style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>
              {branches.map((b, i) => {
                const ov = branchPricing.find(bp => bp.branch_id === b.id) ?? { branch_id: b.id, price: '', labor_cost: '' }
                return (
                  <div key={b.id} className="form-2col" style={{
                    padding: '8px 12px', alignItems: 'center',
                    borderBottom: i < branches.length - 1 ? '1px solid var(--hairline)' : undefined,
                  }}>
                    <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text)', fontWeight: 600 }}>{b.name}</span>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', pointerEvents: 'none' }}>R$</span>
                      <input type="text" className="field" value={ov.price}
                        onChange={branchOverrideInput(b.id, 'price')} onBlur={branchOverrideBlur(b.id, 'price')} inputMode="decimal"
                        placeholder={price || '—'}
                        style={{ paddingLeft: 26, fontSize: 'var(--text-sm-sz)', height: 32 }} />
                      <AvisoDoDinheiro valor={ov.price} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* -- Comissão (só o financeiro da rede) -- */}
      {comissao && estadoComissao && (
        <div>
          <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 10 }}>
            COMISSÃO
          </p>
          <EditorDeComissao estado={estadoComissao} onChange={e => { setEstadoComissao(e); setErroComissao(null) }}
            profissionais={comissao.profissionais} inicialComValor={comissao.porProfissional.length} />
          {erroComissao && (
            <p role="alert" style={{ marginTop: 8, fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erroComissao}</p>
          )}
        </div>
      )}

      {/* -- Feedback -- */}
      {state?.error && (
        <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          <CheckCircle2 size={14} /> {isEdit ? 'Procedimento atualizado.' : 'Procedimento criado com sucesso.'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={pending}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? (isEdit ? 'Salvando…' : 'Criando…') : (isEdit ? 'Salvar alterações' : 'Criar procedimento')}
        </button>
      </div>
    </form>
  )
}

const ROTULO_DO_MOMENTO = { AGENDAMENTO: 'nasce ao agendar', INICIO_ATENDIMENTO: 'nasce no início do atendimento' } as const

/**
 * Escolha do termo ou do contrato. Diz, embaixo, quando o documento nasce e se
 * ele trava o atendimento — é isso que muda o dia da recepção, e quem liga o
 * modelo precisa ver sem abrir Configurações.
 */
function SeletorDeModelo({ nome, rotulo, opcoes, inicial, vazio }: {
  nome: string; rotulo: string; opcoes: OpcaoDeModeloDoProcedimento[]; inicial: string | null; vazio: string
}) {
  const [valor, setValor] = useState(inicial ?? '')
  // Inativos só aparecem se já estão ligados: sumir da lista apagaria o
  // vínculo em silêncio ao salvar.
  const visiveis = opcoes.filter(o => o.ativo || o.id === inicial)
  const escolhido = visiveis.find(o => o.id === valor)
  const dica = escolhido
    ? [
        escolhido.momento ? ROTULO_DO_MOMENTO[escolhido.momento] : null,
        escolhido.exigencia === 'BLOQUEIA' ? 'bloqueia o início sem assinatura' : 'só avisa se faltar',
        escolhido.ativo ? null : 'modelo inativo — não nasce em atendimento novo',
      ].filter(Boolean).join(' · ')
    : visiveis.length ? 'Opcional.' : vazio
  return (
    <Field label={rotulo} hint={dica.charAt(0).toUpperCase() + dica.slice(1)}>
      <select name={nome} className="field" value={valor} onChange={e => setValor(e.target.value)}>
        <option value="">Nenhum</option>
        {visiveis.map(o => <option key={o.id} value={o.id}>{o.nome}{o.ativo ? '' : ' (inativo)'}</option>)}
      </select>
    </Field>
  )
}
