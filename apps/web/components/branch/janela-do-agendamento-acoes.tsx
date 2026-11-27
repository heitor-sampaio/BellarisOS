'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, HandCoins, MapPin, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { profissionaisParaTrocar, reassignProfessional, opcoesParaMudarDeUnidade, mudarUnidadeDoAgendamento, type UnidadeParaMudar } from '@/actions/appointments'
import { useUmaUnidade } from '@/components/shared/uma-unidade'
import { creditosDoAgendamento, usarCreditoNoAgendamento } from '@/actions/creditos'
import type { CreditoParaAgendar } from '@/lib/creditos/credito'
import { O_ATENDE_NA_FICHA } from '@/lib/equipe/atende'
import { NINGUEM_LIVRE_NO_HORARIO } from '@/lib/agenda/so-o-que-esta-livre'
import { avisoDeQuemNaoRealiza } from '@/lib/procedimentos/aviso-de-quem-realiza'

/**
 * Trocar quem atende pela janela do agendamento (A22 da 8ª simulação,
 * 2026-11-06): só se fazia arrastando, sem confirmação, e o histórico dizia só
 * "Remarcado". Só quem ATENDE na unidade do agendamento e está LIVRE no horário
 * é oferecida — sem choque e sem bloqueio (R13, o Heitor, 26/11, na página de
 * perguntas: "Só mostra os horarios, salas e pessoas que estão livres"; era
 * "ocupada" desligada). Trocar pergunta antes, e o histórico diz "de Fulana
 * para Beltrana" (`reassignProfessional`, que confere tudo de novo).
 */
