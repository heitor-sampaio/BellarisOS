'use client'

import { startTransition, useActionState, useEffect, useEffectEvent, useState, useMemo, useRef } from 'react'
import { addAppointment, dadosParaAgendar, proximoHorarioLivre, buscarClientesParaAgendar, clienteParaAgendar, salasParaAgendar, avisosDoHorario, avisoDoPlanoAoAgendar, getSchedulingDaySlots } from '@/actions/appointments'
import { GradeDeHorarios } from '@/components/shared/grade-de-horarios'
import { gradeDoCheckout } from '@/lib/checkout/grade-de-horarios'
import { ocupanteDoHorario } from '@/lib/agenda/horario-livre'
import type { SalaParaAgendar } from '@/lib/appointments/salas'
import { creditosParaAgendar } from '@/actions/creditos'
import { formatBRL, maskPhone, maskTelefoneDigitando, telefoneDoCadastro } from '@estetica-os/utils'
import type { CreditoParaAgendar } from '@/lib/creditos/credito'
import { X, Calendar, Search, UserPlus, Loader2, AlertTriangle, CheckCircle2, Ban } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { PerguntaJaExiste } from '@/components/shared/pergunta-ja-existe'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { rotaNoPortal } from '@/lib/rotas'
import { dayKeyTZ } from '@/lib/datetime'
import { unicaOpcao } from '@/lib/uma-opcao'

interface Client      { id: string; name: string; phone: string }
interface Procedure   { id: string; name: string; category: string; duration_min: number; price: string | number; /** Quem realiza (por-01; vazio = todas). */ realizam?: string[] }
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
  /**
   * O dia que a pessoa está olhando na agenda (AAAA-MM-DD; A16 da 9ª): sem
   * horário clicado, o agendar abre nele — e o próximo livre é dele em diante.
   * Abria em hoje, e a Ana agendou no dia errado.
   */
  diaInicial?:   string | null
  /** O cliente já escolhido (`?cliente=` da busca universal e da ficha): o nome vem do servidor. */
  clienteInicialId?: string | null
  /** O procedimento e a profissional que já vêm escolhidos (o "Reagendar" da falta — A27 da 7ª; o clique na coluna — A29). */
  procedimentoInicialId?: string | null
  profissionalInicialId?: string | null
  onClose:       () => void
  onSuccess:     () => void
}

