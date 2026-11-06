'use client'

import { useEffect, useState } from 'react'
import { HandCoins, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { profissionaisParaTrocar, reassignProfessional } from '@/actions/appointments'
import { creditosDoAgendamento, usarCreditoNoAgendamento } from '@/actions/creditos'
import type { CreditoParaAgendar } from '@/lib/creditos/credito'

/**
 * Trocar a profissional pela janela do agendamento (A22 da 8ª simulação,
 * 2026-11-06): só se fazia arrastando, sem confirmação, e o histórico dizia só
 * "Remarcado". Só quem ATENDE na unidade do agendamento é oferecida (o
 * "Atende" por unidade, decisão 2), com "(ocupada)" na que tem atendimento no
 * horário; trocar pergunta antes, e o histórico diz "de Fulana para Beltrana"
 * (`reassignProfessional`, que confere tudo de novo).
 */
export function TrocarProfissional({ appointmentId, slug, atual, onTrocou }: {
  appointmentId: string; slug: string; atual: string; onTrocou: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [opcoes, setOpcoes] = useState<{ id: string; name: string; livre: boolean }[] | null>(null)
  const [escolhida, setEscolhida] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    profissionaisParaTrocar(appointmentId).then(r => { if (vivo) setOpcoes(r) }).catch(() => { if (vivo) setOpcoes([]) })
    return () => { vivo = false }
  }, [aberto, appointmentId])
  const nova = opcoes?.find(o => o.id === escolhida) ?? null

  async function trocar() {
    if (!nova) return
    setGravando(true); setErro(null)
    const r = await reassignProfessional(appointmentId, nova.id, slug)
    setGravando(false)
    if (r?.error) { setErro(r.error); setConfirmando(false); return }
    toast.success(`Profissional trocada: agora é ${nova.name}.`)
    onTrocou()
  }

  if (!aberto) {
    return (
      <button type="button" className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setAberto(true)}>
        <UserCog size={14} /> Trocar profissional
      </button>
    )
  }
  return (
    <div data-trocar-profissional style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)' }}>
      <label htmlFor="troca-de-profissional" className="field-label">Nova profissional</label>
      <select id="troca-de-profissional" className="field" style={{ background: 'var(--surface)' }} value={escolhida}
        disabled={!opcoes} onChange={e => { setEscolhida(e.target.value); setConfirmando(false) }}>
        <option value="">{opcoes ? 'Selecione…' : 'Carregando…'}</option>
        {(opcoes ?? []).map(o => <option key={o.id} value={o.id} disabled={!o.livre}>{o.livre ? o.name : `${o.name} (ocupada)`}</option>)}
      </select>
      {opcoes && opcoes.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Ninguém mais atende nesta unidade (o “Atende clientes em”, na Equipe).</p>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
      {confirmando && nova ? (
        <div data-confirmar-troca role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 700 }}>
            Trocar a profissional de {atual} para {nova.name}? O horário fica o mesmo, e as duas são avisadas.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" disabled={gravando} onClick={() => setConfirmando(false)}>Voltar</button>
            <button type="button" className="btn-primary" disabled={gravando} onClick={trocar}>{gravando ? 'Trocando…' : 'Confirmar a troca'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!nova} onClick={() => setConfirmando(true)}>Trocar</button>
        </div>
      )}
    </div>
  )
}

/**
 * O agendamento AVULSO de quem já pagou o MESMO procedimento (A20 da 8ª
 * simulação): "Usar o pacote X (sessão 2 de 3)" liga o crédito a ele, o preço
 * passa a ser a parte da sessão e a recepção não cobra de novo
 * (`usarCreditoNoAgendamento` → `agendamento_usar_credito`, uma transação).
 */
export function UsarOQueJaFoiPago({ appointmentId, onUsou }: { appointmentId: string; onUsou: () => void }) {
  const [creditos, setCreditos] = useState<CreditoParaAgendar[]>([])
  const [gravando, setGravando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    creditosDoAgendamento(appointmentId).then(r => { if (vivo) setCreditos(r) }).catch(() => { /* nada a oferecer */ })
    return () => { vivo = false }
  }, [appointmentId])
  if (!creditos.length) return null

  async function usar(c: CreditoParaAgendar) {
    const chave = `${c.tipo}:${c.id}`
    setGravando(chave); setErro(null)
    const r = await usarCreditoNoAgendamento(appointmentId, chave)
    setGravando(null)
    if (r.error) { setErro(r.error); return }
    toast.success(`Agendamento ligado: ${c.origem}. A recepção não cobra de novo.`)
    onUsou()
  }
  return (
    <div data-usar-o-que-ja-foi-pago style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', marginBottom: 14, background: 'var(--success-soft)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--success-border)' }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 700 }}>
        A cliente já pagou este procedimento, e este agendamento está avulso (seria cobrado à parte).
      </p>
      {creditos.map(c => {
        const chave = `${c.tipo}:${c.id}`
        const qual = c.numero && c.total ? ` (sessão ${c.numero} de ${c.total})` : ''
        return (
          <button key={chave} type="button" className="btn-secondary" disabled={!!gravando} onClick={() => usar(c)}
            style={{ justifyContent: 'center', background: 'var(--surface)' }}>
            <HandCoins size={14} /> {gravando === chave ? 'Ligando…' : `Usar ${c.tipo === 'PACOTE' ? `o pacote ${c.origem}` : 'o pré-pago'}${qual}`}
          </button>
        )
      })}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}
