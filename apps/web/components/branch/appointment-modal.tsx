'use client'

import { useActionState, useEffect, useState, useMemo, useRef } from 'react'
import { addAppointment, dadosParaAgendar, buscarClientesParaAgendar } from '@/actions/appointments'
import { X, Calendar, Search, UserPlus, Loader2 } from 'lucide-react'

interface Client      { id: string; name: string; phone: string }
interface Procedure   { id: string; name: string; category: string; duration_min: number; price: string | number; is_evaluation?: boolean }
interface Professional { id: string; name: string }
interface Room        { id: string; name: string }
interface Unidade     { id: string; name: string; slug: string }

interface AppointmentModalProps {
  /** Unidade do agendamento. Vazio no portal da rede, onde ela é escolhida aqui. */
  branchId:      string
  slug:          string
  procedures:    Procedure[]
  professionals: Professional[]
  rooms:         Room[]
  /**
   * Unidades da rede. Quando vem preenchida, o modal pergunta em qual unidade é
   * o atendimento e carrega procedimentos, profissionais e salas dela — no
   * portal da rede não existe "a filial atual".
   */
  unidades?:     Unidade[]
  defaultDate?:  string   // ISO datetime hint (from calendar click)
  onClose:       () => void
  onSuccess:     () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function AppointmentModal({
  branchId, slug, procedures, professionals, rooms,
  unidades, defaultDate, onClose, onSuccess,
}: AppointmentModalProps) {
  const [state, formAction, pending] = useActionState(addAppointment, undefined)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientList, setShowClientList] = useState(false)

  // Segunda via para dizer quem será atendido: nome e telefone, sem ficha.
  // A ficha completa cria o login do portal (e-mail + CPF) — pedir isso para
  // marcar um horário é pedir na hora errada. O cliente nasce com o que a
  // pessoa deu e ganha o resto quando (e se) voltar.
  const [novoContato, setNovoContato] = useState(false)
  const [novoNome,    setNovoNome]    = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')

  // -- Unidade ----------------------------------------------------------------
  // No portal da unidade ela já veio por prop; na rede é escolhida aqui, e cada
  // troca recarrega o que é dela: procedimentos, profissionais e salas.
  const escolheUnidade = (unidades?.length ?? 0) > 0
  const [unidadeId, setUnidadeId] = useState(branchId || unidades?.[0]?.id || '')
  const [dados, setDados] = useState({ procedures, professionals, rooms, slug })
  const [carregandoUnidade, setCarregandoUnidade] = useState(false)

  useEffect(() => {
    if (!escolheUnidade || !unidadeId) return
    let vivo = true
    setCarregandoUnidade(true)
    dadosParaAgendar(unidadeId).then(d => {
      if (!vivo) return
      setDados(d)
      setCarregandoUnidade(false)
    })
    return () => { vivo = false }
  }, [escolheUnidade, unidadeId])

  useEffect(() => { if (state?.success) { onSuccess(); onClose() } }, [state?.success])

  // -- Busca de cliente -------------------------------------------------------
  // No servidor, e não sobre uma lista carregada na tela: o telefone precisa ser
  // comparado por dígitos ("(47) 99123-4567" contra "47991234567"), e trazer a
  // rede inteira para filtrar aqui para de funcionar quando a base cresce.
  const [achados, setAchados] = useState<Client[]>([])
  const [buscando, setBuscando] = useState(false)
  const termoRef = useRef('')

  useEffect(() => {
    const termo = clientSearch.trim()
    termoRef.current = termo
    if (termo.length < 2) { setAchados([]); setBuscando(false); return }

    setBuscando(true)
    const t = setTimeout(async () => {
      const res = await buscarClientesParaAgendar(termo)
      // Resposta atrasada não pode sobrescrever a busca atual: sem esta guarda,
      // o resultado de "De" chegava depois do de "Demo 05".
      if (termoRef.current !== termo) return
      setAchados(res.clientes)
      setBuscando(false)
    }, 250)
    return () => clearTimeout(t)
  }, [clientSearch])

  const telefoneOk = novoTelefone.replace(/\D/g, '').length >= 10
  const contatoOk  = novoContato && novoNome.trim().length >= 2 && telefoneOk
  const podeAgendar = !!selectedClient || contatoOk

  /** Entra na via do contato novo, aproveitando o que já foi digitado na busca. */
  function abrirNovoContato(nomeSugerido: string) {
    setNovoContato(true)
    setShowClientList(false)
    // Um texto que só tem número é telefone, não nome — é assim que a recepção
    // busca quando a pessoa está ao telefone.
    if (/^[\d\s()+-]+$/.test(nomeSugerido) && nomeSugerido.trim()) setNovoTelefone(nomeSugerido.trim())
    else if (nomeSugerido.trim()) setNovoNome(nomeSugerido.trim())
    setClientSearch('')
  }

