'use client'

import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Upload, FileText, FileImage, File, FileSpreadsheet,
  Download, Trash2, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { uploadClientDocument, deleteClientDocument } from '@/actions/client-documents'

// -- Types ---------------------------------------------------------------------

export interface ClientDocumentItem {
  id:          string
  name:        string
  category:    string
  fileUrl:     string
  fileName:    string
  fileSize:    number | null
  mimeType:    string | null
  uploadedBy:  string | null
  createdAt:   string
}

interface Props {
  documents: ClientDocumentItem[]
  clientId:  string
  branchId:  string
  slug:      string
}

// -- Constants -----------------------------------------------------------------

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'termo_consentimento', label: 'Termo de consentimento' },
  { value: 'exame',               label: 'Exame' },
  { value: 'laudo',               label: 'Laudo médico' },
  { value: 'contrato',            label: 'Contrato' },
  { value: 'foto_clinica',        label: 'Foto clínica' },
  { value: 'receita',             label: 'Receita' },
  { value: 'outro',               label: 'Outro' },
]

const CATEGORY_COLOR: Record<string, { bg: string; text: string }> = {
  termo_consentimento: { bg: '#fce7ec', text: '#c34d6b' },
  exame:               { bg: '#e7f0fc', text: '#3a6bcc' },
  laudo:               { bg: '#f0e7fc', text: '#7a3acc' },
  contrato:            { bg: '#e7fcf0', text: '#3a9b6f' },
  foto_clinica:        { bg: '#fcf0e7', text: '#cc7a3a' },
  receita:             { bg: '#fcfce7', text: '#9b9b3a' },
  outro:               { bg: 'var(--bg-app)', text: 'var(--text-faint)' },
}

// -- Helpers -------------------------------------------------------------------

function fileSizeLabel(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  const t = mimeType ?? ''
  const style = { color: 'var(--brand)', flexShrink: 0 }
  if (t.startsWith('image/'))            return <FileImage size={18} style={style} />
  if (t === 'application/pdf')           return <FileText  size={18} style={style} />
  if (t.includes('spreadsheet') || t.includes('excel')) return <FileSpreadsheet size={18} style={style} />
  return <File size={18} style={style} />
}

function categoryLabel(cat: string): string {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat
}

// -- Upload form ---------------------------------------------------------------

