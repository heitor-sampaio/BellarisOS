'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Edit2, X } from 'lucide-react'
import { AnamnesisFormRenderer, type AnamnesisFormHandle, type AnamnesisAnswers, type ValidacaoDaFicha } from '@/components/branch/anamnesis-form-renderer'
import { salvarAnamneseGeral } from '@/actions/pre-atendimento'
import { quemRespondeu, anamneseRespondida, type AnamneseGeral, type FichaDePreAtendimento } from '@/lib/anamnese-geral'
import { campoVisivel, type AnamnesisRow } from '@/lib/anamnesis'
import { faltaNaAnamnese, rotulosQueFaltamNaAnamnese } from '@/lib/atendimento/obrigatorias'
import { useFuso } from '@/components/shared/fuso'

/**
 * A anamnese geral da cliente (2026-10-20): as perguntas da FICHA DE
 * PRÉ-ATENDIMENTO da rede — não mais oito campos fixos. Mostra o que foi
 * respondido (com as perguntas de quando foi respondido) e quem respondeu; a
 * equipe edita com as perguntas ATUAIS, e salvar fecha o pré-atendimento
 * pendente da cliente (`salvarAnamneseGeral`).
 */

/**
 * O selo de quem respondeu — ou, com a ficha gravada sem resposta nenhuma, que
 * ela está VAZIA (D2 da simulação de 2026-10-28: a tela dizia "Respondida pela
 * cliente" com os campos em branco).
 */
function SeloDaAnamnese({ anamnese }: { anamnese: AnamneseGeral }) {
  const fuso = useFuso()
  return anamneseRespondida(anamnese)
    ? <span className="anamnese-geral-selo">{quemRespondeu(anamnese, fuso)}</span>
    : <span className="anamnese-geral-selo anamnese-geral-selo-vazia">Ficha de saúde vazia — nenhuma pergunta respondida</span>
}

