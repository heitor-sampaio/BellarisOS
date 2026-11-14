'use client'
import { FormasDePagamento, FORMAS_DO_BALCAO } from '@/components/shared/formas-de-pagamento'
import { useFuso } from '@/components/shared/fuso'
import { instanteNoFuso, dayKeyTZ, addDaysTZ, BUSINESS_TZ } from '@/lib/datetime'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AlertTriangle, Check, ChevronRight, User, FileText, CreditCard, CalendarCheck, Stethoscope, Clock, FileSignature, ScrollText } from 'lucide-react'
import { checkoutTreatmentPlan, cancelCheckout, avulsosDoPlanoNoCheckout } from '@/actions/treatment-plans'
import { prepararDocumentosDoCheckout, documentoParaAssinar } from '@/actions/documentos'
import { TelaDeAssinatura, type DocumentoNaTela } from '@/components/shared/tela-de-assinatura'
import type { ResumoDeDocumento } from '@/lib/documentos/leitura'
import { avisoDasVazias } from '@/lib/documentos/variaveis'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import type { SessionScheduleInput, PlanSessionForCheckout } from '@/actions/treatment-plans'
import { getSchedulingBranchProfessionals, getSchedulingDaySlots } from '@/actions/appointments'
import { GradeDeHorarios } from '@/components/shared/grade-de-horarios'
import { EnviarLinkDeAssinatura } from '@/components/shared/enviar-link-de-assinatura'
import { ocupanteDoHorario } from '@/lib/agenda/horario-livre'
import type { Horario } from '@/lib/agenda/horario'
import { rotaCliente, rotaAtendimento } from '@/lib/rotas'
import { textoDaExigenciaDoModelo } from '@/lib/checkout/exigencia-do-modelo'
import Link from 'next/link'
import { lerEntrada, erroDaEntrada, recusaDaEntradaAcimaDoTotal } from '@/lib/checkout/entrada'
import { parcelasEmTexto } from '@/lib/checkout/resumo-do-pagamento'
import { CampoDoDesconto, SEM_DESCONTO, contaDoDesconto, descontoDoEstado, estadoDoDesconto } from '@/components/shared/campo-do-desconto'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { CampoDaBandeira, CampoDaMaquininha, useFaltaAMaquininha } from '@/components/shared/campo-da-bandeira'
import { SaldoDoCredito } from '@/components/shared/saldo-do-credito'
import { textoDasSessoesSemData, avisoDoPlanoFechado } from '@/lib/checkout/sessoes-sem-data'
import { toast } from 'sonner'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { useOpcoesDeParcelas } from '@/components/shared/use-maximo-de-vezes'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { CampoQuemVendeu, PerguntaDaVenda } from '@/components/shared/pergunta-da-venda'
import { textoDaComissaoDaVenda } from '@/lib/comissoes/comissao-da-venda'
import type { MembroDaVenda } from '@/components/shared/vender'
import { PERGUNTA_SEM_VENDEDOR } from '@/lib/vendas/pergunta-sem-vendedor'
import { unicaOpcao } from '@/lib/uma-opcao'
import { lerPassoDoCheckout, gravarPassoDoCheckout, limparPassoDoCheckout, type PassoDoCheckout } from '@/lib/checkout/passo-do-checkout'
import { maskPhone } from '@estetica-os/utils'
import { documentoNaTela } from '@/lib/clients/documento-na-tela'

// -- Types ---------------------------------------------------------------------

export interface CheckoutPlan {
  id:                string
  status:            string
  professionalNotes: string | null
  clientName:        string
  clientDocument:    string | null
  clientPhone:       string | null
  clientId:          string
  branchName:        string
  medicalRecordId:   string | null
  sessions:         PlanSessionForCheckout[]
  total:            number
  professionals:    { id: string; name: string }[]
  branches:         { id: string; name: string }[]
  currentBranchId:  string
  /**
   * O atendimento que gerou o plano, com preço e ainda não recebido: vai junto
   * quando algo é recebido agora (2026-10-20 — o checkout cobrava só o plano).
   */
  atendimentoDeHoje: { appointmentId: string; procedimento: string; preco: number } | null
  /**
   * O pacote do catálogo com a mesma composição, mais barato (2026-10-21):
   * "Fechar como pacote" põe a economia como desconto do plano.
   */
  pacoteEquivalente?: { id: string; nome: string; preco: number; economia: number } | null
  /**
   * A equipe do "Quem vendeu" (decisão 4 da 7ª simulação): a comissão de VENDA
   * do plano vai para quem vendeu. Sem a lista, o campo não aparece.
   */
  equipe?: MembroDaVenda[]
  /** A13 da 13ª: quem vendeu, guardado no plano desde a documentação. */
  vendidoPor?: string | null
  /** C42: a "Venda de plano" da clínica (%), para dizer a comissão antes de vender. */
  comissaoDoPlanoPct?: number | null
  /**
   * A36 da 9ª simulação: o contrato de plano JÁ ASSINADO e o pagamento que ele
   * diz. Reabrir o checkout zerava o pagamento na tela e mantinha o "Assinado":
   * a tela parte dele e diz que mudar as condições pede um contrato novo.
   */
  contratoAssinado?: { titulo: string; pagamento: PagamentoDoPlano | null; desconto: number; frase: string } | null
  /** A35 da 9ª: a rede tem contrato de plano e a ficha não tem CPF, passaporte nem RNE (só aviso — princípio 2). */
  contratoSemDocumento?: boolean
}

interface DaySlot {
  scheduledAt: string
  durationMin: number
  clientName:  string | null
}

interface Props {
  plan: CheckoutPlan
  slug: string
  /**
   * Quem recebe mas não gerencia agenda fecha a venda sem marcar horário — o
   * passo de agendamento some e as sessões ficam para marcar depois. A action
   * confere o mesmo, então esconder aqui não é a única defesa.
   */
  podeAgendar?: boolean
  /**
   * Pode cobrar agora (caixa ou financeiro). Sem isso, a única forma oferecida é
   * "receber no atendimento": a profissional aceita o plano e o dinheiro fica
   * para o balcão. A action confere o mesmo.
   */
  podeCobrar?: boolean
  /** Fechou tudo: usado quando o wizard roda dentro da tela do atendimento. */
  onDone?: (clientId: string) => void
}

// -- Helpers -------------------------------------------------------------------

