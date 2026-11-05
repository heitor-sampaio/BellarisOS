'use client'

import React, { useActionState, useEffect, useEffectEvent, useState, useRef } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Phone, Mail, Calendar, ChevronLeft, MoreHorizontal, Stethoscope, Plus, X, Loader2, Clock, CheckCircle2, Receipt, Check, UserPlus, Smartphone, Star, CalendarPlus, CalendarCheck, DoorOpen, XCircle, AlertCircle, CreditCard, ClipboardList, ClipboardCheck, Package, FileCheck, FileText, FileDown, type LucideIcon } from 'lucide-react'
import { grantInternalCredit, updateClientContactData, lookupClientByCpf, toggleClientStatus, darAcessoAoApp } from '@/actions/clients'
import { avisoDoAcessoCriado, avisoDosAgendamentosAoArquivar } from '@/lib/clients/textos-do-cadastro'
import { BotaoComConfirmacao } from '@/components/shared/botao-com-confirmacao'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { TreatmentFileModal } from './treatment-file-modal'
import { CancelarPacote } from '@/components/shared/cancelar-pacote'
import { ClientDocumentsTab } from './client-documents-tab'
import type { ClientDocumentItem } from './client-documents-tab'
import { TermosDoCliente, type ItemDeTermo } from '@/components/shared/termos-do-cliente'
import { AnamnesisFormRenderer, type AnamnesisAnswers } from './anamnesis-form-renderer'
import { AttendanceRecordCard } from './attendance-record-card'
import { ExportarLgpdDaFicha } from './exportar-lgpd-da-ficha'
import { AnamneseGeralCartao } from './anamnese-geral'
import { alergiasDaAnamnese, type AnamneseGeral } from '@/lib/anamnese-geral'
import { AlertaDeAlergia } from '@/components/shared/alerta-de-alergia'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { TagBadge } from '@/components/shared/tag-badge'
import { LeadTimeline } from './lead-timeline'
import { PainelPlanejamento } from '@/components/branch/painel-planejamento'
import { rotaAgenda, rotaClientes } from '@/lib/rotas'
import { rotaComParams } from '@/lib/query-params'
import { isUnitTag, unitTag, unitTagName, iniciaisDoNome, maskPhone, TIPOS_DE_DOCUMENTO } from '@estetica-os/utils'
import { useTagsDaRede } from '@/components/shared/use-tags-da-rede'
import { alternarTag, opcoesDeTag, temTag } from '@/lib/tags/escolha'
import { format, isSameDay, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FidelidadeDoCliente } from '@/components/branch/fidelidade-do-cliente'
import type { FidelidadeDoPerfil } from '@/lib/fidelidade/leitura'
import type { PacoteAVenda } from '@/components/shared/vender-pacote'
import { Vender, type ProcedimentoAVenda, type ProdutoAVenda, type MembroDaVenda } from '@/components/shared/vender'
import { ProcedimentosPagos } from '@/components/shared/procedimentos-pagos'
import type { PrePagoDoCliente } from '@/lib/pre-pago/leitura'
import { AcessosAoProntuario, type AcessoNaFicha } from '@/components/branch/acessos-ao-prontuario'
import { AtendimentosAReceber } from '@/components/shared/atendimentos-a-receber'
import type { ListaAReceber } from '@/lib/metrics/a-receber'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { Dica } from '@/components/shared/dica'
import { DEFINICOES } from '@/lib/metrics/definicoes'
import { textoDasRestantes } from '@/lib/pre-pago/contagem'
import { ResponsavelLegal, RESPONSAVEL_VAZIO } from '@/components/shared/responsavel-legal'
import { avisoDoMenor, ehMenorDeIdade, linhaDoResponsavel, type ResponsavelLegal as ResponsavelDaFicha } from '@/lib/clients/menor'
import { documentoDoAcesso } from '@/lib/clients/documento-do-acesso'

// -- Types --------------------------------------------------------------------

export interface ProfileClient {
  id:                 string
  name:               string
  phone:              string
  email:              string | null
  document:           string | null
  /** O documento de quem não tem CPF (D-11): o tipo e o número. Nulo = o documento é o CPF. */
  documentoTipo?:     'PASSAPORTE' | 'RNE' | null
  documentoNumero?:   string | null
  birthDate:          string | null
  gender:             string | null
  tags:               string[]
  notes:              string | null
  isActive:           boolean
  createdAt:          string
  zipCode:            string | null
  address:            string | null
  addressNumber:      string | null
  addressComplement:  string | null
  neighborhood:       string | null
  city:               string | null
  state:              string | null
  /** A ficha tem login no app (o acesso pode ser dado depois do cadastro). */
  temAcesso?:         boolean
  /** O responsável legal da menor (decisão 2 do Heitor, 2026-11-05). */
  responsavel?:       ResponsavelDaFicha | null
}

export interface ProfileStats {
  totalSessions:  number
  totalInvested:  number
  /** Nulo sem atendimento cobrado: "—", não R$ 0,00 (2026-10-27). */
  /** A média por atendimento da ficha (serviço ÷ cobrados) — não é o ticket médio do sistema. */
  mediaPorAtendimento: number | null
  age:            number | null
}

export interface ProfileAppointment {
  id:              string
  scheduledAt:     string
  price:           number
  status:          string
  procedureName:   string
  professionalName: string
}

export interface ProfilePackage {
  id:            string
  name:          string
  totalSessions: number
  usedSessions:  number
  /** Das restantes, quantas já têm agendamento (A27). */
  scheduledSessions?: number
  procedureId:   string
  procedureName: string
  price:         number
  durationMin:   number
  planId?:       string   // set for avulso multi-session plans (no client_package)
  planStatus?:   string
}

export interface ProfileTransaction {
  id:            string
  description:   string
  amount:        number
  paymentMethod: string | null
  isPaid:        boolean
  paidAt:        string | null
  createdAt:     string
  procedureName: string | null
  scheduledAt:   string | null
  /**
   * Vencimento. Desde 2026-09-30 cada parcela é um lançamento ("— parcela
   * 2/3" na descrição), e o que está em aberto mostra quando vence.
   */
  dueDate:       string | null
  isCheckout?:   boolean
  /** Cartão de crédito em N vezes (2–12), pago na hora. */
  cartaoVezes?:  number | null
  /**
   * A forma pronta para a tela (`formaDoLancamento`): o meio pelo nome; a
   * parcela do crediário sem meio, "Com a clínica" (D6). Ausente: o meio puro.
   */
  forma?:        string | null
  /** A40: a venda de produto paga que não pontua (fidelidade ligada, produto sem pontos). */
  semPontos?:    boolean
  /** O recebimento estornado (`notes = 'Estornada'`) — não é "Pago" (D6, 2026-10-28). */
  estornada?:    boolean
  /** A contra-transação do estorno (`category = 'Estorno'`). */
  estorno?:      boolean
  /** Dinheiro que SAIU (EXPENSE): o estorno devolvido à cliente, com o sinal de menos. */
  saida?:        boolean
}

export interface ProfileInternalCredit {
  id:          string
  amount:      number
  description: string
  createdAt:   string
}

export interface ClientHistoryEvent {
  id:       string
  date:     string
  type:
    | 'CLIENT_CREATED'
    | 'APP_ACCOUNT'
    | 'APPOINTMENT_SCHEDULED'
    | 'APPOINTMENT_CONFIRMED'
    | 'APPOINTMENT_ARRIVED'
    | 'APPOINTMENT_COMPLETED'
    | 'APPOINTMENT_CANCELLED'
    | 'APPOINTMENT_NO_SHOW'
    | 'PAYMENT'
    | 'PLAN_PROPOSED'
    | 'PLAN_ACCEPTED'
    | 'PLAN_CANCELLED'
    | 'PACKAGE_PURCHASED'
    | 'PACKAGE_CANCELLED'
    | 'CONSENT_SIGNED'
    | 'APPOINTMENT_RATED'
  title:    string
  subtitle: string | null
  amount:   number | null
  link:     string | null
  /** Quem fez (appointment_history, J-27) — com a marca "via suporte", quando foi o suporte. */
  autor?:   string | null
}

export interface ProfileFormSnapshot {
  name:    string
  rows:    AnamnesisRow[]
  answers: Record<string, unknown>
}

export interface ProfileRecordEntry {
  appointmentId: string
  createdAt:     string
  /** O dia do atendimento (hora marcada), dd/mm/aaaa em Brasília (J-56). */
  diaDoAtendimento?: string
  procedureName: string | null
  /** A ficha do procedimento — uma so desde 2026-09-25. */
  ficha:         ProfileFormSnapshot | null
  /** A evolução e a intercorrência gravadas ao concluir (D4, 2026-10-27). */
  evolucao:        string | null
  intercorrencias: string | null
  /** As dores do cliente registradas no atendimento (D3, 2026-10-28). */
  queixas?:        string | null
}