function UploadForm({
  clientId, branchId, slug, onClose,
}: {
  clientId: string; branchId: string; slug: string; onClose: () => void
}) {
  const formRef     = useRef<HTMLFormElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [state, action, pending] = useActionState(uploadClientDocument, null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFileName(f?.name ?? null)
  }

  // Close on success
  if (state !== null && !state?.error && !pending) {
    onClose()
    return null
  }

  return (
    <form
      ref={formRef}
      action={action}
      style={{
        border: '1.5px dashed var(--brand-soft-border)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--brand-soft)',
        padding: '20px 20px 16px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="slug"      value={slug} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>Novo documento</p>
        <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '2px 4px' }}>
          <X size={14} />
        </button>
      </div>

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Nome do documento *</label>
          <input
            type="text" name="name" required
            placeholder="Ex: Termo de anamnese — Jun 2026"
            className="field"
            style={{ background: 'var(--surface)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Categoria *</label>
          <select name="category" className="field" style={{ background: 'var(--surface)' }}>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* File input */}
      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Arquivo *</label>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-field-token)',
          cursor: 'pointer',
        }}>
          <Upload size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: fileName ? 'var(--text)' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName ?? 'Clique para selecionar…'}
          </span>
          <input
            type="file" name="file" required
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
          PDF, Word, Excel, imagens — máximo 20 MB
        </p>
      </div>

      {state?.error && (
        <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>
          {state.error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary" style={{ gap: 6, minWidth: 120, justifyContent: 'center' }}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {pending ? 'Enviando…' : 'Anexar documento'}
        </button>
      </div>
    </form>
  )
}

// -- Document row --------------------------------------------------------------

function DocumentRow({
  doc, slug, clientId, onDelete,
}: {
  doc: ClientDocumentItem; slug: string; clientId: string; onDelete: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const catColor = CATEGORY_COLOR[doc.category] ?? CATEGORY_COLOR['outro']!

  async function handleDelete() {
    if (!confirm('Excluir este documento? Esta ação não pode ser desfeita.')) return
    setDeleting(true)
    await deleteClientDocument(doc.id, slug, clientId)
    onDelete(doc.id)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 20px',
      borderBottom: '1px solid var(--hairline)',
    }}>
      {/* File type icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'var(--brand-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileIcon mimeType={doc.mimeType} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
          {doc.fileName}
          {doc.fileSize && ` · ${fileSizeLabel(doc.fileSize)}`}
          {` · ${format(new Date(doc.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
          {doc.uploadedBy && ` · por ${doc.uploadedBy}`}
        </p>
      </div>

      {/* Category badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, flexShrink: 0,
        padding: '3px 8px', borderRadius: 10,
        background: catColor.bg, color: catColor.text,
      }}>
        {categoryLabel(doc.category)}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={doc.fileName}
          className="btn-ghost"
          style={{ padding: '6px 8px' }}
          title="Baixar"
        >
          <Download size={14} />
        </a>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn-ghost"
          style={{ padding: '6px 8px', color: 'var(--warning)' }}
          title="Excluir"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// -- Main component ------------------------------------------------------------

export function ClientDocumentsTab({ documents, clientId, branchId, slug }: Props) {
  const router = useRouter()
  const [showForm, setShowForm]   = useState(false)
  const [localDocs, setLocalDocs] = useState(documents)

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, ClientDocumentItem[]>>((acc, cat) => {
    const items = localDocs.filter(d => d.category === cat.value)
    if (items.length) acc[cat.value] = items
    return acc
  }, {})
  const otherDocs = localDocs.filter(d => !CATEGORIES.find(c => c.value === d.category))
  if (otherDocs.length) grouped['outro'] = [...(grouped['outro'] ?? []), ...otherDocs]

  function handleDelete(id: string) {
    setLocalDocs(prev => prev.filter(d => d.id !== id))
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Upload form */}
      {showForm && (
        <UploadForm
          clientId={clientId}
          branchId={branchId}
          slug={slug}
          onClose={() => { setShowForm(false); router.refresh() }}
        />
      )}

      {/* Documents card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px',
          borderBottom: localDocs.length > 0 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={15} style={{ color: 'var(--brand)' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
              Documentos
            </span>
            {localDocs.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                background: 'var(--brand-soft)', color: 'var(--brand)',
              }}>
                {localDocs.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className={showForm ? 'btn-ghost' : 'btn-primary'}
            style={{ gap: 6, fontSize: 12 }}
          >
            {showForm ? <><X size={13} /> Cancelar</> : <><Plus size={13} /> Adicionar documento</>}
          </button>
        </div>

        {/* Empty state */}
        {localDocs.length === 0 && !showForm && (
          <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'var(--brand-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={22} style={{ color: 'var(--brand)' }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
              Nenhum documento anexado
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', maxWidth: 280 }}>
              Adicione termos de consentimento, laudos, exames ou qualquer arquivo do cliente.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn-primary"
              style={{ marginTop: 4, gap: 6 }}
            >
              <Plus size={13} /> Adicionar primeiro documento
            </button>
          </div>
        )}

        {/* Document list grouped by category */}
        {localDocs.length > 0 && Object.entries(grouped).map(([catKey, items]) => {
          const catColor = CATEGORY_COLOR[catKey] ?? CATEGORY_COLOR['outro']!
          const catName  = categoryLabel(catKey)
          return (
            <div key={catKey}>
              {/* Category header */}
              <div style={{
                padding: '8px 20px',
                background: 'var(--bg-app)',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 10,
                  background: catColor.bg, color: catColor.text,
                }}>
                  {catName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {items.length} {items.length === 1 ? 'arquivo' : 'arquivos'}
                </span>
              </div>

              {items.map(doc => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  slug={slug}
                  clientId={clientId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
