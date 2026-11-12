'use client'

import { useId,
  useRef, useCallback, useState, useMemo,
  forwardRef, useImperativeHandle,
} from 'react'
import { X, Package, Barcode } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createProduct, updateProduct } from '@/actions/stock'
import { MEDIDAS_DO_PRODUTO } from '@/lib/estoque/medidas'
import { USOS_DO_PRODUTO, lerUso, type UsoDoProduto } from '@/lib/estoque/uso'
import { prefixoDoSku } from '@/lib/estoque/sku'
import { SegSelect } from '@/components/shared/seg-select'
import { Fala } from '@/components/shared/uma-unidade'
import { ComissaoDoProduto } from '@/components/branch/comissao-do-produto'
import { unidadeInicial } from '@/lib/unidades/unidade-inicial'
import { CampoFornecedor, type FornecedorDaLista } from '@/components/admin/campo-fornecedor'
import { loteVencido, validadeNaTela } from '@/lib/estoque/validade'
import { useFuso } from '@/components/shared/fuso'

export interface StockProductModalHandle { open: () => void }

export interface StockProduct {
  id:                string
  name:              string
  sku:               string | null
  barcode:           string | null
  category:          string | null
  category_id:       string | null
  unit:              string
  supplier:          string | null
  cost_price:        number | null
  sale_price:        number | null
  /** O uso (D-6); sem ele, vale pelo preço de venda. */
  uso?:              string | null
  min_stock:         number | null
  consumption_unit:  string | null
  units_per_package: number | null
  /** C76: o fornecedor de costume, da lista da rede. */
  fornecedor_id?:    string | null
}

export interface ProductCategory { id: string; name: string }

interface Props {
  product?:    StockProduct
  trigger?:    React.ReactNode
  /** C76: a lista de fornecedores da rede (o texto livre virou lista). */
  fornecedores?: FornecedorDaLista[]
  categories?: ProductCategory[]
  /**
   * Unidades da rede. Quando vem preenchida, o estoque inicial pergunta em qual
   * unidade ele entra — quem e da rede nao tem uma filial corrente, e sem ela o
   * lancamento era descartado em silencio.
   */
  branches?:   { id: string; name: string }[]
  onSuccess?:  () => void
}


const UNITS = MEDIDAS_DO_PRODUTO


/**
 * O rótulo LIGADO ao campo (A8 da 10ª simulação: no Novo produto os rótulos
 * saíam soltos e centralizados — nem o leitor de tela nem o clique achavam o
 * campo; design.md, "Formulários"). É o `.field-label`, alinhado à esquerda.
 */
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="field-label" style={{ textAlign: 'left', letterSpacing: '0.04em' }}>
      {children}
    </label>
  )
}