interface Props {
  client:                ProfileClient
  branchId:              string
  stats:                 ProfileStats
  upcomingAppointments:  ProfileAppointment[]
  recentAppointments:    ProfileAppointment[]
  allAppointments?:      ProfileAppointment[]
  /** Nulo = programa de fidelidade desligado ou cargo sem o módulo: nada de pontos na ficha. */
  fidelidade:            FidelidadeDoPerfil | null
  activePackage:         ProfilePackage | null
  transactions:          ProfileTransaction[]
  internalCredits:       ProfileInternalCredit[]
  documents:             ClientDocumentItem[]
  recordForms?:          ProfileRecordEntry[]
  /** Quem vê o prontuário: a aba aparece mesmo sem atendimento registrado. */
  podeVerProntuario?:    boolean
  /** Os planejamentos de injetáveis retratados nas fichas que quem vê pode abrir (2026-10-29). */
  planejamentosQueAbrem?: string[]
  /** Quem abriu o prontuário — só para o admin da rede (nulo para os demais). */
  acessosAoProntuario?:  { itens: AcessoNaFicha[]; total: number } | null
  generalAnamnesis?:     AnamneseGeral | null
  canGrantCredit:        boolean
  branches:              { id: string; name: string }[]
  currentBranchId:       string
  slug:                  string
  canManageProcedures:   boolean
  /** Pode anexar e apagar anexo CLÍNICO (exame, laudo…) — prontuário MANAGE. */
  podeAnexarClinico?:    boolean
  /** Anexar o que não é clínico (RG, comprovante…): o cadastro (`clients: MANAGE`). */
  podeAnexarComum?:      boolean
  /** O financeiro do cliente (pagamentos, crédito): `financial` ou quem recebe. */
  veFinanceiro?:         boolean
  /** Os totais da aba Financeiro, do banco (lib/clientes/financeiro-da-ficha.ts). */
  totaisFinanceiros?:    { pago: number; aReceber: number; credito: number | null }
  /** A aba Financeiro recortada pelos atendimentos de quem vê (D6, 2026-10-27). */
  financeiroSoOsProprios?: boolean
  isNetworkWide:         boolean
  /**
   * Cliente da REDE: `clients.branch_id` nulo. Os gestos que gravam por filial
   * (credito interno) passam a perguntar a unidade em vez de herdarem uma.
   */
  clienteSemFilial?:     boolean
  clientHistory:         ClientHistoryEvent[]
  /** Procedimentos que podem entrar num plano de tratamento (sem os de avaliação). */
  planProcedures?:       { id: string; name: string; category: string; price: number; durationMin: number; products?: { productId: string; name: string; unit: string; quantity: number }[] }[]
  /** Insumos disponíveis, para o editor do plano. */
  planProducts?:         { id: string; name: string; unit: string }[]
  /** Pode receber: habilita fechar o plano ali mesmo. */
  podeReceber?:          boolean
  /** O catálogo de pacotes à venda (só para quem recebe). */
  pacotesAVenda?:        PacoteAVenda[]
  /** Os procedimentos à venda como pré-pago (só para quem recebe). */
  procedimentosAVenda?:  ProcedimentoAVenda[]
  /** Os produtos de revenda à venda (D4; só para quem recebe). */
  produtosAVenda?:       ProdutoAVenda[]
  /** A equipe da unidade, para a venda (com-04: a responsável do pacote; com-06: quem vendeu). */
  equipeDaVenda?:        MembroDaVenda[]
  /** Os procedimentos pré-pagos do cliente, com as unidades. */
  prePagos?:             PrePagoDoCliente[]
  /** Pode agendar (agenda: MANAGE): a unidade pré-paga se agenda da ficha, e o "+ Agendar" (A23). */
  podeAgendar?:          boolean
  /**
   * Editar o cadastro (Clientes em Gerenciar): a aba Dados, as anotações e o
   * arquivar. Quem só vê lê tudo isso e não edita (D5, 2026-11-01: "quem só
   * pode ver só pode ver").
   */
  podeEditarCadastro?:   boolean
  /** Incluir o prontuário no pacote LGPD da ficha (A21): `medical_records: MANAGE`. */
  podeExportarProntuario?: boolean
  /** Os planos de tratamento (Agenda em Ver, a de `getPlanosDoCliente`); sem eles, o Planejamento é só injetáveis (D6). */
  podeVerPlanos?:        boolean
  /** Cancelar o pacote (F2b, 2026-11-01): `financial: MANAGE`. */
  podeCancelarPacote?:   boolean
  /** Oportunidades ligadas a este cliente — abertas e concluídas. */
  opportunities?:        ClientOpportunity[]
  /** Termos e contratos. Nulo = cargo sem o módulo `documents`: a seção não aparece. */
  termos?:               { itens: ItemDeTermo[]; podeColher: boolean; pelaConversa?: boolean } | null
  /** Os atendimentos concluídos e não pagos desta cliente (D5, 2026-10-27). */
  aReceber?:             ListaAReceber
  /** Receber o atendimento (o módulo de recebimentos, como `confirmPayment`). */
  podeReceberAtendimento?: boolean
}

/** Uma oportunidade na ficha do cliente: só o que a leitura precisa. */
export interface ClientOpportunity {
  id:          string
  funnel_name: string | null
  stage_name:  string | null
  stage_color: string | null
  outcome:     'OPEN' | 'WON' | 'LOST'
  owner_name:  string | null
  /** Valor negociado. Null = ainda sem proposta. */
  value:       number | null
  created_at:  string
}

/**
 * Anotações sobre a pessoa, no topo da ficha.
 *
 * `clients.notes` existia desde sempre e só era gravada no cadastro — depois
 * disso não havia onde ler nem editar. Fica na visão geral porque é o tipo de
 * coisa que se quer ver ANTES de atender ("prefere à tarde", "alérgica a
 * lidocaína"), não escondida numa aba de dados cadastrais.
 *
 * Salva ao sair do campo, e não a cada tecla: é texto corrido, e um salvamento
 * por palavra digitada não serve a ninguém.
 */
/**
 * Os documentos abertos que o CADASTRO trava (A24 da 7ª simulação,
 * 2026-11-05): "Faltam dados: CPF" só aparecia na janela do agendamento e na
 * aba Documentos — a recepção descobria na hora de assinar. O que falta no
 * pagamento do contrato é outra coisa (a recepção o define nos Termos).
 */
export function faltaNoCadastro(itens: ItemDeTermo[]): { titulo: string; faltando: string[] }[] {
  return itens
    .filter(i => i.status === 'INCOMPLETO')
    .map(i => ({ titulo: i.titulo, faltando: i.faltando.filter(f => !f.startsWith('Pagamento ·')).map(f => f.replace(/^Cliente · /, '')) }))
    .filter(i => i.faltando.length > 0)
}

const formatarDiaDaFalta = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))

/**
 * O que a recepção precisa ver ao abrir a ficha, antes do resto: a menor sem
 * responsável (decisão 2), o documento que o cadastro trava (A24) e as faltas
 * (A25 da 7ª: a falta só aparecia no Histórico). Nada aparece sem o que dizer.
 */
function AvisosDaVisaoGeral({ menor, faltando, faltas, linkDosDados, linkDoHistorico }: {
  menor: string | null
  faltando: { titulo: string; faltando: string[] }[]
  faltas: ProfileAppointment[]
  linkDosDados: string
  linkDoHistorico: string
}) {
  if (!menor && !faltando.length && !faltas.length) return null
  const ultima = [...faltas].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0]
  const linha: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', padding: '10px 14px',
    borderRadius: 'var(--radius-field-token)', fontSize: 'var(--text-sm-sz)', lineHeight: 'var(--leading-snug)',
  }
  const link: React.CSSProperties = { color: 'var(--brand)', fontWeight: 'var(--weight-bold)', textDecoration: 'none' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {menor && (
        <p data-aviso-do-menor role="note" style={{ ...linha, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-border)', fontWeight: 'var(--weight-semibold)' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} /> <span style={{ flex: 1, minWidth: 200 }}>{menor}</span>
          <Link href={linkDosDados} scroll={false} style={link}>Abrir Dados</Link>
        </p>
      )}
      {faltando.map(f => (
        <p key={f.titulo} data-falta-no-cadastro role="note" style={{ ...linha, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-border)', fontWeight: 'var(--weight-semibold)' }}>
          <FileText size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1, minWidth: 200 }}>“{f.titulo}” não pode ser assinado: falta no cadastro {f.faltando.join(', ')}.</span>
          <Link href={linkDosDados} scroll={false} style={link}>Completar o cadastro</Link>
        </p>
      ))}
      {ultima && (
        <p data-faltas-da-cliente style={{ ...linha, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          <XCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1, minWidth: 200 }}>
            {faltas.length === 1 ? 'Não compareceu 1 vez' : `Não compareceu ${faltas.length} vezes`}: a última em {formatarDiaDaFalta(ultima.scheduledAt)} ({ultima.procedureName}).
          </span>
          <Link href={linkDoHistorico} scroll={false} style={link}>Ver no Histórico</Link>
        </p>
      )}
    </div>
  )
}

function NotasDoCliente({
  client, slug, podeEditar,
}: { client: ProfileClient; slug: string; /** Clientes em Gerenciar: quem só vê lê as anotações (D5). */ podeEditar: boolean }) {
  const [texto, setTexto] = useState(client.notes ?? '')
  const [estado, setEstado] = useState<'ocioso' | 'salvando' | 'salvo' | 'erro'>('ocioso')
  const salvoRef = useRef(client.notes ?? '')

  async function salvar() {
    if (!podeEditar || texto === salvoRef.current) return
    setEstado('salvando')
    const res = await updateClientContactData(
      client.id,
      {
        document: client.document, phone: client.phone, email: client.email,
        birthDate: client.birthDate, zipCode: client.zipCode, address: client.address,
        addressNumber: client.addressNumber, addressComplement: client.addressComplement,
        neighborhood: client.neighborhood, city: client.city, state: client.state,
        notes: texto,
      },
      slug,
    )
    if (res.error) { setEstado('erro'); return }
    salvoRef.current = texto
    setEstado('salvo')
  }

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p className="overline" style={{ margin: 0 }}>ANOTAÇÕES</p>
        {estado === 'salvando' && <span style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)' }}>salvando…</span>}
        {estado === 'salvo' && (
          <span style={{ fontSize: 'var(--text-overline)', color: 'var(--success)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Check size={11} /> salvo
          </span>
        )}
        {estado === 'erro' && (
          <span style={{ fontSize: 'var(--text-overline)', color: 'var(--warning)', fontWeight: 700 }}>não foi possível salvar</span>
        )}
      </div>
      {/* Quem autoriza é o servidor (`assertPermission(ctx, 'clients', 'MANAGE')`
          em `updateClientContactData`), como no resto desta ficha. */}
      <textarea
        value={texto}
        readOnly={!podeEditar}
        onChange={e => { setTexto(e.target.value); setEstado('ocioso') }}
        onBlur={salvar}
        rows={2}
        placeholder="Preferências, restrições, combinados… o que ajudar quem for atender."
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          fontSize: 'var(--text-base-sz)', fontFamily: 'inherit', color: 'var(--text)',
          resize: 'vertical', lineHeight: 1.5,
        }}
      />
    </div>
  )
}

