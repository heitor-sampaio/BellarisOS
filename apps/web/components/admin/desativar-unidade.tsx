'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { JanelaModal } from '@/components/shared/janela-modal'
import { toggleBranchStatus, moverEquipeDaUnidade } from '@/actions/branches'

/**
 * Desativar uma unidade (C67/C61 do levantamento das regras, F70; H6 = a):
 * a janela diz o que fica para trás — quem da equipe é fixo só nela e os
 * agendamentos marcados — e oferece resolver antes: mudar a equipe de
 * unidade e ver os agendamentos. Não impede: "Desativar mesmo assim". A mesma
 * janela nas duas portas (a lista de unidades e o detalhe).
 */
export function DesativarUnidade({
  branchId, nome, resumo, fixos, agendamentos, outras, children, className = 'btn-ghost', style,
}: {
  branchId:     string
  nome:         string
  /** "A unidade X tem 2 pessoas da equipe só nela e 14 agendamentos marcados." (null = nada fica). */
  resumo:       string | null
  fixos:        { id: string; nome: string }[]
  agendamentos: number
  /** As outras unidades ATIVAS da rede: para onde a equipe pode ir. */
  outras:       { id: string; nome: string }[]
  children:     React.ReactNode
  className?:   string
  style?:       React.CSSProperties
}) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [destino, setDestino] = useState(outras[0]?.id ?? '')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [fazendo, iniciar] = useTransition()

  function mover() {
    setAviso(null)
    iniciar(async () => {
      const r = await moverEquipeDaUnidade(branchId, destino)
      if ('error' in r) { setAviso({ ok: false, texto: r.error }); return }
      const para = outras.find(o => o.id === destino)?.nome ?? 'a outra unidade'
      setAviso({ ok: true, texto: r.movidos === 1 ? `1 pessoa passou para ${para}.` : `${r.movidos} pessoas passaram para ${para}.` })
      router.refresh()
    })
  }

  function desativar() {
    setAviso(null)
    iniciar(async () => {
      try {
        await toggleBranchStatus(branchId, false)
        setAberta(false)
        router.refresh()
      } catch {
        setAviso({ ok: false, texto: 'Não deu certo. Tente de novo.' })
      }
    })
  }

  const texto = { fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 } as const
  const quadro = { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' } as const

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setAberta(true)}>{children}</button>
      {aberta && (
        <JanelaModal rotulo="Desativar unidade?" largura={480} travado={fazendo} onFechar={() => setAberta(false)}>
          <div data-desativar-unidade style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Desativar unidade?</h2>
            <p style={texto}>
              <strong style={{ color: 'var(--text)' }}>{nome}</strong> sai do ar: a agenda dela fecha para novos agendamentos,
              e ela some do app das clientes. Dá para reativar depois.
            </p>

            {resumo && <p style={{ ...texto, color: 'var(--text)', fontWeight: 600 }}>{resumo}</p>}

            {fixos.length > 0 && (
              <div className="card-sm" style={quadro}>
                <p style={texto}>
                  {fixos.map(f => f.nome).join(', ')} {fixos.length === 1 ? 'só entra' : 'só entram'} nesta unidade: com ela fora do ar,
                  {fixos.length === 1 ? ' fica' : ' ficam'} sem onde entrar.
                </p>
                {outras.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="filtro-select" aria-label="Para qual unidade" value={destino} onChange={e => setDestino(e.target.value)}>
                      {outras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                    <button type="button" className="btn-secondary" disabled={fazendo || !destino} onClick={mover}>
                      Mudar a equipe de unidade
                    </button>
                  </div>
                ) : (
                  <p style={texto}>Não há outra unidade ativa para receber {fixos.length === 1 ? 'essa pessoa' : 'essas pessoas'}: ajuste em Equipe.</p>
                )}
              </div>
            )}

            {agendamentos > 0 && (
              <div className="card-sm" style={quadro}>
                <p style={texto}>
                  {agendamentos === 1 ? 'O agendamento continua marcado' : `Os ${agendamentos} agendamentos continuam marcados`} depois
                  de desativar. Remarque ou cancele na agenda antes, se for o caso.
                </p>
                <Link href={`/admin/agenda?unidade=${branchId}`} className="btn-secondary" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>
                  Ver os agendamentos
                </Link>
              </div>
            )}

            {aviso && (
              <p role={aviso.ok ? 'status' : 'alert'} style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: aviso.ok ? 'var(--success)' : 'var(--danger)' }}>
                {aviso.texto}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={fazendo} onClick={() => setAberta(false)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={fazendo} onClick={desativar}>
                {fazendo ? 'Um momento…' : resumo ? 'Desativar mesmo assim' : 'Desativar'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
