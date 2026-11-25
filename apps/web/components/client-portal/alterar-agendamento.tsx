'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, XCircle, MessageCircle, Phone } from 'lucide-react'
import { gruposDeHorario } from '@/lib/appointments/periodos-do-dia'
import { limiteParaAlterar } from '@/lib/clientes/agenda-do-portal'
import { useFuso, NotaDoFuso } from '@/components/shared/fuso'
import { instanteNoFuso } from '@/lib/datetime'
import { textoDoRemarcado } from '@/lib/clientes/textos-do-app'
import { cancelarPelaCliente, remarcarPelaCliente, horariosParaRemarcar, quemAtendeNoRemarcar, quemRealizaNoRemarcar, diasLivresParaRemarcar } from '@/actions/portal-agendamentos'
import { Dica } from '@/components/shared/dica'
import { useFalaDaRede, useNomeDaRede } from '@/components/client-portal/rede-do-portal'

/** O dia no relógio da unidade (F62). */
const diaNoFuso = (ms: number, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date(ms))
const diaDeHoje = (fuso: string) => diaNoFuso(Date.now(), fuso)
const diaDeAmanha = (fuso: string) => diaNoFuso(Date.now() + 86_400_000, fuso)
/** "quinta-feira, 13/11" — o dia escolhido (AAAA-MM-DD), pelo meio-dia de Brasília. */
const diaPorExtenso = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })
/** "qui., 20/11" — o chip de um dia com horário livre (22ª A42). */
const diaCurto = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/** A escolha do "Com quem?": sem preferência, outra pessoa que realiza, ou a mesma. */
type EscolhaDoComQuem = { semPreferencia: boolean; profissionalId: string | null }

/**
 * Cancelar ou remarcar pelo portal, até o prazo da rede (2026-10-21). Dentro
 * do prazo, só o caminho para falar com a clínica. As ações de verdade
 * conferem o prazo de novo no servidor.
 */
/** Uma unidade do "Em qual unidade?" (A15): o relógio dela e se a mesma profissional atende lá. */
export interface UnidadeDoRemarcar { id: string; nome: string; fuso: string; comAMesma: boolean }