// -- Helpers ------------------------------------------------------------------

function getInitials(name: string) {
  return iniciaisDoNome(name)
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// -- Sub-components -----------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  COMPLETED:   'Concluído',
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  ARRIVED:     'Chegou',
  IN_PROGRESS: 'Em atendimento',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}

type TabKey = 'visao' | 'historico' | 'oportunidades' | 'planejamento' | 'fichas' | 'financeiro' | 'documentos' | 'dados'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'visao',      label: 'Visão geral' },
  { key: 'historico',  label: 'Histórico' },
  // Separada do histórico de propósito: uma conta o ATENDIMENTO (agendou, veio,
  // pagou) e a outra a NEGOCIAÇÃO (o que foi proposto, ganho, perdido). Ser
  // cliente não encerra a segunda — reativação é negociar com quem já comprou.
  { key: 'oportunidades', label: 'Oportunidades' },
  // O plano de tratamento é do cliente: vários ao longo do tempo, criados
  // aqui ou durante um atendimento.
  { key: 'planejamento', label: 'Planejamento' },
  // A chave fica 'fichas' (os links com ?aba=fichas continuam valendo).
  { key: 'fichas',     label: 'Prontuário' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'dados',      label: 'Dados' },
]

type HistoryCfg = {
  dotColor: string
  bgColor:  string
  Icon:     LucideIcon
}
const HISTORY_CONFIG: Record<ClientHistoryEvent['type'], HistoryCfg> = {
  CLIENT_CREATED:        { dotColor: 'var(--brand)', bgColor: 'var(--brand-soft)', Icon: UserPlus },
  APP_ACCOUNT:           { dotColor: 'var(--info)', bgColor: 'var(--info-soft)', Icon: Smartphone },
  APPOINTMENT_SCHEDULED: { dotColor: 'var(--info)', bgColor: 'var(--info-soft)', Icon: CalendarPlus },
  APPOINTMENT_CONFIRMED: { dotColor: 'var(--info)', bgColor: 'var(--info-soft)', Icon: CalendarCheck },
  APPOINTMENT_ARRIVED:   { dotColor: 'var(--success)', bgColor: 'var(--success-soft)', Icon: DoorOpen },
  APPOINTMENT_COMPLETED: { dotColor: 'var(--success)', bgColor: 'var(--success-soft)', Icon: CheckCircle2 },
  APPOINTMENT_CANCELLED: { dotColor: 'var(--text-faint)', bgColor: 'var(--bg-app)', Icon: XCircle },
  APPOINTMENT_NO_SHOW:   { dotColor: 'var(--danger)', bgColor: 'var(--danger-soft)', Icon: AlertCircle },
  PAYMENT:               { dotColor: 'var(--success)', bgColor: 'var(--success-soft)', Icon: CreditCard },
  PLAN_PROPOSED:         { dotColor: 'var(--cat-4)', bgColor: 'var(--cat-4-soft)', Icon: ClipboardList },
  PLAN_ACCEPTED:         { dotColor: 'var(--brand)', bgColor: 'var(--brand-soft)', Icon: ClipboardCheck },
  PLAN_CANCELLED:        { dotColor: 'var(--text-faint)', bgColor: 'var(--bg-app)', Icon: XCircle },
  PACKAGE_PURCHASED:     { dotColor: 'var(--info)', bgColor: 'var(--info-soft)', Icon: Package },
  PACKAGE_CANCELLED:     { dotColor: 'var(--text-faint)', bgColor: 'var(--bg-app)', Icon: XCircle },
  CONSENT_SIGNED:        { dotColor: 'var(--success)', bgColor: 'var(--success-soft)', Icon: FileCheck },
  APPOINTMENT_RATED:     { dotColor: 'var(--brand)', bgColor: 'var(--brand-soft)', Icon: Star },
}

function fmtHistoryDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  if (isSameDay(date, today))
    return `Hoje, ${format(date, 'HH:mm')}`
  if (isSameDay(date, subDays(today, 1)))
    return `Ontem, ${format(date, 'HH:mm')}`
  return format(date, "dd 'de' MMM 'de' yyyy", { locale: ptBR })
}

