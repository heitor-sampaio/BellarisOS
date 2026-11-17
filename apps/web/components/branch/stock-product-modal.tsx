'use client'

import { useId,
  useRef, useCallback, useState, useMemo,
  forwardRef, useImperativeHandle,
} from 'react'
import { X, Package, Barcode, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createProduct, updateProduct } from '@/actions/stock'
import { MEDIDAS_DO_PRODUTO } from '@/lib/estoque/medidas'
import { lerUso, usoDosCheckboxes } from '@/lib/estoque/uso'
import { prefixoDoSku } from '@/lib/estoque/sku'
import { Fala } from '@/components/shared/uma-unidade'
import { ComissaoDoProduto } from '@/components/branch/comissao-do-produto'
import { unidadeInicial } from '@/lib/unidades/unidade-inicial'
import { unicaOpcao } from '@/lib/uma-opcao'
import { CampoDaLista, type ItemDaLista } from '@/components/admin/campo-da-lista'
import { loteVencido, validadeNaTela } from '@/lib/estoque/validade'
import { useFuso } from '@/components/shared/fuso'
import { Dica } from '@/components/shared/dica'

export interface StockProductModalHandle { open: () => void }

export interface StockProduct {
  id:                string
  name:              string
  sku:               string | null
  barcode:           string | null
  category:          string | null
  category_id:       string | null
  unit:              string
  cost_price:        number | null
  sale_price:        number | null
  /** O uso (D-6); sem ele, vale pelo preço de venda. */
  uso?:              string | null
  min_stock:         number | null
  consumption_unit:  string | null
  units_per_package: number | null
}

