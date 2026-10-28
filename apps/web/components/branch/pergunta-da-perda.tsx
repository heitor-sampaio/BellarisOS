'use client'

import { useEffect, useState } from 'react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { listarMotivosDePerda } from '@/actions/crm-motivos'

export interface OpcaoDeMotivo { id: string; nome: string }

/**
 * "Por que perdeu?" — o motivo da perda, ao levar o lead à etapa de desfecho
 * perdido (2026-10-21, decisão do Heitor). A lista é a da rede (Configurar
 * funis); a observação é opcional. O quadro e o painel do inbox abrem esta
 * janela antes de mover.
 */
export function PerguntaDaPerda({ motivos: dados, enviando, erro, onConfirmar, onVoltar }: {
  /** Sem a lista, ela é buscada ao abrir (o painel do inbox). */
  motivos?:    OpcaoDeMotivo[]
  enviando:    boolean
  erro:        string | null
  onConfirmar: (perda: { motivoId: string; obs: string | null }) => void
  onVoltar:    () => void
}) {
  const [motivoId, setMotivoId] = useState('')
  const [obs, setObs] = useState('')
  // O botão não se apaga por falta do motivo: apagado, não diz o que falta (A14, 2026-10-27).
  const [faltou, setFaltou] = useState(false)
  const [buscados, setBuscados] = useState<OpcaoDeMotivo[] | null>(null)
  useEffect(() => {
    if (dados) return
    let vivo = true
    listarMotivosDePerda().then(l => { if (vivo) setBuscados(l) }).catch(() => { if (vivo) setBuscados([]) })
    return () => { vivo = false }
  }, [dados])
  const motivos = dados ?? buscados ?? []
  return (
    <JanelaModal rotulo="Por que perdeu?" largura={420} travado={enviando} onFechar={onVoltar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Por que perdeu?</h2>
        <MotivoDaPerdaCampos motivos={motivos} motivoId={motivoId} obs={obs} onMotivo={v => { setMotivoId(v); setFaltou(false) }} onObs={setObs} />
        {faltou && !motivoId && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>Escolha o motivo da perda para marcar como perdido.</p>}
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={enviando} onClick={onVoltar}>Voltar</button>
          <button type="button" className="btn-primary" disabled={enviando}
            onClick={() => { if (!motivoId) { setFaltou(true); return } onConfirmar({ motivoId, obs: obs.trim() || null }) }}>
            {enviando ? 'Salvando…' : 'Marcar como perdido'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}

/** Os dois campos (motivo e observação) — também dentro do modal do lead. */
export function MotivoDaPerdaCampos({ motivos, motivoId, obs, onMotivo, onObs, nomes, lembrete }: {
  motivos: OpcaoDeMotivo[]
  motivoId: string
  obs: string
  onMotivo: (v: string) => void
  onObs: (v: string) => void
  /** Os nomes no formulário, quando os campos vão num <form> (o modal do lead). */
  nomes?: { motivo: string; obs: string }
  /** Diz, sem esperar o clique, que falta o motivo (o modal do lead salva num botão só). */
  lembrete?: boolean
}) {
  const rotulo = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' } as const
  return (
    <>
      <label style={rotulo}>
        Motivo
        <select className="field" required name={nomes?.motivo} value={motivoId} onChange={e => onMotivo(e.target.value)}>
          <option value="">Escolha o motivo…</option>
          {motivos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        {lembrete && !motivoId && (
          <span role="status" style={{ fontWeight: 600, color: 'var(--danger)' }}>Escolha o motivo da perda para salvar.</span>
        )}
      </label>
      <label style={rotulo}>
        Observação
        <input className="field" name={nomes?.obs} value={obs} onChange={e => onObs(e.target.value)} placeholder="Opcional" maxLength={300} />
      </label>
    </>
  )
}