/** O rótulo é LIGADO ao campo (`htmlFor`, design.md): sem isso, nem o leitor de tela nem o clique o acham. */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function AppointmentModal({
  branchId, slug, procedures, professionals, rooms,
  unidades, defaultDate, diaInicial = null, clienteInicialId = null, procedimentoInicialId = null, profissionalInicialId = null, onClose, onSuccess,
}: AppointmentModalProps) {
  const [state, formAction, pending] = useActionState(addAppointment, undefined)
  // A resposta a "Já existe a ficha de X" do agendar com nome e telefone
  // (r2-cli-01): vai em todo envio seguinte, como no cadastro de cliente.
  const formRef = useRef<HTMLFormElement>(null)
  const [respostaJaExiste, setRespostaJaExiste] = useState('')
  function reenviar(resposta: string) {
    if (!formRef.current) return
    const dados = new FormData(formRef.current)
    dados.set('_jaExiste', resposta)
    startTransition(() => formAction(dados))
  }
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const pathname = usePathname()
  const [showClientList, setShowClientList] = useState(false)

  // O cliente que veio escolhido: confere no servidor e já deixa selecionado.
  useEffect(() => {
    if (!clienteInicialId) return
    let vivo = true
    clienteParaAgendar(clienteInicialId).then(r => { if (vivo && r.cliente) setSelectedClient(r.cliente) }).catch(() => { /* escolhe à mão */ })
    return () => { vivo = false }
  }, [clienteInicialId])

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
  // A14 da 8ª simulação: na rede com várias unidades, nenhuma vem escolhida —
  // era a primeira em ordem alfabética (a Água Verde), não a que a pessoa quis.
  // Com uma só, ela; com o filtro da agenda ou o clique na coluna, a dele.
  const [unidadeId, setUnidadeId] = useState(branchId || unicaOpcao(unidades))
  const [dados, setDados] = useState({ procedures, professionals, rooms, slug })
  // Nasce carregando quando há unidade a carregar; cada troca liga de novo no
  // handler do seletor, e o efeito só desliga quando os dados chegam.
  const [carregandoUnidade, setCarregandoUnidade] = useState(escolheUnidade && !!unidadeId)

  // A2 da 10ª: com UMA profissional, ela vem escolhida (a clínica de uma pessoa).
  const [profId, setProfId] = useState(profissionalInicialId ?? unicaOpcao(professionals))
  const [procId, setProcId] = useState(procedimentoInicialId ?? '')

  function trocarUnidade(id: string) {
    // A PRIMEIRA escolha (a unidade nasce vazia na rede — A14 da 8ª) mantém o
    // procedimento e a profissional que vieram pedidos (o "Reagendar"); o que
    // a unidade não tem cai quando os dados dela chegam. Trocar depois zera.
    if (unidadeId) { setProfId(''); setProcId('') }
    setUnidadeId(id)
    setSalaEscolhida(null)
    if (escolheUnidade && id) setCarregandoUnidade(true)
  }

  useEffect(() => {
    if (!escolheUnidade || !unidadeId) return
    let vivo = true
    dadosParaAgendar(unidadeId).then(d => {
      if (!vivo) return
      setDados(d)
      setProfId(atual => (d.professionals.some(p => p.id === atual) ? atual : unicaOpcao(d.professionals)))
      setProcId(atual => (d.procedures.some(p => p.id === atual) ? atual : ''))
      setCarregandoUnidade(false)
    })
    return () => { vivo = false }
  }, [escolheUnidade, unidadeId])

  // -- O que o cliente já pagou (fase 3 de "Vender") --------------------------
  // Escolhido o cliente, o modal oferece as unidades pré-pagas e as sessões de
  // pacote dele. Usar uma fixa o procedimento e o preço (o servidor confere).
  const [creditos, setCreditos] = useState<{ de: string; itens: CreditoParaAgendar[] }>({ de: '', itens: [] })
  // `null` = ninguém mexeu no "Já pago": com o crédito do MESMO procedimento,
  // ele vem escolhido (A20 da 8ª simulação, decidido pelo princípio 3 — a Bruna
  // saiu avulsa a R$ 180 com a sessão do pacote livre). "Não usar" é ''.
  const [creditoSel, setCreditoSel] = useState<string | null>(null)
  useEffect(() => {
    const id = selectedClient?.id
    if (!id) return
    let vivo = true
    creditosParaAgendar(id).then(itens => { if (vivo) setCreditos({ de: id, itens }) }).catch(() => { /* sem créditos a oferecer */ })
    return () => { vivo = false }
  }, [selectedClient?.id])
  const creditosDoCliente = selectedClient && creditos.de === selectedClient.id ? creditos.itens : []
  const chaveDoCredito = (c: CreditoParaAgendar) => `${c.tipo}:${c.id}`
  const creditoAutomatico = creditoSel === null && procId ? (creditosDoCliente.find(c => c.procedureId === procId) ?? null) : null
  const credito = creditoSel === null ? creditoAutomatico : (creditosDoCliente.find(c => chaveDoCredito(c) === creditoSel) ?? null)

  // Quem realiza o procedimento escolhido (por-01): o nome da escolhida que NÃO realiza.
  const procDoAgendamento = dados.procedures.find(p => p.id === (credito?.procedureId ?? procId))
  const naoRealiza = profId && procDoAgendamento?.realizam?.length && !procDoAgendamento.realizam.includes(profId)
    ? (dados.professionals.find(p => p.id === profId)?.name ?? 'A profissional')
    : null

  const aoAgendar = useEffectEvent(() => { onSuccess(); onClose() })
  useEffect(() => { if (state?.success) aoAgendar() }, [state?.success])

  // -- Busca de cliente -------------------------------------------------------
  // No servidor, e não sobre uma lista carregada na tela: o telefone precisa ser
  // comparado por dígitos ("(47) 99123-4567" contra "47991234567"), e trazer a
  // rede inteira para filtrar aqui para de funcionar quando a base cresce.
  const [resultados, setAchados] = useState<Client[]>([])
  const [procurando, setBuscando] = useState(false)
  const termoRef = useRef('')

  // Termo curto não busca: a lista some e o "buscando" também, derivados do
  // próprio termo em vez de zerados dentro do efeito.
  const termoCurto = clientSearch.trim().length < 2
  const achados  = termoCurto ? [] : resultados
  const buscando = !termoCurto && procurando

  /** Toda digitação passa por aqui: é onde a busca começa a "buscar". */
  function mudarBusca(texto: string) {
    setClientSearch(texto)
    if (texto.trim().length >= 2) setBuscando(true)
    else setAchados([])
  }

  useEffect(() => {
    const termo = clientSearch.trim()
    termoRef.current = termo
    if (termo.length < 2) return

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

  // A regra do cadastro: com DDD, ou de outro país com "+" (cli-06).
  const telefoneOk = !!telefoneDoCadastro(novoTelefone)
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

  // "Agora", lido uma vez quando o modal abre — o render não pode ler o relógio.
  const [agora] = useState(() => Date.now())
  // O dia da tela só vale quando é DEPOIS de hoje (hoje e o passado: a partir de agora).
  const diaDaTela = diaInicial && !defaultDate && diaInicial > dayKeyTZ(new Date(agora)) ? diaInicial : null

  // Data/hora padrão em horário local (não UTC)
  const defaultDT = useMemo(() => {
    if (defaultDate) return defaultDate.substring(0, 16)  // já vem como local de agenda-calendar
    if (diaDaTela) return `${diaDaTela}T08:00`
    const rounded = new Date(Math.ceil(agora / 1800000) * 1800000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${rounded.getFullYear()}-${pad(rounded.getMonth()+1)}-${pad(rounded.getDate())}T${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`
  }, [defaultDate, agora, diaDaTela])

  // Controla o valor do input (exibe local) e o hidden UTC para envio
  const [localDT, setLocalDT] = useState(defaultDT)

  // A20 (2026-10-27): sem horário clicado na grade, o horário sugerido é o
  // próximo livre da profissional (hoje: a partir de agora). A hora que a
  // pessoa digitou ela mesma não é trocada.
  const horaEscolhida = useRef(!!defaultDate)
  // A sessão do plano dura o que a sessão dura (D5 da 9ª: a soma dos procedimentos dela).
  const duracaoMin = credito
    ? (credito.duracaoMin ?? dados.procedures.find(p => p.id === credito.procedureId)?.duration_min ?? 30)
    : (dados.procedures.find(p => p.id === procId)?.duration_min ?? 30)
  useEffect(() => {
    if (!profId || !unidadeId || horaEscolhida.current) return
    let vivo = true
    proximoHorarioLivre(unidadeId, profId, duracaoMin, diaDaTela ? new Date(`${diaDaTela}T00:00:00-03:00`).toISOString() : null)
      .then(r => { if (vivo && r && !horaEscolhida.current) setLocalDT(r) })
      .catch(() => { /* fica a hora de antes */ })
    return () => { vivo = false }
  }, [profId, unidadeId, duracaoMin, diaDaTela])

  // Ao mudar o defaultDate (novo clique no calendário), reseta — ajustado
  // durante o render, guardando o padrão anterior.
  const [dtAnterior, setDtAnterior] = useState(defaultDT)
  if (dtAnterior !== defaultDT) {
    setDtAnterior(defaultDT)
    setLocalDT(defaultDT)
  }

  const scheduledAtUTC = useMemo(
    () => localDT ? new Date(localDT).toISOString() : '',
    [localDT],
  )

  // -- Sala (D5, 2026-10-30) --------------------------------------------------
  // Só as salas que servem ao procedimento (as ligadas a ele nesta unidade, ou
  // todas), cada uma dizendo se está livre no horário; a primeira livre vem
  // escolhida, até a pessoa escolher outra. O servidor confere de novo.
  const temSalas = dados.rooms.length > 0
  const procedimentoDoAgendamento = credito?.procedureId ?? procId
  const [salasDoServidor, setSalasDoServidor] = useState<{ chave: string; salas: SalaParaAgendar[]; sugerida: string | null; doProcedimento?: boolean } | null>(null)
  const chaveDasSalas = `${unidadeId}|${procedimentoDoAgendamento}|${scheduledAtUTC}|${duracaoMin}`
  useEffect(() => {
    if (!temSalas || !unidadeId) return
    let vivo = true
    salasParaAgendar(unidadeId, procedimentoDoAgendamento || null, scheduledAtUTC || null, duracaoMin)
      .then(r => { if (vivo) setSalasDoServidor({ chave: chaveDasSalas, ...r }) })
      // Falhou: fica a lista da unidade, sem sugestão (e o Confirmar não espera para sempre).
      .catch(() => { if (vivo) setSalasDoServidor({ chave: chaveDasSalas, salas: dados.rooms.map(r => ({ id: r.id, name: r.name, livre: true })), sugerida: null }) })
    return () => { vivo = false }
  }, [temSalas, unidadeId, procedimentoDoAgendamento, scheduledAtUTC, duracaoMin, chaveDasSalas, dados.rooms])
  // D12 da 7ª simulação: a sala sugerida chega DEPOIS do horário; confirmar
  // antes dela gravava sem sala, e a janela logo mostrava a sugerida. O
  // Confirmar espera a lista do horário — o que a janela mostra é o que grava.
  const carregandoSalas = temSalas && !!unidadeId && !!scheduledAtUTC && salasDoServidor?.chave !== chaveDasSalas
  const salasOferecidas: SalaParaAgendar[] = salasDoServidor?.chave === chaveDasSalas
    ? salasDoServidor.salas
    : dados.rooms.map(r => ({ id: r.id, name: r.name, livre: true }))
  // `null` = ninguém escolheu: vale a sugerida. A escolhida que deixou de
  // servir (outro procedimento) volta a "sem sala".
  const [salaEscolhida, setSalaEscolhida] = useState<string | null>(null)
  const salaId = salaEscolhida !== null
    ? (salaEscolhida === '' || salasOferecidas.some(s => s.id === salaEscolhida) ? salaEscolhida : '')
    : (salasDoServidor?.chave === chaveDasSalas
      // A2 da 10ª: a unidade de UMA sala livre já a traz escolhida (a sugestão
      // do procedimento ligado a salas vem antes — A27 da 5ª).
      ? (salasDoServidor.sugerida ?? unicaOpcao(salasDoServidor.salas.filter(s => s.livre).length === salasDoServidor.salas.length ? salasDoServidor.salas : []))
      : '')
  // A28: as salas DO procedimento todas ocupadas no horário — vai sem sala
  // (a sala é opcional, H1), e a janela diz isso em vez de calar.
  const semSalaLivre = !salaId && salasDoServidor?.chave === chaveDasSalas && !!salasDoServidor.doProcedimento
    && salasOferecidas.length > 0 && salasOferecidas.every(s => !s.livre)

  // -- O plano com o mesmo procedimento (D-18, A68) --------------------------
  // A cliente tem plano proposto ou fechado com este procedimento: o agendar
  // pergunta se não é pelo plano (avulso, ele é cobrado à parte).
  const chaveDoPlano = selectedClient?.id && procedimentoDoAgendamento && !credito ? `${selectedClient.id}|${procedimentoDoAgendamento}` : ''
  const [avisoDoPlano, setAvisoDoPlano] = useState<{ chave: string; texto: string; planId: string } | null>(null)
  useEffect(() => {
    if (!chaveDoPlano || !selectedClient?.id) return
    let vivo = true
    avisoDoPlanoAoAgendar(selectedClient.id, procedimentoDoAgendamento)
      .then(r => { if (vivo) setAvisoDoPlano(r ? { chave: chaveDoPlano, ...r } : null) })
      .catch(() => { /* sem aviso */ })
    return () => { vivo = false }
  }, [chaveDoPlano, selectedClient?.id, procedimentoDoAgendamento])
  const avisoDoPlanoAgora = avisoDoPlano && avisoDoPlano.chave === chaveDoPlano ? avisoDoPlano : null

  // -- Avisos do horário (J-30, 2026-10-30) ----------------------------------
  // Antes de confirmar: o encaixe fora do horário da profissional e o choque
  // com outro atendimento dela. É aviso — o encaixe é permitido (§9.1), e o
  // choque o servidor recusa ao gravar.
  // O bloqueio pontual (decisão 3 da 7ª) entra aqui: o da profissional e o da
  // sala escolhida — avisa, e o encaixe é permitido (princípio 2).
  const chaveDosAvisos = profId && unidadeId && scheduledAtUTC
    ? `${unidadeId}|${profId}|${scheduledAtUTC}|${procedimentoDoAgendamento}|${duracaoMin}|${salaId}` : ''
  const [avisos, setAvisos] = useState<{ chave: string; foraDoHorario: string | null; conflito: string | null; bloqueio?: string | null } | null>(null)
  useEffect(() => {
    if (!chaveDosAvisos) return
    let vivo = true
    const t = setTimeout(() => {
      avisosDoHorario(unidadeId, profId, scheduledAtUTC, procedimentoDoAgendamento || null, duracaoMin, salaId || null)
        .then(r => { if (vivo) setAvisos({ chave: chaveDosAvisos, ...r }) })
        // Sem a conferência, nenhum aviso — e o Confirmar não espera para sempre (o servidor confere ao gravar).
        .catch(() => { if (vivo) setAvisos({ chave: chaveDosAvisos, foraDoHorario: null, conflito: null, bloqueio: null }) })
    }, 200)
    return () => { vivo = false; clearTimeout(t) }
  }, [chaveDosAvisos, unidadeId, profId, scheduledAtUTC, procedimentoDoAgendamento, duracaoMin, salaId])
  // D9 da 8ª simulação: o Confirmar gravava ANTES de o aviso do horário chegar
  // — a Ana às 23:55, no bloqueio das férias e fora do expediente, gravou "sem
  // nenhum aviso". O botão espera a conferência DESTE horário (como espera as
  // salas, D12 da 7ª): o que a janela avisa aparece antes de gravar.
  const conferindoOHorario = !!chaveDosAvisos && avisos?.chave !== chaveDosAvisos
  // A26 (5ª simulação): a recusa do servidor por choque e o aviso diziam o
  // mesmo, duas vezes. Recusado por choque com o aviso na tela, fica UMA
  // mensagem: a recusa, com o detalhe do aviso (horário e unidade).
  const conflitoDoAviso = avisos && avisos.chave === chaveDosAvisos ? avisos.conflito : null
  const recusadoPorChoque = !!state?.error?.startsWith('Este profissional já tem agendamento') && !!conflitoDoAviso
  const avisosDoMomento = avisos && avisos.chave === chaveDosAvisos
    ? [avisos.bloqueio ?? null, avisos.foraDoHorario].filter((x): x is string => !!x) : []
  // A21 da 8ª simulação: o choque não é encaixe — o servidor RECUSA. A janela
  // diz "Não vai ser agendado" e oferece o próximo livre dela a partir do
  // horário escolhido (a régua de `computeAvailableSlots`, a do "próximo livre").
  const choque = recusadoPorChoque ? null : conflitoDoAviso
  const chaveDoProximo = choque ? chaveDosAvisos : ''
  const [proximoLivre, setProximoLivre] = useState<{ chave: string; quando: string | null } | null>(null)
  useEffect(() => {
    if (!chaveDoProximo) return
    let vivo = true
    proximoHorarioLivre(unidadeId, profId, duracaoMin, scheduledAtUTC)
      .then(r => { if (vivo) setProximoLivre({ chave: chaveDoProximo, quando: r }) })
      .catch(() => { if (vivo) setProximoLivre({ chave: chaveDoProximo, quando: null }) })
    return () => { vivo = false }
  }, [chaveDoProximo, unidadeId, profId, duracaoMin, scheduledAtUTC])
  const proximo = proximoLivre && proximoLivre.chave === chaveDoProximo ? proximoLivre.quando : null
  const rotuloDoProximo = proximo
    ? (proximo.slice(0, 10) === localDT.slice(0, 10) ? proximo.slice(11, 16) : `${proximo.slice(8, 10)}/${proximo.slice(5, 7)} às ${proximo.slice(11, 16)}`)
    : null

  // -- Os horários livres do dia (A58 da 8ª simulação) ------------------------
  // O seletor que só existia no agendar da sessão do pacote: a mesma grade
  // (`GradeDeHorarios`) e a mesma régua (`ocupanteDoHorario` — a duração
  // inteira contra os agendamentos e os bloqueios dela, D5).
  const diaEscolhido = localDT.slice(0, 10)
  // Com a sala escolhida, o bloqueio dela também risca a grade (A17 da 9ª).
  const chaveDoDia = profId && unidadeId && /^\d{4}-\d{2}-\d{2}$/.test(diaEscolhido) ? `${unidadeId}|${profId}|${diaEscolhido}|${salaId}` : ''
  const [doDia, setDoDia] = useState<{ chave: string } & Awaited<ReturnType<typeof getSchedulingDaySlots>> | null>(null)
  useEffect(() => {
    if (!chaveDoDia) return
    let vivo = true
    getSchedulingDaySlots(unidadeId, profId, diaEscolhido, salaId || null)
      .then(r => { if (vivo) setDoDia({ chave: chaveDoDia, ...r }) })
      .catch(() => { /* sem a grade: fica o campo de data e hora */ })
    return () => { vivo = false }
  }, [chaveDoDia, unidadeId, profId, diaEscolhido, salaId])
  const gradeDoDia = doDia && doDia.chave === chaveDoDia ? doDia : null
  // A grade de horários do dia (`gradeDoCheckout`, a da `GradeDeHorarios`): o
  // horário que não é dela é encaixe, como no plano (A17 da 10ª). O que cai
  // fora do expediente já tem o aviso dele (`foraDoHorario`).
  const horasDaGrade = gradeDoDia ? gradeDoCheckout(gradeDoDia.horarioDaUnidade ?? null, null, diaEscolhido).map(h => h.hora) : []
  const foraDaGrade = horasDaGrade.length > 0 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(localDT)
    && !horasDaGrade.includes(localDT.slice(11, 16)) && avisosDoMomento.length === 0

  const minDT = useMemo(() => {
    const now = new Date(agora)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  }, [agora])

  return (
    <JanelaModal onFechar={onClose} rotulo="Novo agendamento" largura={520}>
      <div style={{ padding: 'var(--card-pad)' }}>
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

        {/* onSubmit + startTransition, e não `action={formAction}` (J-28): o
            `<form action>` do React REINICIA o formulário ao fim da action, com
            erro ou não — a recusa por conflito apagava a observação digitada.
            Como o cadastro de cliente (client-form). */}
        <form
          ref={formRef}
          onSubmit={e => {
            e.preventDefault()
            // O Enter no campo não fura a espera da conferência (D9).
            if (conferindoOHorario || carregandoSalas) return
            const dados = new FormData(e.currentTarget)
            if (respostaJaExiste) dados.set('_jaExiste', respostaJaExiste)
            startTransition(() => formAction(dados))
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <input type="hidden" name="_branchId" value={unidadeId} />
          <input type="hidden" name="_slug" value={dados.slug} />
          <input type="hidden" name="client_id" value={selectedClient?.id ?? ''} />
          {credito && <input type="hidden" name="credito" value={chaveDoCredito(credito)} />}
          {credito && <input type="hidden" name="procedure_id" value={credito.procedureId} />}

          {/* Na rede o atendimento precisa dizer de qual unidade é: é ela que
              tem a sala, a profissional e a agenda. */}
          {escolheUnidade && (
            <Field label="Unidade *" htmlFor="ag-unidade">
              <select id="ag-unidade" className="field" value={unidadeId} onChange={e => trocarUnidade(e.target.value)} required>
                {!unidadeId && <option value="">Selecione a unidade…</option>}
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
                      title="De outro país, comece com + e o código (ex.: +351 912 345 678)"
                      value={novoTelefone}
                      onChange={e => setNovoTelefone(maskTelefoneDigitando(e.target.value))}
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
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{maskPhone(selectedClient.phone)}</span>
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
                    onChange={e => { mudarBusca(e.target.value); setShowClientList(true) }}
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
                            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{maskPhone(c.phone)}</span>
                          </button>
                        ))
                      ) : (
                        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                            Nenhum resultado para “{clientSearch}”.
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
          {creditosDoCliente.length > 0 && (
            <Field label="Já pago">
              <select className="field" aria-label="Usar o que já foi pago" value={credito ? chaveDoCredito(credito) : ''}
                onChange={e => setCreditoSel(e.target.value)}>
                <option value="">Não usar — cobrar no atendimento</option>
                {creditosDoCliente.map(c => (
                  <option key={chaveDoCredito(c)} value={chaveDoCredito(c)}>
                    {c.procedimento} — {c.origem} · {c.restantes} restante{c.restantes > 1 ? 's' : ''} ({formatBRL(c.preco)})
                  </option>
                ))}
              </select>
              {credito && creditoAutomatico && (
                <p data-credito-pre-escolhido role="status" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>
                  <CheckCircle2 size={13} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
                  Já pago: {credito.origem}{credito.numero && credito.total ? ` (sessão ${credito.numero} de ${credito.total})` : ''} — escolhido porque o procedimento é o mesmo. Para cobrar à parte, escolha “Não usar”.
                </p>
              )}
              {credito && (
                <span data-credito-escolhido style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  O procedimento e o preço vêm do que já foi pago; a recepção não cobra de novo.
                </span>
              )}
            </Field>
          )}

          {credito ? (
            <Field label="Procedimento *">
              <p className="field" style={{ display: 'flex', alignItems: 'center', color: 'var(--text)' }}>
                {credito.procedimento} — já pago ({formatBRL(credito.preco)})
              </p>
            </Field>
          ) : (
          <Field label="Procedimento *" htmlFor="ag-procedimento">
            <select id="ag-procedimento" name="procedure_id" required className="field" disabled={carregandoUnidade} value={procId} onChange={e => setProcId(e.target.value)}>
              <option value="">{carregandoUnidade ? 'Carregando…' : 'Selecione o procedimento…'}</option>
              {dados.procedures.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.duration_min}min — R$ {parseFloat(String(p.price)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
            {avisoDoPlanoAgora && (
              <p data-aviso-do-plano role="status" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', marginTop: 4 }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                <span>
                  {avisoDoPlanoAgora.texto}{' '}
                  <Link href={rotaNoPortal(pathname, dados.slug, `/planejamentos/${avisoDoPlanoAgora.planId}`)} style={{ color: 'var(--brand)', fontWeight: 700 }}>
                    Abrir o plano
                  </Link>
                </span>
              </p>
            )}
          </Field>
          )}

          <div className={temSalas ? 'form-2col' : undefined}>
            <Field label="Profissional *" htmlFor="ag-profissional">
              <select id="ag-profissional" name="professional_id" required className="field" disabled={carregandoUnidade} value={profId} onChange={e => setProfId(e.target.value)}>
                <option value="">{carregandoUnidade ? 'Carregando…' : 'Selecione…'}</option>
                {dados.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {/* Quem realiza (por-01): a agenda AVISA, não barra — o encaixe é da clínica. */}
              {naoRealiza && (
                <p data-aviso-quem-realiza role="status" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', marginTop: 4 }}>
                  <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                  {naoRealiza} não está em “Quem realiza” deste procedimento.
                </p>
              )}
            </Field>

            {/* Unidade sem sala: o campo nem aparece (D5). Com sala, só as que
                servem ao procedimento, com a livre já escolhida. */}
            {temSalas && (
              <Field label="Sala / Cabine" htmlFor="ag-sala">
                <select id="ag-sala" name="room_id" className="field" disabled={carregandoUnidade}
                  value={salaId} onChange={e => setSalaEscolhida(e.target.value)}>
                  <option value="">Sem sala definida</option>
                  {salasOferecidas.map(r => (
                    <option key={r.id} value={r.id}>{r.livre ? r.name : `${r.name} (ocupada)`}</option>
                  ))}
                </select>
                {semSalaLivre && (
                  <p data-aviso-da-sala role="status" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', marginTop: 4 }}>
                    <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                    {salasOferecidas.length === 1 ? 'A sala deste procedimento está ocupada' : 'As salas deste procedimento estão ocupadas'} nesse horário: o agendamento vai sem sala.
                  </p>
                )}
              </Field>
            )}
          </div>

          <Field label="Data e hora *" htmlFor="ag-quando">
            <input
              id="ag-quando"
              type="datetime-local" required className="field"
              value={localDT}
              min={minDT}
              onChange={e => { horaEscolhida.current = true; setLocalDT(e.target.value) }}
            />
            <input type="hidden" name="scheduled_at" value={scheduledAtUTC} />
            {(avisosDoMomento.length > 0 || choque) && (
              <div data-aviso-do-horario role="status" style={{
                display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2,
                background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
              }}>
                {choque && (
                  <div data-choque-do-horario style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-bold)' }}>
                      <Ban size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden /> Não vai ser agendado: {choque}
                    </span>
                    {rotuloDoProximo && proximo && (
                      <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 'var(--text-xs-sz)' }}
                        onClick={() => { horaEscolhida.current = true; setLocalDT(proximo) }}>
                        Usar o próximo livre: {rotuloDoProximo}
                      </button>
                    )}
                  </div>
                )}
                {avisosDoMomento.map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden /> {t}
                  </span>
                ))}
              </div>
            )}
            {/* A17 da 10ª: o horário fora da grade (de 30 em 30 min) é encaixe, como
                diz o "Outro horário (encaixe)" do plano — permitido, e dito. */}
            {foraDaGrade && (
              <p data-fora-da-grade role="status" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 4 }}>
                <AlertTriangle size={13} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
                {localDT.slice(11, 16)} fica fora da grade de 30 em 30 minutos: é um encaixe (permitido).
              </p>
            )}
            {gradeDoDia && (
              <div style={{ marginTop: 6 }}>
                <GradeDeHorarios
                  data={diaEscolhido}
                  horarioDaUnidade={gradeDoDia.horarioDaUnidade ?? null}
                  horarioDoProfissional={gradeDoDia.horarioDoProfissional ?? null}
                  nomeDoProfissional={dados.professionals.find(p => p.id === profId)?.name}
                  ocupado={h => ocupanteDoHorario(new Date(`${diaEscolhido}T${h}:00-03:00`), duracaoMin, gradeDoDia.slots, gradeDoDia.bloqueios ?? [])}
                  selecionado={localDT.slice(11, 16)}
                  onEscolher={h => { horaEscolhida.current = true; setLocalDT(`${diaEscolhido}T${h}`) }}
                  carregando={false}
                  semOutroHorario
                />
              </div>
            )}
          </Field>

          <Field label="Observações internas" htmlFor="ag-notas">
            <textarea id="ag-notas" name="notes" rows={2} className="field" placeholder="Preferências, contraindicações…" style={{ resize: 'vertical' }} />
          </Field>

          {state?.jaExiste && novoContato && !selectedClient && (
            <PerguntaJaExiste
              ficha={state.jaExiste} pending={pending}
              aoCadastrarMesmoAssim={id => {
                const resposta = [...respostaJaExiste.split(' ').filter(Boolean), `cadastrar:${id}`].join(' ')
                setRespostaJaExiste(resposta)
                reenviar(resposta)
              }}
              aoAtualizar={id => reenviar(`atualizar:${id}`)}
            />
          )}

          {state?.error && (
            <p role="alert" style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
              {recusadoPorChoque ? `Não foi agendado: ${conflitoDoAviso}` : state.error}
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
              disabled={pending || !podeAgendar || carregandoSalas || conferindoOHorario}
              className="btn-primary"
              style={{ opacity: podeAgendar ? 1 : 0.5 }}
            >
              <Calendar size={14} />
              {pending ? 'Agendando…' : conferindoOHorario ? 'Conferindo o horário…' : 'Confirmar agendamento'}
            </button>
          </div>
        </form>
      </div>
    </JanelaModal>
  )
}