/** O que foi respondido, pergunta por pergunta (só leitura). */
export function RespostasDaAnamnese({ rows, respostas }: { rows: AnamnesisRow[]; respostas: AnamneseGeral['respostas'] }) {
  const campos = rows.flatMap(r => r.fields)
  return (
    <div className="anamnese-geral-respostas">
      {campos.map(f => {
        if (f.type === 'section') return <p key={f.id} className="anamnese-geral-secao">{f.label}</p>
        // O detalhe que só vale com outra resposta (a alergia no "Sim") não aparece sem ela.
        if (!campoVisivel(f, respostas, campos)) return null
        const v = respostas[f.id]
        const texto = Array.isArray(v) ? v.join(', ') : (v ?? '')
        return (
          <div key={f.id} className="anamnese-geral-resposta">
            <span className="anamnese-geral-pergunta">{f.label}</span>
            <span className={texto ? 'anamnese-geral-valor' : 'anamnese-geral-valor anamnese-geral-vazio'}>{texto || 'Não informado'}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Conferir as obrigatórias da anamnese sem salvar (o "Finalizar" do
 * atendimento — revisão do Heitor, 2026-10-29). Com a ficha só para ler e uma
 * obrigatória sem resposta, o cartão abre para editar e aponta o campo.
 */
export interface AnamneseGeralCartaoHandle { validar: (o?: { rolar?: boolean }) => ValidacaoDaFicha }

export const AnamneseGeralCartao = forwardRef<AnamneseGeralCartaoHandle, {
  anamnese:   AnamneseGeral | null
  fichaAtual: FichaDePreAtendimento
  clientId:   string
  canEdit:    boolean
  /** Dentro da ficha do atendimento: sem o card e o título próprios. */
  embedded?:  boolean
  /** As respostas do rascunho do atendimento (D3): abre editando, com elas. */
  rascunho?:  Record<string, unknown> | null
  /** Cada resposta mudada (o rascunho e o "Finalizar"); `null` depois de salvar. */
  onMudou?:   (respostas: Record<string, unknown> | null) => void
}>(function AnamneseGeralCartao({ anamnese, fichaAtual, clientId, canEdit, embedded = false, rascunho = null, onMudou }, ref) {
  const router = useRouter()
  // Sem anamnese ainda (ou vazia), a ficha já abre para responder (quem pode editar).
  const respondida = anamneseRespondida(anamnese)
  const [editando, setEditando] = useState((!respondida || !!rascunho) && canEdit)
  const renderer = useRef<AnamnesisFormHandle>(null)
  // Abriu para editar por causa de uma obrigatória: aponta o campo depois de montar.
  const [apontar, setApontar] = useState<{ rolar: boolean } | null>(null)
  useEffect(() => {
    if (!apontar || !editando) return
    renderer.current?.validar({ rolar: apontar.rolar })
    setApontar(null) // eslint-disable-line react-hooks/set-state-in-effect -- um pedido só, cumprido depois de o formulário existir
  }, [apontar, editando])

  useImperativeHandle(ref, () => ({
    validar(o = {}) {
      if (editando) return renderer.current?.validar(o) ?? {}
      const falta = faltaNaAnamnese(fichaAtual.rows, anamnese?.respostas ?? {})
      if (!falta) return {}
      if (canEdit) { setEditando(true); setApontar({ rolar: o.rolar !== false }) }
      return { error: falta.mensagem, faltam: rotulosQueFaltamNaAnamnese(fichaAtual.rows, anamnese?.respostas ?? {}) }
    },
  }))

  const corpo = editando ? (
    <AnamnesisFormRenderer
      ref={renderer}
      appointmentId="" slug=""
      formName={fichaAtual.nome}
      rows={fichaAtual.rows}
      initial={(rascunho ?? anamnese?.respostas ?? {}) as AnamnesisAnswers}
      canEdit
      semInjetaveis
      rotuloSalvar="Salvar anamnese"
      onAnswersChange={onMudou}
      saveAction={async ({ answers }) => {
        const r = await salvarAnamneseGeral({ clientId, respostas: answers })
        if ('error' in r) return { error: r.error }
        setEditando(false)
        onMudou?.(null)
        router.refresh()
        return { ok: true }
      }}
    />
  ) : respondida ? (
    <RespostasDaAnamnese rows={anamnese.ficha.rows} respostas={anamnese.respostas} />
  ) : (
    <p className="anamnese-geral-vazio">{anamnese ? 'A ficha de saúde está vazia: nenhuma pergunta foi respondida.' : 'A cliente ainda não respondeu a anamnese.'}</p>
  )

  const acoes = canEdit && (
    editando
      ? respondida && (
          <button type="button" className="btn-ghost" onClick={() => setEditando(false)} style={{ fontSize: 'var(--text-sm-sz)', gap: 5 }}>
            <X size={12} /> Cancelar
          </button>
        )
      : (
          <button type="button" className="btn-secondary" onClick={() => setEditando(true)} style={{ fontSize: 'var(--text-sm-sz)', gap: 5 }}>
            <Edit2 size={12} /> Editar anamnese
          </button>
        )
  )

  if (embedded) {
    return (
      <div data-anamnese-geral className="anamnese-geral">
        <div className="anamnese-geral-topo">
          {anamnese && (!editando || !respondida) && <SeloDaAnamnese anamnese={anamnese} />}
          <span style={{ flex: 1 }} />
          {acoes}
        </div>
        {corpo}
      </div>
    )
  }

  return (
    <div data-anamnese-geral className="card anamnese-geral" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="anamnese-geral-cabeca">
        <ClipboardList size={15} style={{ color: 'var(--brand)' }} aria-hidden="true" />
        <h3 className="anamnese-geral-titulo">Anamnese</h3>
        {anamnese && (!editando || !respondida) && <SeloDaAnamnese anamnese={anamnese} />}
        {acoes}
      </div>
      <div style={{ padding: '18px 20px' }}>{corpo}</div>
    </div>
  )
})

/** Na AVALIAÇÃO a anamnese é salva junto com o plano: o handle colhe as respostas. */
export interface AnamneseNaAvaliacaoHandle {
  coletar: () => Promise<{ respostas?: Record<string, unknown>; error?: string }>
  /** Aponta as obrigatórias vazias, sem colher (o "Finalizar" — 2026-10-29; todas de uma vez desde o A30). */
  validar: (o?: { rolar?: boolean }) => ValidacaoDaFicha
}

export const AnamneseNaAvaliacao = forwardRef<AnamneseNaAvaliacaoHandle, {
  anamnese: AnamneseGeral | null
  fichaAtual: FichaDePreAtendimento
  /** As respostas do rascunho do atendimento (D3): o formulário nasce com elas. */
  rascunho?: Record<string, unknown> | null
  /** Cada resposta mudada (o rascunho e o "Finalizar" — D3). */
  onMudou?: (respostas: Record<string, unknown>) => void
}>(function AnamneseNaAvaliacao({ anamnese, fichaAtual, rascunho = null, onMudou }, ref) {
  const fuso = useFuso()
  const renderer = useRef<AnamnesisFormHandle>(null)
  const colhidas = useRef<Record<string, unknown> | null>(null)

  useImperativeHandle(ref, () => ({
    async coletar() {
      colhidas.current = null
      const r = await renderer.current?.save()
      if (r?.error) return { error: r.error }
      return { respostas: colhidas.current ?? {} }
    },
    validar: (o?: { rolar?: boolean }) => renderer.current?.validar(o) ?? {},
  }))

  return (
    <div data-anamnese-geral className="card anamnese-geral" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="anamnese-geral-cabeca" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <h3 className="anamnese-geral-titulo">Anamnese</h3>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
          {anamnese && anamneseRespondida(anamnese) ? quemRespondeu(anamnese, fuso) : 'As perguntas da ficha de pré-atendimento da clínica'}
        </p>
        {anamnese && !anamneseRespondida(anamnese) && <SeloDaAnamnese anamnese={anamnese} />}
      </div>
      <div style={{ padding: '18px 20px' }}>
        <AnamnesisFormRenderer
          ref={renderer}
          appointmentId="" slug=""
          formName={fichaAtual.nome}
          rows={fichaAtual.rows}
          initial={(rascunho ?? anamnese?.respostas ?? {}) as AnamnesisAnswers}
          canEdit
          semInjetaveis
          hideSaveButton
          onAnswersChange={onMudou}
          saveAction={async ({ answers }) => { colhidas.current = answers; return { ok: true } }}
        />
      </div>
    </div>
  )
})
