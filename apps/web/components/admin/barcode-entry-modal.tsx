'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { X, Barcode, RotateCcw, Loader2, Link2, Search } from 'lucide-react'
import { findProductByBarcode, saveBarcodeToProduct, searchProducts } from '@/actions/stock'

/**
 * O LEITOR de código de barras (C16 do levantamento das regras, 2026-11-12):
 * ele só ACHA o produto (ou liga o código a um produto); a entrada é a do
 * Gerenciar estoque, que o pai abre (`onAchou`). Tinha um formulário próprio
 * que mostrava a quantidade e o custo na unidade de CONSUMO ("ml") enquanto a
 * action lia EMBALAGENS — 100 ml viravam 100 frascos —, sem fornecedor, nota,
 * "Não gera despesa" nem o aviso de validade vencida. Agora é a mesma Entrada.
 */
interface Props {
  onClose: () => void
  /** O produto achado (ou recém-ligado ao código). Devolve false se a tela não o tem. */
  onAchou: (productId: string) => boolean
}

type Step = 'scan' | 'not-found'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
      {children}
    </label>
  )
}
function FieldWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
}

export function BarcodeEntryModal({ onClose, onAchou }: Props) {
  const dialogRef  = useRef<HTMLDialogElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)

  const [step,         setStep]         = useState<Step>('scan')
  const [barcode,      setBarcode]      = useState('')
  const [scanError,    setScanError]    = useState<string>()
  const [isPending,    startTransition] = useTransition()

  // Not-found flow
  const [searchQuery,  setSearchQuery]  = useState('')
  const [searchRes,    setSearchRes]    = useState<{ id: string; name: string; sku: string | null; unit: string; barcode: string | null }[]>([])
  const [linking,      setLinking]      = useState(false)
  const [linkError,    setLinkError]    = useState<string>()
  const [selectedProd, setSelectedProd] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }, [])

  // Auto-search while typing in not-found step
  useEffect(() => {
    if (step !== 'not-found') return
    const t = setTimeout(async () => {
      if (searchQuery.length < 2) { setSearchRes([]); return }
      const res = await searchProducts(searchQuery)
      setSearchRes(res.products)
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, step])

  function resetToScan() {
    setStep('scan')
    setBarcode('')
    setScanError(undefined)
    setSearchQuery('')
    setSearchRes([])
    setSelectedProd(null)
    setLinkError(undefined)
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }

  function handleScan() {
    const code = barcode.trim()
    if (!code) return
    setScanError(undefined)

    startTransition(async () => {
      const res = await findProductByBarcode(code)
      if ('error' in res) {
        // Not found → offer to link
        setStep('not-found')
        setTimeout(() => searchRef.current?.focus(), 50)
      } else if (!onAchou(res.product.id as string)) {
        setScanError('Este produto não está na lista desta tela (desativado?).')
      }
    })
  }

  async function handleLink() {
    if (!selectedProd) return
    setLinking(true)
    setLinkError(undefined)
    const res = await saveBarcodeToProduct(selectedProd.id, barcode.trim())
    setLinking(false)
    if (res.error) { setLinkError(res.error); return }
    // O código ficou ligado: a entrada é a do Gerenciar estoque.
    setSearchQuery('')
    setSearchRes([])
    if (!onAchou(selectedProd.id)) { setStep('scan'); setScanError('Este produto não está na lista desta tela (desativado?).') }
    setSelectedProd(null)
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Barcode size={18} style={{ color: 'var(--brand)' }} />
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Entrada por código de barras
            </h2>
            {step === 'not-found' && (
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                Código não cadastrado · {barcode}
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: '22px 22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* -- Passo 1: leitura -- */}
        {step === 'scan' && (
          <>
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Aponte a leitora para o código de barras do produto ou digite o código manualmente.
            </p>

            <FieldWrap>
              <Label>Código de barras</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={barcodeRef}
                  type="text"
                  className="field"
                  value={barcode}
                  onChange={e => { setBarcode(e.target.value); setScanError(undefined) }}
                  onKeyDown={e => e.key === 'Enter' && handleScan()}
                  placeholder="EAN-13, UPC, EAN-8…"
                  autoComplete="off"
                  style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.08em', fontSize: 'var(--text-base-sz)' }}
                />
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={!barcode.trim() || isPending}
                  className="btn-primary"
                  style={{ gap: 6, flexShrink: 0 }}
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
                  Buscar
                </button>
              </div>
            </FieldWrap>

            {scanError && (
              <p style={{
                fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '8px 12px', borderRadius: 8,
                background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)',
              }}>
                {scanError}
              </p>
            )}
          </>
        )}

        {/* -- Passo 2: produto não encontrado → vincular -- */}
        {step === 'not-found' && (
          <>
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'var(--cat-5-soft)', border: '1.5px solid var(--cat-5-soft)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <Barcode size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--warning)' }}>Código não cadastrado</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', marginTop: 2 }}>
                  Nenhum produto com o código <code style={{ fontFamily: 'monospace', fontWeight: 700 }}>{barcode}</code>.
                  Ligue o código a um produto para registrar a entrada.
                </p>
              </div>
            </div>

            <FieldWrap>
              <Label>Buscar produto para vincular</Label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  type="text"
                  className="field campo-busca"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSelectedProd(null) }}
                  placeholder="Nome do produto…"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </FieldWrap>

            {searchRes.length > 0 && !selectedProd && (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                maxHeight: 220, overflowY: 'auto',
              }}>
                {searchRes.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProd({ id: p.id, name: p.name })}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'var(--surface)',
                      border: 'none', borderBottom: i < searchRes.length - 1 ? '1px solid var(--hairline)' : 'none',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
                  >
                    <div>
                      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
                        {p.sku && <span>{p.sku} · </span>}
                        {p.unit}
                        {p.barcode && <span style={{ color: 'var(--warning)' }}> · já tem código</span>}
                      </p>
                    </div>
                    <Link2 size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            {selectedProd && (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}>
                <div>
                  <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>{selectedProd.name}</p>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>
                    Vincular código <code style={{ fontFamily: 'monospace' }}>{barcode}</code>
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedProd(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {linkError && (
              <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
                {linkError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={resetToScan} className="btn-secondary">
                <RotateCcw size={13} /> Cancelar
              </button>
              <button
                type="button"
                onClick={handleLink}
                disabled={!selectedProd || linking || isPending}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {linking || isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                {linking ? 'Ligando…' : 'Ligar e registrar entrada'}
              </button>
            </div>
          </>
        )}

      </div>
    </dialog>
  )
}