export function AlterarAgendamento({ appointmentId, scheduledAt, prazoHoras, whatsapp, whatsappParaAlterar = null, ligar = null, telefone, profissional = null, semPreferenciaInicial = false, ofereceSemPreferencia = false, unidade: unidadeDoAgendamento = '', unidadeInicial, unidades = [], abrirRemarcando = false }: {
  appointmentId: string
  /** A unidade do agendamento. */
  unidade?:      string
  /** A unidade em que o horário novo começa: a do agendamento, ou (F72) a primeira ativa quando a dele foi desativada. */
  unidadeInicial?: string
  /** Com mais de uma (A15, F65), o remarcar pergunta "Em qual unidade?". */
  unidades?:     UnidadeDoRemarcar[]
  scheduledAt:   string
  prazoHoras:    number
  whatsapp:      string | null
  /** Fora do prazo (A53): o WhatsApp com "preciso cancelar ou remarcar" já escrito. */
  whatsappParaAlterar?: string | null
  /** Fora do prazo (A53): o "Ligar" (tel:) da clínica. */
  ligar?:        string | null
  /** O nome da profissional do agendamento. */
  profissional?: string | null
  /** O agendamento foi feito em "Sem preferência" (A59): o remarcar começa por aí. */
  semPreferenciaInicial?: boolean
  /** Mais de uma profissional realiza o procedimento na unidade: oferece "Sem preferência" (A59). */
  ofereceSemPreferencia?: boolean
  /** A47 da 24ª: veio do "Remarcar" do cartão — o formulário já abre (um toque). */
  abrirRemarcando?: boolean
  /** O telefone da clínica, já formatado — o contato quando o app não remarca mais. */
  telefone:      string | null
}) {
  const router = useRouter()
  // CA1: o NOME da rede no lugar de "clínica".
  const fala = useFalaDaRede()
  // D13 (CA1): o motivo se conta à rede, pelo nome.
  const nomeDaRede = useNomeDaRede()
  // A unidade do horário novo (A15): a do agendamento, até a cliente escolher outra.
  const [unidade, setUnidade] = useState(unidadeInicial ?? unidadeDoAgendamento)
  const escolhida = unidades.find(u => u.id === unidade) ?? null
  const outraUnidade = !!unidade && unidade !== unidadeDoAgendamento
  // A mesma profissional só onde ela atende; noutra unidade, quem estiver livre.
  const comAMesma = !outraUnidade || !!escolhida?.comAMesma
  // F62: o dia e a hora são os do relógio da UNIDADE (a escolhida).
  const fusoDoAgendamento = useFuso()
  const fuso = escolhida?.fuso ?? fusoDoAgendamento
  const [abertoEm] = useState(() => Date.now())
  const podeAlterar = new Date(scheduledAt).getTime() - abertoEm >= prazoHoras * 3600_000
  // O dia e a hora em que o prazo acaba (J-61): era só "até 24 horas antes".
  // A10 da 26ª (princípio 3): o prazo é do agendamento ORIGINAL — no relógio
  // dele, não no da unidade escolhida para o horário novo (o "até 10:00" virava
  // "11:00" ao escolher o Setor Bueno, o mesmo instante sem dizer o relógio).
  const limite = limiteParaAlterar(scheduledAt, prazoHoras, fusoDoAgendamento)
  const [modo, setModo] = useState<'nada' | 'remarcar' | 'cancelar'>(abrirRemarcando && podeAlterar ? 'remarcar' : 'nada')
  const [dia, setDia] = useState('')
  const [slots, setSlots] = useState<string[] | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  // Com quem remarcar (A59): a mesma profissional, ou "Sem preferência" — que
  // escolhe de novo, entre quem realiza, quem estiver livre no horário.
  const [semPreferenciaEscolhida, setSemPreferencia] = useState(ofereceSemPreferencia && semPreferenciaInicial)
  // 22ª A42: ou outra pessoa que realiza o procedimento na unidade, da lista
  // (como o "Tem preferência?" do Agendar). Vazio: a escolha dos chips.
  const [outraPessoa, setOutraPessoa] = useState('')
  const semPreferencia = !outraPessoa && (semPreferenciaEscolhida || !comAMesma)
  const ofereceComQuem = ofereceSemPreferencia && comAMesma
  const escolhaAtual: EscolhaDoComQuem = { semPreferencia, profissionalId: outraPessoa || null }
  // Quem realiza na unidade do horário novo, e os dias com horário livre pela
  // escolha — as respostas guardam a chave a que se referem.
  const [pessoasDe, setPessoasDe] = useState<{ chave: string; pessoas: { id: string; nome: string; atual: boolean }[] } | null>(null)
  const chaveDasPessoas = modo === 'remarcar' ? unidade : null
  const outras = pessoasDe && pessoasDe.chave === chaveDasPessoas ? pessoasDe.pessoas.filter(x => !x.atual) : []
  useEffect(() => {
    if (chaveDasPessoas === null) return
    let vivo = true
    quemRealizaNoRemarcar(appointmentId, chaveDasPessoas || null)
      .then(r => { if (vivo) setPessoasDe({ chave: chaveDasPessoas, pessoas: 'error' in r ? [] : r.pessoas }) })
      .catch(() => { if (vivo) setPessoasDe({ chave: chaveDasPessoas, pessoas: [] }) })
    return () => { vivo = false }
  }, [chaveDasPessoas, appointmentId])
  const [diasDe, setDiasDe] = useState<{ chave: string; dias: string[] } | null>(null)
  const chaveDosDias = modo === 'remarcar' ? `${unidade}|${semPreferencia ? 'sem' : outraPessoa || 'mesma'}` : null
  const diasLivres = diasDe && diasDe.chave === chaveDosDias ? diasDe.dias : null
  useEffect(() => {
    if (chaveDosDias === null) return
    let vivo = true
    diasLivresParaRemarcar(appointmentId, { semPreferencia, profissionalId: outraPessoa || null }, unidade || null)
      .then(r => { if (vivo) setDiasDe({ chave: chaveDosDias, dias: 'error' in r ? [] : r.dias }) })
      .catch(() => { if (vivo) setDiasDe({ chave: chaveDosDias, dias: [] }) })
    return () => { vivo = false }
  }, [chaveDosDias, appointmentId, semPreferencia, outraPessoa, unidade])
  // A56 da 11ª: em "Sem preferência", quem fica com o horário — antes de confirmar.
  // A resposta guarda o dia e a hora a que se refere: a de outro horário não aparece.
  const [quemAtendeDe, setQuemAtendeDe] = useState<{ chave: string; nome: string | null; mesma: boolean } | null>(null)
  const chaveDoHorario = semPreferencia && dia && hora ? `${unidade} ${dia} ${hora}` : null
  const quemAtende = quemAtendeDe && quemAtendeDe.chave === chaveDoHorario ? quemAtendeDe : null
  const esperandoQuemAtende = !!chaveDoHorario && !quemAtende
  useEffect(() => {
    if (!chaveDoHorario || !dia || !hora) return
    let vivo = true
    // A falha libera o botão (sem o nome): o servidor confere de novo ao remarcar.
    quemAtendeNoRemarcar(appointmentId, dia, hora, unidade || null).then(r => { if (vivo) setQuemAtendeDe({ chave: chaveDoHorario, ...r }) })
      .catch(() => { if (vivo) setQuemAtendeDe({ chave: chaveDoHorario, nome: null, mesma: false }) })
    return () => { vivo = false }
  }, [chaveDoHorario, dia, hora, appointmentId, unidade])
  // A57 da 11ª: o horário novo dentro do prazo do app — depois de remarcar, só a equipe muda.
  const novoDentroDoPrazo = !!dia && !!hora && prazoHoras > 0
    && instanteNoFuso(dia, hora, fuso).getTime() - abertoEm < prazoHoras * 3_600_000

  if (!podeAlterar) {
    // A53 da 7ª simulação: a regra do prazo fica; a saída diz o prazo, liga e
    // manda a mensagem certa ("preciso cancelar ou remarcar").
    const zap = whatsappParaAlterar ?? whatsapp
    return (
      <div data-fora-do-prazo className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          O prazo para alterar pelo app terminou em {limite} ({prazoHoras} horas antes do horário){' '}
          <NotaDoFuso fuso={fusoDoAgendamento} prefixo="· " />. A equipe ainda
          cancela ou remarca: para isso, fale com ela.
        </p>
        {telefone && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
            {fala.telefone}: {telefone}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {zap && (
            <a href={zap} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ justifyContent: 'center', flex: '1 1 180px' }}>
              <MessageCircle size={14} aria-hidden="true" /> {fala.falarCom}
            </a>
          )}
          {ligar && (
            <a href={ligar} className="btn-secondary" style={{ justifyContent: 'center', flex: '1 1 180px' }}>
              <Phone size={14} aria-hidden="true" /> Ligar
            </a>
          )}
        </div>
      </div>
    )
  }

  function escolherDia(novo: string, escolha: EscolhaDoComQuem = escolhaAtual, onde = unidade) {
    setDia(novo); setHora(null); setSlots(null); setErro(null)
    if (!novo) return
    iniciar(async () => {
      const r = await horariosParaRemarcar(appointmentId, novo, escolha.semPreferencia, onde || null, escolha.profissionalId)
      if ('error' in r) setErro(r.error)
      else setSlots(r.slots)
    })
  }

  function confirmarRemarcar() {
    if (!dia || !hora) return
    setErro(null)
    iniciar(async () => {
      const r = await remarcarPelaCliente(appointmentId, instanteNoFuso(dia, hora, fuso).toISOString(), semPreferencia, unidade || null, outraPessoa || null)
      if ('error' in r) { setErro(r.error); return }
      // A51 da 12ª: o remarcado diz com quem ficou e quando (a Sabrina passou da Eva à Fernanda calada);
      // A29 da 14ª: e ONDE, quando mudou de unidade.
      setFeito(textoDoRemarcado({
        quemAtende: r.quemAtende ?? null, dia: diaPorExtenso(dia), hora,
        unidadeNova: outraUnidade ? escolhida?.nome ?? null : null,
      })); setModo('nada'); router.refresh()
    })
  }

  function confirmarCancelar() {
    setErro(null)
    iniciar(async () => {
      const r = await cancelarPelaCliente(appointmentId, motivo)
      if ('error' in r) { setErro(r.error); return }
      setFeito('Agendamento cancelado.'); setModo('nada'); router.refresh()
    })
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        Pelo app, você cancela ou remarca até {limite} ({prazoHoras} horas antes do horário).{' '}
        {/* A10 da 26ª: o relógio do agendamento, fora do de Brasília. */}
        <NotaDoFuso fuso={fusoDoAgendamento} />
      </p>
      {feito && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 700 }}>{feito}</p>}

      {modo === 'nada' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => { setModo('remarcar'); setFeito(null) }}>
            <CalendarClock size={14} aria-hidden="true" /> Remarcar
          </button>
          <button type="button" className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => { setModo('cancelar'); setFeito(null) }}>
            <XCircle size={14} aria-hidden="true" /> Cancelar agendamento
          </button>
        </div>
      )}

      {modo === 'remarcar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* A15 (F65): com mais de uma unidade que faz o procedimento, onde. As
              opções vêm dos dados: é um select, não chip (design.md). */}
          {(unidades.length > 1 || (unidades.length === 1 && unidades[0]!.id !== unidadeDoAgendamento)) && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
              Em qual unidade?
              <select className="filtro-select" value={unidade} onChange={e => {
                const nova = e.target.value
                const mesma = nova === unidadeDoAgendamento || !!unidades.find(u => u.id === nova)?.comAMesma
                setUnidade(nova); setOutraPessoa('')
                if (dia) escolherDia(dia, { semPreferencia: semPreferenciaEscolhida || !mesma, profissionalId: null }, nova)
              }}>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
          )}
          {outraUnidade && !comAMesma && !outraPessoa && (
            <p data-outra-unidade-quem-atende style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {profissional ? `${profissional} não atende em ${escolhida?.nome ?? 'nesta unidade'}: o` : 'O'} horário novo fica com quem estiver livre lá.
            </p>
          )}
          {ofereceComQuem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: 'var(--text-muted)' }}>
              <div role="group" aria-label="Com quem?" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" aria-pressed={!semPreferencia && !outraPessoa} className={!semPreferencia && !outraPessoa ? 'chip-filtro is-ativo' : 'chip-filtro'}
                  onClick={() => { setSemPreferencia(false); setOutraPessoa(''); if (dia) escolherDia(dia, { semPreferencia: false, profissionalId: null }) }}>
                  {profissional ? `Só com ${profissional}` : 'A mesma profissional'}
                </button>
                <button type="button" aria-pressed={semPreferencia} className={semPreferencia ? 'chip-filtro is-ativo' : 'chip-filtro'}
                  onClick={() => { setSemPreferencia(true); setOutraPessoa(''); if (dia) escolherDia(dia, { semPreferencia: true, profissionalId: null }) }}>
                  Sem preferência
                </button>
              </div>
              {/* A50 da 12ª: "Sem preferência" marcado ao lado de "Com Helena" não dizia se a
                  profissional podia mudar. O que significa mora na dica (2026-11-16); com quem
                  fica o horário novo aparece à vista antes de confirmar (A56 da 11ª). Fora do
                  grupo: o nome dela não pode conter "Sem preferência". */}
              <Dica rotulo="Sobre a escolha de quem atende">
                <span data-o-que-e-sem-preferencia>
                  Sem preferência: {profissional ? `hoje o agendamento é com ${profissional}; no` : 'no'} horário novo, fica com quem estiver livre — pode ser outra pessoa.
                  {profissional ? ` Para ficar com ${profissional}, escolha “Só com ${profissional}”.` : ''}
                </span>
              </Dica>
            </div>
          )}
          {/* 22ª A42: as outras pessoas que realizam o procedimento na unidade — a
              lista vem dos dados, então é um select (design.md). */}
          {outras.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
              {ofereceComQuem ? 'Ou com outra pessoa' : 'Com quem?'}
              <select data-com-quem className="filtro-select" value={outraPessoa} onChange={e => {
                const id = e.target.value
                setOutraPessoa(id)
                if (dia) escolherDia(dia, id ? { semPreferencia: false, profissionalId: id } : { semPreferencia: semPreferenciaEscolhida || !comAMesma, profissionalId: null })
              }}>
                <option value="">{ofereceComQuem ? 'Escolha' : 'Quem estiver livre'}</option>
                {outras.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Novo dia
            <input type="date" className="field" value={dia} onChange={e => escolherDia(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={dia === diaDeHoje(fuso) ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(diaDeHoje(fuso))}>Hoje</button>
            <button type="button" className={dia === diaDeAmanha(fuso) ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(diaDeAmanha(fuso))}>Amanhã</button>
          </div>
          {/* 22ª A42: os dias com horário livre nas próximas duas semanas, pela escolha acima. */}
          {diasLivres && diasLivres.length > 0 && (
            <div data-dias-livres role="group" aria-label="Dias com horário" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="overline">Dias com horário</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {diasLivres.map(d => (
                  <button key={d} type="button" aria-pressed={dia === d}
                    className={dia === d ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(d)}>
                    {diaCurto(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {diasLivres && diasLivres.length === 0 && (
            <p data-sem-dias-livres style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum horário livre nas próximas duas semanas.</p>
          )}
          {slots && slots.length === 0 && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum horário livre neste dia.</p>
          )}
          {/* A9 da 26ª: os horários novos estão no relógio da unidade escolhida — dito fora do de Brasília. */}
          {slots && slots.length > 0 && <NotaDoFuso fuso={fuso} />}
          {slots && slots.length > 0 && gruposDeHorario(slots).map(g => (
            <div key={g.periodo} role="group" aria-label={g.periodo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="overline">{g.periodo}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.horarios.map(h => (
                  <button key={h} type="button" aria-pressed={hora === h}
                    className={hora === h ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => setHora(h)}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {semPreferencia && hora && quemAtende?.nome && (
            <p data-quem-atende-no-remarcar role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
              Com {quemAtende.nome}{quemAtende.mesma ? ' (a mesma de antes)' : ''} — quem está livre neste horário.
            </p>
          )}
          {novoDentroDoPrazo && (
            <p data-dentro-do-prazo style={{
              color: 'var(--text)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
              padding: '10px 14px', fontSize: 'var(--text-sm-sz)', lineHeight: 1.45,
            }}>
              Este horário fica a menos de {prazoHoras} horas: depois de remarcar, para mudar de novo ou cancelar, {fala.faleCom}.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setModo('nada')}>Voltar</button>
            {/* A51 da 12ª: em "Sem preferência", só confirma depois de saber com quem. */}
            <button type="button" className="btn-primary" disabled={enviando || !hora || esperandoQuemAtende} onClick={confirmarRemarcar}>
              {enviando ? 'Remarcando…' : esperandoQuemAtende ? 'Conferindo quem atende…' : 'Confirmar novo horário'}
            </button>
          </div>
        </div>
      )}

      {modo === 'cancelar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Motivo (opcional)
            <input className="field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={`Conte ${nomeDaRede ? `a ${nomeDaRede}` : 'à rede'} o porquê, se quiser`} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setModo('nada')}>Voltar</button>
            <button type="button" className="btn-primary" disabled={enviando} onClick={confirmarCancelar}>
              {enviando ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </div>
      )}

      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}