interface Props {
  product?:    StockProduct
  trigger?:    React.ReactNode
  /** E1/E6: as três listas da rede — categorias (no produto), marcas e fornecedores (no estoque inicial). */
  categories?: ItemDaLista[]
  marcas?: ItemDaLista[]
  fornecedores?: ItemDaLista[]
  /**
   * As unidades que o estoque inicial oferece: as que a pessoa alcança (E13 e
   * EQ1d — `unidadesDoCadastro`). Uma só: escrita e travada; mais: a lista, e o
   * estoque inicial se divide entre elas (E11). Sem a unidade, o lançamento era
   * descartado em silêncio (quem é da rede não tem uma unidade corrente).
   */
  branches?:   { id: string; name: string }[]
  onSuccess?:  () => void
  /**
   * A unidade em que a pessoa está (o portal da unidade): o estoque inicial
   * já vem com ela (EQ1d). No portal da rede, nenhuma (com duas ou mais).
   */
  unidadeAtual?: string
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
  product, marcas = [], fornecedores = [], categories = [], branches = [], unidadeAtual, onClose, state, pending, submitLabel, isCreate = false, pergunta = null,
}: {
  product?:    StockProduct
  marcas?:     ItemDaLista[]
  fornecedores?: ItemDaLista[]
  categories:  ItemDaLista[]
  branches?:   { id: string; name: string }[]
  unidadeAtual?: string
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
  const [costPriceStr,     setCostPriceStr]     = useState(product?.cost_price != null ? String(product.cost_price) : '')
  const [unitsPerPkgStr,   setUnitsPerPkgStr]   = useState(product?.units_per_package != null ? String(product.units_per_package) : '')
  const [consumptionUnit,  setConsumptionUnit]  = useState(product?.consumption_unit ?? '')
  // E2 (o Heitor, 13/11: "checkbox de onde o produto está disponivel (Insumo e
  // Venda direta)"): dois checkboxes; o banco guarda o mesmo uso (D-6). O que já
  // existia sem a coluna vale pelo preço de venda; o produto novo nasce Insumo.
  const usoInicial = lerUso(product?.uso) ?? ((product?.sale_price ?? null) !== null ? 'AMBOS' : 'INSUMO')
  const [insumo,           setInsumo]           = useState(usoInicial !== 'REVENDA')
  const [vendaDireta,      setVendaDireta]      = useState(usoInicial !== 'INSUMO')
  const uso = usoDosCheckboxes(insumo, vendaDireta)
  const [showStock,        setShowStock]        = useState(false)
  // C16: a validade do estoque inicial que já passou avisa (o dia da unidade, F62b).
  const fuso = useFuso()
  const [validadeInicial, setValidadeInicial] = useState('')
  const validadeInicialVencida = !!validadeInicial && loteVencido(validadeInicial, new Date(), fuso)

  const selectedCat = useMemo(() => categories.find(c => c.id === categoryId), [categories, categoryId])
  const skuPreview  = useMemo(
    // O cadastro novo sem categoria também gera (A6 da 7ª: o que se vende ganha REV).
    () => isCreate || selectedCat ? `${prefixoDoSku(selectedCat?.nome, uso)}-NNN` : null,
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
          {/* E6/E3: a categoria com lista e busca; a que falta se cria ali mesmo. */}
          <CampoDaLista lista="categorias" rotulo="Categoria" nome="category_id" itens={categories}
            inicial={product?.category_id ?? null} aoMudar={c => setCategoryId(c?.id ?? '')}
            placeholder="Buscar ou criar categoria…" />
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
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          <span>Conteúdo da embalagem <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)' }}>— opcional</span></span>
          <Dica rotulo="Sobre o conteúdo da embalagem">
            Ex: 1 frasco com <strong>100 ml</strong> → custo por ml = preço ÷ 100
          </Dica>
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
      </div>

      {/* Onde o produto está disponível (E2): Insumo — aparece no atendimento e no
          procedimento; Venda direta — aparece na venda do PDV, com preço. Os dois
          podem estar marcados; nenhum, não (o servidor recusa). */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px',
        background: vendaDireta ? 'var(--bg-app)' : 'transparent',
        transition: 'background 200ms',
      }}>
        <div role="group" aria-labelledby={id('onde')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
            <span id={id('onde')} style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              Onde o produto está disponível
            </span>
            {/* O que cada escolha faz mora na dica (2026-11-16); sem nenhuma, o aviso fica à vista. */}
            {uso && (
              <Dica rotulo="Sobre onde o produto aparece">
                {uso === 'INSUMO'
                  ? 'Usado nos atendimentos: aparece como insumo do procedimento e da sessão.'
                  : uso === 'REVENDA'
                  ? 'Vendido à cliente: aparece na venda do PDV, e não como insumo.'
                  : 'Usado nos atendimentos e vendido à cliente.'}
              </Dica>
            )}
          </span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={insumo} onChange={e => setInsumo(e.target.checked)} style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
              Insumo
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={vendaDireta} onChange={e => setVendaDireta(e.target.checked)} style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
              Venda direta
            </label>
          </div>
          {!uso && (
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              Marque ao menos um: sem nenhum, o produto não aparece em lugar nenhum.
            </span>
          )}
        </div>
        <input type="hidden" name="uso" value={uso ?? ''} />

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

      {/* E10: o produto não tem marca nem fornecedor — quem os tem é cada entrada. */}
      <div className="form-2col">
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
              {/* E11 + E13/EQ1d (o Heitor, 13/11): a unidade segue as unidades da
                  pessoa — uma só, escrita e travada; mais de uma, a lista só com as
                  dela — e o estoque inicial se divide entre elas, uma linha por
                  unidade. O resto da entrada (custo, lote, validade, marca,
                  fornecedor, nota, observações) vale para todas as linhas. */}
              <EstoqueInicialPorUnidade branches={branches} unidadeAtual={unidadeAtual} id={id} />

              {/* Preço de custo por embalagem */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    {/* Sem "lançar como despesa": movimentação de estoque nunca gera
                        despesa (D13 revisto, decisão do Heitor, 2026-10-28). O custo
                        é base de insumo, custo e margem — e o estoque inicial DIZ isso,
                        como a Entrada (D5 do levantamento, C16), na dica do custo (2026-11-16). */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                      <Label htmlFor={id('custo')}>Custo por embalagem</Label>
                      <Dica rotulo="Sobre o custo da entrada">
                        <span data-entrada-sem-despesa>
                          Não gera despesa: o custo é a base do insumo, do valor em estoque e da margem. A compra que a rede pagou entra no
                          Financeiro por um lançamento (Novo lançamento, categoria “Compra de estoque”).
                        </span>
                      </Dica>
                    </span>
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

              {/* E14 (o Heitor, 13/11: "Na entrada no estoque, escolhe fornecedor e
                  marca"): a marca e o fornecedor DESTA entrada, das listas da rede. */}
              <div className="form-2col">
                <CampoDaLista lista="marcas" rotulo="Marca" nome="initial_marca_id" itens={marcas} placeholder="Buscar ou criar marca…" />
                <CampoDaLista lista="fornecedores" rotulo="Fornecedor" nome="initial_fornecedor_id" itens={fornecedores} placeholder="Buscar ou criar fornecedor…" />
              </div>

              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('nota')}>Nota fiscal</Label>
                  <input id={id('nota')} name="initial_nota_fiscal" type="text" maxLength={60} className="field" placeholder="Número da nota" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={id('obs')}>Observações</Label>
                  <input id={id('obs')} name="initial_notes" type="text" className="field" placeholder="Ex: compra inicial" />
                </div>
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

// -- O estoque inicial por unidade (E11, E13 e EQ1d) -------------------
function EstoqueInicialPorUnidade({ branches, unidadeAtual, id }: {
  branches:      { id: string; name: string }[]
  unidadeAtual?: string
  id:            (campo: string) => string
}) {
  const proxima = useRef(1)
  const [linhas, setLinhas] = useState<{ chave: number; unidade: string }[]>(
    () => [{ chave: 0, unidade: unidadeInicial(branches, unidadeAtual) }],
  )
  const escolhidas = new Set(linhas.map(l => l.unidade).filter(Boolean))
  const sobram = branches.filter(b => !escolhidas.has(b.id))

  function dividir() {
    // Com uma unidade sobrando, ela vem escolhida (unicaOpcao); com mais, nenhuma.
    setLinhas(ls => [...ls, { chave: proxima.current++, unidade: unicaOpcao(sobram) }])
  }

  // Uma unidade só (ou o chamador sem unidades, que grava na unidade do contexto): sem lista.
  if (branches.length <= 1) {
    return (
      <div className="form-2col">
        {branches.length === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="field-label" style={{ textAlign: 'left', letterSpacing: '0.04em' }}>Unidade que recebe o estoque</span>
            <input type="hidden" name="_branchId" value={branches[0]!.id} />
            <p data-unidade-travada className="field" aria-readonly="true"
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'default' }}>
              {branches[0]!.name}
            </p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label htmlFor={id('qtd-0')}>Quantidade *</Label>
          <input id={id('qtd-0')} name="initial_qty" type="number" step="0.001" min="0.001" required className="field" placeholder="0" />
        </div>
      </div>
    )
  }

  return (
    <div role="group" aria-label="Unidades que recebem o estoque" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {linhas.map((linha, i) => {
        const outras = new Set(linhas.filter(l => l.chave !== linha.chave).map(l => l.unidade).filter(Boolean))
        return (
          <div key={linha.chave} data-linha-do-estoque-inicial style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '2 1 0', minWidth: 0 }}>
              {i === 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                  <Label htmlFor={id(`unidade-${linha.chave}`)}>Unidade que recebe o estoque *</Label>
                  {linhas.length > 1 && (
                    <Dica rotulo="Sobre a divisão entre unidades">
                      Cada unidade recebe a quantidade da linha dela, com o mesmo custo, lote, validade, marca, fornecedor e nota.
                    </Dica>
                  )}
                </span>
              )}
              <select id={id(`unidade-${linha.chave}`)} name="_branchId" required className="field"
                aria-label={i === 0 ? undefined : 'Unidade que recebe o estoque'}
                value={linha.unidade}
                onChange={e => { const v = e.target.value; setLinhas(ls => ls.map(l => l.chave === linha.chave ? { ...l, unidade: v } : l)) }}>
                {/* Sobra da F33 (8ª simulação; princípio 3): sem unidade escolhida, a pessoa escolhe. */}
                <option value="">Selecione a unidade…</option>
                {branches.filter(b => !outras.has(b.id)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 0', minWidth: 0 }}>
              {i === 0 && <Label htmlFor={id(`qtd-${linha.chave}`)}>Quantidade *</Label>}
              <input id={id(`qtd-${linha.chave}`)} name="initial_qty" type="number" step="0.001" min="0.001" required className="field" placeholder="0"
                aria-label={i === 0 ? undefined : 'Quantidade'} />
            </div>
            {i > 0 && (
              <button type="button" aria-label="Tirar esta unidade" title="Tirar esta unidade"
                onClick={() => setLinhas(ls => ls.filter(l => l.chave !== linha.chave))}
                style={{
                  width: 'var(--altura-controle)', height: 'var(--altura-controle)', flexShrink: 0, marginBottom: 2,
                  borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                <X size={14} />
              </button>
            )}
          </div>
        )
      })}
      {sobram.length > 0 && (
        <button type="button" className="btn-secondary" onClick={dividir} style={{ alignSelf: 'flex-start', fontSize: 'var(--text-xs-sz)' }}>
          <Plus size={13} /> Dividir com outra unidade
        </button>
      )}
    </div>
  )
}

// -- Form de criação ---------------------------------------------------
function CreateForm({ marcas, fornecedores, categories, branches, unidadeAtual, onClose, onSuccess }: {
  marcas: ItemDaLista[]
  fornecedores: ItemDaLista[]
  categories: ItemDaLista[]
  branches?:  { id: string; name: string }[]
  unidadeAtual?: string
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
        marcas={marcas} fornecedores={fornecedores} categories={categories} branches={branches} unidadeAtual={unidadeAtual} onClose={onClose}
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
function EditForm({ product, categories, onClose, onSuccess }: {
  product:    StockProduct
  categories: ItemDaLista[]
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
      {/* O "como corrigir uma entrada errada" mora na dica do título (A19 da 19ª). */}
      <ProductFields
        product={product} categories={categories} onClose={onClose}
        state={error ? { error } : undefined}
        pending={pending} submitLabel="Salvar"
      />
    </form>
  )
}

// -- Modal wrapper -----------------------------------------------------
export const StockProductModal = forwardRef<StockProductModalHandle, Props>(
  function StockProductModal({ product, trigger, marcas = [], fornecedores = [], categories = [], branches = [], unidadeAtual, onSuccess }, ref) {
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
                  {isEdit ? 'Editar produto' : 'Novo produto'}
                </h2>
                {/* A19 da 19ª (princípio 7): o custo de um lote errado não se acerta aqui nem por Ajuste
                    (a diferença vira perda) — desfaz-se a entrada e lança-se de novo. Na dica do
                    título (2026-11-16). */}
                {isEdit && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                    <Dica rotulo="Como corrigir uma entrada errada">
                      <span data-desfazer-entrada>
                        Lançou uma entrada com a quantidade ou o custo errado? Em “Movimentar” → Histórico, use “Desfazer entrada” e lance de novo.
                        O custo aqui é o do cadastro; o de cada lote é o da entrada.
                      </span>
                    </Dica>
                  </span>
                )}
              </div>
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
              ? <EditForm key={`${product.id}-${formKey}`} product={product} categories={categories} onClose={close} onSuccess={handleSuccess} />
              : <CreateForm key={formKey} marcas={marcas} fornecedores={fornecedores} categories={categories} branches={branches} unidadeAtual={unidadeAtual} onClose={close} onSuccess={handleSuccess} />
            }
          </div>
        </dialog>
      </>
    )
  },
)