export function TrocarProfissional({ appointmentId, slug, atual, onTrocou }: {
  appointmentId: string; slug: string; atual: string; onTrocou: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [lidas, setLidas] = useState<{ livres: { id: string; name: string; realiza: boolean }[]; atendem: number } | null>(null)
  const [escolhida, setEscolhida] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    profissionaisParaTrocar(appointmentId).then(r => { if (vivo) setLidas(r) }).catch(() => { if (vivo) setLidas({ livres: [], atendem: 0 }) })
    return () => { vivo = false }
  }, [aberto, appointmentId])
  const opcoes = lidas?.livres ?? null
  const nova = opcoes?.find(o => o.id === escolhida) ?? null

  async function trocar() {
    if (!nova) return
    setGravando(true); setErro(null)
    const r = await reassignProfessional(appointmentId, nova.id, slug)
    setGravando(false)
    if (r?.error) { setErro(r.error); setConfirmando(false); return }
    toast.success(`Agora quem atende é ${nova.name}.`)
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
      <label htmlFor="troca-de-profissional" className="field-label">Quem vai atender</label>
      <select id="troca-de-profissional" className="field" style={{ background: 'var(--surface)' }} value={escolhida}
        disabled={!opcoes} onChange={e => { setEscolhida(e.target.value); setConfirmando(false) }}>
        <option value="">{opcoes ? 'Selecione…' : 'Carregando…'}</option>
        {(opcoes ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {/* PC-14: quem não realiza o procedimento só avisa — como no novo agendamento. */}
      {nova && !nova.realiza && (
        <p data-aviso-quem-realiza role="status" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--warning)' }}>
          <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          {avisoDeQuemNaoRealiza(nova.name)}
        </p>
      )}
      {/* A lista vazia diz por quê: ninguém mais atende aqui, ou ninguém está livre no horário. */}
      {lidas && opcoes && opcoes.length === 0 && (
        <p data-ninguem-para-trocar style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {lidas.atendem === 0
            ? <>Ninguém mais atende nesta unidade: marque {O_ATENDE_NA_FICHA} no lápis de quem atende aqui, na Equipe.</>
            : `${NINGUEM_LIVRE_NO_HORARIO} Para trocar em outro horário, remarque antes.`}
        </p>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
      {confirmando && nova ? (
        <div data-confirmar-troca role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 700 }}>
            Trocar quem atende de {atual} para {nova.name}? O horário fica o mesmo, e as duas pessoas são avisadas.
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
 * MUDAR A UNIDADE do agendamento pela janela (A33 da 9ª simulação, 2026-11-07;
 * H5: "a cliente é da clínica"): mover a sessão da Luana para a Menino Deus
 * exigia cancelar e refazer. A unidade nova, a profissional que ATENDE lá e a
 * sala (opcional), só as LIVRES no horário (R13, o Heitor, 26/11: "Só mostra os
 * horarios, salas e pessoas que estão livres"); o horário fica. Confirma antes,
 * e o servidor confere tudo de novo (`mudarUnidadeDoAgendamento`). Na clínica
 * de uma unidade, nem aparece.
 */
export function MudarDeUnidade({ appointmentId, unidadeAtual, onMudou }: {
  appointmentId: string; unidadeAtual: string | null; onMudou: () => void
}) {
  const umaUnidade = useUmaUnidade()
  const [aberto, setAberto] = useState(false)
  const [opcoes, setOpcoes] = useState<UnidadeParaMudar[] | null>(null)
  const [unidade, setUnidade] = useState('')
  const [profissional, setProfissional] = useState('')
  const [sala, setSala] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    opcoesParaMudarDeUnidade(appointmentId).then(r => { if (vivo) setOpcoes(r) }).catch(() => { if (vivo) setOpcoes([]) })
    return () => { vivo = false }
  }, [aberto, appointmentId])
  if (umaUnidade) return null
  const nova = opcoes?.find(o => o.id === unidade) ?? null
  const quem = nova?.profissionais.find(p => p.id === profissional) ?? null

  async function mudar() {
    if (!nova || !quem) return
    setGravando(true); setErro(null)
    const r = await mudarUnidadeDoAgendamento(appointmentId, { branchId: nova.id, professionalId: quem.id, roomId: sala || null })
    setGravando(false)
    if (r?.error) { setErro(r.error); setConfirmando(false); return }
    toast.success(`Agendamento mudado para ${nova.nome}, com ${quem.name}.`)
    onMudou()
  }

  if (!aberto) {
    return (
      <button type="button" className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setAberto(true)}>
        <MapPin size={14} /> Mudar de unidade
      </button>
    )
  }
  return (
    <div data-mudar-de-unidade style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)' }}>
      <label htmlFor="mudar-unidade" className="field-label">Unidade nova</label>
      <select id="mudar-unidade" className="field" style={{ background: 'var(--surface)' }} value={unidade} disabled={!opcoes}
        onChange={e => { setUnidade(e.target.value); setProfissional(''); setSala(''); setConfirmando(false) }}>
        <option value="">{opcoes ? 'Selecione a unidade…' : 'Carregando…'}</option>
        {(opcoes ?? []).map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
      {opcoes && opcoes.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Não há outra unidade ao seu alcance para onde mudar.</p>
      )}
      {nova && (
        <>
          <label htmlFor="mudar-profissional" className="field-label">Profissional na unidade nova</label>
          <select id="mudar-profissional" className="field" style={{ background: 'var(--surface)' }} value={profissional}
            onChange={e => { setProfissional(e.target.value); setConfirmando(false) }}>
            <option value="">Selecione…</option>
            {nova.profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {/* A lista vazia diz por quê: ninguém atende lá, ou ninguém está livre no horário. */}
          {nova.profissionais.length === 0 && (
            <p data-ninguem-na-unidade-nova style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {nova.quemAtende === 0
                ? <>Ninguém atende em {nova.nome} ainda: marque {O_ATENDE_NA_FICHA} no lápis de quem atende lá, na Equipe.</>
                : `${NINGUEM_LIVRE_NO_HORARIO} Para mudar para ${nova.nome} em outro horário, remarque antes.`}
            </p>
          )}
          {nova.salas.length > 0 && (
            <>
              <label htmlFor="mudar-sala" className="field-label">Sala (opcional)</label>
              <select id="mudar-sala" className="field" style={{ background: 'var(--surface)' }} value={sala} onChange={e => setSala(e.target.value)}>
                <option value="">Sem sala</option>
                {nova.salas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}
          {nova.salas.length === 0 && nova.salasQueServem > 0 && (
            <p data-nenhuma-sala-livre style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Nenhuma sala de {nova.nome} está livre nesse horário: o agendamento vai sem sala.
            </p>
          )}
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>O horário fica o mesmo; para mudar o horário, use o Remarcar.</p>
        </>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
      {confirmando && nova && quem ? (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 700 }}>
            Mudar o agendamento{unidadeAtual ? ` de ${unidadeAtual}` : ''} para {nova.nome}, com {quem.name}? A cliente é avisada da unidade nova.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" disabled={gravando} onClick={() => setConfirmando(false)}>Voltar</button>
            <button type="button" className="btn-primary" disabled={gravando} onClick={mudar}>{gravando ? 'Mudando…' : 'Confirmar a mudança'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!nova || !quem} onClick={() => setConfirmando(true)}>Mudar</button>
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
    toast.success(`Agendamento ligado: ${c.origem}. O PDV não cobra de novo.`)
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