/** C42: a comissão de venda de quem vendeu o plano, antes de vender (a da pessoa; sem ela, a "Venda de plano" da clínica). */
function comissaoDaVendaDoPlano(plan: CheckoutPlan, vendedorId: string): string | null {
  const quem = (plan.equipe ?? []).find(m => m.id === vendedorId)
  if (!quem) return null
  return textoDaComissaoDaVenda({ tipo: 'PLANO', pessoa: { nome: quem.nome, pct: quem.comissaoVendaPct }, itens: [{ regra: null }], clinicaPct: plan.comissaoDoPlanoPct ?? null })
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAYMENT_METHODS = [
  { value: 'PIX',           label: 'Pix' },
  { value: 'CASH',          label: 'Dinheiro' },
  { value: 'DEBIT_CARD',    label: 'Débito' },
  { value: 'CREDIT_CARD',   label: 'Crédito' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito interno' },
]

// Pagamento ANTES da documentação: o contrato de plano cita a forma de
// pagamento, e ele só pode ser montado depois de ela estar escolhida.
const STEPS = [
  { label: 'Plano',         icon: Stethoscope  },
  { label: 'Pagamento',     icon: CreditCard    },
  { label: 'Documentação',  icon: FileText      },
  { label: 'Agendamento',   icon: CalendarCheck },
]

// -- Componente principal ------------------------------------------------------

export function CheckoutWizard({ plan, slug, podeAgendar = true, podeCobrar = true, onDone }: Props) {
  // A hora escolhida é a do relógio da unidade (F62).
  const fuso = useFuso()
  const router = useRouter()
  const pathname = usePathname()
  const total  = plan.total

  const [step, setStep] = useState(0)

  // Documentação — os termos dos procedimentos e o contrato de plano
  // (§9.4.1), montados com o pagamento escolhido no passo anterior. O que
  // BLOQUEIA sem assinatura trava o passo; o servidor confere o mesmo.
  const [docs,       setDocs]       = useState<ResumoDeDocumento[] | null>(null)
  const [assinando,  setAssinando]  = useState<DocumentoNaTela | null>(null)
  const [preparando, startPreparar] = useTransition()
  const [abrindo,    startAbrir]    = useTransition()
  // O contrato assinado para OUTRO pagamento (A45): o servidor pergunta antes de substituir.
  const [substitui,  setSubstitui]  = useState<{ titulo: string; pagamento: string } | null>(null)
  // O avulso agendado de um procedimento do plano (A68): a cliente pagaria os dois.
  const [avulsos, setAvulsos] = useState<{ id: string; texto: string }[]>([])
  useEffect(() => {
    let vivo = true
    avulsosDoPlanoNoCheckout(plan.id).then(r => { if (vivo) setAvulsos(r) }).catch(() => {})
    return () => { vivo = false }
  }, [plan.id])

  const aberto = (d: ResumoDeDocumento) => d.status === 'A_GERAR' || d.status === 'PENDENTE' || d.status === 'INCOMPLETO'
  // PT1c (o Heitor, 13/11: "primeiro colhe assinatura, depois paga"): o que
  // segura o RECEBER é o contrato de plano, que cita o pagamento; os termos se
  // assinam quando a cliente quiser.
  const documentosQueTravam = (docs ?? []).filter(d => aberto(d) && d.tipo === 'CONTRATO_PLANO')

  // Pagamento — plano de milhares de reais raramente é à vista, então a forma
  // vem antes do método: nada agora, à vista, entrada + parcelas, ou a receber.
  //
  // O padrão é NADA_AGORA: aceitar o plano e pagar por ele são gestos
  // diferentes. Quem aceita é o cliente, na sala; quem recebe é o balcão, na
  // chegada da primeira sessão. Cobrar aqui obrigava a profissional a operar
  // caixa — ou o plano a ficar parado numa fila esperando a recepção.
  // A37 da 6ª simulação: a forma nasce VAZIA — o Pix era o padrão calado.
  const [paymentMethod, setPaymentMethod] = useState('')
  const [formaPgto,     setFormaPgto]     = useState<'NADA_AGORA' | 'AVISTA' | 'PARCELADO' | 'A_RECEBER'>('AVISTA')
  const [entrada,       setEntrada]       = useState('')
  const [parcelas,      setParcelas]      = useState(3)
  // À vista no cartão de crédito: em quantas vezes na maquininha (pago na hora).
  const [vezesCartao,   setVezesCartao]   = useState(1)
  // r3-f13-01: a bandeira do cartão, opcional (vazia = a regra geral).
  const [bandeira,      setBandeira]      = useState('')
  // C75: "Qual maquininha?" (só com mais de uma na rede).
  const [maquininha,    setMaquininha]    = useState('')
  // Até quantas vezes a clínica parcela no crédito (D-15).
  const opcoesDeVezes = useOpcoesDeVezes(maquininha)
  // C38: o crediário até o limite da rede (padrão 12).
  const opcoesDeParcelas = useOpcoesDeParcelas()
  // O atendimento que gerou o plano entra junto quando algo é recebido agora.
  const recebeHoje   = !!plan.atendimentoDeHoje && (formaPgto === 'AVISTA' || formaPgto === 'PARCELADO')
  const precoDeHoje  = plan.atendimentoDeHoje?.preco ?? 0
  // Daqui a 30 dias no relógio da unidade (F64), não no do aparelho.
  const [primeiroVenc,  setPrimeiroVenc]  = useState(() =>
    dayKeyTZ(addDaysTZ(new Date(), 30, fuso), fuso),
  )

  // Desconto do fechamento (2026-09-30): R$ ou %, sobre a soma dos
  // procedimentos. Daqui para baixo toda conta é sobre o que o cliente paga.
  const [desconto, setDesconto] = useState(SEM_DESCONTO)

  // "Quem vendeu" (decisão 4 da 7ª): nasce VAZIO, como em toda venda
  // (r2-ven-12); vazio, a venda pergunta antes de seguir (com-06).
  const temQuemVendeu = !!plan.equipe
  const [vendedorId,  setVendedorId]  = useState('')
  const [semVendedor, setSemVendedor] = useState(false)
  const [perguntaDoVendedor, setPerguntaDoVendedor] = useState<string | null>(null)
  const contaDesc = contaDoDesconto(total, desconto)
  const liquido   = contaDesc.liquido

  // A regra de todo campo de dinheiro (D3): "1.400,00" dava NaN e "1.400", R$ 1,40.
  // O ilegível NÃO vira R$ 0 calado (frente de cadastro, 2026-10-29): o aviso de
  // todo campo de dinheiro, e o checkout não avança (`recusaDaEntrada`).
  const entradaLida = lerEntrada(entrada)
  // E a entrada acima do total é recusada, não cortada (ven-02 — "o plano custa
  // R$ 900 e a Bruna digita entrada de R$ 1.000; grava R$ 900 sem dizer nada").
  const recusaDaEntrada = formaPgto === 'PARCELADO'
    ? erroDaEntrada(entrada) ?? ('valor' in entradaLida ? recusaDaEntradaAcimaDoTotal(entradaLida.valor, liquido, 'do plano') : null)
    : null
  const entradaNum = Math.max(0, Math.min('valor' in entradaLida ? entradaLida.valor : 0, liquido))
  const saldo      = Math.round((liquido - entradaNum) * 100) / 100
  // D2 da 7ª: as parcelas como serão GRAVADAS ("2x de R$ 890,66 + 1x de R$ 890,68"), não a média.
  const textoDasParcelas = parcelasEmTexto(saldo, parcelas)

  // Agendamento — compartilhado por todas as sessões
  const [schedBranchId, setSchedBranchId] = useState(plan.currentBranchId)
  const [schedProfs,    setSchedProfs]    = useState<{ id: string; name: string }[]>([])
  // Nasce carregando quando já há filial; cada troca liga de novo no handler.
  const [loadingProfs,  setLoadingProfs]  = useState(!!plan.currentBranchId)
  const [schedProfId,   setSchedProfId]   = useState('')

  // Por sessão: key = planSessionId → { date, time }
  const [sessionDates,  setSessionDates]  = useState<Record<string, { date: string; time: string }>>({})
  const [activeSession, setActiveSession] = useState(plan.sessions[0]?.id ?? '')

  const activeDate = sessionDates[activeSession]?.date ?? ''
  const activeTime = sessionDates[activeSession]?.time ?? ''

  // Os horários do dia valem para UMA combinação de filial, profissional, data
  // e sessão. Guardados junto com a chave dela: enquanto a resposta da chave
  // atual não chega, a lista é vazia e "carregando" — derivado, sem zerar nada
  // dentro de efeito.
  const chaveDosSlots = schedBranchId && schedProfId && activeDate
    ? `${schedBranchId}|${schedProfId}|${activeDate}|${activeSession}`
    : ''
  // Com os horários da unidade e do profissional: a grade cobre a janela da unidade (D8).
  const [slotsLidos, setSlotsLidos] = useState<{
    chave: string; slots: DaySlot[]; bloqueios: { inicio: string; fim: string; motivo: string }[]; unidade: Horario | null; profissional: Horario | null
  }>({ chave: '', slots: [], bloqueios: [], unidade: null, profissional: null })
  const daySlots     = chaveDosSlots && slotsLidos.chave === chaveDosSlots ? slotsLidos.slots : []
  const loadingSlots = !!chaveDosSlots && slotsLidos.chave !== chaveDosSlots

  const [submitting,   startSubmit]   = useTransition()
  const [error,        setError]      = useState<string | null>(null)
  const [cancelling,   startCancel]   = useTransition()
  const [showCancel,   setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // Trocar a filial zera o profissional e liga o "carregando"; o efeito abaixo
  // só busca a equipe dela.
  function trocarFilialDoAgendamento(id: string) {
    setSchedBranchId(id)
    if (!id) return
    setLoadingProfs(true)
    setProfId('')
  }

  // Busca profissionais quando branch muda
  useEffect(() => {
    if (!schedBranchId) return
    getSchedulingBranchProfessionals(schedBranchId).then(res => {
      setSchedProfs(res.professionals)
      setLoadingProfs(false)
      // A2 da 10ª: com UMA profissional na unidade, ela vem escolhida.
      const unica = unicaOpcao(res.professionals)
      if (unica) setSchedProfId(atual => atual || unica)
    })
  }, [schedBranchId])

  function setProfId(v: string) {
    setSchedProfId(v)
    setSessionDates({})
    setActiveSession(plan.sessions[0]?.id ?? '')
  }

  // Busca slots quando profissional + sessão ativa + data mudam
  useEffect(() => {
    if (!chaveDosSlots || !schedBranchId) return
    getSchedulingDaySlots(schedBranchId, schedProfId, activeDate).then(res => {
      setSlotsLidos({ chave: chaveDosSlots, slots: res.slots, bloqueios: res.bloqueios ?? [], unidade: res.horarioDaUnidade ?? null, profissional: res.horarioDoProfissional ?? null })
    })
  }, [chaveDosSlots, schedBranchId, schedProfId, activeDate])

  function setActiveDate(date: string) {
    setSessionDates(prev => ({ ...prev, [activeSession]: { date, time: '' } }))
  }

  function setActiveTime(time: string) {
    setSessionDates(prev => ({
      ...prev,
      [activeSession]: { date: prev[activeSession]?.date ?? '', time },
    }))
  }

  // A régua única do horário livre (D5 da 8ª): a sessão INTEIRA (a duração
  // dela, como o servidor confere) contra os agendamentos e os bloqueios.
  function isSlotBooked(time: string): { clientName: string | null; rotulo?: string } | null {
    if (!activeDate) return null
    const duracao = plan.sessions.find(s => s.id === activeSession)?.mainDurationMin || 60
    return ocupanteDoHorario(instanteNoFuso(activeDate, time, fuso), duracao, daySlots, slotsLidos.chave === chaveDosSlots ? slotsLidos.bloqueios : [])
  }

  // A37: o que se recebe agora (à vista, entrada + parcelas) pede a forma.
  // PDV8: no crediário a forma é o crediário — o meio é só o da ENTRADA.
  const semForma = (formaPgto === 'AVISTA' || (formaPgto === 'PARCELADO' && entradaNum > 0)) && !paymentMethod
  const faltaAMaquininha = useFaltaAMaquininha(formaPgto === 'AVISTA' || (formaPgto === 'PARCELADO' && entradaNum > 0) ? paymentMethod : null, maquininha)

  // -- Documentação: monta os documentos com o pagamento escolhido -----------
  // Voltar ao pagamento e trocá-lo monta de novo — e o contrato já assinado
  // com o pagamento antigo é substituído (o servidor decide, não a tela).
  function irParaDocumentos(substituirContrato = false, confirmouSemVendedor = semVendedor, depois?: (itens: ResumoDeDocumento[]) => void) {
    setError(recusaDaEntrada)
    if (recusaDaEntrada) return
    // A pergunta do "Quem vendeu" vazio, ANTES dos documentos (o servidor faz a mesma).
    if (temQuemVendeu && !vendedorId && !confirmouSemVendedor) { setPerguntaDoVendedor(PERGUNTA_SEM_VENDEDOR); return }
    setPerguntaDoVendedor(null)
    setSubstitui(null)
    startPreparar(async () => {
      const r = await prepararDocumentosDoCheckout(plan.id, montarPagamento(), descontoDoEstado(desconto), { substituirContrato, ...(temQuemVendeu ? { vendedorId: vendedorId || null } : {}) })
      if (r.error) { setError(r.error); return }
      if (r.substituiContrato) { setSubstitui(r.substituiContrato); return }
      setDocs(r.itens ?? [])
      setStep(2)
      depois?.(r.itens ?? [])
    })
  }

  // -- O passo em que estava, ao recarregar (A45 da 7ª simulação) -------------
  // O sessionStorage (morre com a aba) guarda o passo e o pagamento; ao voltar,
  // a tela os relê e, da documentação em diante, monta os documentos de novo
  // com o MESMO pagamento (o contrato já assinado para ele fica).
  const [retomada, setRetomada] = useState<PassoDoCheckout | null>(null)
  const [passoLido, setPassoLido] = useState(false)
  useEffect(() => {
    const r = lerPassoDoCheckout(plan.id)
    /* eslint-disable react-hooks/set-state-in-effect -- o sessionStorage só existe no navegador: ler na renderização desencontraria a hidratação */
    // No passo 0 nada do pagamento foi escolhido ainda: o guardado não diz nada,
    // e o contrato assinado (A36) vale.
    if (r && (r.step > 0 || !plan.contratoAssinado)) {
      setFormaPgto(r.formaPgto); setPaymentMethod(r.paymentMethod); setEntrada(r.entrada); setParcelas(r.parcelas)
      setVezesCartao(r.vezesCartao); setBandeira(r.bandeira); setMaquininha(r.maquininha ?? ''); if (r.primeiroVenc) setPrimeiroVenc(r.primeiroVenc)
      setDesconto(r.desconto); setVendedorId(r.vendedorId); setSemVendedor(r.semVendedor)
      setStep(Math.min(r.step, 1))
      if (r.step >= 2) setRetomada(r)
    } else if (plan.contratoAssinado) {
      // A36 da 9ª: sem o passo guardado (outra aba, outro dia), o pagamento é o
      // que a cliente ASSINOU — não o "Receber no atendimento" de nascença.
      const p = plan.contratoAssinado.pagamento
      // O dia do vencimento: o "AAAA-MM-DD" do campo passa como veio; a âncora
      // do meio-dia (vencimentoDoDia) se lê em Brasília (F64).
      const dia = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : dayKeyTZ(iso, BUSINESS_TZ)
      if (!p) setFormaPgto('AVISTA')
      else {
        setFormaPgto(p.forma)
        setPaymentMethod(p.metodo ?? '')
        if (p.forma === 'AVISTA') setVezesCartao(p.vezes ?? 1)
        if (p.forma === 'PARCELADO') {
          setEntrada(p.entrada > 0 ? p.entrada.toFixed(2).replace('.', ',') : '')
          setParcelas(p.parcelas); setPrimeiroVenc(dia(p.primeiroVencimento)); setVezesCartao(p.vezes ?? 1)
        }
        if (p.forma === 'A_RECEBER' && p.vencimento) setPrimeiroVenc(dia(p.vencimento))
      }
      if (plan.contratoAssinado.desconto > 0) setDesconto(estadoDoDesconto(plan.contratoAssinado.desconto))
    }
    // A13 da 13ª: sem o passo guardado (outra aba, outro dia), quem vendeu é o
    // que ficou no plano na documentação — o que a pessoa escolheu continua escolhido.
    if (!(r && (r.step > 0 || !plan.contratoAssinado)) && plan.vendidoPor && (plan.equipe ?? []).some(m => m.id === plan.vendidoPor)) {
      setVendedorId(plan.vendidoPor)
    }
    setPassoLido(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    // Só ao abrir o checkout (o plano). Com `plan.contratoAssinado` aqui, cada
    // refresh da tela (assinar um documento chama router.refresh) trazia um
    // objeto NOVO, o efeito rodava de novo, voltava ao Pagamento e remontava a
    // documentação: o "Documento assinado" sumia e o mesmo termo reabria (a
    // completa de 07/11, F46). O contrato assinado DURANTE o checkout já é o
    // pagamento da tela; o retrato só vale para quem chega.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relê o passo uma vez por plano, não a cada refresh
  }, [plan.id])
  useEffect(() => {
    if (!retomada) return
    const alvo = retomada.step
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- a retomada roda uma vez, depois de o pagamento guardado voltar ao estado */
    setRetomada(null)
    irParaDocumentos(false, retomada.semVendedor, itens => {
      if (alvo === 3 && podeAgendar && !itens.some(d => aberto(d) && d.tipo === 'CONTRATO_PLANO')) setStep(3)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a retomada chega
  }, [retomada])
  useEffect(() => {
    if (!passoLido) return
    gravarPassoDoCheckout(plan.id, { step, formaPgto, paymentMethod, entrada, parcelas, vezesCartao, bandeira, maquininha, primeiroVenc, desconto, vendedorId, semVendedor })
  }, [passoLido, plan.id, step, formaPgto, paymentMethod, entrada, parcelas, vezesCartao, bandeira, maquininha, primeiroVenc, desconto, vendedorId, semVendedor])

  function abrirParaAssinar(id: string) {
    setError(null)
    startAbrir(async () => {
      const r = await documentoParaAssinar(id)
      if (r.error || !r.doc) { setError(r.error ?? 'Não consegui abrir o documento.'); return }
      setAssinando(r.doc)
    })
  }

  // -- Finalizar checkout -------------------------------------------------------
  /** O que a action precisa saber sobre o dinheiro. */
  function montarPagamento(): PagamentoDoPlano | null {
    // `null` = aceito sem cobrar. O valor nasce em aberto e aparece no check-in
    // do primeiro atendimento, com o botão de receber.
    if (formaPgto === 'NADA_AGORA') return null
    const noCartao = paymentMethod === 'CREDIT_CARD' || paymentMethod === 'DEBIT_CARD'
    const comBandeira = { ...(bandeira && noCartao ? { bandeira } : {}), ...(maquininha && noCartao ? { maquininha } : {}) }
    if (formaPgto === 'PARCELADO') {
      // PDV8: sem entrada, nada se recebe agora — nenhum meio.
      const comEntrada = entradaNum > 0
      return {
        forma:              'PARCELADO',
        metodo:             comEntrada ? paymentMethod || null : null,
        entrada:            entradaNum,
        parcelas,
        primeiroVencimento: new Date(`${primeiroVenc}T12:00:00-03:00`).toISOString(),
        // D5: as vezes da ENTRADA no crédito (a maquininha).
        ...(paymentMethod === 'CREDIT_CARD' && comEntrada && vezesCartao > 1 ? { vezes: vezesCartao } : {}),
        ...(comEntrada ? comBandeira : {}),
      }
    }
    if (formaPgto === 'A_RECEBER') {
      // PDV8: o a receber não tem meio — a forma se escolhe quando o dinheiro entra.
      return {
        forma:      'A_RECEBER',
        vencimento: new Date(`${primeiroVenc}T12:00:00-03:00`).toISOString(),
      }
    }
    return paymentMethod === 'CREDIT_CARD' && vezesCartao > 1
      ? { forma: 'AVISTA', metodo: paymentMethod, vezes: vezesCartao, ...comBandeira }
      : { forma: 'AVISTA', metodo: paymentMethod, ...comBandeira }
  }

  function handleFinish() {
    setError(recusaDaEntrada)
    if (recusaDaEntrada) return
    const semData = plan.sessions.map((s, i) => ({ s, n: i + 1 }))
      .filter(({ s }) => !(sessionDates[s.id]?.date && sessionDates[s.id]?.time && schedProfId && schedBranchId)).map(x => x.n)
    const schedules: SessionScheduleInput[] = plan.sessions
      .filter(s => {
        const d = sessionDates[s.id]
        return d?.date && d?.time && schedProfId && schedBranchId
      })
      .map(s => {
        const d = sessionDates[s.id]!
        return {
          planSessionId:  s.id,
          scheduledAt:    instanteNoFuso(d.date, d.time, fuso).toISOString(),
          professionalId: schedProfId,
          branchId:       schedBranchId,
        }
      })

    startSubmit(async () => {
      const result = await checkoutTreatmentPlan(plan.id, montarPagamento(), schedules, slug, descontoDoEstado(desconto),
        temQuemVendeu ? { vendedorId: vendedorId || null, semVendedor } : undefined)
      if (result.error) { setError(result.error); return }
      // O servidor pergunta o mesmo que a tela (a pergunta já foi respondida no pagamento).
      if ('confirmarSemVendedor' in result && result.confirmarSemVendedor) { setError(result.confirmarSemVendedor); return }
      // O plano fechou; só o atendimento de hoje não foi recebido — a pessoa precisa saber.
      // O plano fechou (com ou sem o aviso do atendimento de hoje): o passo guardado não serve mais.
      limparPassoDoCheckout(plan.id)
      if ('aviso' in result && result.aviso) { setError(result.aviso); return }
      // D8 da 12ª: a sala única do procedimento estava ocupada — a sessão foi sem sala.
      if ('avisoDaSala' in result && result.avisoDaSala) toast.warning(result.avisoDaSala, { duration: 10_000 })
      // A37 da 8ª: concluir caía na ficha sem confirmação nenhuma.
      toast.success(avisoDoPlanoFechado(plan.sessions.length, semData))
      if (onDone) { onDone(plan.clientId); return }
      router.push(rotaCliente(pathname, slug, plan.clientId))
    })
  }

  function handleCancel() {
    startCancel(async () => {
      const result = await cancelCheckout(plan.id, cancelReason, slug)
      if (result.error) { setError(result.error); setShowCancel(false); return }
      limparPassoDoCheckout(plan.id)
      router.push(rotaCliente(pathname, slug, plan.clientId))
    })
  }

  // A35 da 9ª: o contrato vai sem o documento da cliente — avisa antes de
  // emitir, sem recusar (princípio 2); completar o cadastro é na ficha.
  const avisoSemDocumento = plan.contratoSemDocumento ? (
    <div data-contrato-sem-documento role="note" style={{ padding: '12px 14px', marginBottom: 16, borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AlertTriangle size={15} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        O cadastro de {plan.clientName} não tem CPF (nem passaporte ou RNE): o contrato do plano sai sem esse documento.
        Para incluir, complete o cadastro antes de ir para a documentação.{' '}
        <Link href={`${rotaCliente(pathname, slug, plan.clientId)}?aba=dados`} style={{ color: 'var(--brand)', fontWeight: 700 }}>Completar o cadastro</Link>
      </p>
    </div>
  ) : null

  // O "Cancelar checkout" devolvia o plano PROPOSTO ao rascunho; o plano agora
  // chega aqui já aceito (PT1b), e cancelá-lo é do Financeiro, pela página dele.
  const cancelBlock = plan.status !== 'PROPOSED' ? null : showCancel ? (
    <div style={{ marginTop: 24, padding: '18px 20px', borderRadius: 'var(--radius-field-token)', border: '1.5px solid var(--danger-border)', background: 'var(--danger-soft)' }}>
      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>
        Cancelar checkout
      </p>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', marginBottom: 12 }}>
        O plano voltará para rascunho e o profissional poderá revisá-lo antes de reenviar.
      </p>
      <textarea
        value={cancelReason}
        onChange={e => setCancelReason(e.target.value)}
        placeholder="Motivo do cancelamento (opcional)…"
        rows={2}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 'var(--text-base-sz)', resize: 'vertical',
          border: '1px solid var(--danger-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          boxSizing: 'border-box', marginBottom: 12,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowCancel(false)}
          style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--surface)', cursor: cancelling ? 'wait' : 'pointer' }}
        >
          {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowCancel(true)}
      style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: 'none', background: 'none', fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}
    >
      Cancelar checkout
    </button>
  )

  // -- Progress bar -------------------------------------------------------------
  // Sem permissão de agenda o checkout tem três passos, não quatro.
  const passos = podeAgendar ? STEPS : STEPS.slice(0, 3)

  const progressBar = (
    <div data-passo-atual={passos[step]?.label} style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {passos.map((s, i) => {
        const done    = i < step
        const current = i === step
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < passos.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background:  done ? 'var(--success-soft)' : current ? 'var(--brand)' : 'var(--bg-app)',
                border:      done ? '1.5px solid var(--success)' : current ? 'none' : '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {done
                  ? <Check size={16} color="var(--success)" />
                  : <s.icon size={15} color={current ? 'var(--surface)' : 'var(--text-faint)'} />}
              </div>
              <span style={{
                fontSize: 'var(--text-2xs)', fontWeight: current ? 700 : 600,
                color: current ? 'var(--brand)' : done ? 'var(--success)' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
            </div>
            {i < passos.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? 'var(--success)' : 'var(--hairline)', margin: '0 8px', marginBottom: 22 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  // -- Renderização dos passos ---------------------------------------------------

  // PASSO 0: Revisão do plano
  if (step === 0) return (
    <div>
      {progressBar}

      {avulsos.length > 0 && (
        <div data-avulso-do-plano role="note" style={{ padding: '12px 14px', marginBottom: 16, borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={15} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {avulsos.map(a => (
              <p key={a.id} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 700 }}>
                {a.texto}.{' '}
                <Link href={rotaAtendimento(pathname, slug, a.id)} style={{ color: 'var(--brand)' }}>Abrir</Link>
              </p>
            ))}
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              Fechado o plano, a cliente paga os dois. Se o agendamento é uma sessão deste plano, cancele o avulso e agende pela sessão.
            </p>
          </div>
        </div>
      )}

      {/* Card do cliente */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--brand-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <User size={20} style={{ color: 'var(--brand)' }} />
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{plan.clientName}</p>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            {/* A45 da 11ª: com máscara ("CPF 005.159.962-70 · (31) 99700-0013"); o passaporte/RNE fica como veio. */}
            {plan.clientDocument ? `CPF ${documentoNaTela(plan.clientDocument)}` : 'CPF não informado'}
            {plan.clientPhone ? ` · ${maskPhone(plan.clientPhone)}` : ''}
          </p>
        </div>
      </div>

      {avisoSemDocumento}

      {/* Sessões do plano */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Plano de tratamento — {plan.sessions.length} sessão(ões)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.sessions.map((sess, i) => (
            <div key={sess.id} style={{
              borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--hairline)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-overline)', fontWeight: 800, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>Sessão {i + 1}</span>
                </div>
                <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--brand)' }}>{fmtBRL(sess.totalPrice)}</span>
              </div>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sess.procedures.map((p, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stethoscope size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                      {p.name}
                    </span>
                    <span>{fmtBRL(p.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {plan.professionalNotes && (
          <p style={{ marginTop: 14, fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', fontStyle: 'italic', paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
            “{plan.professionalNotes}”
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Total: {fmtBRL(total)}</span>
        </div>
      </div>

      {plan.atendimentoDeHoje && (
        <div data-testid="atendimento-de-hoje" className="card" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
            Atendimento de hoje — {plan.atendimentoDeHoje.procedimento} · {fmtBRL(plan.atendimentoDeHoje.preco)}
          </p>
          {/* A38 da 6ª simulação: aqui só o fato — se ele entra no checkout, quem
              diz é o passo do pagamento, pela forma escolhida (uma frase só). */}
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            Ainda não foi recebido. O plano acima é das PRÓXIMAS sessões.
          </p>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button onClick={() => { setError(null); setStep(1) }}
        style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-card-title)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brand-btn)' }}>
        Confirmar plano <ChevronRight size={18} />
      </button>

      {cancelBlock}
    </div>
  )

  // PASSO 1: Pagamento
  if (step === 1) return (
    <div>
      {progressBar}

      {/* Como vai ser pago */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 14 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Como vai ser pago
        </p>
        {temQuemVendeu && (
          <div data-quem-vendeu-do-plano style={{ marginBottom: 16, maxWidth: 420 }}>
            <CampoQuemVendeu equipe={plan.equipe ?? []} valor={vendedorId}
              comissao={comissaoDaVendaDoPlano(plan, vendedorId)}
              aoMudar={id => { setVendedorId(id); setSemVendedor(false); setPerguntaDoVendedor(null) }} />
          </div>
        )}
        {/* PT1b (o Heitor, 13/11): aceitar não cobra — o plano já chega aceito, e
            aqui é o RECEBER (no PDV). PDV8: as formas lado a lado — o bloco de
            um meio é o à vista nele; o Crediário e o A receber são formas. */}
        {podeCobrar && (
          <div style={{ marginBottom: 16 }}>
            <FormasDePagamento formas={[...FORMAS_DO_BALCAO, 'CREDIARIO', 'A_RECEBER']}
              valor={formaPgto === 'AVISTA' ? paymentMethod : formaPgto === 'PARCELADO' ? 'CREDIARIO' : formaPgto}
              aoMudar={f => {
                if (f === 'CREDIARIO') { setFormaPgto('PARCELADO'); setPaymentMethod('') }
                else if (f === 'A_RECEBER') { setFormaPgto('A_RECEBER'); setPaymentMethod('') }
                else { setFormaPgto('AVISTA'); setPaymentMethod(f) }
                setVezesCartao(1); setBandeira(''); setMaquininha('')
              }} />
          </div>
        )}
        {plan.pacoteEquivalente && (() => {
          const pac = plan.pacoteEquivalente
          const aplicado = contaDesc.reais === pac.economia
          return (
            <div data-pacote-equivalente style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                <strong>{pac.nome}</strong> tem as mesmas sessões: {fmtBRL(pac.preco)} (economia de {fmtBRL(pac.economia)})
              </p>
              {aplicado ? (
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)' }}>Preço do pacote aplicado</span>
              ) : (
                <button type="button" className="btn-primary" onClick={() => setDesconto(estadoDoDesconto(pac.economia))}>
                  Fechar como pacote
                </button>
              )}
            </div>
          )
        })()}
        <div style={{ marginBottom: 16, maxWidth: 360 }}>
          <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={total} comMotivo />
        </div>

        {plan.atendimentoDeHoje && (
          <div data-testid="atendimento-de-hoje-no-pagamento" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
              Atendimento de hoje — {plan.atendimentoDeHoje.procedimento} · {fmtBRL(plan.atendimentoDeHoje.preco)}
            </p>
            {/* A38: UMA frase, a do que o sistema faz com a forma escolhida. */}
            <p data-hoje-entra={recebeHoje ? 'sim' : 'nao'} style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
              {recebeHoje
                ? `Entra neste checkout: ${fmtBRL(precoDeHoje)} cobrados junto com o que se recebe agora, no mesmo meio${paymentMethod === 'CREDIT_CARD' && vezesCartao > 1 ? ` e nas mesmas ${vezesCartao}x` : ''}.`
                : 'Não entra neste checkout: receba pela tela do atendimento.'}
            </p>
          </div>
        )}

        {formaPgto === 'PARCELADO' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-2col">
              <div>
                <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Entrada (opcional)</label>
                <input
                  inputMode="decimal" aria-label="Entrada" value={entrada} onChange={e => setEntrada(e.target.value)}
                  placeholder="0,00" className="field" style={{ marginTop: 5 }}
                />
                {recusaDaEntrada && (
                  <p role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)', marginTop: 4 }}>
                    {recusaDaEntrada}
                  </p>
                )}
              </div>
              {/* PDV8: com entrada, ela pede a forma dela; sem entrada, nada se recebe agora. */}
              {entradaNum > 0 && (
                <div>
                  <label htmlFor="checkout-forma-da-entrada" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Forma da entrada *</label>
                  <select id="checkout-forma-da-entrada" value={paymentMethod} className="field" style={{ marginTop: 5 }}
                    onChange={e => { setPaymentMethod(e.target.value); setVezesCartao(1); setBandeira(''); setMaquininha('') }}>
                    <option value="">Selecione…</option>
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="checkout-parcelas-do-saldo" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Parcelas do saldo</label>
                <select id="checkout-parcelas-do-saldo" value={parcelas} onChange={e => setParcelas(Number(e.target.value))} className="field" style={{ marginTop: 5 }}>
                  {opcoesDeParcelas.map(n => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Vencimento da 1ª parcela</label>
              <input type="date" value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} className="field" style={{ marginTop: 5 }} />
            </div>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
              {entradaNum > 0 && <>Entrada de {fmtBRL(entradaNum)} agora · </>}
              <span data-parcelas-do-saldo>{textoDasParcelas ?? `${parcelas}x de ${fmtBRL(0)}`}</span> a partir de {primeiroVenc.split('-').reverse().join('/')}
            </p>
          </div>
        )}

        {formaPgto === 'A_RECEBER' && (
          <div>
            <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Vencimento</label>
            <input type="date" value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} className="field" style={{ marginTop: 5, maxWidth: 220 }} />
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', marginTop: 8 }}>
              Nada entra no caixa agora — o valor fica como a receber.
            </p>
          </div>
        )}

        {formaPgto === 'NADA_AGORA' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.55, flex: 1, minWidth: 220 }}>
              O plano é aceito por {fmtBRL(liquido)} e o valor fica em aberto. A recepção
              recebe na chegada da primeira sessão, pela tela do atendimento.
            </p>
            <span style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{fmtBRL(liquido)}</span>
          </div>
        )}
      </div>

      {formaPgto !== 'NADA_AGORA' && (
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          O que se recebe agora
        </p>
        {/* A36 da 8ª: com o crédito na clínica, o saldo dela e o que sobra. */}
        {(formaPgto === 'AVISTA' || formaPgto === 'PARCELADO') && paymentMethod === 'INTERNAL_CREDIT' && (
          <div style={{ marginBottom: 16 }}>
            <SaldoDoCredito clienteId={plan.clientId} valor={formaPgto === 'PARCELADO' ? entradaNum : liquido} />
          </div>
        )}
        {(formaPgto === 'AVISTA' || (formaPgto === 'PARCELADO' && entradaNum > 0)) && (
          <div style={{ marginBottom: 16, maxWidth: 260 }}>
            <CampoDaMaquininha metodo={paymentMethod} valor={maquininha} aoMudar={v => { setMaquininha(v); setVezesCartao(1) }} />
          </div>
        )}
        {/* D5: na entrada + parcelas, a ENTRADA no crédito também em N vezes. */}
        {(formaPgto === 'AVISTA' || (formaPgto === 'PARCELADO' && entradaNum > 0)) && paymentMethod === 'CREDIT_CARD' && (
          <div style={{ marginBottom: 16, maxWidth: 220 }}>
            <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>
              {formaPgto === 'PARCELADO' ? 'Vezes no cartão (a entrada)' : 'Vezes no cartão'}
              <select value={vezesCartao} onChange={e => setVezesCartao(Number(e.target.value))} className="field" style={{ marginTop: 5 }} aria-label="Vezes no cartão">
                {opcoesDeVezes.map(n => (
                  <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>
                ))}
              </select>
            </label>
            <DicaDasVezes total={(formaPgto === 'PARCELADO' ? entradaNum : liquido) + (recebeHoje ? precoDeHoje : 0)} vezes={vezesCartao} opcoes={opcoesDeVezes} />
            <AvisoDaTaxa vezes={vezesCartao} bandeira={bandeira} maquininha={maquininha} total={(formaPgto === 'PARCELADO' ? entradaNum : liquido) + (recebeHoje ? precoDeHoje : 0)} />
          </div>
        )}
        {(formaPgto === 'AVISTA' || formaPgto === 'PARCELADO') && (
          <div style={{ marginBottom: 16, maxWidth: 260 }}>
            <CampoDaBandeira metodo={paymentMethod} valor={bandeira} aoMudar={setBandeira} maquininha={maquininha} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
            {formaPgto === 'AVISTA' ? 'Total a cobrar' : formaPgto === 'PARCELADO' ? 'Recebido agora' : 'Total a receber'}
            {recebeHoje && ' (com o atendimento de hoje)'}
          </span>
          <span style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {fmtBRL((formaPgto === 'AVISTA' ? liquido : formaPgto === 'PARCELADO' ? entradaNum : 0) + (recebeHoje ? precoDeHoje : 0))}
          </span>
        </div>
        {formaPgto !== 'AVISTA' && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'right' }}>
            Plano de {fmtBRL(liquido)}
          </p>
        )}
      </div>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      {/* A36 da 9ª: o contrato assinado diz este pagamento; mudar pede um novo (princípio 3). */}
      {plan.contratoAssinado && !substitui && (
        <div data-contrato-assinado-com role="note" style={{ padding: '12px 14px', marginBottom: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--info-soft)', border: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ScrollText size={15} aria-hidden="true" style={{ color: 'var(--info)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            O contrato “{plan.contratoAssinado.titulo}” já foi assinado com este pagamento: {plan.contratoAssinado.frase}.
            Mudar as condições pede um contrato novo: a cliente assina de novo.
          </p>
        </div>
      )}

      {avisoSemDocumento}

      {/* A45 da 5ª simulação: o contrato assinado virava SUBSTITUIDO sem aviso. */}
      {substitui && (
        <div data-substitui-contrato role="alert" style={{ padding: '12px 14px', marginBottom: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 700, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={15} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
            <span>O contrato “{substitui.titulo}” já foi assinado para outro pagamento ({substitui.pagamento}).</span>
          </p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            Seguir com este pagamento substitui o contrato: o assinado fica guardado como substituído, e a cliente assina o novo.
            Para manter o contrato, volte ao pagamento combinado.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => setSubstitui(null)}>Manter o pagamento combinado</button>
            <button type="button" className="btn-primary" disabled={preparando} onClick={() => irParaDocumentos(true)}>Substituir o contrato</button>
          </div>
        </div>
      )}

      {perguntaDoVendedor && (
        <div style={{ marginBottom: 12 }}>
          <PerguntaDaVenda texto={perguntaDoVendedor} pendente={preparando} rotuloConfirmar="Vender assim"
            aoVoltar={() => setPerguntaDoVendedor(null)}
            aoConfirmar={() => { setSemVendedor(true); irParaDocumentos(false, true) }} />
        </div>
      )}

      <button
        onClick={() => irParaDocumentos()} disabled={preparando || !!contaDesc.recusa || semForma || !!faltaAMaquininha} title={faltaAMaquininha ?? undefined}
        style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-card-title)', border: 'none', cursor: preparando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brand-btn)' }}>
        {preparando ? 'Montando os documentos…' : 'Ir para a documentação'} <ChevronRight size={18} />
      </button>

      {cancelBlock}
    </div>
  )

  // PASSO 2: Documentação — os termos dos procedimentos e o contrato de plano,
  // já com o pagamento. Assinar abre a tela de assinatura AQUI dentro: sair da
  // página perderia o que foi escolhido no pagamento.
  if (step === 2) {
    if (assinando) return (
      <div>
        {progressBar}
        <TelaDeAssinatura doc={assinando} podeColher aoTerminar={() => { setAssinando(null); irParaDocumentos() }} />
      </div>
    )
    const podeSeguir = documentosQueTravam.length === 0
    return (
      <div>
        {progressBar}
        <div className="card" style={{ padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Documentos para assinar
          </p>
          {(docs ?? []).length === 0 && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              Nenhum documento configurado para este plano. O contrato de plano e os termos dos procedimentos
              se montam em Configurações → Documentos.
            </p>
          )}
          {(docs ?? []).map(d => {
            const Icone = d.tipo === 'CONTRATO_PLANO' ? ScrollText : FileSignature
            return (
              <div key={d.id} data-documento={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--hairline)', background: 'var(--bg-app)' }}>
                <Icone size={16} color="var(--brand)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{d.titulo}</p>
                  {d.status === 'INCOMPLETO' && (
                    <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>
                      Falta no cadastro do cliente: {d.faltando.join(', ')}.
                    </p>
                  )}
                  {/* D6 da 12ª: o que sai vazio NESTE plano, antes de colher ou mandar o link (só aviso — princípio 2). */}
                  {(d.status === 'PENDENTE' || d.status === 'INCOMPLETO') && avisoDasVazias(d.vazias) && (
                    <p data-variaveis-vazias style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600, marginTop: 2 }}>
                      {avisoDasVazias(d.vazias)}
                    </p>
                  )}
                </div>
                {d.status === 'ASSINADO'
                  ? <span className="chip chip-success"><Check size={12} /> Assinado</span>
                  : d.status === 'DISPENSADO'
                    ? <span className="chip chip-muted">Dispensado</span>
                    : d.status === 'INCOMPLETO'
                      ? <span className="chip chip-warning">Faltam dados</span>
                      : <button type="button" className="btn-primary" disabled={abrindo || preparando} onClick={() => abrirParaAssinar(d.id)}
                          style={{ padding: '7px 14px', fontSize: 'var(--text-sm-sz)' }}>
                          Colher assinatura
                        </button>}
                {/* A8 da 11ª: ou mandar o link — sem sair do checkout (sair o reabria do início). */}
                {d.status === 'PENDENTE' && <EnviarLinkDeAssinatura documentoId={d.id} jaEnviadoAte={d.linkAte} />}
              </div>
            )
          })}
        </div>

        {/* A28 da 10ª: quem exige a assinatura é o modelo, que a clínica configura. */}
        {documentosQueTravam.length > 0 && (
          <p data-exigencia-do-modelo style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            {textoDaExigenciaDoModelo(documentosQueTravam.map(d => d.titulo))}
          </p>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

        <button
          type="button"
          onClick={() => (podeAgendar ? setStep(3) : handleFinish())}
          // Enquanto a lista se atualiza (voltou de uma assinatura), ela ainda
          // mostra o estado de antes: nada se clica até ela chegar.
          disabled={!podeSeguir || submitting || preparando}
          className="btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: 'var(--text-card-title)', justifyContent: 'center', gap: 8 }}
        >
          {podeSeguir
            ? (podeAgendar ? 'Ir para o agendamento' : 'Receber o plano')
            : `Falta assinar: ${documentosQueTravam.map(d => d.titulo).join(', ')}`}
          <ChevronRight size={18} />
        </button>
        <button type="button" className="btn-ghost" onClick={() => setStep(1)} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
          Voltar ao pagamento
        </button>

        {cancelBlock}
      </div>
    )
  }

  // PASSO 3: Agendamento
  const minDate = dayKeyTZ(new Date(), fuso)
  const scheduledCount = plan.sessions.filter(s => sessionDates[s.id]?.date && sessionDates[s.id]?.time).length

  return (
    <div>
      {progressBar}

      {/* Filial + Profissional (compartilhados) */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          {/* Com uma unidade só, não há unidade a escolher (F8). */}
          {plan.branches.length > 1 ? 'Unidade e profissional' : 'Profissional'}
        </p>

        {/* Filial */}
        {plan.branches.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <select
              className="filtro-select"
              aria-label="Unidade do agendamento"
              value={schedBranchId ?? ''}
              onChange={e => trocarFilialDoAgendamento(e.target.value)}
            >
              {plan.branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.id === plan.currentBranchId ? ' (atual)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Profissional */}
        {loadingProfs ? (
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>Carregando profissionais…</p>
        ) : schedProfs.length === 0 ? (
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>Nenhum profissional nesta unidade.</p>
        ) : (
          <select
            className="filtro-select"
            aria-label="Profissional do agendamento"
            value={schedProfId ?? ''}
            onChange={e => setProfId(e.target.value)}
          >
            <option value="">Escolher profissional</option>
            {schedProfs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Tabs por sessão */}
      {schedProfId && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Agendamento por sessão
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {plan.sessions.map((sess, i) => {
              const hasDate  = !!(sessionDates[sess.id]?.date && sessionDates[sess.id]?.time)
              const isActive = activeSession === sess.id
              const label    = plan.sessions.length === 1
                ? 'Sessão única'
                : `Sessão ${i + 1}`
              const subLabel = sess.procedures.map(p => p.name).join(' · ')
              return (
                <button key={sess.id} type="button" onClick={() => setActiveSession(sess.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700, cursor: 'pointer',
                    border:     isActive ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                    background: isActive ? 'var(--brand-soft)'      : hasDate ? 'var(--success-bg)' : 'var(--surface)',
                    color:      isActive ? 'var(--brand)'           : hasDate ? 'var(--success)' : 'var(--text-muted)',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                  }}>
                  <span>{hasDate ? <Check size={10} style={{ display: 'inline', marginRight: 3 }} /> : null}{label}</span>
                  {subLabel && <span style={{ fontSize: 'var(--text-overline)', fontWeight: 500, opacity: 0.7 }}>{subLabel}</span>}
                </button>
              )
            })}
          </div>

          {/* Data */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Data</label>
            <input
              type="date" min={minDate} value={activeDate}
              onChange={e => setActiveDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)', fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg-app)', boxSizing: 'border-box' as const }}
            />
          </div>

          {/* Grade de horários */}
          {activeDate && (
            <>
              <GradeDeHorarios
                data={activeDate}
                horarioDaUnidade={slotsLidos.unidade}
                horarioDoProfissional={slotsLidos.profissional}
                nomeDoProfissional={schedProfs.find(p => p.id === schedProfId)?.name}
                ocupado={isSlotBooked}
                selecionado={activeTime}
                onEscolher={setActiveTime}
                carregando={loadingSlots}
              />

              {activeTime && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--brand-soft)' }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)' }}>
                    <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {activeDate.split('-').reverse().join('/')} às {activeTime} · {schedProfs.find(p => p.id === schedProfId)?.name}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resumo de sessões agendadas */}
      {scheduledCount > 0 && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em' }}>
            <Check size={12} style={{ display: 'inline', marginRight: 4 }} />
            {scheduledCount} de {plan.sessions.length} {plan.sessions.length === 1 ? 'sessão' : 'sessões'} com data definida
          </p>
        </div>
      )}

      {/* A37 da 8ª: as sessões que ficam sem data, ditas antes de concluir. */}
      {(() => {
        const texto = textoDasSessoesSemData(plan.sessions.map((s, i) => ({ s, n: i + 1 }))
          .filter(({ s }) => !(sessionDates[s.id]?.date && sessionDates[s.id]?.time)).map(x => x.n))
        return texto && (
          <p data-sessoes-sem-data style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 14 }}>{texto}</p>
        )
      })()}

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button
        type="button"
        onClick={() => handleFinish()}
        disabled={submitting}
        style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-card-title)', border: 'none', cursor: submitting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brand-btn)' }}>
        {submitting ? 'Finalizando…' : scheduledCount > 0 ? 'Concluir' : 'Concluir sem agendar'}
      </button>

      {cancelBlock}
    </div>
  )
}
