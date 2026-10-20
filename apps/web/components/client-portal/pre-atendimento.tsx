'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Pencil } from 'lucide-react'
import { AnamnesisFormRenderer, type AnamnesisAnswers } from '@/components/branch/anamnesis-form-renderer'
import { RespostasDaAnamnese } from '@/components/branch/anamnese-geral'
import { responderPreAtendimento, confirmarQueNadaMudou } from '@/actions/pre-atendimento-cliente'
import type { FichaDePreAtendimento, RespostaDaAnamnese } from '@/lib/anamnese-geral'

/**
 * O pré-atendimento no app da cliente (2026-10-20). COMPLETO: a ficha inteira
 * para responder (já com o que ela respondeu antes, se houver). CONFIRMAR
 * (dentro da validade): as respostas de antes, e "Nada mudou" — ou atualizar.
 */
export function PreAtendimentoDaCliente({ modo, ficha, respostasAnteriores, voltar }: {
  modo: 'COMPLETO' | 'CONFIRMAR'
  ficha: FichaDePreAtendimento
  respostasAnteriores: Record<string, RespostaDaAnamnese>
  voltar: string
}) {
  const [enviado, setEnviado] = useState(false)
  const [atualizando, setAtualizando] = useState(modo === 'COMPLETO')
  const [confirmando, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  if (enviado) {
    return (
      <div className="card pre-atendimento-cliente-fim" role="status">
        <CheckCircle2 size={28} color="var(--success)" aria-hidden="true" />
        <p className="pre-atendimento-cliente-titulo">Respostas enviadas</p>
        <p className="pre-atendimento-cliente-texto">Obrigada! A clínica vai conferir com você no atendimento.</p>
        <Link href={voltar} className="btn-secondary">Voltar ao início</Link>
      </div>
    )
  }

  if (!atualizando) {
    return (
      <div className="card pre-atendimento-cliente">
        <p className="pre-atendimento-cliente-titulo">Algo mudou na sua saúde?</p>
        <p className="pre-atendimento-cliente-texto">
          Estas são as suas respostas da última vez. Se nada mudou, é só confirmar.
        </p>
        <RespostasDaAnamnese rows={ficha.rows} respostas={respostasAnteriores} />
        {erro && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>{erro}</p>}
        <div className="pre-atendimento-cliente-acoes">
          <button type="button" className="btn-primary" disabled={confirmando}
            onClick={() => iniciar(async () => {
              setErro(null)
              const r = await confirmarQueNadaMudou()
              if ('error' in r) setErro(r.error)
              else setEnviado(true)
            })}>
            {confirmando ? 'Enviando…' : 'Nada mudou'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setAtualizando(true)}>
            <Pencil size={14} aria-hidden="true" /> Atualizar respostas
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card pre-atendimento-cliente">
      <p className="pre-atendimento-cliente-titulo">Antes do seu atendimento</p>
      <p className="pre-atendimento-cliente-texto">
        Algumas perguntas sobre a sua saúde. Elas ajudam a clínica a cuidar de você com segurança.
      </p>
      <AnamnesisFormRenderer
        appointmentId="" slug=""
        formName={ficha.nome}
        rows={ficha.rows}
        initial={respostasAnteriores as AnamnesisAnswers}
        canEdit
        semInjetaveis
        rotuloSalvar="Enviar respostas"
        saveAction={async ({ answers }) => {
          const r = await responderPreAtendimento({ respostas: answers })
          if ('error' in r) return { error: r.error }
          setEnviado(true)
          return { ok: true }
        }}
      />
    </div>
  )
}
