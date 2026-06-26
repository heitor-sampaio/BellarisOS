'use client'

import {
  useRef, useCallback, useActionState, useEffect,
  useState, forwardRef, useImperativeHandle,
} from 'react'
import { useRouter } from 'next/navigation'
import { X, UserPlus, CheckCircle2, Check } from 'lucide-react'
import { createLead, updateLead } from '@/actions/leads'
import type { CRMStage } from '@/actions/crm-stages'
import type { Lead } from './crm-board'

const SOURCES = ['Instagram', 'Google', 'Indicação', 'WhatsApp', 'Site', 'Evento', 'Outro']

export interface Procedure { id: string; name: string }

interface ExistingLead {
  id:             string
  name:           string
  phone?:         string | null
  email?:         string | null
  social_media?:  string | null
  source?:        string | null
  notes?:         string | null
  crm_stage_id?:  string | null
  lead_procedures?: { procedure_id: string }[]
}

export interface CRMLeadModalHandle {
  open: () => void
}

export interface CRMBranch { id: string; name: string; slug: string }

interface CRMLeadModalProps {
  /** Modo filial: passar branchId + slug diretamente */
  branchId?:       string
  slug?:           string
  /** Modo rede: passar lista de filiais; exibe seletor */
  branches?:       CRMBranch[]
  stages:          CRMStage[]
  procedures:      Procedure[]
  initialStageId?: string
  existing?:       ExistingLead
  trigger?:        React.ReactNode
  onLeadCreated?:  (lead: Lead) => void
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 'var(--text-xs-sz)', fontWeight: 700,
      color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      {children}
    </label>
  )
}

