'use client'

import { useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'
import { ProcedureForm, type ModelosDoProcedimento, type SalaDoCadastro, type ProfissionalDoCadastro } from './procedure-form'
import type { DadosDaComissao } from './comissao-do-procedimento'
import { useUmaUnidade } from '@/components/shared/uma-unidade'

interface Branch  { id: string; name: string }
interface Product { id: string; name: string; unit: string; branch_name: string | null; cost_price?: number | null }

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
  procedure_products: { product_id: string; quantity: number }[]
  branch_pricing?: { branch_id: string; price: number | null; labor_cost: number | null }[]
  form_id?: string | null
  consent_template_id?: string | null
  contract_template_id?: string | null
  loyalty_points?: number | null
  room_ids?: string[]
  /** Quem realiza (por-01). */
  professional_ids?: string[]
}

interface ProcedureModalProps {
  /** As salas ativas da rede (D5): o procedimento se liga às em que é feito. */
  salas?: SalaDoCadastro[]
  /** Quem atende na rede (por-01): o "Quem realiza" do procedimento. */
  profissionais?: ProfissionalDoCadastro[]
  branches: Branch[]
  products: Product[]
  fichas?: { id: string; name: string }[]
  existing?: ExistingProcedure
  trigger?: React.ReactNode
  pontosDeFidelidade?: boolean
  modelos?: ModelosDoProcedimento
  /** As categorias ativas da rede (Procedimentos → Categorias). */
  categorias?: string[]
  /** A comissão do procedimento — só para o financeiro da rede. */
  comissao?: DadosDaComissao
}

export function ProcedureModal({ salas = [], profissionais = [], branches, products, fichas = [], existing, trigger, pontosDeFidelidade = false, modelos, categorias, comissao }: ProcedureModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router    = useRouter()
  const umaUnidade = useUmaUnidade()

  /**
   * Cada abertura monta um formulário NOVO (a `key` muda). O diálogo só
   * esconde, não desmonta: sem isto, o segundo "Novo procedimento" abria com os
   * campos do anterior e o aviso de sucesso dele (visto pelo Heitor em
   * produção, 2026-09-28).
   */
  const [abertura, setAbertura] = useState(0)
  // A4 da 8ª: o formulário só existe com a janela ABERTA — montado escondido em
  // cada linha, a tela tinha N+1 formulários (`name=price` repetido).
  const [aberto, setAberto] = useState(false)
  const open  = useCallback(() => {
    setAbertura(n => n + 1)
    setAberto(true)
    dialogRef.current?.showModal()
  }, [])
  const close = useCallback(() => dialogRef.current?.close(), [])

  function handleSuccess() {
    close()
    router.refresh()
  }

  const isEdit = !!existing

  return (
    <>
      <span onClick={open} style={{ cursor: 'pointer' }}>
        {trigger ?? (
          <button type="button" className="btn-primary">
            <Sparkles size={15} />
            Novo procedimento
          </button>
        )}
      </span>

      <dialog
        ref={dialogRef}
        className="modal modal-flex"
        style={{ maxWidth: 640 }}
        onClick={e => { if (e.target === dialogRef.current) close() }}
        onClose={() => setAberto(false)}
      >
        {/* Wrapper visual: arredondamento + overflow na mesma camada → scrollbar clipada corretamente */}
        <div className="modal-container">
          {/* Cabeçalho fixo */}
          <div style={{
            flexShrink: 0,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--hairline)',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
                {isEdit ? 'Editar procedimento' : 'Novo procedimento'}
              </h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                {isEdit ? existing!.name : umaUnidade ? 'Catálogo da clínica' : 'Catálogo da rede · disponível nas unidades selecionadas'}
              </p>
            </div>
            <button
              type="button" onClick={close}
              style={{
                width: 32, height: 32, borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg-app)',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
              aria-label="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          {/* Corpo rolável */}
          <div className="modal-body" style={{ padding: '24px 24px 28px' }}>
            {aberto && <ProcedureForm
              key={abertura}
              salas={salas}
              profissionais={profissionais}
              branches={branches}
              products={products}
              fichas={fichas}
              existing={existing}
              pontosDeFidelidade={pontosDeFidelidade}
              modelos={modelos}
              categorias={categorias}
              comissao={comissao}
              onSuccess={handleSuccess}
              onCancel={close}
            />}
          </div>
        </div>
      </dialog>
    </>
  )
}
