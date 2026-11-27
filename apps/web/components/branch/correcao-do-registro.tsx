'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PencilLine } from 'lucide-react'
import { saveDraftNotes } from '@/actions/appointments'
import { AnamnesisFormRenderer, type AnamnesisAnswers, type AnamnesisFormHandle } from '@/components/branch/anamnesis-form-renderer'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { Dica } from '@/components/shared/dica'

/**
 * "Corrigir o registro" na aba Prontuário da ficha (D4 da 31ª simulação; PT-11:
 * corrigir o concluído pede o Prontuário em Gerenciar, e só ele — o Heitor,
 * 23/11, "3 - ok"; CLAUDE.md §11: o clínico é do Prontuário em Gerenciar, sem
 * precisar atender). O "Editar registro" só existia na tela do atendimento, que
 * abre com o Atendimento: quem tinha só o Prontuário lia e não corrigia.
 *
 * Grava pelas MESMAS actions do atendimento: a evolução e a intercorrência por
 * `saveDraftNotes`, a ficha do procedimento por `salvarFichaDoProcedimento` (o
 * renderer) — no concluído, as duas passam por `prontuario_corrigir_registro`,
 * que guarda a versão de antes com quem corrigiu. As actions conferem a
 * permissão, a rede e o alcance; a tela só oferece no concluído, a quem anota.
 * O planejador de injetáveis da ficha fica só para ler (mexer no mapa é do
 * atendimento, PT-16).
 */
export function CorrecaoDoRegistro({ appointmentId, slug, evolucao, intercorrencias, ficha }: {
  appointmentId:   string
  slug:            string
  evolucao:        string | null
  intercorrencias: string | null
  ficha:           { name: string; rows: AnamnesisRow[]; answers: Record<string, unknown> } | null
}) {
  const router = useRouter()
  const fichaRef = useRef<AnamnesisFormHandle>(null)
  const [aberta, setAberta] = useState(false)
  const [notas, setNotas] = useState(evolucao ?? '')
  const [interc, setInterc] = useState(intercorrencias ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // P1 da 37ª (PT-11): a ficha só se grava se quem corrige mexeu nela. Gravada
  // sempre, a do planejador de injetáveis voltava com um retrato novo e criava
  // uma SEGUNDA versão, a "Como estava", já com a evolução nova.
  const [fichaMexida, setFichaMexida] = useState(false)
  const id = (campo: string) => `correcao-${campo}-${appointmentId}`

  function cancelar() {
    setAberta(false); setErro(null); setFichaMexida(false)
    setNotas(evolucao ?? ''); setInterc(intercorrencias ?? '')
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    // A ficha primeiro confere as obrigatórias (sem gravar nada se faltar).
    const falta = fichaRef.current?.validar()
    if (falta?.error) { setSalvando(false); setErro(falta.error); return }
    if (notas.trim() !== (evolucao ?? '').trim() || interc.trim() !== (intercorrencias ?? '').trim()) {
      const fd = new FormData()
      fd.set('appointment_id', appointmentId)
      fd.set('notes', notas)
      fd.set('intercurrences', interc)
      const r = await saveDraftNotes(null, fd)
      if (r.error) { setSalvando(false); setErro(r.error); return }
    }
    const daFicha = fichaMexida ? await fichaRef.current?.save() : undefined
    setSalvando(false)
    if (daFicha?.error) { setErro(daFicha.error); return }
    setAberta(false); setFichaMexida(false)
    router.refresh()
  }

  if (!aberta) {
    return (
      <div data-corrigir-registro style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <Dica rotulo="Sobre a correção">
          Corrigir troca a evolução, as intercorrências e a ficha deste atendimento. A versão de antes fica guardada, com o seu nome e a data.
        </Dica>
        <button type="button" onClick={() => setAberta(true)} className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-sm-sz)' }}>
          <PencilLine size={13} aria-hidden="true" /> Corrigir o registro
        </button>
      </div>
    )
  }

  return (
    <div data-corrigir-registro="aberto" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)' }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>Corrigir o registro deste atendimento</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor={id('evolucao')} className="field-label">Evolução</label>
        <textarea id={id('evolucao')} value={notas} onChange={e => setNotas(e.target.value)} rows={4} className="field" style={{ resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor={id('intercorrencias')} className="field-label">Intercorrências</label>
        <textarea id={id('intercorrencias')} value={interc} onChange={e => setInterc(e.target.value)} rows={2} className="field" style={{ resize: 'vertical' }} />
      </div>
      {ficha && ficha.rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p className="field-label">{ficha.name}</p>
          <AnamnesisFormRenderer ref={fichaRef} appointmentId={appointmentId} slug={slug}
            formName={ficha.name} rows={ficha.rows} initial={ficha.answers as AnamnesisAnswers}
            canEdit hideSaveButton semInjetaveis
            onAnswersChange={respostas => setFichaMexida(JSON.stringify(respostas) !== JSON.stringify(ficha.answers))} />
        </div>
      )}
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
        A versão de antes fica guardada, com o seu nome e a data.
      </p>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={cancelar} disabled={salvando} className="btn-secondary">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className="btn-primary" style={{ gap: 6 }}>
          {salvando && <Loader2 size={13} className="animate-spin" />} Salvar correção
        </button>
      </div>
    </div>
  )
}