export const CRMLeadModal = forwardRef<CRMLeadModalHandle, CRMLeadModalProps>(
  function CRMLeadModal(
    { branchId, slug, branches, stages, procedures, initialStageId, existing, trigger, onLeadCreated },
    ref,
  ) {
    const isEdit    = !!existing
    const action    = isEdit ? updateLead : createLead
    const dialogRef = useRef<HTMLDialogElement>(null)
    const router    = useRouter()

    const [state, formAction, pending] = useActionState(action, undefined)
    const [phone,           setPhone]           = useState(existing?.phone ?? '')
    const [selectedProcs,   setSelectedProcs]   = useState<string[]>(
      existing?.lead_procedures?.map(lp => lp.procedure_id) ?? [],
    )
    const [stageId, setStageId] = useState(
      existing?.crm_stage_id ?? initialStageId ?? stages[0]?.id ?? '',
    )
    const [selectedBranchId, setSelectedBranchId] = useState(
      branchId ?? branches?.[0]?.id ?? '',
    )

    const networkMode    = !!branches && branches.length > 0
    const activeBranchId = networkMode ? selectedBranchId : (branchId ?? '')
    const activeBranchSlug = networkMode
      ? (branches!.find(b => b.id === selectedBranchId)?.slug ?? '')
      : (slug ?? '')

    const open = useCallback(() => {
      setPhone(existing?.phone ?? '')
      setSelectedProcs(existing?.lead_procedures?.map(lp => lp.procedure_id) ?? [])
      setStageId(existing?.crm_stage_id ?? initialStageId ?? stages[0]?.id ?? '')
      dialogRef.current?.showModal()
    }, [existing, initialStageId, stages])

    const close = useCallback(() => dialogRef.current?.close(), [])

    useImperativeHandle(ref, () => ({ open }), [open])

    useEffect(() => {
      if (!state?.success) return
      close()
      if (!isEdit && 'leadId' in state && onLeadCreated) {
        const newLead: Lead = {
          id:           state.leadId as string,
          name:         (dialogRef.current?.querySelector<HTMLInputElement>('[name="name"]')?.value ?? '').trim(),
          phone:        phone || null,
          email:        (dialogRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.value ?? '').trim() || null,
          social_media: (dialogRef.current?.querySelector<HTMLInputElement>('[name="social_media"]')?.value ?? '').trim() || null,
          source:       (dialogRef.current?.querySelector<HTMLSelectElement>('[name="source"]')?.value ?? '') || null,
          notes:        (dialogRef.current?.querySelector<HTMLTextAreaElement>('[name="notes"]')?.value ?? '').trim() || null,
          crm_stage_id: stageId || null,
          client_id:    null,
          created_at:   (state.createdAt as string) ?? new Date().toISOString(),
          lead_procedures: selectedProcs.map(pid => ({
            procedure_id: pid,
            procedures:   procedures.find(p => p.id === pid)
              ? { name: procedures.find(p => p.id === pid)!.name }
              : null,
          })),
        }
        onLeadCreated(newLead)
      } else {
        router.refresh()
      }
    }, [state?.success])

    function toggleProc(id: string) {
      setSelectedProcs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    return (
      <>
        {trigger && (
          <span onClick={open} style={{ cursor: 'pointer', display: 'contents' }}>
            {trigger}
          </span>
        )}

        <dialog ref={dialogRef} className="modal" onClick={e => { if (e.target === dialogRef.current) close() }}>
          {/* Header */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 1,
            background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
                {isEdit ? 'Editar lead' : 'Novo lead'}
              </h2>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {isEdit ? existing!.name : 'Adicionar contato ao funil de CRM'}
              </p>
            </div>
            <button type="button" onClick={close} style={{
              width: 32, height: 32, borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-app)',
              color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 24px 28px' }}>
            <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input type="hidden" name="_branchId"     value={activeBranchId} />
              <input type="hidden" name="_slug"         value={activeBranchSlug} />
              <input type="hidden" name="procedure_ids" value={JSON.stringify(selectedProcs)} />
              {isEdit && <input type="hidden" name="_leadId" value={existing!.id} />}

              {/* Filial — seletor visível apenas no modo rede */}
              {networkMode && !isEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Filial</Label>
                  <select
                    className="field"
                    value={selectedBranchId}
                    onChange={e => setSelectedBranchId(e.target.value)}
                  >
                    {branches!.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nome */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Nome *</Label>
                <input name="name" type="text" required className="field"
                  defaultValue={existing?.name} placeholder="Nome do contato" />
              </div>

              {/* Contato */}
              <div>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 4 }}>
                  CONTATO <span style={{ color: 'var(--brand)' }}>*</span>
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10 }}>
                  Preencha pelo menos um dos campos abaixo
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', minWidth: 80 }}>Telefone</span>
                    <input name="phone" type="tel" className="field" style={{ flex: 1 }}
                      value={phone} onChange={e => setPhone(maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', minWidth: 80 }}>E-mail</span>
                    <input name="email" type="email" className="field" style={{ flex: 1 }}
                      defaultValue={existing?.email ?? ''} placeholder="contato@email.com" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', minWidth: 80 }}>Rede social</span>
                    <input name="social_media" type="text" className="field" style={{ flex: 1 }}
                      defaultValue={existing?.social_media ?? ''} placeholder="@usuario ou link do perfil" />
                  </div>
                </div>
              </div>

              {/* Procedimentos */}
              <div>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 10 }}>
                  PROCEDIMENTOS DE INTERESSE
                </p>
                {procedures.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 0' }}>
                    Nenhum procedimento cadastrado. Acesse o portal admin para cadastrar.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto', padding: '2px 0' }}>
                      {procedures.map(p => {
                        const selected = selectedProcs.includes(p.id)
                        return (
                          <button key={p.id} type="button" onClick={() => toggleProc(p.id)} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 99, cursor: 'pointer',
                            border: selected ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                            background: selected ? 'var(--brand-soft)' : 'var(--bg-app)',
                            color: selected ? 'var(--brand)' : 'var(--text-muted)',
                            transition: 'all 120ms',
                          }}>
                            {selected && <Check size={11} strokeWidth={3} />}
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                    {selectedProcs.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                        {selectedProcs.length} selecionado{selectedProcs.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Origem + Etapa */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Origem</Label>
                  <select name="source" className="field" defaultValue={existing?.source ?? ''}>
                    <option value="">Não informado</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Etapa</Label>
                  <select name="crm_stage_id" className="field"
                    value={stageId} onChange={e => setStageId(e.target.value)}>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Observações</Label>
                <textarea name="notes" rows={3} className="field"
                  defaultValue={existing?.notes ?? ''}
                  placeholder="Interesse, contexto, próximos passos…"
                  style={{ resize: 'vertical' }} />
              </div>

              {/* Feedback */}
              {state?.error && (
                <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 700 }}>
                  {state.error}
                </p>
              )}
              {state?.success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 700 }}>
                  <CheckCircle2 size={14} />
                  {isEdit ? 'Lead atualizado.' : 'Lead criado com sucesso.'}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={close} className="btn-secondary" disabled={pending}>
                  Cancelar
                </button>
                <button type="submit" disabled={pending} className="btn-primary">
                  <UserPlus size={15} />
                  {pending ? (isEdit ? 'Salvando…' : 'Criando…') : (isEdit ? 'Salvar' : 'Criar lead')}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      </>
    )
  },
)