  // Data/hora padrão em horário local (não UTC)
  const defaultDT = useMemo(() => {
    if (defaultDate) return defaultDate.substring(0, 16)  // já vem como local de agenda-calendar
    const rounded = new Date(Math.ceil(Date.now() / 1800000) * 1800000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${rounded.getFullYear()}-${pad(rounded.getMonth()+1)}-${pad(rounded.getDate())}T${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`
  }, [defaultDate])

  // Controla o valor do input (exibe local) e o hidden UTC para envio
  const [localDT, setLocalDT] = useState(defaultDT)

  // Ao mudar o defaultDate (novo clique no calendário), reseta
  useEffect(() => { setLocalDT(defaultDT) }, [defaultDT])

  const scheduledAtUTC = useMemo(
    () => localDT ? new Date(localDT).toISOString() : '',
    [localDT],
  )

  const minDT = useMemo(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(34,22,25,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={16} style={{ color: 'var(--brand)' }} />
            </div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
              Novo agendamento
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={16} /></button>
        </div>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="_branchId" value={unidadeId} />
          <input type="hidden" name="_slug" value={dados.slug} />
          <input type="hidden" name="client_id" value={selectedClient?.id ?? ''} />

          {/* Na rede o atendimento precisa dizer de qual unidade é: é ela que
              tem a sala, a profissional e a agenda. */}
          {escolheUnidade && (
            <Field label="Unidade *">
              <select className="field" value={unidadeId} onChange={e => setUnidadeId(e.target.value)}>
                {unidades!.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          )}

          {/* Quem será atendido */}
          <Field label="Cliente *">
            <div style={{ position: 'relative' }}>
              {novoContato && !selectedClient ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="form-2col">
                    <input
                      type="text" name="client_name" className="field" autoFocus
                      placeholder="Nome de quem será atendido"
                      value={novoNome}
                      onChange={e => setNovoNome(e.target.value)}
                    />
                    <input
                      type="tel" name="client_phone" className="field"
                      placeholder="Telefone com DDD"
                      value={novoTelefone}
                      onChange={e => setNovoTelefone(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                      A ficha completa (CPF, e-mail) pode ser preenchida depois.
                    </span>
                    <button type="button"
                      onClick={() => { setNovoContato(false); setNovoNome(''); setNovoTelefone('') }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand)', fontWeight: 700, fontSize: 'var(--text-xs-sz)', whiteSpace: 'nowrap' }}>
                      Buscar cliente cadastrado
                    </button>
                  </div>
                </div>
              ) : selectedClient ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
                  borderRadius: 'var(--radius-field-token)',
                }}>
                  <div>
                    <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--brand)' }}>{selectedClient.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{selectedClient.phone}</span>
                  </div>
                  <button type="button" onClick={() => setSelectedClient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', lineHeight: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="field campo-busca"
                    style={{ paddingLeft: 30 }}
                    placeholder="Buscar cliente por nome ou telefone…"
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setShowClientList(true) }}
                    onFocus={() => setShowClientList(true)}
                  />
                  {showClientList && clientSearch.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-card-sm)', marginTop: 4,
                      boxShadow: 'var(--shadow-popover)',
                      maxHeight: 200, overflow: 'auto',
                    }}>
                      {buscando ? (
                        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                          <Loader2 size={12} className="animate-spin" /> Procurando…
                        </div>
                      ) : achados.length > 0 ? (
                        achados.map(c => (
                          <button
                            key={c.id} type="button"
                            onClick={() => { setSelectedClient(c); setClientSearch(''); setShowClientList(false) }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '9px 14px',
                              background: 'none', border: 'none', cursor: 'pointer',
                              borderBottom: '1px solid var(--hairline)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{c.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{c.phone}</span>
                          </button>
                        ))
                      ) : (
                        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                            Nenhum resultado para "{clientSearch}".
                          </span>
                          <button
                            type="button"
                            onClick={() => abrirNovoContato(clientSearch)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            + Agendar com nome e telefone
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* A saída não é "vá cadastrar primeiro": quem está com a pessoa na
                linha resolve aqui, com o que ela deu. */}
            {!novoContato && !selectedClient && (
              <button type="button" onClick={() => abrirNovoContato(clientSearch)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--brand)', fontWeight: 700, fontSize: 'var(--text-xs-sz)',
                }}>
                <UserPlus size={13} /> Não é cliente ainda? Use nome e telefone
              </button>
            )}
          </Field>

          {/* A consulta de avaliação era um checkbox aqui, que criava o
              atendimento SEM procedimento — preço R$ 0 e 60 minutos fixos.
              Agora ela é um procedimento do catálogo como qualquer outro: a
              rede define preço, duração e ficha, e o atendimento herda de lá
              que é uma avaliação. */}
          <Field label="Procedimento *">
            <select name="procedure_id" required className="field" disabled={carregandoUnidade}>
              <option value="">{carregandoUnidade ? 'Carregando…' : 'Selecione o procedimento…'}</option>
              {dados.procedures.map(p => (
                <option key={p.id} value={p.id}>
                  {p.is_evaluation ? '★ ' : ''}{p.name} — {p.duration_min}min — R$ {parseFloat(String(p.price)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </Field>

          <div className="form-2col">
            <Field label="Profissional *">
              <select name="professional_id" required className="field" disabled={carregandoUnidade}>
                <option value="">{carregandoUnidade ? 'Carregando…' : 'Selecione…'}</option>
                {dados.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field label="Sala / Cabine">
              <select name="room_id" className="field">
                <option value="">Sem sala definida</option>
                {dados.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Data e hora *">
            <input
              type="datetime-local" required className="field"
              value={localDT}
              min={minDT}
              onChange={e => setLocalDT(e.target.value)}
            />
            <input type="hidden" name="scheduled_at" value={scheduledAtUTC} />
          </Field>

          <Field label="Observações internas">
            <textarea name="notes" rows={2} className="field" placeholder="Preferências, contraindicações…" style={{ resize: 'vertical' }} />
          </Field>

          {state?.error && (
            <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
              {state.error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, alignItems: 'center' }}>
            {!podeAgendar && (
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginRight: 4 }}>
                {novoContato ? 'Informe nome e telefone com DDD' : 'Selecione um cliente para continuar'}
              </span>
            )}
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={pending || !podeAgendar}
              className="btn-primary"
              style={{ opacity: podeAgendar ? 1 : 0.5 }}
            >
              <Calendar size={14} />
              {pending ? 'Agendando…' : 'Confirmar agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