function HistoryEventRow({ ev, isLast }: { ev: ClientHistoryEvent; isLast: boolean }) {
  const cfg = HISTORY_CONFIG[ev.type]

  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: cfg.bgColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <cfg.Icon size={15} color={cfg.dotColor} />
        </div>
        {!isLast && (
          <div style={{ width: 1, flex: 1, minHeight: 10, background: 'var(--border)', marginTop: 4 }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{ev.title}</span>
          {ev.amount != null && ev.amount > 0 && (
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--success)', whiteSpace: 'nowrap' }}>
              {fmtBRL(ev.amount)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{fmtHistoryDate(ev.date)}</span>
          {ev.autor && (
            <>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--hairline)' }}>·</span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>por {ev.autor}</span>
            </>
          )}
          {ev.subtitle && (
            <>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--hairline)' }}>·</span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>{ev.subtitle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )

  const rowStyle: React.CSSProperties = {
    display: 'block', textDecoration: 'none', color: 'inherit',
    padding: '0 20px',
    borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
  }

  if (ev.link) {
    return (
      <a
        href={ev.link} style={rowStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {content}
      </a>
    )
  }
  return <div style={rowStyle}>{content}</div>
}

// -- Dados sub-component -------------------------------------------------------

function applyDocMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

function applyCepMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

function DadosTab({ client, slug, branches, podeEditar }: {
  client: ProfileClient; slug: string; branches: { id: string; name: string }[]
  /** Clientes em Gerenciar. Sem isso, os campos só se leem (D5, 2026-11-01). */
  podeEditar: boolean
}) {
  const router = useRouter()

  // Nome e genero ficavam de fora: a unica tela que os editava era o modo de
  // edicao do ClientForm, que nenhuma pagina montava. Corrigir um nome
  // digitado errado no cadastro nao tinha caminho nenhum no sistema.
  const [nome,       setNome]       = useState(client.name ?? '')
  const [gender,     setGender]     = useState(client.gender ?? '')
  // O "Documento" tem tipo (D-11): CPF (com a máscara e a busca de repetido) ou passaporte/RNE.
  const [tipoDoc,    setTipoDoc]    = useState<string>(client.documentoTipo ?? 'CPF')
  const [cpf,        setCpf]        = useState(client.documentoTipo ? (client.documentoNumero ?? '') : client.document ? applyDocMask(client.document) : '')
  const [phone,      setPhone]      = useState(maskPhone(client.phone ?? ''))
  const [email,      setEmail]      = useState(client.email ?? '')
  const [birthDate,  setBirthDate]  = useState(client.birthDate ? client.birthDate.slice(0, 10) : '')
  const [zipCode,    setZipCode]    = useState(client.zipCode   ? applyCepMask(client.zipCode) : '')
  const [address,    setAddress]    = useState(client.address ?? '')
  const [addrNum,    setAddrNum]    = useState(client.addressNumber ?? '')
  const [addrComp,   setAddrComp]   = useState(client.addressComplement ?? '')
  const [neighborhood, setNeighborhood] = useState(client.neighborhood ?? '')
  const [city,       setCity]       = useState(client.city ?? '')
  const [state,      setState]      = useState(client.state ?? '')
  // A menor de idade: o responsável legal (decisão 2 do Heitor, 2026-11-05).
  const [responsavel, setResponsavel] = useState(client.responsavel ? {
    nome: client.responsavel.nome, cpf: client.responsavel.cpf ? applyDocMask(client.responsavel.cpf) : '',
    parentesco: client.responsavel.parentesco ?? '', telefone: client.responsavel.telefone ?? '',
  } : RESPONSAVEL_VAZIO)
  const menor = ehMenorDeIdade(birthDate)

  const [selectedTags, setSelectedTags] = useState<string[]>(client.tags ?? [])
  // As tags da rede (Configurações → Tags) — e as que o cliente já tem fora
  // dela (importadas, arquivadas), que antes ficavam gravadas e invisíveis.
  const vocabulario = useTagsDaRede()

  const [cpfStatus,  setCpfStatus]  = useState<'idle' | 'checking' | 'ok' | 'self' | 'dup'>('idle')
  const [cpfDupName, setCpfDupName] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [saved,      setSaved]      = useState(false)
  const cpfTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleCpfChange(v: string) {
    if (tipoDoc !== 'CPF') {
      setCpf(v.toUpperCase())
      setCpfStatus('idle')
      setSaved(false)
      return
    }
    const masked = applyDocMask(v)
    setCpf(masked)
    setCpfStatus('idle')
    setSaved(false)
    const digits = masked.replace(/\D/g, '')
    if (digits.length < 11) return
    if (cpfTimer.current) clearTimeout(cpfTimer.current)
    cpfTimer.current = setTimeout(async () => {
      setCpfStatus('checking')
      const res = await lookupClientByCpf(masked, client.id)
      if (!res.found)       setCpfStatus('ok')
      else if (res.isSelf)  setCpfStatus('self')
      else { setCpfStatus('dup'); setCpfDupName(res.name ?? '') }
    }, 500)
  }

  async function handleCepChange(v: string) {
    const masked = applyCepMask(v)
    setZipCode(masked)
    setSaved(false)
    const digits = masked.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setAddress(data.logradouro ?? '')
        setNeighborhood(data.bairro ?? '')
        setCity(data.localidade ?? '')
        setState(data.uf ?? '')
      }
    } catch {}
    setCepLoading(false)
  }

  async function handleSave() {
    if (cpfStatus === 'dup') return
    if (nome.trim().length < 2) { setSaveError('Informe o nome do cliente.'); return }
    setSaving(true)
    setSaveError(null)
    const result = await updateClientContactData(
      client.id,
      { name: nome, gender, document: cpf, documentType: tipoDoc, phone, email, birthDate, zipCode, address, addressNumber: addrNum, addressComplement: addrComp, neighborhood, city, state, tags: selectedTags,
        ...(menor ? { responsavel } : {}) },
      slug,
    )
    setSaving(false)
    if (result.error) { setSaveError(result.error); return }
    setSaved(true)
    router.refresh()
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)',
    fontFamily: 'inherit', color: 'var(--text)',
    background: 'var(--bg-app)', boxSizing: 'border-box' as const,
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = { fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, display: 'block', letterSpacing: '0.04em' }

  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Quem só vê lê o cadastro: os campos ficam travados pelo fieldset, e
          não há "Salvar" nem "Dar acesso ao app" — era um 500 mudo (D5). */}
      {!podeEditar && (
        <p data-cadastro-so-leitura style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 'var(--leading-snug)' }}>
          Seu cargo só consulta o cadastro: editar pede Clientes em Gerenciar.
        </p>
      )}
      <fieldset disabled={!podeEditar} style={{ display: 'contents' }}>

      {/* Nome e genero */}
      <div className="form-2col">
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Nome *</p>
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Gênero</p>
          <select value={gender} onChange={e => setGender(e.target.value)} style={fieldStyle}>
            <option value="">Não informado</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
            <option value="O">Outro</option>
          </select>
        </div>
      </div>

      {/* Documento: CPF, passaporte ou RNE (D-11) */}
      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Documento</p>
        <div style={{ display: 'flex', gap: 8 }}>
        <select
          aria-label="Tipo do documento"
          value={tipoDoc}
          onChange={e => { setTipoDoc(e.target.value); setCpf(''); setCpfStatus('idle'); setSaved(false) }}
          style={{ ...fieldStyle, width: 'auto', flex: '0 0 auto' }}
        >
          {TIPOS_DE_DOCUMENTO.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            type="text"
            aria-label="Número do documento"
            inputMode={tipoDoc === 'CPF' ? 'numeric' : 'text'}
            placeholder={tipoDoc === 'CPF' ? '000.000.000-00' : tipoDoc === 'RNE' ? 'V123456-7' : 'AB123456'}
            value={cpf}
            onChange={e => handleCpfChange(e.target.value)}
            style={{ ...fieldStyle, paddingRight: 36 }}
          />
          {cpfStatus === 'checking' && (
            <Loader2 size={14} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
          )}
          {cpfStatus === 'ok' && (
            <CheckCircle2 size={14} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }} />
          )}
        </div>
        </div>
        {cpfStatus === 'dup' && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, marginTop: 5 }}>
            CPF já cadastrado para <strong>{cpfDupName}</strong>.
          </p>
        )}
        {cpfStatus === 'self' && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 600, marginTop: 5 }}>CPF já vinculado a este cliente.</p>
        )}
      </div>

      {/* Contato */}
      <div className="form-2col">
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Telefone</p>
          <input
            type="tel"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={e => { setPhone(e.target.value); setSaved(false) }}
            style={fieldStyle}
          />
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Data de nascimento</p>
          <input
            type="date"
            value={birthDate}
            onChange={e => { setBirthDate(e.target.value); setSaved(false) }}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* A menor de idade: o responsável legal (decisão 2 do Heitor). Some quando a data diz 18 ou mais. */}
      <ResponsavelLegal nascimento={birthDate} valor={responsavel} aoMudar={v => { setResponsavel(v); setSaved(false) }} />

      {/* E-mail */}
      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>E-mail</p>
        <input
          type="email"
          placeholder="email@exemplo.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setSaved(false) }}
          style={fieldStyle}
        />
      </div>

      {/* Endereço */}
      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Endereço</p>

        <div className="form-2col" style={{ marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>CEP</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text" inputMode="numeric" placeholder="00000-000"
                value={zipCode} onChange={e => handleCepChange(e.target.value)}
                style={{ ...fieldStyle, paddingRight: cepLoading ? 32 : 12 }}
              />
              {cepLoading && <Loader2 size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Bairro</label>
            <input type="text" placeholder="Bairro" value={neighborhood} onChange={e => { setNeighborhood(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Logradouro</label>
          <input type="text" placeholder="Rua, Avenida…" value={address} onChange={e => { setAddress(e.target.value); setSaved(false) }} style={fieldStyle} />
        </div>

        <div className="form-2col" style={{ marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Número</label>
            <input type="text" placeholder="Nº" value={addrNum} onChange={e => { setAddrNum(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Complemento</label>
            <input type="text" placeholder="Apto, Sala…" value={addrComp} onChange={e => { setAddrComp(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
        </div>

        <div className="form-2col">
          <div>
            <label style={labelStyle}>Cidade</label>
            <input type="text" placeholder="Cidade" value={city} onChange={e => { setCity(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>UF</label>
            <input type="text" placeholder="UF" maxLength={2} value={state} onChange={e => { setState(e.target.value.toUpperCase()); setSaved(false) }} style={{ ...fieldStyle, textTransform: 'uppercase' }} />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Tags</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opcoesDeTag(vocabulario ?? [], selectedTags).map(tag => {
            const active = temTag(selectedTags, tag)
            return (
              <button
                key={tag}
                type="button"
                className={active ? 'chip-filtro is-ativo' : 'chip-filtro'}
                aria-pressed={active}
                onClick={() => {
                  setSelectedTags(prev => alternarTag(prev, tag))
                  setSaved(false)
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Unidades que frequenta (tags "Unidade: <nome>"). Com uma unidade só
          não há o que escolher (A21 da 5ª simulação). */}
      {branches.length > 1 && <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Unidades que frequenta</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {branches.map(b => {
            const tag = unitTag(b.name)
            const active = selectedTags.includes(tag)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
                  setSaved(false)
                }}
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-chip-token)', fontSize: 'var(--text-sm-sz)', fontWeight: 600,
                  cursor: 'pointer', border: active ? '1.5px solid var(--info)' : '1px solid var(--border)',
                  background: active ? 'var(--info-soft)' : 'var(--surface)',
                  color: active ? 'var(--info)' : 'var(--text-muted)',
                  transition: 'all 0.12s',
                }}
              >
                {b.name}
              </button>
            )
          })}
        </div>
        {/* Unit tags sem filial correspondente (renomeada/inativa) — removíveis */}
        {(() => {
          const orphans = selectedTags.filter(t => isUnitTag(t) && !branches.some(b => unitTag(b.name) === t))
          if (orphans.length === 0) return null
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {orphans.map(tag => (
                <TagBadge
                  key={tag}
                  label={unitTagName(tag)}
                  style={{ bg: 'var(--info-soft)', color: 'var(--info)' }}
                  onRemove={() => {
                    setSelectedTags(prev => prev.filter(t => t !== tag))
                    setSaved(false)
                  }}
                />
              ))}
            </div>
          )
        })()}
      </div>}

      </fieldset>

      {/* Sempre montado: o aviso do acesso criado fica depois do refresh (a ficha passa a ter acesso). */}
      {podeEditar && <AcessoAoApp
        temAcesso={!!client.temAcesso}
        email={client.email ?? ''}
        clientId={client.id}
        documento={documentoDoAcesso({ document: client.document, documento_tipo: client.documentoTipo, documento_numero: client.documentoNumero })}
      />}

      {saveError && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{saveError}</p>}

      {podeEditar && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || cpfStatus === 'dup'}
          className="btn-primary"
          style={{ minWidth: 120, justifyContent: 'center' }}
        >
          {saving   ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> :
           saved    ? <><Check size={13} /> Salvo</>                                  :
                      'Salvar dados'}
        </button>
      </div>}
    </div>
  )
}

/**
 * A ficha sem login no app (a cliente de balcão, 2026-10-21): o acesso se dá
 * aqui, com o e-mail e o CPF já SALVOS na ficha.
 *
 * Fica montado depois de dar o acesso: o refresh traz a ficha COM acesso, e
 * desmontar levava junto o aviso de login e senha antes de alguém o ler.
 */
function AcessoAoApp({ temAcesso, email, clientId, documento }: {
  /** A ficha já tem login: nada a oferecer — só o aviso do que acabou de ser criado. */
  temAcesso: boolean
  email: string
  clientId: string
  /**
   * O documento SALVO que vira a senha inicial: o CPF, ou sem ele o
   * passaporte/RNE (decisão 1 do Heitor, 2026-11-05 — era "sem CPF, sem acesso
   * por enquanto"). Nulo: sem documento, sem acesso.
   */
  documento: { tipo: 'CPF' | 'PASSAPORTE' | 'RNE'; numero: string } | null
}) {
  const pronto = !!email && !!documento
  const senha = documento?.tipo === 'RNE' ? 'o número do RNE' : documento?.tipo === 'PASSAPORTE' ? 'o número do passaporte' : 'o CPF'
  const router = useRouter()
  const [dando, setDando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ titulo: string; descricao: string } | null>(null)

  async function dar() {
    setErro(null)
    setDando(true)
    const r = await darAcessoAoApp(clientId)
    setDando(false)
    if ('error' in r) { setErro(r.error); return }
    // Na conta que ela já tinha (outra clínica), a senha é a dela, não o documento (J-22).
    setFeito(avisoDoAcessoCriado({ contaLigada: r.contaLigada, email, documento }))
    router.refresh()
  }

  if (temAcesso && !feito) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: 'var(--bg-app)', border: '1px solid var(--hairline)', borderRadius: 10, padding: '10px 12px',
    }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 460 }}>
        {feito
          ? <><strong style={{ color: 'var(--text)' }}>{feito.titulo}.</strong> {feito.descricao}</>
          : pronto
            ? `Esta cliente ainda não tem acesso ao app. O login é o e-mail, e a senha inicial, ${senha}.`
            : 'Esta cliente ainda não tem acesso ao app. Para dar, salve o e-mail e um documento dela (CPF, passaporte ou RNE).'}
      </p>
      {!feito && (
        <button type="button" className="btn-secondary" disabled={!pronto || dando} onClick={dar}>
          {dando ? 'Criando…' : 'Dar acesso ao app'}
        </button>
      )}
      {erro && <p role="alert" style={{ width: '100%', fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}

// -- Financeiro sub-component --------------------------------------------------

function GrantCreditForm({
  clientId, branchId, slug, onClose, unidades = [],
}: {
  clientId: string; branchId: string; slug: string; onClose: () => void
  /**
   * Unidades para escolher. So vem preenchida quando o cliente e da REDE (sem
   * filial propria): antes a tela usava a primeira filial em ordem alfabetica,
   * e o credito — que e dinheiro no caixa da unidade — ia parar na errada.
   */
  unidades?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(grantInternalCredit, null)
  // A chave do envio (D10): o duplo clique concede uma vez só (o formulário some ao conceder).
  const envio = useEnvioUnico()

  if (state !== null && !state?.error && !pending) {
    onClose()
    router.refresh()
    return null
  }

  return (
    <form
      action={fd => { fd.set('_envio', envio.chave()); action(fd) }}
      style={{
        padding: '14px 20px',
        background: 'var(--brand-soft)',
        borderBottom: '1px solid var(--brand-soft-border)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="slug"      value={slug} />
      {unidades.length === 0 && <input type="hidden" name="branch_id" value={branchId} />}

      {unidades.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label" htmlFor="credito-unidade">Unidade do crédito *</label>
          <select id="credito-unidade" name="branch_id" required className="field" style={{ background: 'var(--surface)' }} defaultValue="">
            <option value="" disabled>Selecione a unidade…</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label" htmlFor="credito-valor">Valor (R$) *</label>
          <input
            id="credito-valor"
            type="number" name="amount" required min="0.01" step="0.01"
            placeholder="0,00"
            className="field"
            style={{ background: 'var(--surface)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label" htmlFor="credito-motivo">Motivo *</label>
          <input
            id="credito-motivo"
            type="text" name="description" required
            placeholder="Ex.: valor pago a mais, que fica para a próxima"
            className="field"
            style={{ background: 'var(--surface)' }}
          />
        </div>
      </div>

      {state?.error && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} className="btn-secondary" style={{ fontSize: 'var(--text-sm-sz)' }}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary" style={{ fontSize: 'var(--text-sm-sz)', gap: 6, minWidth: 130, justifyContent: 'center' }}>
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {pending ? 'Concedendo…' : 'Conceder crédito'}
        </button>
      </div>
    </form>
  )
}

function FinanceiroTab({
  transactions,
  internalCredits,
  canGrantCredit,
  clientId,
  branchId,
  slug,
  unidadesParaCredito = [],
  totais,
  soOsProprios = false,
}: {
  transactions:    ProfileTransaction[]
  internalCredits: ProfileInternalCredit[]
  canGrantCredit:  boolean
  clientId:        string
  branchId:        string
  slug:            string
  /** Preenchida so quando o cliente nao tem filial propria. */
  unidadesParaCredito?: { id: string; name: string }[]
  /**
   * Os totais vêm do banco (metrics_financeiro_do_cliente): a aba somava na
   * tela as últimas 50 linhas. `credito` nulo = "só os próprios" (D6).
   */
  totais:          { pago: number; aReceber: number; credito: number | null }
  /** Recortado pelos atendimentos de quem vê (o financeiro "só os meus"). */
  soOsProprios?:   boolean
}) {
  const [showGrantForm, setShowGrantForm] = useState(false)

  const totalPago      = totais.pago
  const totalPendente  = totais.aReceber
  const creditoTotal   = totais.credito

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* KPIs */}
      <div className="rg-3" style={{ gap: 8 }}>
        {[
          { chave: 'pago', label: 'TOTAL PAGO',       value: fmtBRL(totalPago),     accent: false },
          { chave: 'a-receber', label: 'A RECEBER',        value: fmtBRL(totalPendente),  accent: totalPendente > 0 },
          ...(creditoTotal == null ? [] : [{ chave: 'credito', label: 'CRÉDITO INTERNO',  value: fmtBRL(creditoTotal),   accent: creditoTotal > 0 }]),
        ].map(k => (
          <div key={k.label} data-total={k.chave} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>
              {k.label}
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: k.accent ? 'var(--brand)' : 'var(--text)' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {soOsProprios && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Só os lançamentos dos atendimentos que você fez com esta cliente.
        </p>
      )}

      {/* Transações */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Transações</h3>
          {transactions.length > 0 && (
            <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              {transactions.length}
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>Nenhuma transação registrada.</p>
          </div>
        ) : (
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {['Data', 'Descrição', 'Forma', 'Valor', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => {
                const isLast = i === transactions.length - 1

                return (
                  <tr key={t.id} data-lancamento={t.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {!t.isPaid && t.dueDate
                        ? `Vence ${new Date(t.dueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                        : t.scheduledAt
                          ? format(new Date(t.scheduledAt), 'dd/MM/yyyy', { locale: ptBR })
                          : format(new Date(t.createdAt), 'dd/MM/yyyy', { locale: ptBR })
                      }
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {t.isCheckout && (
                          <Receipt size={12} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                        )}
                        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.procedureName ?? t.description}
                        </p>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {(t.forma !== undefined ? t.forma : t.paymentMethod && rotuloDaForma(t.paymentMethod, t.cartaoVezes)) && (
                        <span data-forma-do-lancamento style={{
                          fontSize: 'var(--text-overline)', fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                          background: 'var(--bg-app)', color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}>
                          {t.forma !== undefined ? t.forma : rotuloDaForma(t.paymentMethod, t.cartaoVezes)}
                        </span>
                      )}
                      {/* A40: por que a venda de produto não deu pontos (como a janela "Vender"). */}
                      {t.semPontos && (
                        <span data-sem-pontos style={{ display: 'block', marginTop: 4, fontSize: 'var(--text-overline)', color: 'var(--text-muted)' }}>
                          Venda de produto não pontua
                        </span>
                      )}
                    </td>
                    <td style={{
                      padding: '12px 16px', fontSize: 'var(--text-base-sz)', fontWeight: 800, whiteSpace: 'nowrap',
                      color: t.saida ? 'var(--danger)' : t.estornada ? 'var(--text-faint)' : 'var(--text)',
                      textDecoration: t.estornada ? 'line-through' : undefined,
                    }}>
                      {/* O estorno é dinheiro que saiu: com o sinal (D6, 2026-10-28). */}
                      {t.saida ? `− ${fmtBRL(t.amount)}` : fmtBRL(t.amount)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={t.estornada || t.estorno ? 'chip chip-muted' : t.isPaid ? 'chip chip-success' : 'chip chip-muted'} style={{ fontSize: 'var(--text-overline)' }}>
                          {t.estornada ? 'Estornado' : t.estorno ? 'Estorno' : t.isPaid ? 'Pago' : 'Pendente'}
                        </span>
                        {/* r2-ven-13: o recibo do pago (PDF), onde a recepção procura. Quem só vê
                            o dela não tira recibo (a rota pede quem recebe ou vê a unidade inteira). */}
                        {t.isPaid && !t.estornada && !t.estorno && !t.saida && !soOsProprios && (
                          <a href={`/api/recibos/${t.id}`} target="_blank" rel="noopener" title="Recibo (PDF): imprimir ou baixar"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}>
                            <FileText size={12} aria-hidden /> Recibo
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Crédito interno — é da cliente, não de um atendimento: fora do "só os próprios" (D6). */}
      {creditoTotal != null && <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: (showGrantForm || internalCredits.length > 0) ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Crédito interno</h3>
          <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: creditoTotal > 0 ? 'var(--brand)' : 'var(--text-faint)', marginRight: 8 }}>
            {fmtBRL(creditoTotal)}
          </span>
          {canGrantCredit && (
            <button
              type="button"
              onClick={() => setShowGrantForm(v => !v)}
              className={showGrantForm ? 'btn-ghost' : 'btn-primary'}
              style={{ fontSize: 'var(--text-sm-sz)', gap: 5 }}
            >
              {showGrantForm ? <><X size={12} /> Cancelar</> : <><Plus size={12} /> Conceder crédito</>}
            </button>
          )}
        </div>

        {showGrantForm && (
          <GrantCreditForm
            clientId={clientId}
            branchId={branchId}
            slug={slug}
            unidades={unidadesParaCredito}
            onClose={() => setShowGrantForm(false)}
          />
        )}

        {internalCredits.length === 0 && !showGrantForm ? (
          <div style={{ padding: '28px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
              {canGrantCredit ? 'Nenhum crédito concedido ainda.' : 'Sem crédito disponível.'}
            </p>
          </div>
        ) : (
          internalCredits.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', padding: '12px 20px',
                borderBottom: i < internalCredits.length - 1 ? '1px solid var(--hairline)' : 'none',
                gap: 14,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text)' }}>{c.description}</p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>
                  {format(new Date(c.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              {/* Desde 2026-09-27 o USO do crédito entra negativo (o gatilho
                  desconta quando ele paga algo): cada linha mostra o seu sinal. */}
              <span style={{
                fontSize: 'var(--text-base-sz)', fontWeight: 800, flexShrink: 0,
                color: c.amount < 0 ? 'var(--text-muted)' : 'var(--success)',
              }}>
                {c.amount < 0 ? `−${fmtBRL(-c.amount)}` : `+${fmtBRL(c.amount)}`}
              </span>
            </div>
          ))
        )}
      </div>}
    </div>
  )
}

// -- Main component ------------------------------------------------------------

export function ClientProfile({
  client, branchId, stats, upcomingAppointments, recentAppointments, allAppointments = [],
  fidelidade, activePackage,
  transactions, internalCredits, documents, recordForms = [], podeVerProntuario = false, planejamentosQueAbrem = [], acessosAoProntuario = null, generalAnamnesis = null, canGrantCredit, branches, currentBranchId, slug, canManageProcedures, podeAnexarClinico = false, podeAnexarComum = false, veFinanceiro = false, isNetworkWide, clienteSemFilial = false, clientHistory, opportunities = [],
  planProcedures = [], planProducts = [], podeReceber = false, termos = null, pacotesAVenda = [],
  procedimentosAVenda = [], produtosAVenda = [], equipeDaVenda = [], prePagos = [], podeAgendar = false, podeCancelarPacote = false, podeEditarCadastro = false, podeExportarProntuario = false, podeVerPlanos = false,
  aReceber = { itens: [], total: { n: 0, valor: 0 } }, podeReceberAtendimento = false,
  totaisFinanceiros = { pago: 0, aReceber: 0, credito: null }, financeiroSoOsProprios = false,
}: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  /*
   * `slug` é a filial DO CLIENTE, não o portal: serve às actions e ao que só
   * existe na unidade. Para onde navegar quem decide é `lib/rotas`, pelo
   * caminho atual — mandar quem veio de /admin para `/<unidade>/…` trocava o
   * portal da rede pelo de uma unidade sem ninguém ter pedido.
   */
  const params = useSearchParams()

  // `?acao=vender` (a busca universal, 2026-10-08): abre a venda ao chegar e
  // tira o parâmetro da URL (recarregar não reabre). O sinal sai da própria
  // URL: o Vender abre quando ele passa de 0 a 1. Sem nada a vender aqui, ou
  // sem poder receber, avisa em vez de não fazer nada.
  const acaoDaUrl = params.get('acao')
  const podeVenderAqui = podeReceber && !!currentBranchId && (pacotesAVenda.length > 0 || procedimentosAVenda.length > 0 || produtosAVenda.length > 0)
  const sinalDaVenda = acaoDaUrl === 'vender' && podeVenderAqui ? 1 : 0
  const aoPedirVenda = useEffectEvent(() => {
    if (!podeVenderAqui) toast.info(podeReceber ? 'Não há procedimento, pacote nem produto à venda para este cliente.' : 'Seu cargo não recebe pagamentos.')
    const q = new URLSearchParams(params.toString())
    q.delete('acao')
    const resto = q.toString()
    router.replace(resto ? `${pathname}?${resto}` : pathname, { scroll: false })
  })
  useEffect(() => { if (acaoDaUrl === 'vender') aoPedirVenda() }, [acaoDaUrl])

  // Cancelar o pacote em andamento (F2b): a janela da conta.
  const [cancelandoPacote, setCancelandoPacote] = useState(false)
  const pacoteCancelavel = podeCancelarPacote && !!activePackage && !activePackage.planId

  // Menu do cabeçalho: desativar e reativar o cliente.
  // `?acao=reativar` (a busca universal acha a arquivada, A19): a ficha abre
  // com o menu e o "Reativar cliente" à vista.
  const [menuAberto,      setMenuAberto]      = useState(() => params.get('acao') === 'reativar' && !client.isActive)
  const [exportandoLgpd,  setExportandoLgpd]  = useState(false)
  const [alterandoStatus, setAlterandoStatus] = useState(false)
  const [erroStatus,      setErroStatus]      = useState<string | null>(null)

  async function alternarStatus() {
    setAlterandoStatus(true); setErroStatus(null)
    const res = await toggleClientStatus(client.id, !client.isActive, slug)
    setAlterandoStatus(false)
    if (res?.error) { setErroStatus(res.error); return }
    setMenuAberto(false)
    router.refresh()
  }
  // Arquivada (J-23): a ficha diz isso, e agendar e vender ficam desligados —
  // o servidor também recusa (CLIENTE_ARQUIVADA).
  const arquivada = !client.isActive
  const motivoDoArquivo = 'Cliente arquivada: reative em "Mais ações" para agendar ou vender.'
  // Arquivar não cancela o que ela tem marcado: a confirmação diz (A19).
  const agendamentosAoArquivar = avisoDosAgendamentosAoArquivar(upcomingAppointments)

  // O `?acao=reativar` sai da URL (recarregar não reabre o menu).
  const aoPedirReativar = useEffectEvent(() => {
    const q = new URLSearchParams(params.toString())
    q.delete('acao')
    const resto = q.toString()
    router.replace(resto ? `${pathname}?${resto}` : pathname, { scroll: false })
  })
  useEffect(() => { if (acaoDaUrl === 'reativar') aoPedirReativar() }, [acaoDaUrl])

  // O prontuário aparece para quem pode vê-lo, mesmo antes do primeiro
  // atendimento (a anamnese já está lá): a dona não achava a aba (2026-10-20).
  // O Planejamento é dos planos (Agenda) e dos injetáveis (prontuário): sem
  // nenhum dos dois, a aba ficava em "Carregando planos…" para sempre (D6).
  const visibleTabs = TABS.filter(t => (t.key !== 'fichas' || podeVerProntuario || recordForms.length > 0) && (t.key !== 'financeiro' || veFinanceiro)
    && (t.key !== 'planejamento' || podeVerPlanos || podeVerProntuario))

  /**
   * A aba aberta mora na URL, não em `useState`.
   *
   * Em estado local, o voltar do aparelho saía da ficha inteira em vez de
   * devolver a aba anterior, recarregar jogava de volta na Visão geral e não
   * havia como mandar a alguém "o financeiro deste cliente". Aba que não
   * existe (link velho, cargo sem a ficha) cai na primeira, em vez de deixar
   * a tela sem conteúdo.
   */
  const abaPedida = params.get('aba')
  const tab: TabKey = visibleTabs.some(t => t.key === abaPedida)
    ? (abaPedida as TabKey)
    : 'visao'

  /** Link de uma aba, preservando o resto da URL e limpando o que era da aba anterior. */
  function linkDaAba(key: TabKey) {
    // `planejamento` e `aberto` descrevem o que está aberto DENTRO da aba de
    // planejamento: levá-los para outra aba deixaria lixo na URL e reabriria o
    // plano errado ao voltar.
    return rotaComParams(pathname, params, { aba: key === 'visao' ? null : key, planejamento: null, aberto: null })
  }

  /**
   * O planejamento retratado numa ficha abre na aba Planejamento → Injetáveis
   * desta mesma ficha (2026-10-29) — só o que existe e quem vê pode abrir.
   */
  function linkDoPlanejamento(mapId: string): string | null {
    if (!planejamentosQueAbrem.includes(mapId)) return null
    return rotaComParams(pathname, params, { aba: 'planejamento', planejamento: 'injetaveis', aberto: mapId })
  }

  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false)

  const initials = getInitials(client.name)
  const since    = format(new Date(client.createdAt), "MMM yyyy", { locale: ptBR })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Volta para a lista. Só no celular, onde a lista saiu de cena para o
          perfil ocupar a tela — sem isto não há caminho de volta a não ser o
          botão do navegador. */}
      <a
        href={rotaClientes(pathname, slug)}
        className="show-mobile"
        style={{
          alignItems: 'center', gap: 5, alignSelf: 'flex-start',
          fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)',
          textDecoration: 'none', padding: '2px 0',
        }}
      >
        <ChevronLeft size={14} /> Clientes
      </a>

      {/* Ficha de tratamento */}
      {treatmentModalOpen && activePackage && (
        <TreatmentFileModal
          client={client}
          activePackage={activePackage}
          branches={branches}
          currentBranchId={currentBranchId}
          slug={slug}
          canManageProcedures={canManageProcedures}
          isNetworkWide={isNetworkWide}
          onClose={() => setTreatmentModalOpen(false)}
          onCancelarPacote={pacoteCancelavel ? () => { setTreatmentModalOpen(false); setCancelandoPacote(true) } : undefined}
        />
      )}
      {cancelandoPacote && activePackage && (
        <CancelarPacote clientPackageId={activePackage.id} onFechar={() => setCancelandoPacote(false)} />
      )}

      {/* -- Hero card ------------------------------------------------- */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {/* `flexWrap` + `minWidth: 0` no bloco da identidade: sem os dois, o
            e-mail do cliente esticava a coluna, as ações não encolhiam e o
            "+ Agendar" saía 69px para fora da tela do celular. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          {/* Avatar + name + meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: '1 1 220px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-squircle)', flexShrink: 0,
              background: 'var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: 'var(--on-brand)',
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
                  {client.name}
                </h1>
                {arquivada && (
                  <TagBadge label="Arquivada" size="xs" style={{ bg: 'var(--warning-soft)', color: 'var(--warning)' }} />
                )}
                {client.temAcesso && (
                  <TagBadge label="Tem acesso ao app" size="xs" style={{ bg: 'var(--success-soft)', color: 'var(--success)' }} />
                )}
                {/* A menor de idade (decisão 2 do Heitor, 2026-11-05). */}
                {ehMenorDeIdade(client.birthDate) && <span data-menor className="chip chip-brand">Menor de idade</span>}
                {client.tags.map(tag => {
                  if (isUnitTag(tag)) {
                    return <TagBadge key={tag} label={unitTagName(tag)} size="xs" style={{ bg: 'var(--info-soft)', color: 'var(--info)' }} />
                  }
                  if (tag === 'VIP') {
                    return <TagBadge key={tag} label="VIP · Ouro" size="xs" style={{ bg: 'var(--brand-soft)', color: 'var(--brand)' }} />
                  }
                  return <TagBadge key={tag} label={tag} size="xs" />
                })}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                {client.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                    <Phone size={11} style={{ color: 'var(--text-faint)' }} />
                    {maskPhone(client.phone)}
                  </span>
                )}
                {client.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', minWidth: 0 }}>
                    <Mail size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</span>
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  <Calendar size={11} style={{ color: 'var(--text-faint)' }} />
                  Cliente desde {since}
                </span>
                {ehMenorDeIdade(client.birthDate) && client.responsavel && (
                  <span data-responsavel-da-ficha style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                    {linhaDoResponsavel(client.responsavel)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions — vender à esquerda do agendar (pedido do Heitor): vender é o
              que o cliente compra e como paga; agendar, quando ele vem. */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {podeReceber && currentBranchId && (
              <Vender clienteId={client.id} branchId={currentBranchId} pacotes={pacotesAVenda} procedimentos={procedimentosAVenda} produtos={produtosAVenda} equipe={equipeDaVenda}
                podeAgendar={podeAgendar} abrirSinal={arquivada ? 0 : sinalDaVenda} aReceber={aReceber.itens}
                desativadoPorque={arquivada ? motivoDoArquivo : null} />
            )}
            {/* Sem a Agenda em Gerenciar, "+ Agendar" levava à tela de bloqueio (A23). */}
            {podeAgendar && (
            <button
              type="button"
              // Já com este cliente escolhido no modal (era a agenda vazia).
              onClick={() => router.push(`${rotaAgenda(pathname, slug)}?novo=1&cliente=${client.id}`)}
              className="btn-primary"
              disabled={arquivada}
              title={arquivada ? motivoDoArquivo : undefined}
            >
              + Agendar
            </button>
            )}
            {/* O "..." existia sem fazer nada. Desativar cliente era uma action
                sem porta:  nao tinha um unico chamador. Arquivar e reativar são
                do cadastro: só com Clientes em Gerenciar. */}
            {podeEditarCadastro && (
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn-ghost" style={{ padding: '8px 10px' }} aria-label="Mais ações"
                onClick={() => setMenuAberto(v => !v)}>
                <MoreHorizontal size={16} />
              </button>
              {menuAberto && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuAberto(false)} />
                  <div className="card" style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 41,
                    minWidth: 230, padding: 6, boxShadow: 'var(--shadow-popover)',
                  }}>
                    {/* Arquivar pede confirmação (J-23): era um clique só. */}
                    {client.isActive ? (
                      <BotaoComConfirmacao
                        acao={() => toggleClientStatus(client.id, false, slug)}
                        aoFeito={() => setMenuAberto(false)}
                        titulo="Arquivar cliente?"
                        explicacao={<>
                          <strong style={{ color: 'var(--text)' }}>{client.name}</strong> sai das listas, e não se agenda nem se vende para ela até reativar. O histórico e o prontuário ficam.
                          {agendamentosAoArquivar && (
                            <span style={{
                              display: 'block', marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-field-token)',
                              background: 'var(--warning-soft)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)',
                            }}>
                              {agendamentosAoArquivar}
                            </span>
                          )}
                        </>}
                        rotuloConfirmar="Arquivar"
                        title="Arquivar cliente"
                        className=""
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--warning)',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <XCircle size={14} /> Arquivar cliente
                      </BotaoComConfirmacao>
                    ) : (
                      <button type="button" disabled={alterandoStatus}
                        onClick={alternarStatus}
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--success)',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                        <CheckCircle2 size={14} /> Reativar cliente
                      </button>
                    )}
                    {/* A LGPD também pela equipe (A21): a cliente que pede no balcão ou não tem o app. */}
                    <button type="button" onClick={() => { setMenuAberto(false); setExportandoLgpd(true) }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                      <FileDown size={14} /> Exportar dados (LGPD)
                    </button>
                    <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', padding: '2px 12px 8px', lineHeight: 1.45 }}>
                      {client.isActive
                        ? 'Some das listas e deixa de contar como cliente nova. O histórico e o prontuário ficam.'
                        : 'Volta a aparecer nas listas, e dá para agendar e vender de novo.'}
                    </p>
                    {erroStatus && (
                      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600, padding: '0 12px 8px' }}>{erroStatus}</p>
                    )}
                  </div>
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {exportandoLgpd && (
        <ExportarLgpdDaFicha clientId={client.id} podeIncluirProntuario={podeExportarProntuario} onFechar={() => setExportandoLgpd(false)} />
      )}

      {/* -- KPI row --------------------------------------------------- */}
      <div className="kpi-grid" style={{ gap: 8 }}>
        {[
          { label: 'SESSÕES',          value: String(stats.totalSessions) },
          { label: 'INVESTIDO TOTAL — LTV',  value: fmtBRL(stats.totalInvested) },
          // A56: ao lado do que ela PAGOU (de tudo), o preço médio dos
          // atendimentos cobrados — outra conta, outro nome, e a dica diz qual.
          { label: 'PREÇO MÉDIO POR ATEND.', value: stats.mediaPorAtendimento == null ? '—' : fmtBRL(stats.mediaPorAtendimento), dica: DEFINICOES.precoMedioPorAtendimento },
          ...(fidelidade ? [{ label: 'PONTOS', value: fidelidade.saldo.toLocaleString('pt-BR') }] : []),
        ].map((k: { label: string; value: string; dica?: { rotulo: string; texto: string } }) => (
          <div key={k.label} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>
              {k.label}{k.dica && <Dica rotulo={k.dica.rotulo}>{k.dica.texto}</Dica>}
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* O atendido e ainda não pago, com a porta para receber (D5). */}
      <AtendimentosAReceber lista={aReceber} titulo="Atendimentos a receber" mostrarCliente={false} podeReceber={podeReceberAtendimento} />

      {/* A alergia em destaque (só chega aqui com o prontuário à vista). */}
      <AlertaDeAlergia alergias={alergiasDaAnamnese(generalAnamnesis)} />

      {/* -- Tabs ------------------------------------------------------ */}
      {/* São ABAS (tablist/tab, a escolhida marcada) — A17 da 5ª simulação: a
          aba "Oportunidades" e o "Oportunidades" do menu lateral (o quadro
          geral) eram dois links com o mesmo nome, e quem procura pelo nome (o
          leitor de tela, o robô) caía no quadro. Continuam links: a aba mora
          na URL. */}
      <div className="tabs-bar" role="tablist" aria-label="Abas da ficha" style={{ gap: 0 }}>
        {visibleTabs.map(t => (
          <Link
            key={t.key}
            href={linkDaAba(t.key)}
            role="tab"
            aria-selected={tab === t.key}
            // A barra rola na horizontal e a aba clicada some se a página pular
            // para o topo junto — o conteúdo troca logo abaixo dela.
            scroll={false}
            style={{
              padding: '10px 18px',
              fontSize: 'var(--text-base-sz)', fontWeight: 700, whiteSpace: 'nowrap',
              textDecoration: 'none',
              color:       tab === t.key ? 'var(--brand)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.1s',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* -- Tab: Visão geral ------------------------------------------ */}
      {tab === 'visao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AvisosDaVisaoGeral
          menor={avisoDoMenor({ nascimento: client.birthDate, responsavel: client.responsavel ?? null })}
          faltando={faltaNoCadastro(termos?.itens ?? [])}
          faltas={allAppointments.filter(a => a.status === 'NO_SHOW')}
          linkDosDados={linkDaAba('dados')}
          linkDoHistorico={linkDaAba('historico')}
        />
        <NotasDoCliente client={client} slug={slug} podeEditar={podeEditarCadastro} />
        <ProcedimentosPagos vendas={prePagos} podeCancelar={podeReceber} podeAgendar={podeAgendar && !arquivada}
          branches={branches} currentBranchId={currentBranchId ?? ''} />
        <div className="rg-3" style={{ gap: 12, alignItems: 'start' }}>

          {/* 1. Tratamento em andamento */}
          {activePackage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div role="button" onClick={() => setTreatmentModalOpen(true)} style={{
              borderRadius: 'var(--radius-card)',
              background: 'var(--gradient-brand)',
              padding: '20px 24px', color: 'var(--on-brand)', cursor: 'pointer',
            }}>
              <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.75, marginBottom: 6 }}>
                TRATAMENTO EM ANDAMENTO
              </p>
              <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, marginBottom: 4 }}>{activePackage.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }}>
                  <div style={{
                    height: '100%', borderRadius: 3, background: 'var(--surface)',
                    width: `${Math.round((activePackage.usedSessions / activePackage.totalSessions) * 100)}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, opacity: 0.95, flexShrink: 0 }}>
                  {activePackage.usedSessions} / {activePackage.totalSessions} sessões
                </p>
              </div>
              {activePackage.totalSessions - activePackage.usedSessions > 0 && (
                <p style={{ fontSize: 'var(--text-2xs)', opacity: 0.7, marginTop: 6 }}>
                  {textoDasRestantes(activePackage.totalSessions - activePackage.usedSessions, activePackage.scheduledSessions ?? 0)}
                </p>
              )}
            </div>
            {/* Cancelar o pacote (F2b): fora do cartão, que já é o botão da ficha de tratamento. */}
            {pacoteCancelavel && (
              <button type="button" className="btn-ghost" onClick={() => setCancelandoPacote(true)}
                style={{ alignSelf: 'flex-start' }}>
                Cancelar pacote
              </button>
            )}
            </div>
          ) : (
            <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minHeight: 90 }}>
              <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>TRATAMENTO EM ANDAMENTO</p>
              <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>Nenhum pacote ativo.</p>
            </div>
          )}

          {/* 2. Próximos agendamentos */}
          {upcomingAppointments.length > 0 ? (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Clock size={14} style={{ color: 'var(--brand)' }} />
                <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Próximos agendamentos</h3>
                <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)', marginLeft: 'auto' }}>
                  {upcomingAppointments.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcomingAppointments.map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: i < upcomingAppointments.length - 1 ? '1px solid var(--hairline)' : 'none',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'var(--brand-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Stethoscope size={14} style={{ color: 'var(--brand)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{a.procedureName}</p>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {format(new Date(a.scheduledAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
                        {a.professionalName !== '—' && ` · ${a.professionalName}`}
                      </p>
                    </div>
                    <span className={a.status === 'CONFIRMED' ? 'chip chip-success' : 'chip chip-brand'} style={{ fontSize: 'var(--text-overline)' }}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Clock size={14} style={{ color: 'var(--text-faint)' }} />
              <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>Nenhum agendamento futuro.</p>
            </div>
          )}

          {/* 3. Histórico de procedimentos */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Histórico de procedimentos</h3>
              {recentAppointments.length > 8 && (
                <Link href={linkDaAba('historico')} scroll={false}
                  style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', fontWeight: 700, textDecoration: 'none' }}>
                  Ver tudo
                </Link>
              )}
            </div>

            {recentAppointments.length === 0 ? (
              <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)', padding: '4px 0 8px' }}>
                Nenhum procedimento realizado ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentAppointments.slice(0, 8).map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0',
                    borderBottom: i < Math.min(recentAppointments.length, 8) - 1 ? '1px solid var(--hairline)' : 'none',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: a.status === 'COMPLETED' ? 'var(--success-soft)' : 'var(--bg-app)',
                      border: '1px solid var(--hairline)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Stethoscope size={12} style={{ color: a.status === 'COMPLETED' ? 'var(--success)' : 'var(--text-faint)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{a.procedureName}</p>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>
                        {format(new Date(a.scheduledAt), "dd MMM yyyy", { locale: ptBR })}
                        {a.professionalName !== '—' && ` · ${a.professionalName}`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{fmtBRL(a.price)}</p>
                      <p style={{ fontSize: 'var(--text-overline)', color: a.status === 'COMPLETED' ? 'var(--success)' : 'var(--text-faint)', fontWeight: 600, marginTop: 2 }}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>{/* fim grid 3 colunas */}

          {/* Fidelidade: só com o programa ligado e o módulo no cargo. */}
          {fidelidade && (
            <FidelidadeDoCliente
              clientId={client.id}
              fidelidade={fidelidade}
              branches={branches}
              unidadePadrao={currentBranchId || branchId}
            />
          )}
        </div>
      )}

      {/* -- Tab: Histórico -------------------------------------------- */}
      {tab === 'historico' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
              Linha do tempo
            </span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              {clientHistory.length} evento{clientHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          {clientHistory.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
              Nenhum evento registrado.
            </div>
          ) : (
            <div>
              {clientHistory.map((ev, i) => (
                <HistoryEventRow
                  key={ev.id}
                  ev={ev}
                  isLast={i === clientHistory.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* -- Tab: Oportunidades ---------------------------------------- */}
      {tab === 'planejamento' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <PainelPlanejamento
            clientId={client.id}
            branchId={currentBranchId || branchId}
            slug={slug}
            procedures={planProcedures}
            availableProducts={planProducts}
            podeEditar={canManageProcedures}
            // Injetáveis é prontuário: a mesma decisão da aba Prontuário.
            podeVerInjetaveis={podeVerProntuario}
            podeVerPlanos={podeVerPlanos}
            podeReceber={podeReceber}
            // A ficha já é uma rota: o plano aberto cabe na URL dela.
            navegarPorUrl
          />
        </div>
      )}

      {tab === 'oportunidades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
                Negociações
              </span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                {opportunities.filter(o => o.outcome === 'OPEN').length} em aberto ·{' '}
                {opportunities.length} no total
              </span>
            </div>

            {opportunities.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
                Nenhuma oportunidade. Abra uma pela conversa no Inbox quando houver
                interesse em algo novo.
              </div>
            ) : (
              <div>
                {opportunities.map((o, i) => (
                  <div
                    key={o.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 20px',
                      borderBottom: i === opportunities.length - 1 ? 'none' : '1px solid var(--hairline)',
                    }}
                  >
                    <span style={{
                      width: 3, height: 30, borderRadius: 99, flexShrink: 0,
                      background: o.stage_color ?? 'var(--border)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
                        {o.funnel_name ?? 'Sem funil'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {o.stage_name ?? 'Sem etapa'}
                        {o.owner_name ? ` · ${o.owner_name}` : ''}
                        {' · desde '}
                        {format(new Date(o.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    </div>
                    {o.value !== null && (
                      <span style={{ flexShrink: 0, fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
                        {fmtBRL(o.value)}
                      </span>
                    )}
                    <span style={{
                      flexShrink: 0, fontSize: 'var(--text-overline)', fontWeight: 800, padding: '2px 9px', borderRadius: 99,
                      color: o.outcome === 'WON' ? 'var(--success)'
                           : o.outcome === 'LOST' ? 'var(--text-faint)' : 'var(--brand)',
                      background: o.outcome === 'OPEN' ? 'var(--brand-soft)' : 'var(--bg-app)',
                    }}>
                      {o.outcome === 'WON' ? 'Ganha' : o.outcome === 'LOST' ? 'Perdida' : 'Em aberto'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* A linha do tempo comercial: o que foi proposto e como terminou. */}
          <div className="card">
            <LeadTimeline clientId={client.id} />
          </div>
        </div>
      )}

      {/* -- Tab: Fichas ---------------------------------------------- */}
      {tab === 'fichas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recordForms.length === 0 ? (
            <>
              {generalAnamnesis && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <AnamneseGeralCartao embedded anamnese={generalAnamnesis} fichaAtual={generalAnamnesis.ficha} clientId={client.id} canEdit={false} />
                </div>
              )}
              <div className="card" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
                Nenhum atendimento registrado ainda.
              </div>
            </>
          ) : (
            recordForms.map(entry => (
              <AttendanceRecordCard
                key={entry.appointmentId}
                client={{ name: client.name, document: client.document, birthDate: client.birthDate, phone: client.phone }}
                subtitle={`${entry.procedureName ?? 'Atendimento'} · ${entry.diaDoAtendimento || format(new Date(entry.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
                generalAnamnesis={
                  <AnamneseGeralCartao embedded anamnese={generalAnamnesis} fichaAtual={generalAnamnesis?.ficha ?? { formId: null, nome: 'Pré-atendimento', rows: [] }} clientId={client.id} canEdit={false} />
                }
                ficha={entry.ficha && entry.ficha.rows.length > 0 ? {
                  name: entry.ficha.name,
                  node: (
                    <AnamnesisFormRenderer
                      appointmentId={entry.appointmentId} slug={slug}
                      formName={entry.ficha.name} rows={entry.ficha.rows}
                      initial={entry.ficha.answers as AnamnesisAnswers} canEdit={false}
                      injetaveis={{ linkDoPlanejamento: linkDoPlanejamento }}
                    />
                  ),
                } : null}
                evolucao={{ texto: entry.evolucao, intercorrencias: entry.intercorrencias, queixas: entry.queixas ?? null }}
              />
            ))
          )}
          {/* Quem abriu o prontuário — o servidor só manda ao admin da rede. */}
          {acessosAoProntuario && <AcessosAoProntuario {...acessosAoProntuario} />}
        </div>
      )}

      {/* -- Tab: Dados ------------------------------------------------ */}
      {tab === 'dados' && (
        <DadosTab client={client} slug={slug} branches={branches} podeEditar={podeEditarCadastro} />
      )}

      {/* -- Tab: Financeiro ------------------------------------------- */}
      {tab === 'financeiro' && (
        <FinanceiroTab
          transactions={transactions}
          internalCredits={internalCredits}
          canGrantCredit={canGrantCredit}
          clientId={client.id}
          branchId={branchId}
          slug={slug}
          unidadesParaCredito={clienteSemFilial ? branches : []}
          totais={totaisFinanceiros}
          soOsProprios={financeiroSoOsProprios}
        />
      )}

      {/* -- Tab: Documentos ------------------------------------------- */}
      {tab === 'documentos' && termos && (
        <section aria-label="Termos e contratos" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Termos e contratos</h3>
          <TermosDoCliente itens={termos.itens} slug={slug} podeColher={termos.podeColher} pelaConversa={termos.pelaConversa} />
        </section>
      )}
      {tab === 'documentos' && (
        <ClientDocumentsTab
          documents={documents}
          clientId={client.id}
          branchId={branchId}
          slug={slug}
          podeAnexarClinico={podeAnexarClinico}
          podeAnexarComum={podeAnexarComum}
        />
      )}
    </div>
  )
}
