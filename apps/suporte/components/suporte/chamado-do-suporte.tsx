'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Paperclip } from 'lucide-react'
import { responderComoSuporte, mudarSituacaoDoChamado, assumirChamado, pedirAutorizacao } from '@/actions/chamados-suporte'
import { SITUACOES_DO_CHAMADO, ROTULO_DA_SITUACAO, type SituacaoDoChamado } from '@estetica-os/nucleo/lib/suporte/chamados-regras'

/** A resposta do suporte: para a clínica (avisa no sino) ou nota interna. */
export function RespostaDoSuporte({ chamadoId }: { chamadoId: string }) {
  const [interna, setInterna] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [chave, setChave] = useState(0)
  const [anexo, setAnexo] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()

  function enviar(form: FormData) {
    setErro(null)
    form.set('chamadoId', chamadoId)
    if (interna) form.set('interna', '1')
    iniciar(async () => {
      const r = await responderComoSuporte(form)
      if (!r.ok) { setErro(r.error); return }
      toast.success(interna ? 'Nota interna gravada.' : 'Resposta enviada.')
      setChave(k => k + 1); setAnexo(null)
    })
  }

  return (
    <form key={chave} action={enviar} className="ajuda-form" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
      <label className="ajuda-rotulo">{interna ? 'Nota interna (a clínica não vê)' : 'Responder à clínica'}
        <textarea className="field" name="corpo" required maxLength={5000} rows={4} />
      </label>
      <div className="ajuda-acoes" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="suporte-filtros">
          <button type="button" className="filtro-toggle" aria-pressed={interna} onClick={() => setInterna(v => !v)}>Nota interna</button>
          <label className="btn-secondary" style={{ cursor: 'pointer' }}>
            <Paperclip size={14} /> {anexo ?? 'Anexar imagem'}
            <input type="file" name="anexo" accept="image/png,image/jpeg" hidden onChange={e => setAnexo(e.target.files?.[0]?.name ?? null)} />
          </label>
        </div>
        <div className="suporte-filtros">
          {!interna && (
            <select name="status" className="filtro-select" defaultValue="" aria-label="Situação depois de responder">
              <option value="">Depois: aguardando a clínica</option>
              {SITUACOES_DO_CHAMADO.filter(s => s !== 'aguardando_clinica').map(s => (
                <option key={s} value={s}>Depois: {ROTULO_DA_SITUACAO[s].toLowerCase()}</option>
              ))}
            </select>
          )}
          <button type="submit" className="btn-primary" disabled={gravando}>{gravando ? 'Enviando…' : interna ? 'Gravar nota' : 'Enviar'}</button>
        </div>
      </div>
      {erro && <p className="suporte-erro">{erro}</p>}
    </form>
  )
}

/** Assumir, mudar a situação e pedir autorização de acesso à clínica. */
export function AcoesDoChamado({ chamadoId, status, podePedir }: { chamadoId: string; status: SituacaoDoChamado; podePedir: boolean }) {
  const [gravando, iniciar] = useTransition()
  function rodar(f: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) {
    iniciar(async () => {
      const r = await f()
      if (r.ok) toast.success(ok); else toast.error(r.error)
    })
  }
  return (
    <div className="suporte-pilha" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
      {podePedir && (
        <button type="button" className="btn-secondary" disabled={gravando}
          onClick={() => rodar(() => pedirAutorizacao(chamadoId), 'Pedido enviado à clínica.')}>
          Pedir autorização
        </button>
      )}
      <button type="button" className="btn-secondary" disabled={gravando}
        onClick={() => rodar(() => assumirChamado(chamadoId), 'O chamado é seu.')}>
        Assumir
      </button>
      <select className="filtro-select" value={status} disabled={gravando} aria-label="Situação do chamado"
        onChange={e => rodar(() => mudarSituacaoDoChamado(chamadoId, e.target.value), 'Situação alterada.')}>
        {SITUACOES_DO_CHAMADO.map(s => <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>)}
      </select>
    </div>
  )
}