// -- Campos compartilhados --------------------------------------------
function ProductFields({
  product, fornecedores = [], categories = [], branches = [], onClose, state, pending, submitLabel, isCreate = false, pergunta = null,
}: {
  product?:    StockProduct
  fornecedores?: FornecedorDaLista[]
  categories:  ProductCategory[]
  branches?:   { id: string; name: string }[]
  onClose:     () => void
  state:       { error?: string; success?: boolean } | undefined
  pending:     boolean
  submitLabel: string
  isCreate?:   boolean
  /** O nome repetido (A6 da 9ª): o servidor pergunta antes de cadastrar outro igual. */
  pergunta?:   { texto: string; onConfirmar: () => void } | null
}) {
  const [categoryId,       setCategoryId]       = useState(product?.category_id ?? '')
  const [barcodeValue,     setBarcodeValue]     = useState(product?.barcode ?? '')
  const [barcodeReady,     setBarcodeReady]     = useState(false)
  const [initialQtyStr,    setInitialQtyStr]    = useState('')
  const [costPriceStr,     setCostPriceStr]     = useState(product?.cost_price != null ? String(product.cost_price) : '')
  const [unitsPerPkgStr,   setUnitsPerPkgStr]   = useState(product?.units_per_package != null ? String(product.units_per_package) : '')
  const [consumptionUnit,  setConsumptionUnit]  = useState(product?.consumption_unit ?? '')
  // O uso do produto (D-6): o que já existia sem a coluna vale pelo preço de
  // venda (com preço, os dois; sem, insumo) — a mesma regra da migração.
  const [uso,              setUso]              = useState<UsoDoProduto>(
    lerUso(product?.uso) ?? ((product?.sale_price ?? null) !== null ? 'AMBOS' : 'INSUMO'))
  const vendaDireta = uso !== 'INSUMO'
  const [showStock,        setShowStock]        = useState(false)
  // C16: a validade do estoque inicial que já passou avisa (o dia da unidade, F62b).
  const fuso = useFuso()
  const [validadeInicial, setValidadeInicial] = useState('')
  const validadeInicialVencida = !!validadeInicial && loteVencido(validadeInicial, new Date(), fuso)

  const selectedCat = useMemo(() => categories.find(c => c.id === categoryId), [categories, categoryId])
  const skuPreview  = useMemo(
    // O cadastro novo sem categoria também gera (A6 da 7ª: o que se vende ganha REV).
    () => isCreate || selectedCat ? `${prefixoDoSku(selectedCat?.name, uso)}-NNN` : null,
    [selectedCat, isCreate, uso],
  )

  const costPerUnit = useMemo(() => {
    const cost = parseFloat(costPriceStr)
    const upp  = parseFloat(unitsPerPkgStr)
    if (!cost || !upp || upp <= 0 || !consumptionUnit) return null
    return cost / upp
  }, [costPriceStr, unitsPerPkgStr, consumptionUnit])

  // Os ids dos campos (o rótulo aponta para eles): um por formulário aberto.
  const uid = useId()
  const id = (campo: string) => `${uid}-${campo}`

  return (
    <>
      {/* Nome + SKU */}
      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label htmlFor={id('nome')}>Nome *</Label>
          <input id={id('nome')} name="name" type="text" required className="field"
            defaultValue={product?.name}
            placeholder="Ex: Ácido Hialurônico 1%" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>SKU</Label>
          {product?.sku ? (
            <div className="field" style={{
              background: 'var(--bg-app)', cursor: 'default',
              fontFamily: 'monospace', fontSize: 'var(--text-base-sz)', fontWeight: 700,
              color: 'var(--text)', letterSpacing: '0.05em',
            }}>
              {product.sku}
            </div>
          ) : (
            <div className="field" style={{
              background: 'var(--bg-app)', cursor: 'default',
              fontFamily: 'monospace', fontSize: 'var(--text-base-sz)', fontWeight: 700,
              color: skuPreview ? 'var(--brand)' : 'var(--text-faint)',
              letterSpacing: '0.05em',
            }}>
              {skuPreview ?? '—'}
            </div>
          )}
        </div>
      </div>

      {/* Código de barras */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label htmlFor={id('barcode')}>Código de barras</Label>
          {barcodeReady && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--brand)',
              letterSpacing: '0.02em',
            }}>
              <Barcode size={11} />
              Pronto para leitura
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            id={id('barcode')}
            name="barcode"
            type="text"
            className="field"
            value={barcodeValue}
            onChange={e => setBarcodeValue(e.target.value)}
            onFocus={() => setBarcodeReady(true)}
            onBlur={() => setBarcodeReady(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            placeholder="Escaneie ou digite o código EAN/UPC…"
            autoComplete="off"
            spellCheck={false}
            style={{
              fontFamily: barcodeValue ? 'monospace' : undefined,
              letterSpacing: barcodeValue ? '0.08em' : undefined,
              fontSize: barcodeValue ? 14 : undefined,
              outline: 'none',
              borderColor: barcodeReady ? 'var(--brand)' : undefined,
              boxShadow: barcodeReady ? '0 0 0 3px var(--brand-soft)' : undefined,
              transition: 'border-color 150ms, box-shadow 150ms',
            }}
          />
        </div>
      </div>

      {/* Categoria + Unidade */}
      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label htmlFor={id('categoria')}>Categoria</Label>
          <select
            id={id('categoria')}
            name="category_id"
            className="field"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            disabled={categories.length === 0}
          >
            <option value="">
              {categories.length === 0 ? 'Nenhuma categoria cadastrada' : 'Sem categoria'}
            </option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label htmlFor={id('embalagem')}>Embalagem *</Label>
          <select id={id('embalagem')} name="unit" required className="field"
            defaultValue={product?.unit ?? 'un'}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Conversão de embalagem (opcional) */}
      <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Conteúdo da embalagem <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)' }}>— opcional</span>
        </p>
        <div className="form-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Label htmlFor={id('conteudo')}>Quantidade</Label>
            <input id={id('conteudo')} name="units_per_package" type="number" step="0.0001" min="0.0001" className="field"
              value={unitsPerPkgStr}
              onChange={e => setUnitsPerPkgStr(e.target.value)}
              placeholder="Ex: 100" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Label htmlFor={id('medida')}>Medida</Label>
            <select id={id('medida')} name="consumption_unit" className="field"
              value={consumptionUnit}
              onChange={e => setConsumptionUnit(e.target.value)}
            >
              <option value="">—</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 8 }}>
          Ex: 1 frasco com <strong>100 ml</strong> → custo por ml = preço ÷ 100
        </p>
      </div>

      {/* O uso do produto (D-6, decisão do Heitor): o insumo aparece no
          atendimento; a revenda, na venda de produto ("Vender" da ficha). Três
          opções fixas e curtas: segmentado. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px',
        background: vendaDireta ? 'var(--bg-app)' : 'transparent',
        transition: 'background 200ms',
      }}>
        <div role="group" aria-label="Uso do produto" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            Uso do produto *
          </span>
          <SegSelect ariaLabel="Uso do produto" options={USOS_DO_PRODUTO} value={uso} onSelect={k => setUso(k as UsoDoProduto)} />
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
            {uso === 'INSUMO'
              ? 'Usado nos atendimentos: aparece como insumo do procedimento e da sessão.'
              : uso === 'REVENDA'
              ? 'Vendido à cliente: aparece em "Vender" na ficha, e não como insumo.'
              : 'Usado nos atendimentos e vendido à cliente.'}
          </span>
        </div>
        <input type="hidden" name="uso" value={uso} />

        {vendaDireta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Label htmlFor={id('preco')}>Preço de venda *</Label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', pointerEvents: 'none',
              }}>R$</span>
              <input id={id('preco')} name="sale_price" type="number" step="0.01" min="0" className="field"
                defaultValue={product?.sale_price ?? ''}
                placeholder="0,00" style={{ paddingLeft: 28 }} />
            </div>
          </div>
        )}

        {/* Só insumo: o preço de venda vai vazio (o servidor grava nulo). */}
        {!vendaDireta && <input type="hidden" name="sale_price" value="" />}

        {/* A comissão de venda DESTE produto (o Heitor, 03/11): só de quem revende. */}
        {vendaDireta && <ComissaoDoProduto productId={product?.id ?? null} />}
      </div>

      {/* Fornecedor + Estoque mínimo */}
      <div className="form-2col">
        {/* C76: o fornecedor de costume vem da lista da rede, com "+ Novo fornecedor". */}
        <CampoFornecedor id={id('fornecedor')} rotulo="Fornecedor de costume" fornecedores={fornecedores}
          nomeId="fornecedor_id" nomeTexto="supplier"
          inicial={{ id: product?.fornecedor_id ?? null, nome: product?.supplier ?? null }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label htmlFor={id('minimo')}>Estoque mínimo</Label>
          <input id={id('minimo')} name="min_stock" type="number" step="0.001" min="0" className="field"
            defaultValue={product?.min_stock ?? 0}
            placeholder="0" />
        </div>
      </div>

      {/* Estoque inicial — só na criação */}
      {isCreate && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: showStock ? 12 : 0,
          border: `1px solid ${showStock ? 'var(--brand-soft, var(--border))' : 'var(--border)'}`,
          borderRadius: 10, padding: '12px 14px',
          background: showStock ? 'var(--brand-soft, var(--bg-app))' : 'transparent',
          transition: 'background 200ms, border-color 200ms',
        }}>
          <button
            type="button"
            role="switch"
            aria-checked={showStock}
            onClick={() => setShowStock(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
            }}
          >
            <div style={{
              width: 36, height: 20, borderRadius: 10, flexShrink: 0,
              background: showStock ? 'var(--brand)' : 'var(--border)',
              position: 'relative', transition: 'background 200ms',
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: showStock ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%',
                background: 'white',
                boxShadow: 'none',
                transition: 'left 200ms',
              }} />
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', display: 'block' }}>
                Adicionar estoque inicial
              </span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                {showStock ? 'Lançamento de entrada registrado junto ao cadastro' : 'Registrar quantidade disponível agora'}
              </span>
            </div>
          </button>

          {showStock && (
            <>
              {/* Em qual unidade o estoque entra. Só aparece no portal da rede:
                  estoque é da filial, e sem dizer qual o lançamento inteiro era
                  descartado em silêncio — sem movimento, sem saldo, sem despesa. */}
              {branches.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('unidade')}>Unidade que recebe o estoque *</Label>
                  <select id={id('unidade')} name="_branchId" required className="field" defaultValue={unidadeInicial(branches)}>
                    {/* Sobra da F33 (8ª simulação; princípio 3): com duas ou mais, nenhuma vem escolhida. */}
                    {branches.length > 1 && <option value="">Selecione a unidade…</option>}
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {/* Quantidade + Preço de custo por embalagem */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('qtd-inicial')}>Quantidade *</Label>
                  <input
                    id={id('qtd-inicial')}
                    name="initial_qty"
                    type="number" step="0.001" min="0.001"
                    required
                    value={initialQtyStr}
                    onChange={e => setInitialQtyStr(e.target.value)}
                    className="field"
                    placeholder="0"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <Label htmlFor={id('custo')}>Custo por embalagem</Label>
                    {costPerUnit !== null && (
                      <span style={{ fontSize: 'var(--text-overline)', color: 'var(--brand)', fontWeight: 700 }}>
                        = R$ {costPerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / {consumptionUnit}
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', pointerEvents: 'none',
                    }}>R$</span>
                    <input id={id('custo')} name="initial_cost" type="number" step="0.01" min="0" className="field"
                      value={costPriceStr}
                      onChange={e => setCostPriceStr(e.target.value)}
                      placeholder="0,00" style={{ paddingLeft: 28 }} />
                  </div>
                </div>
              </div>

              {/* Sem "lançar como despesa": movimentação de estoque nunca gera
                  despesa (D13 revisto, decisão do Heitor, 2026-10-28). O custo
                  é base de insumo, custo e margem — e o estoque inicial DIZ isso,
                  como a Entrada (D5 do levantamento, C16). */}
              <p data-entrada-sem-despesa style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Não gera despesa: o custo é a base do insumo, do valor em estoque e da margem. A compra que a clínica pagou entra no
                Financeiro por um lançamento (Novo lançamento, categoria “Compra de estoque”).
              </p>

              {/* Lote + Validade */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('lote')}>Número do lote</Label>
                  <input id={id('lote')} name="initial_batch" type="text" className="field" placeholder="Ex: LOT-2024-001" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('validade')}>Data de validade</Label>
                  <input id={id('validade')} name="initial_expires_at" type="date" className="field"
                    value={validadeInicial} onChange={e => setValidadeInicial(e.target.value)} />
                </div>
              </div>
              {/* C16 (caminho irmão da Entrada): a validade que já passou avisa, sem recusar (princípio 2). */}
              {validadeInicialVencida && (
                <p data-validade-vencida role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)', lineHeight: 1.45 }}>
                  Esta validade já passou ({validadeNaTela(validadeInicial)}): o lote entra vencido. Confira a data na embalagem — se estiver certa, a entrada vale assim.
                </p>
              )}

              {/* C16: o fornecedor e a nota DESTA entrada, estruturados, como na Entrada
                  (o fornecedor vem o de costume escolhido acima, se nada mudar aqui). */}
              <div className="form-2col">
                <CampoFornecedor id={id('fornecedor-inicial')} rotulo="Fornecedor desta entrada" fornecedores={fornecedores}
                  nomeId="initial_fornecedor_id" nomeTexto="initial_fornecedor"
                  inicial={{ id: product?.fornecedor_id ?? null, nome: product?.supplier ?? null }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('nota')}>Nota fiscal</Label>
                  <input id={id('nota')} name="initial_nota_fiscal" type="text" maxLength={60} className="field" placeholder="Número da nota" />
                </div>
              </div>

              {/* Observações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor={id('obs')}>Observações</Label>
                <input id={id('obs')} name="initial_notes" type="text" className="field" placeholder="Ex: compra inicial" />
              </div>
            </>
          )}
        </div>
      )}

      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 700,
        }}>
          {state.error}
        </p>
      )}

      {pergunta && (
        <div role="alert" data-nome-repetido style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 8, padding: '10px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 700,
        }}>
          <span>{pergunta.texto}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={pending} onClick={pergunta.onConfirmar}>Cadastrar mesmo assim</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          <Package size={14} />
          {pending ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </>
  )
}

// -- Form de criação ---------------------------------------------------
function CreateForm({ fornecedores, categories, branches, onClose, onSuccess }: {
  fornecedores: FornecedorDaLista[]
  categories: ProductCategory[]
  branches?:  { id: string; name: string }[]
  onClose:    () => void
  onSuccess:  () => void
}) {
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)
  const [pergunta, setPergunta] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function enviar(dados: FormData) {
    setPending(true)
    setError(undefined)
    setPergunta(null)
    try {
      const result = await createProduct(undefined, dados)
      if (result && 'pergunta' in result && result.pergunta) setPergunta(result.pergunta)
      else if (result?.success) onSuccess()
      else setError((result && 'error' in result ? result.error : undefined) ?? 'Erro inesperado.')
    } catch {
      setError('Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void enviar(new FormData(e.currentTarget))
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProductFields
        isCreate
        fornecedores={fornecedores} categories={categories} branches={branches} onClose={onClose}
        state={error ? { error } : undefined}
        pending={pending} submitLabel="Criar produto"
        pergunta={pergunta ? {
          texto: pergunta,
          onConfirmar: () => {
            if (!formRef.current) return
            const dados = new FormData(formRef.current)
            dados.set('_nomeRepetido', 'sim')
            void enviar(dados)
          },
        } : null}
      />
    </form>
  )
}

// -- Form de edição ---------------------------------------------------
function EditForm({ product, fornecedores, categories, onClose, onSuccess }: {
  product:    StockProduct
  fornecedores: FornecedorDaLista[]
  categories: ProductCategory[]
  onClose:    () => void
  onSuccess:  () => void
}) {
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(undefined)
    try {
      const result = await updateProduct(undefined, new FormData(e.currentTarget))
      if (result?.success) onSuccess()
      else setError(result?.error ?? 'Erro inesperado.')
    } catch {
      setError('Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="_productId" value={product.id} />
      <ProductFields
        product={product} fornecedores={fornecedores} categories={categories} onClose={onClose}
        state={error ? { error } : undefined}
        pending={pending} submitLabel="Salvar"
      />
    </form>
  )
}

// -- Modal wrapper -----------------------------------------------------
export const StockProductModal = forwardRef<StockProductModalHandle, Props>(
  function StockProductModal({ product, trigger, fornecedores = [], categories = [], branches = [], onSuccess }, ref) {
    const isEdit    = !!product
    const dialogRef = useRef<HTMLDialogElement>(null)
    const router    = useRouter()

    const [formKey, setFormKey] = useState(0)

    const open  = useCallback(() => dialogRef.current?.showModal(), [])
    const close = useCallback(() => dialogRef.current?.close(), [])
    useImperativeHandle(ref, () => ({ open }), [open])

    function handleSuccess() {
      setFormKey(k => k + 1)
      close()
      router.refresh()
      onSuccess?.()
    }

    return (
      <>
        {trigger && (
          <span onClick={open} style={{ cursor: 'pointer', display: 'contents' }}>
            {trigger}
          </span>
        )}

        <dialog
          ref={dialogRef} className="modal"
          onClick={e => { if (e.target === dialogRef.current) close() }}
        >
          <div style={{
            position: 'sticky', top: 0, zIndex: 1,
            background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
                {isEdit ? 'Editar produto' : 'Novo produto'}
              </h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                {isEdit ? product.name : <Fala>Adicionar ao catálogo da rede</Fala>}
              </p>
            </div>
            <button type="button" onClick={close} style={{
              width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
              border: '1px solid var(--border)', background: 'var(--bg-app)',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: '24px 24px 28px' }}>
            {isEdit
              ? <EditForm key={`${product.id}-${formKey}`} product={product} fornecedores={fornecedores} categories={categories} onClose={close} onSuccess={handleSuccess} />
              : <CreateForm key={formKey} fornecedores={fornecedores} categories={categories} branches={branches} onClose={close} onSuccess={handleSuccess} />
            }
          </div>
        </dialog>
      </>
    )
  },
)
