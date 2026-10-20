'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Pencil } from 'lucide-react'
import { ConstrutorDeFicha } from '@/components/admin/construtor-de-ficha'
import { salvarFichaDePreAtendimento, definirEnvioDoPreAtendimento } from '@/actions/pre-atendimento'
import { TIPOS_FORA_DO_PRE_ATENDIMENTO } from '@/lib/anamnese-geral'
import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * Configurações → Fichas → a ficha de pré-atendimento (2026-10-20): UMA por
 * rede, com as perguntas sobre a PESSOA, que a cliente responde ao ser
 * agendada (pelo app ou pelo link) e a equipe vê na sessão. Aqui a rede edita
 * as perguntas e decide se a ficha é mandada e por quanto tempo a resposta vale.
 */
export function SettingsPreAtendimento({ ficha, envio, validadeMeses, podePersonalizar }: {
  ficha: { id: string; name: string; rows: AnamnesisRow[] } | null
  envio: boolean
  validadeMeses: number
  /** Personalizar fichas é do plano (`fichas`): fora dele, a ficha fica como está. */
  podePersonalizar: boolean
}) {
  const router = useRouter()
  const idEnvio = useId()
  const idValidade = useId()
  const [editando, setEditando] = useState(false)
  const [ligado, setLigado] = useState(envio)
  const [meses, setMeses] = useState(String(validadeMeses))
  const [salvando, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const perguntas = (ficha?.rows ?? []).reduce((s, r) => s + r.fields.filter(f => f.type !== 'section').length, 0)

  function salvarEnvio() {
    setAviso(null)
    iniciar(async () => {
      const r = await definirEnvioDoPreAtendimento({ envio: ligado, validadeMeses: Number(meses) })
      setAviso('error' in r ? { tipo: 'erro', texto: r.error } : { tipo: 'ok', texto: 'Envio salvo.' })
      if (!('error' in r)) router.refresh()
    })
  }

  if (editando && ficha) {
    return (
      <div className="card" style={{ padding: '20px 11px' }} data-pre-atendimento>
        <ConstrutorDeFicha
          existing={ficha}
          onDone={() => { setEditando(false); router.refresh() }}
          updateAction={salvarFichaDePreAtendimento}
          tiposFora={TIPOS_FORA_DO_PRE_ATENDIMENTO}
          nomeFixo
        />
      </div>
    )
  }

  return (
    <section className="card pre-atendimento-config" data-pre-atendimento aria-labelledby={`${idEnvio}-titulo`}>
      <div className="pre-atendimento-config-cabeca">
        <span className="pre-atendimento-config-icone" aria-hidden="true"><ClipboardCheck size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={`${idEnvio}-titulo`} className="pre-atendimento-config-titulo">Ficha de pré-atendimento</h3>
          <p className="pre-atendimento-config-texto">
            As perguntas sobre a cliente — alergias, medicamentos, condições de saúde —, iguais para qualquer
            atendimento. Ela responde antes de chegar, pelo app ou por um link, e a equipe confere na sessão.
          </p>
          <p className="pre-atendimento-config-texto" style={{ marginTop: 4 }}>
            {perguntas === 1 ? '1 pergunta' : `${perguntas} perguntas`}
          </p>
        </div>
        {podePersonalizar && ficha && (
          <button type="button" className="btn-secondary" onClick={() => setEditando(true)}>
            <Pencil size={14} /> Editar perguntas
          </button>
        )}
      </div>

      <div className="pre-atendimento-config-envio">
        <label htmlFor={idEnvio} className="pre-atendimento-config-opcao">
          <input id={idEnvio} type="checkbox" checked={ligado} onChange={e => setLigado(e.target.checked)} />
          <span>Mandar a ficha quando a cliente for agendada</span>
        </label>
        <div className="pre-atendimento-config-validade">
          <label htmlFor={idValidade} className="field-label">Validade das respostas (meses)</label>
          <input id={idValidade} className="field" type="number" inputMode="numeric" min={1} max={36}
            value={meses} onChange={e => setMeses(e.target.value)} />
          <span className="pre-atendimento-config-dica">
            Dentro da validade, a cliente só confirma se algo mudou; depois dela, responde a ficha inteira.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" disabled={salvando} onClick={salvarEnvio}>
            {salvando ? 'Salvando…' : 'Salvar o envio'}
          </button>
          {aviso && (
            <span role="status" style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: aviso.tipo === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
              {aviso.texto}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
