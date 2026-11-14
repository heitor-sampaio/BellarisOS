'use client'

import { PerguntaDaPerda, type OpcaoDeMotivo } from '@/components/branch/pergunta-da-perda'
import { useState, useTransition, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Plus, ArrowRight, ArrowRightLeft, Phone, Mail, X,
  MoreHorizontal, Trophy, XCircle, CalendarClock, BellRing,
} from 'lucide-react'
import { toast } from 'sonner'
import { idadeDoLead } from '@/lib/crm/idade-do-lead'
import { updateLeadStage } from '@/actions/leads'
import { ClientForm } from './client-form'
import type { CRMFunnel, CRMStage } from '@/lib/crm'
import { rotaCliente } from '@/lib/rotas'
import { dayKeyTZ } from '@/lib/datetime'
import { textoDoRetorno } from '@/lib/crm/retorno'
import { rotaComParams } from '@/lib/query-params'
import { CRMLeadModal, type Procedure, type CRMLeadModalHandle } from './crm-lead-modal'
import {
  sourceStyle,
  secondsSince, agingLevel, AGING_STYLE,
  AWAITING_THRESHOLDS, STALE_THRESHOLDS, formatDurationShort, iniciaisDoNome,
  maskPhone, formatBRL,
} from '@estetica-os/utils'
import { TagBadge } from '@/components/shared/tag-badge'
import { FunnelSelect } from '@/components/shared/funnel-select'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { JanelaModal } from '@/components/shared/janela-modal'
import { useFuso } from '@/components/shared/fuso'

// --- Filtros e ordenação -----------------------------------------
const SEM_DONO = '__sem_dono__'

interface FiltersState {
  sources:      string[]
  tags:         string[]
  /** Nome do dono, ou SEM_DONO para o bolo comum. */
  owners:       string[]
  procedureIds: string[]
  /** Motivos de perda (id). Só os leads perdidos por eles ficam. */
  motivos:      string[]
  situation:    'all' | 'converted' | 'not_converted'
  period:       'all' | '7d' | '30d' | '90d' | 'custom'
  /** O intervalo do "Personalizado", em dias do fuso do negócio (AAAA-MM-DD). */
  periodoDe:    string
  periodoAte:   string
}
type SortOrder = 'newest' | 'oldest' | 'name_asc' | 'name_desc'

const DEFAULT_FILTERS: FiltersState = {
  sources: [], tags: [], owners: [], procedureIds: [], motivos: [], situation: 'all', period: 'all', periodoDe: '', periodoAte: '',
}

const SITUACOES: { valor: FiltersState['situation']; rotulo: string }[] = [
  { valor: 'all',           rotulo: 'Todos os leads' },
  { valor: 'not_converted', rotulo: 'Ainda não é cliente' },
  { valor: 'converted',     rotulo: 'Já é cliente' },
]
const PERIODOS: { valor: FiltersState['period']; rotulo: string }[] = [
  { valor: 'all',    rotulo: 'Qualquer período' },
  { valor: '7d',     rotulo: 'Últimos 7 dias' },
  { valor: '30d',    rotulo: 'Últimos 30 dias' },
  { valor: '90d',    rotulo: 'Últimos 90 dias' },
  { valor: 'custom', rotulo: 'Personalizado' },
]

/** '2026-01-15' → '15/01/26' — curto, para caber no gatilho. */
function diaCurto(dia: string): string {
  const [a = '', m = '', d = ''] = dia.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

function FiltersBar({
  leads, filters, sort, funnels, funnelId,
  onFiltersChange, onSortChange, onClear,
}: {
  leads:           Lead[]
  filters:         FiltersState
  sort:            SortOrder
  /** O funil entra na MESMA barra: escolher o quadro e filtrá-lo são o mesmo
      gesto para quem usa, e duas linhas soltas faziam parecer dois assuntos. */
  funnels:         Pick<CRMFunnel, 'id' | 'name'>[]
  funnelId:        string
  onFiltersChange: (f: FiltersState) => void
  onSortChange:    (s: SortOrder) => void
  onClear:         () => void
}) {
  const availableSources = useMemo(
    () => [...new Set(leads.map(l => l.source).filter(Boolean))].sort() as string[],
    [leads],
  )

  // Tags que aparecem em pelo menos um lead
  const availableTags = useMemo(
    () => [...new Set(leads.flatMap(l => l.tags ?? []))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [leads],
  )

  // Donos presentes na tela. "Sem dono" é uma opção de verdade: é o bolo comum,
  // onde cai todo lead que chega sozinho pelo WhatsApp.
  const availableOwners = useMemo(() => {
    const nomes = [...new Set(
      leads.map(l => l.owner_name).filter((v): v is string => !!v),
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return leads.some(l => !l.owner_name) ? [SEM_DONO, ...nomes] : nomes
  }, [leads])
  // Quem foi desativado e ainda é responsável por algum card (H6, 5ª simulação:
  // o filtro listava o inativo como qualquer outro).
  const ownersInativos = useMemo(() => new Set(
    leads.filter(l => l.owner_name && l.owner_ativo === false).map(l => l.owner_name as string),
  ), [leads])

  // Procedimentos que aparecem em pelo menos um lead
  const availableProcs = useMemo(() => {
    const map = new Map<string, string>()
    leads.forEach(l =>
      l.lead_procedures.forEach(lp => {
        if (lp.procedures?.name) map.set(lp.procedure_id, lp.procedures.name)
      }),
    )
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [leads])

  // Motivos de perda presentes nos leads da tela (os perdidos).
  const availableMotivos = useMemo(() => {
    const map = new Map<string, string>()
    leads.forEach(l => { if (l.motivo_perda_id) map.set(l.motivo_perda_id, l.crm_motivos_perda?.nome ?? 'Motivo') })
    return [...map.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [leads])

  const activeCount =
    (filters.motivos.length > 0 ? 1 : 0) +
    (filters.sources.length > 0 ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.owners.length > 0 ? 1 : 0) +
    (filters.procedureIds.length > 0 ? 1 : 0) +
    (filters.situation !== 'all' ? 1 : 0) +
    (filters.period !== 'all' ? 1 : 0)

  function toggleSource(src: string) {
    const next = filters.sources.includes(src)
      ? filters.sources.filter(s => s !== src)
      : [...filters.sources, src]
    onFiltersChange({ ...filters, sources: next })
  }

  function toggleTag(tag: string) {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag]
    onFiltersChange({ ...filters, tags: next })
  }

  function toggleOwner(nome: string) {
    const next = filters.owners.includes(nome)
      ? filters.owners.filter(o => o !== nome)
      : [...filters.owners, nome]
    onFiltersChange({ ...filters, owners: next })
  }

  // O "Personalizado" abre as datas no rodapé do painel e só vale ao aplicar:
  // escolher a opção sozinha não pode filtrar por um intervalo vazio.
  const [personalizado, setPersonalizado] = useState(false)
  const [de,  setDe]  = useState(filters.periodoDe)
  const [ate, setAte] = useState(filters.periodoAte)
  const podeAplicar = !!de && !!ate && de <= ate

  function escolherPeriodo(valor: string) {
    if (valor === 'custom') { setPersonalizado(true); return }
    setPersonalizado(false)
    onFiltersChange({ ...filters, period: valor as FiltersState['period'], periodoDe: '', periodoAte: '' })
  }

  const rotuloPeriodo = filters.period === 'custom'
    ? `${diaCurto(filters.periodoDe)} – ${diaCurto(filters.periodoAte)}`
    : filters.period === 'all' ? 'Período' : PERIODOS.find(p => p.valor === filters.period)!.rotulo

  function toggleMotivo(id: string) {
    const next = filters.motivos.includes(id)
      ? filters.motivos.filter(x => x !== id)
      : [...filters.motivos, id]
    onFiltersChange({ ...filters, motivos: next })
  }

  function toggleProcedure(id: string) {
    const next = filters.procedureIds.includes(id)
      ? filters.procedureIds.filter(x => x !== id)
      : [...filters.procedureIds, id]
    onFiltersChange({ ...filters, procedureIds: next })
  }


  /**
   * Gatilho de filtro que liga e desliga — o mesmo papel do `.filtro-toggle`.
   * Herdava do `selectStyle` local, que saiu quando os selects da barra
   * passaram a usar a classe do sistema.
   */
  /**
   * Gatilho de filtro que abre uma lista. Da barra, é um liga/desliga — ou o
   * filtro está valendo, ou não —, então usa a classe do sistema.
   */
  function classeGatilho(ativo: boolean) {
    return ativo ? 'filtro-toggle is-ativo' : 'filtro-toggle'
  }
  // Era um estilo local: 33px de altura ao lado de seletores de 34, e a borda
  // engordando meio pixel de cada lado ao ficar ativo — o que fazia a barra
  // inteira mexer justamente quando se filtrava.

  /** "Tags · 2" — o que está escolhido cabe no próprio rótulo. */
  function rotuloFiltro(nome: string, quantos: number): string {
    return quantos > 0 ? `${nome} · ${quantos}` : nome
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      flexWrap: 'wrap', padding: '10px 0 4px',
    }}>
      {/* O funil primeiro: ele decide QUAL quadro se está olhando, enquanto o
          resto filtra o que já está nele. O divisor marca essa diferença — sem
          ele, "Vendas" pareceria mais um filtro entre outros. */}
      {funnels.length > 1 && (
        <>
          <FunnelSelect funnels={funnels} activeId={funnelId} />
          <div style={{ width: 1, height: 20, background: 'var(--hairline)', flexShrink: 0 }} />
        </>
      )}

      {/* Origem, tags, dono e procedimento como SELETORES, não como chips.
          Cada um despejava todas as opções na barra: numa rede com trinta tags,
          a barra de filtros ficava mais alta que o quadro, e no celular virava
          uma parede antes de qualquer card aparecer. Agora seguem a forma dos
          outros filtros — um gatilho que abre a lista —, e o que está marcado
          aparece no próprio rótulo. */}
      {availableSources.length > 0 && (
        <PickerCompacto
          rotuloBotao={rotuloFiltro('Origem', filters.sources.length)}
          opcoes={availableSources.map(s => ({ valor: s, rotulo: s }))}
          selecionadas={filters.sources}
          multiplo
          textoListaVazia="Nenhuma origem nos leads carregados."
          classeBotao={classeGatilho(filters.sources.length > 0)}
          onEscolher={toggleSource}
        />
      )}

      {availableTags.length > 0 && (
        <PickerCompacto
          rotuloBotao={rotuloFiltro('Tags', filters.tags.length)}
          opcoes={availableTags.map(t => ({ valor: t, rotulo: t }))}
          selecionadas={filters.tags}
          multiplo
          textoListaVazia="Nenhuma tag nos leads carregados."
          classeBotao={classeGatilho(filters.tags.length > 0)}
          onEscolher={toggleTag}
        />
      )}

      {availableOwners.length > 0 && (
        <PickerCompacto
          rotuloBotao={rotuloFiltro('Responsável', filters.owners.length)}
          opcoes={availableOwners.map(n => ({
            valor: n, rotulo: n === SEM_DONO ? 'Sem responsável' : ownersInativos.has(n) ? `${n} (inativo)` : n,
          }))}
          selecionadas={filters.owners}
          multiplo
          textoListaVazia="Nenhum responsável nos leads carregados."
          classeBotao={classeGatilho(filters.owners.length > 0)}
          onEscolher={toggleOwner}
        />
      )}

      {availableProcs.length > 0 && (
        <PickerCompacto
          rotuloBotao={rotuloFiltro('Procedimento', filters.procedureIds.length)}
          opcoes={availableProcs.map(p => ({ valor: p.id, rotulo: p.name }))}
          selecionadas={filters.procedureIds}
          multiplo
          textoListaVazia="Nenhum procedimento nos leads carregados."
          classeBotao={classeGatilho(filters.procedureIds.length > 0)}
          onEscolher={toggleProcedure}
        />
      )}

      {availableMotivos.length > 0 && (
        <PickerCompacto
          rotuloBotao={rotuloFiltro('Motivo da perda', filters.motivos.length)}
          opcoes={availableMotivos.map(m => ({ valor: m.id, rotulo: m.nome }))}
          selecionadas={filters.motivos}
          multiplo
          textoListaVazia="Nenhum lead perdido com motivo."
          classeBotao={classeGatilho(filters.motivos.length > 0)}
          onEscolher={toggleMotivo}
        />
      )}


      {/* Situação e período: a mesma forma dos filtros acima (pedido do
          Heitor, 2026-10-09). Escolha única — o gatilho mostra a escolhida. */}
      <PickerCompacto
        rotuloBotao={filters.situation === 'all' ? 'Situação' : SITUACOES.find(s => s.valor === filters.situation)!.rotulo}
        opcoes={SITUACOES}
        selecionadas={[filters.situation]}
        textoListaVazia=""
        classeBotao={classeGatilho(filters.situation !== 'all')}
        onEscolher={v => onFiltersChange({ ...filters, situation: v as FiltersState['situation'] })}
      />

      <PickerCompacto
        rotuloBotao={rotuloPeriodo}
        opcoes={PERIODOS}
        selecionadas={[personalizado ? 'custom' : filters.period]}
        textoListaVazia=""
        classeBotao={classeGatilho(filters.period !== 'all')}
        mantemAbertoEm={['custom']}
        onEscolher={escolherPeriodo}
        rodape={fechar => (personalizado || filters.period === 'custom') && (
          <div style={{
            borderTop: '1px solid var(--hairline)', marginTop: 6, paddingTop: 8,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {([['De', de, setDe, { max: ate || undefined }], ['Até', ate, setAte, { min: de || undefined }]] as const).map(([rotulo, valor, mudar, limite]) => (
              <label key={rotulo} style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)',
              }}>
                {rotulo}
                <input type="date" className="field" value={valor} {...limite}
                  onChange={e => mudar(e.target.value)} />
              </label>
            ))}
            <button type="button" className="btn-primary" disabled={!podeAplicar}
              onClick={() => {
                onFiltersChange({ ...filters, period: 'custom', periodoDe: de, periodoAte: ate })
                setPersonalizado(false)
                fechar()
              }}>
              Aplicar
            </button>
          </div>
        )}
      />

      {/* Ordenação */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <select className="filtro-select" aria-label="Ordenar os leads"
          value={sort} onChange={e => onSortChange(e.target.value as SortOrder)}>
          <option value="newest">Mais recente</option>
          <option value="oldest">Mais antigo</option>
          <option value="name_asc">Nome A → Z</option>
          <option value="name_desc">Nome Z → A</option>
        </select>

        {/* Limpar filtros */}
        {(activeCount > 0 || sort !== 'newest') && (
          <button
            type="button" onClick={onClear}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)',
              background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <X size={11} />
            Limpar
            {activeCount > 0 && (
              <span style={{
                fontSize: 'var(--text-overline)', fontWeight: 800, minWidth: 16, height: 16,
                background: 'var(--brand)', color: 'var(--surface)',
                borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {activeCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// --- Tipos -------------------------------------------------------
export interface Lead {
  id:           string
  name:         string
  phone:        string | null
  email:        string | null
  social_media: string | null
  source:       string | null
  crm_stage_id: string | null
  notes:        string | null
  client_id:    string | null
  created_at:   string
  tags:         string[]
  /** O RESPONSÁVEL: quem está trabalhando o lead. Nulo = bolo comum. */
  owner_id?:    string | null
  owner_name?:  string | null
  /** O responsável está ativo? Falso = desativado (H6: o filtro o marca "(inativo)"). */
  owner_ativo?: boolean | null
  last_interaction_at?: string | null
  awaiting_since?:      string | null
  branch_name?: string | null
  branch_slug?: string | null
  lead_procedures: { procedure_id: string; procedures: { name: string; price: number } | null }[]
  /** Perdido: o motivo (2026-10-21). */
  motivo_perda_id?:   string | null
  crm_motivos_perda?: { nome: string } | null
  /** A18 da 7ª: o próximo agendamento da cliente ligada (ISO), para "Agendado 06/11 10:30". */
  proximo_agendamento?: string | null
  /** A18: a compra da cliente depois de a oportunidade nascer ("Pacote X"): o card SUGERE o Ganho. */
  compra?: string | null
  /** A4 da 11ª: o VENDIDO dessa compra — o card diz ele no lugar do valor de interesse. */
  compra_valor?: number | null
  /** A42 da 9ª: o dia do retorno combinado (yyyy-mm-dd) e o que fazer. */
  retornar_em?: string | null
  retornar_obs?: string | null
}

interface CRMBoardProps {
  initialLeads: Lead[]
  /** Os motivos de perda da rede: levar o card à etapa perdida pergunta o motivo. */
  motivos?:     OpcaoDeMotivo[]
  /** A unidade do portal: o lead criado pelo "+" da coluna nasce com a tag dela. */
  branchName?:  string
  /** Etapas do funil aberto — são as colunas do quadro. */
  stages:       CRMStage[]
  /** Etapas de todos os funis: o modal do lead usa para mover entre funis. */
  allStages:    CRMStage[]
  funnels:      Pick<CRMFunnel, 'id' | 'name'>[]
  funnelId:     string
  procedures:   Procedure[]
  branchId:     string
  slug:         string
  /** Modo rede: exibe badge de filial nos cards e oculta "+" por coluna */
  networkMode?: boolean
  branches?:    { id: string; name: string; slug: string }[]
  /**
   * Lead a abrir ao montar (`?lead=` da URL — é por aqui que a busca universal
   * entra no card). Fora da lista carregada (alcance, outro funil), nada abre.
   */
  leadAberto?:  string | null
  /** "Converter" o lead em cliente pede Clientes em Gerenciar (D4, 2026-11-01). */
  podeCadastrarCliente?: boolean
  /** "Agendar" no card (A16 da 6ª simulação): o CRM em Gerenciar e a agenda no plano. */
  podeAgendar?: boolean
  /** Mover o card pelos botões (A18/A19 da 7ª): o CRM em Gerenciar. */
  podeMover?: boolean
}

// --- Cores suaves a partir de hex --------------------------------
function softBg(hex: string)     { return hex + '18' }
function softBorder(hex: string) { return hex + '50' }

/** Item do menu do card. `danger` marca a ação destrutiva. */
function MenuItem({
  icon, children, onClick, danger,
}: {
  icon:     React.ReactNode
  children: React.ReactNode
  onClick:  () => void
  danger?:  boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        border: 'none', background: 'transparent', textAlign: 'left',
        fontSize: 'var(--text-sm-sz)', fontWeight: 600, fontFamily: 'inherit',
        color: danger ? 'var(--danger)' : 'var(--text)',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'var(--danger-soft)' : 'var(--bg-app)'
      }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ display: 'flex', flexShrink: 0, color: danger ? 'var(--danger)' : 'var(--text-faint)' }}>
        {icon}
      </span>
      {children}
    </button>
  )
}

// --- Cartão do lead ----------------------------------------------
function LeadCard({
  lead, slug, branchId, allStages, funnels, funnelId, procedures, branches, networkMode, nowMs, podeCadastrarCliente = false,
  unidadesParaAgendar, isDragging, onDragStart, onDragEnd, onLeadDeleted, abrirAoMontar, onAbertoAoMontar,
  desfechos, onMoverPara,
}: {
  lead:           Lead
  slug:           string
  branchId:       string
  allStages:      CRMStage[]
  funnels:        Pick<CRMFunnel, 'id' | 'name'>[]
  funnelId:       string
  procedures:     Procedure[]
  branches?:      { id: string; name: string; slug: string }[]
  networkMode?:   boolean
  podeCadastrarCliente?: boolean
  /** As unidades do "Agendar" do card (A16); nulo, sem o botão. */
  unidadesParaAgendar?: { id: string; name: string; slug: string }[] | null
  /** Nulo antes de montar — ver o useState lá embaixo. */
  nowMs:          number | null
  isDragging:     boolean
  onDragStart:    (e: React.DragEvent, id: string) => void
  onDragEnd:      () => void
  onLeadDeleted:  (id: string) => void
  /** Este é o lead pedido na URL: abre o modal e rola até o card. */
  abrirAoMontar?:    boolean
  onAbertoAoMontar?: () => void
  /** As etapas de ganho e de perda do funil aberto (A18/A19); nulo, sem os botões. */
  desfechos?: { ganho: CRMStage | null; perdido: CRMStage | null } | null
  onMoverPara?: (leadId: string, etapaId: string) => void
}) {
  const fuso = useFuso()
  const [convertOpen, setConvertOpen] = useState(false)
  const [moving,     startMoving]  = useTransition()
  const router     = useRouter()
  const pathname   = usePathname()
  const editRef    = useRef<CRMLeadModalHandle>(null)
  const moveRef    = useRef<HTMLDialogElement>(null)
  const menuRef    = useRef<HTMLDivElement>(null)
  const cardRef    = useRef<HTMLDivElement>(null)

  const [menuAberto, setMenuAberto] = useState(false)

  // Aberto pela URL (`?lead=`): rola o card para a vista e abre o modal, uma
  // vez só — quem decide que já abriu é o quadro (`onAbertoAoMontar`).
  useEffect(() => {
    if (!abrirAoMontar) return
    cardRef.current?.scrollIntoView({ block: 'center', inline: 'center' })
    editRef.current?.open()
    onAbertoAoMontar?.()
  }, [abrirAoMontar, onAbertoAoMontar])

  // Fecha ao clicar fora. Sem isso fica um menu aberto por card assim que a
  // pessoa passa por vários.
  useEffect(() => {
    if (!menuAberto) return
    function fora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [menuAberto])

  // Mover de funil só existe se houver para onde mover.
  const outrosFunis = funnels.filter(f => f.id !== funnelId)
  // A3 da 11ª: as outras etapas ABERTAS deste funil, para mover pelo menu
  // (no celular arrastar pesa, e o editor era o único outro caminho).
  const outrasEtapas = onMoverPara
    ? allStages.filter(s => s.funnel_id === funnelId && s.outcome === 'OPEN' && s.id !== lead.crm_stage_id)
        .sort((a, b) => a.position - b.position)
    : []

  /**
   * Leva o card para a PRIMEIRA etapa do funil de destino.
   *
   * Etapas não se correspondem entre funis — "Avaliação" de vendas não é
   * "Avaliação" de pós-venda —, então não há mapeamento a adivinhar: o lead
   * recomeça o novo funil. Reusa `updateLeadStage`, e por isso a mudança já cai
   * no histórico com os dois nomes de funil.
   */
  function moverParaFunil(destinoId: string) {
    const primeira = allStages
      .filter(st => st.funnel_id === destinoId)
      .sort((a, b) => a.position - b.position)[0]
    if (!primeira) return
    moveRef.current?.close()
    startMoving(async () => {
      await updateLeadStage(lead.id, primeira.id, slug)
      // Sai deste quadro: o card agora pertence a outro funil.
      onLeadDeleted(lead.id)
      router.refresh()
    })
  }
  // Evita abrir o modal de edição ao finalizar um drag
  const wasDragging = useRef(false)

  // D12 da 12ª: pelo dia de Brasília, não por 24 h corridas.
  const ageLabel  = idadeDoLead(lead.created_at, nowMs ?? new Date(), fuso)

  // --- Métricas de atendimento -----------------------------------
  // Cliente aguardando resposta (prioridade máxima de sinal).
  const awaitingSecs = nowMs != null && lead.awaiting_since != null
    ? secondsSince(lead.awaiting_since, nowMs)
    : null
  // Tempo desde a última interação (para "esfriando").
  const lastSecs = nowMs == null ? null : secondsSince(lead.last_interaction_at, nowMs)
  // Frieza: baseada na última interação, ou na idade do lead se nunca houve interação.
  const staleSecs  = nowMs == null ? null : secondsSince(lead.last_interaction_at ?? lead.created_at, nowMs)
  const staleLevel = agingLevel(staleSecs, STALE_THRESHOLDS)
  const staleColor = staleLevel === 'alert'
    ? AGING_STYLE.alert.color
    : staleLevel === 'warn'
      ? AGING_STYLE.warn.color
      : 'var(--text-faint)'

  const procNames = lead.lead_procedures
    .map(lp => lp.procedures?.name)
    .filter(Boolean) as string[]

  const totalValue = lead.lead_procedures.reduce(
    (sum, lp) => sum + (lp.procedures?.price ?? 0), 0,
  )
  const vendido = lead.compra && lead.compra_valor != null && lead.compra_valor > 0 ? lead.compra_valor : null
  const formattedValue = totalValue > 0
    ? totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

  function handleDragStartCard(e: React.DragEvent) {
    wasDragging.current = true
    onDragStart(e, lead.id)
  }

  function handleDragEndCard() {
    onDragEnd()
    setTimeout(() => { wasDragging.current = false }, 80)
  }

  function handleCardClick() {
    if (wasDragging.current) return
    // Os dois portais fazem a mesma coisa: abrem o card. No portal da rede isto
    // pulava direto para a conversa no inbox, o que era um destino diferente
    // para o mesmo gesto — e escondia o card, que é onde estão os dados, a
    // etapa e o histórico. Ir para a conversa virou um botão dentro do modal.
    editRef.current?.open()
  }

  function handleConvert(e: React.MouseEvent) {
    e.stopPropagation()
    setConvertOpen(true)   // abre o form de cliente (e-mail + CPF) pré-preenchido
  }

  return (
    <>
      {/* Modal de edição via ref (sem trigger visível) */}
      <CRMLeadModal
        ref={editRef}
        branchId={branchId} slug={slug}
        stages={allStages} funnels={funnels} funnelId={funnelId}
        procedures={procedures}
        branches={branches}
        existing={{
          id: lead.id, name: lead.name,
          phone: lead.phone, email: lead.email,
          social_media: lead.social_media,
          source: lead.source, notes: lead.notes,
          crm_stage_id: lead.crm_stage_id,
          tags: lead.tags,
          lead_procedures: lead.lead_procedures.map(lp => ({ procedure_id: lp.procedure_id })),
          owner_id: lead.owner_id ?? null, owner_name: lead.owner_name ?? null,
          retornar_em: lead.retornar_em ?? null, retornar_obs: lead.retornar_obs ?? null,
        }}
        agendar={unidadesParaAgendar ? { unidades: unidadesParaAgendar, clienteId: lead.client_id } : undefined}
      />

      {/* Mover para outro funil */}
      <dialog
        ref={moveRef}
        className="modal"
        style={{ maxWidth: 380 } as React.CSSProperties}
        onClick={e => { if (e.target === moveRef.current) moveRef.current?.close() }}
      >
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Mover para outro funil</p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 2 }}>{lead.name}</p>
            </div>
            <button
              type="button"
              onClick={() => moveRef.current?.close()}
              style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                border: '1px solid var(--border)', background: 'var(--bg-app)',
                color: 'var(--text-faint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={13} />
            </button>
          </div>

          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            O lead entra na primeira etapa do funil escolhido e sai deste quadro.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {outrosFunis.map(f => {
              const etapas = allStages
                .filter(st => st.funnel_id === f.id)
                .sort((a, b) => a.position - b.position)
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => moverParaFunil(f.id)}
                  disabled={moving || etapas.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    opacity: moving || etapas.length === 0 ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{f.name}</span>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', fontWeight: 600 }}>
                    {etapas.length > 0 ? `→ ${etapas[0]!.name}` : 'sem etapas'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </dialog>

      {/* Card */}
      <div
        ref={cardRef}
        className="crm-card"
        data-lead-id={lead.id}
        data-lead-card
        draggable
        onDragStart={handleDragStartCard}
        onDragEnd={handleDragEndCard}
        onClick={handleCardClick}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-field-token)', padding: "12px 14px",
          cursor: isDragging ? 'grabbing' : 'pointer',
          opacity: isDragging ? 0.35 : 1,
          transition: 'opacity 150ms, box-shadow 150ms',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(34,22,25,.1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
      >
        {/* Linha 1: origem + tags + lixeira */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
            {lead.source && (
              <TagBadge label={lead.source} style={sourceStyle(lead.source)} size="xs" />
            )}
            {/* A tag igual à origem não se repete: era "Instagram Instagram" (a
                origem e a tag que a conversa deriva dela). */}
            {lead.tags?.filter(t => t.toLowerCase() !== (lead.source ?? '').toLowerCase()).map(t => (
              <TagBadge key={t} label={t} size="xs" />
            ))}
          </div>

          {/*
            Menu do card. Mover de funil é ação rara e não merece um botão fixo
            ocupando o topo do card. Excluir lead deixou de existir (2026-09-28):
            sem outro funil, não há menu.
          */}
          {(outrosFunis.length > 0 || (desfechos && onMoverPara) || outrasEtapas.length > 0) && (
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              title="Ações do lead"
              aria-haspopup="menu"
              aria-expanded={menuAberto}
              onClick={e => { e.stopPropagation(); setMenuAberto(v => !v) }}
              disabled={moving}
              style={{
                width: 24, height: 24, borderRadius: 6,
                border: '1px solid var(--border)',
                background: menuAberto ? 'var(--brand-soft)' : 'var(--bg-app)',
                color: menuAberto ? 'var(--brand)' : 'var(--text-faint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                opacity: moving ? 0.5 : 1,
              }}
            >
              <MoreHorizontal size={12} />
            </button>

            {menuAberto && (
              <div
                role="menu"
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 28, right: 0, zIndex: 20,
                  minWidth: 190, padding: 5,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-field-token)',
                  boxShadow: 'var(--shadow-popover)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                {outrasEtapas.length > 0 && onMoverPara && (
                  <div role="group" aria-label="Mover para a etapa" data-mover-para-etapa style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="overline" style={{ padding: '4px 8px 2px' }}>Mover para a etapa</span>
                    {outrasEtapas.map(s => (
                      <MenuItem key={s.id} icon={<ArrowRight size={13} />} onClick={() => { setMenuAberto(false); onMoverPara(lead.id, s.id) }}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </div>
                )}
                {/* A19 da 7ª simulação: ganhar ou perder sem rolar até a coluna. */}
                {desfechos?.ganho && onMoverPara && lead.crm_stage_id !== desfechos.ganho.id && (
                  <MenuItem icon={<Trophy size={13} />} onClick={() => { setMenuAberto(false); onMoverPara(lead.id, desfechos.ganho!.id) }}>
                    Marcar como ganho ({desfechos.ganho.name})
                  </MenuItem>
                )}
                {desfechos?.perdido && onMoverPara && lead.crm_stage_id !== desfechos.perdido.id && (
                  <MenuItem icon={<XCircle size={13} />} onClick={() => { setMenuAberto(false); onMoverPara(lead.id, desfechos.perdido!.id) }}>
                    Marcar como perdido ({desfechos.perdido.name})
                  </MenuItem>
                )}
                {outrosFunis.length > 0 && (
                <MenuItem
                  icon={<ArrowRightLeft size={13} />}
                  onClick={() => { setMenuAberto(false); moveRef.current?.showModal() }}
                >
                  Mover para outro funil
                </MenuItem>
                )}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Nome */}
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, marginBottom: 5 }}>
          {lead.name}
        </p>

        {/* Contatos */}
        {lead.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Phone size={10} color="var(--text-faint)" />
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{maskPhone(lead.phone)}</span>
          </div>
        )}
        {lead.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Mail size={10} color="var(--text-faint)" />
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {lead.email}
            </span>
          </div>
        )}
        {lead.social_media && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)', fontWeight: 700 }}>@</span>
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {lead.social_media}
            </span>
          </div>
        )}

        {/* Procedimentos + valor */}
        {procNames.length > 0 && (
          <div style={{ marginTop: 7 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {procNames.slice(0, 2).map(name => (
                <span key={name} style={{
                  fontSize: 'var(--text-overline)', fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: 'var(--brand-soft)', color: 'var(--brand)',
                  border: '1px solid var(--brand-soft-border)',
                }}>
                  {name}
                </span>
              ))}
              {procNames.length > 2 && (
                <span style={{
                  fontSize: 'var(--text-overline)', fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: 'var(--bg-app)', color: 'var(--text-faint)',
                  border: '1px solid var(--border)',
                }}>
                  +{procNames.length - 2}
                </span>
              )}
            </div>
            {formattedValue && vendido == null && (
              <p style={{
                marginTop: 5, fontSize: 'var(--text-base-sz)', fontWeight: 800,
                color: 'var(--brand)', letterSpacing: '-0.01em',
              }}>
                {formattedValue}
              </p>
            )}
          </div>
        )}
        {/* A4 da 11ª (princípio 3): comprou depois de a oportunidade nascer —
            o card diz o vendido (o plano de R$ 8.400), não o preço de tabela
            do procedimento de interesse (R$ 2.600). */}
        {vendido != null && (
          <p data-valor-vendido style={{
            marginTop: 5, fontSize: 'var(--text-base-sz)', fontWeight: 800,
            color: 'var(--brand)', letterSpacing: '-0.01em',
          }}>
            {formatBRL(vendido)} <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>vendido</span>
          </p>
        )}

        {/* Notas */}
        {lead.notes && (
          <p style={{
            fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 6,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {lead.notes}
          </p>
        )}

        {/* Badge de filial (modo rede) */}
        {lead.branch_name && (
          <div style={{ marginTop: 8 }}>
            <span style={{
              fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: 'var(--bg-app)', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
              {lead.branch_name}
            </span>
          </div>
        )}

        {/* Métricas de atendimento: aguardando resposta / lead esfriando */}
        {nowMs != null && (awaitingSecs != null || lead.last_interaction_at || staleLevel === 'alert') && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {awaitingSecs != null ? (
              <TagBadge
                size="xs"
                label={`Aguardando ${formatDurationShort(awaitingSecs)}`}
                style={AGING_STYLE[agingLevel(awaitingSecs, AWAITING_THRESHOLDS)]}
              />
            ) : staleLevel === 'alert' ? (
              <TagBadge
                size="xs"
                label={`Frio há ${formatDurationShort(staleSecs)}`}
                style={AGING_STYLE.alert}
              />
            ) : lead.last_interaction_at ? (
              <span style={{ fontSize: 'var(--text-2xs)', fontWeight: staleLevel === 'warn' ? 700 : 400, color: staleColor }}>
                Última interação há {formatDurationShort(lastSecs)}
              </span>
            ) : null}
          </div>
        )}

        {/* A18 da 7ª simulação: o card diz quando a cliente vem, e — depois
            de ela comprar — SUGERE levar a oportunidade a Ganho. Não move
            sozinho (crm-05, princípio 6): quem move é a pessoa, no botão. */}
        {/* A42 da 9ª: o lembrete de retorno — o dia combinado; hoje e atrasado em destaque. */}
        {lead.retornar_em && (() => {
          const r = textoDoRetorno(lead.retornar_em, nowMs != null ? dayKeyTZ(new Date(nowMs), fuso) : '0000-00-00')
          return (
            <p data-retornar-em title={lead.retornar_obs ?? undefined} style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-2xs)', fontWeight: 700,
              color: r.atrasado ? 'var(--danger)' : r.hoje ? 'var(--warning)' : 'var(--text-muted)',
            }}>
              <BellRing size={11} /> {r.texto}{lead.retornar_obs ? ` · ${lead.retornar_obs}` : ''}
            </p>
          )
        })()}
        {lead.proximo_agendamento && (
          <p data-agendado-em style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--info)' }}>
            <CalendarClock size={11} /> Agendado {quandoNoCard(lead.proximo_agendamento, fuso)}
          </p>
        )}
        {lead.compra && (
          <div data-sugere-ganho onClick={e => e.stopPropagation()} style={{
            marginTop: 8, padding: '7px 9px', borderRadius: 'var(--radius-field-token)',
            background: 'var(--success-soft)', border: '1px solid var(--success-border)',
            display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-2xs)', color: 'var(--text)',
          }}>
            <span>Comprou {lead.compra}. A oportunidade segue aberta{desfechos?.ganho ? '' : ' (este funil não tem etapa de ganho)'}.</span>
            {desfechos?.ganho && onMoverPara && (
              <button type="button" className="btn-secondary" draggable={false}
                onClick={e => { e.stopPropagation(); onMoverPara(lead.id, desfechos.ganho!.id) }}
                style={{ alignSelf: 'flex-start', fontSize: 'var(--text-2xs)', padding: '3px 8px', gap: 4 }}>
                <Trophy size={11} /> Mover para {desfechos.ganho.name}
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {/* O responsável, em iniciais (o nome inteiro no title e no leitor de tela). */}
            {lead.owner_name && (
              <span
                role="img"
                aria-label={`Responsável: ${lead.owner_name}`}
                title={`Responsável: ${lead.owner_name}`}
                style={{
                  width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--brand-soft)', color: 'var(--brand)',
                  border: '1px solid var(--brand-soft-border)',
                  fontSize: 'var(--text-overline)', fontWeight: 800, letterSpacing: '0.02em',
                }}
              >
                {iniciaisDoNome(lead.owner_name)}
              </span>
            )}
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{ageLabel}</span>
          </span>
          {lead.client_id ? (
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--success)', fontWeight: 700 }}>✓ Cliente</span>
          ) : networkMode || !podeCadastrarCliente ? (
            // Lead de rede converte no painel do inbox (escolhe a unidade de cadastro);
            // e converter é cadastrar: sem Clientes em Gerenciar, nada (D4).
            null
          ) : (
            <button
              type="button" onClick={handleConvert}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--success)',
                background: 'var(--success-soft)', border: '1px solid var(--success-border)',
                borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
              }}
            >
              <ArrowRight size={10} /> Converter
            </button>
          )}
        </div>
      </div>

      {convertOpen && (
        <JanelaModal onFechar={() => setConvertOpen(false)} rotulo="Converter em cliente" largura={480}>
          <div style={{ padding: 'var(--card-pad)' }}>
            <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Converter em cliente</h3>
            <ClientForm
              branchId={branchId}
              slug={slug}
              leadId={lead.id}
              prefill={{ name: lead.name, phone: lead.phone ? maskPhone(lead.phone) : undefined, email: lead.email ?? undefined }}
              onSuccess={(clientId) => {
                setConvertOpen(false)
                if (clientId) router.push(rotaCliente(pathname, lead.branch_slug ?? slug, clientId))
              }}
              showCancelButton
              onCancel={() => setConvertOpen(false)}
            />
          </div>
        </JanelaModal>
      )}
    </>
  )
}

/** "06/11 10:30" no fuso da clínica — o mesmo no servidor e no navegador. */
function quandoNoCard(iso: string, fuso = 'America/Sao_Paulo'): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: fuso })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso })
  return `${dia} ${hora}`
}

// --- Relógio do quadro -------------------------------------------
// Um "agora" que anda de minuto em minuto, lido por `useSyncExternalStore`.
// Fora do componente porque é uma fonte externa: o render só LÊ o valor.
let agoraDoRelogio: number | null = null

function assinarRelogio(avisar: () => void): () => void {
  agoraDoRelogio = Date.now()
  avisar()
  const id = setInterval(() => { agoraDoRelogio = Date.now(); avisar() }, 60000)
  return () => clearInterval(id)
}
const lerRelogio = () => agoraDoRelogio
const semRelogio = () => null

// --- Board principal ---------------------------------------------
export function CRMBoard({
  initialLeads, stages, allStages, funnels, funnelId,
  procedures, branchId, branchName, slug, networkMode, branches, leadAberto, motivos = [], podeCadastrarCliente = false,
  podeAgendar = false, podeMover = false,
}: CRMBoardProps) {
  // O dia da criação no relógio da unidade (F62b).
  const fuso = useFuso()
  // A18/A19 da 7ª simulação: as etapas de desfecho do funil aberto — o botão
  // "Mover para Fechado" da compra, o menu do card e o lugar de soltar no arraste.
  const desfechos = podeMover
    ? { ganho: stages.find(s => s.outcome === 'WON') ?? null, perdido: stages.find(s => s.outcome === 'LOST') ?? null }
    : null
  // O "Agendar" do card (A16): na rede, as unidades dela; na unidade, ela.
  const unidadesParaAgendar = !podeAgendar ? null
    : networkMode ? (branches ?? [])
    : branchId ? [{ id: branchId, name: branchName ?? '', slug }] : null
  // Levar o card à etapa de desfecho perdido pergunta o motivo antes de mover.
  const [perdaPendente, setPerdaPendente] = useState<{ id: string; etapa: string } | null>(null)
  const [perdendo, setPerdendo] = useState(false)
  const [erroDaPerda, setErroDaPerda] = useState<string | null>(null)
  const [leads, setLeads]     = useState<Lead[]>(initialLeads)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage,  setOverStage]  = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const enterCounts = useRef<Record<string, number>>({})

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [sort,    setSort]    = useState<SortOrder>('newest')

  // `?lead=` abre o card UMA vez. Depois de aberto, o parâmetro sai da URL
  // (sem refazer a página: o `replaceState` é integrado ao router do Next),
  // para recarregar ou voltar não reabrir o modal que a pessoa já fechou.
  const pathnameDoQuadro = usePathname()
  const [leadPendente, setLeadPendente] = useState(leadAberto ?? null)
  // A busca pode pedir outro lead — ou o MESMO de novo — com o quadro já
  // aberto (a página não remonta): ajustado durante o render, como
  // `leadsDoServidor` abaixo. Lido da URL, e não da prop: o `replaceState`
  // tira o `lead` da URL sem refazer a página, e a prop continuaria com o
  // pedido antigo — pedir o mesmo card outra vez não o abriria.
  const leadDaUrl = useSearchParams().get('lead')
  const [leadPedido, setLeadPedido] = useState(leadAberto ?? null)
  if (leadDaUrl !== leadPedido) {
    setLeadPedido(leadDaUrl)
    if (leadDaUrl) setLeadPendente(leadDaUrl)
  }
  const aoAbrirLeadDaUrl = useCallback(() => {
    setLeadPendente(null)
    const atuais = new URLSearchParams(window.location.search)
    if (!atuais.has('lead')) return
    window.history.replaceState(null, '', rotaComParams(pathnameDoQuadro, atuais, { lead: null }))
  }, [pathnameDoQuadro])

  // "Agora" compartilhado para as métricas de aging; atualiza a cada minuto.
  //
  // NULO no servidor e na hidratação, de propósito: calcular no servidor dá
  // 'há 4min' e na hidratação 'há 5min', e o React descarta a árvore inteira
  // por causa disso. É o `getServerSnapshot` que garante isso.
  const nowMs = useSyncExternalStore(assinarRelogio, lerRelogio, semRelogio)
  // Base do filtro de período antes de o relógio começar a andar.
  const [montadoEm] = useState(() => Date.now())

  // Sincroniza quando o servidor revalida (ex: "Novo lead" do header da página).
  // Ajustado durante o render, guardando a lista anterior; durante um arraste a
  // lista nova é marcada como vista mas não aplicada, como antes.
  const [leadsDoServidor, setLeadsDoServidor] = useState(initialLeads)
  if (leadsDoServidor !== initialLeads) {
    setLeadsDoServidor(initialLeads)
    if (!draggingId) setLeads(initialLeads)
  }

  // Leads filtrados e ordenados (apenas para exibição; DnD usa `leads` completo)
  const visibleLeads = useMemo(() => {
    let result = leads

    if (filters.sources.length > 0)
      result = result.filter(l => l.source && filters.sources.includes(l.source))

    if (filters.tags.length > 0)
      result = result.filter(l => (l.tags ?? []).some(t => filters.tags.includes(t)))

    if (filters.owners.length > 0)
      result = result.filter(l =>
        filters.owners.includes(l.owner_name ?? SEM_DONO),
      )

    if (filters.motivos.length > 0)
      result = result.filter(l => !!l.motivo_perda_id && filters.motivos.includes(l.motivo_perda_id))

    if (filters.procedureIds.length > 0)
      result = result.filter(l =>
        l.lead_procedures.some(lp => filters.procedureIds.includes(lp.procedure_id)),
      )

    if (filters.situation === 'converted')
      result = result.filter(l => !!l.client_id)
    else if (filters.situation === 'not_converted')
      result = result.filter(l => !l.client_id)

    if (filters.period === 'custom') {
      // O dia da criação no fuso do negócio: o servidor roda em UTC, e um lead
      // das 22h cairia no dia seguinte.
      result = result.filter(l => {
        const dia = dayKeyTZ(l.created_at, fuso)
        return dia >= filters.periodoDe && dia <= filters.periodoAte
      })
    } else if (filters.period !== 'all') {
      const days   = filters.period === '7d' ? 7 : filters.period === '30d' ? 30 : 90
      const cutoff = new Date((nowMs ?? montadoEm) - days * 864e5)
      result = result.filter(l => new Date(l.created_at) >= cutoff)
    }

    return [...result].sort((a, b) => {
      if (sort === 'newest')    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'oldest')    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'name_asc')  return a.name.localeCompare(b.name, 'pt-BR')
      if (sort === 'name_desc') return b.name.localeCompare(a.name, 'pt-BR')
      return 0
    })
  }, [leads, filters, sort, nowMs, montadoEm, fuso])

  function handleLeadCreated(lead: Lead) {
    // A resposta da action já pode ter trazido a lista nova do servidor, com o
    // lead dentro: acrescentar de novo mostrava o card duas vezes.
    setLeads(prev => prev.some(l => l.id === lead.id) ? prev : [lead, ...prev])
  }

  function handleLeadDeleted(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const el = e.currentTarget as HTMLElement
    const ghost = el.cloneNode(true) as HTMLElement
    ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${el.offsetWidth}px;opacity:0.9;pointer-events:none;`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 20, 20)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  function handleDragEnd() {
    setDraggingId(null); setOverStage(null); enterCounts.current = {}
  }

  function handleDragEnter(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    enterCounts.current[stageId] = (enterCounts.current[stageId] ?? 0) + 1
    setOverStage(stageId)
  }

  function handleDragLeave(_e: React.DragEvent, stageId: string) {
    enterCounts.current[stageId] = Math.max((enterCounts.current[stageId] ?? 1) - 1, 0)
    if (enterCounts.current[stageId] === 0) setOverStage(null)
  }

  function handleDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault()
    // O id vem do arraste; sem ele (o navegador não repassou), o card que estava sendo arrastado.
    const id   = e.dataTransfer.getData('text/plain') || draggingId || ''
    setDraggingId(null); setOverStage(null); enterCounts.current = {}
    moverPara(id, targetStageId)
  }

  /** Leva o card a uma etapa — o arraste, o menu do card e a sugestão da compra (A18/A19). */
  function moverPara(id: string, targetStageId: string) {
    const lead = leads.find(l => l.id === id)
    if (!lead || lead.crm_stage_id === targetStageId) return
    if (allStages.find(s => s.id === targetStageId)?.outcome === 'LOST') {
      setErroDaPerda(null)
      setPerdaPendente({ id, etapa: targetStageId })
      return
    }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, crm_stage_id: targetStageId, motivo_perda_id: null, crm_motivos_perda: null } : l))
    startTransition(async () => {
      // A recusa volta o card para onde estava e diz por quê (era descartada).
      const r = await updateLeadStage(id, targetStageId, slug)
      if (r.error) {
        setLeads(prev => prev.map(l => l.id === id ? lead : l))
        toast.error(r.error)
      }
    })
  }

  const desfechosParaSoltar = [desfechos?.ganho, desfechos?.perdido].filter((s): s is CRMStage => !!s)

  async function confirmarPerda(perda: { motivoId: string; obs: string | null }) {
    if (!perdaPendente) return
    setPerdendo(true); setErroDaPerda(null)
    const r = await updateLeadStage(perdaPendente.id, perdaPendente.etapa, slug, perda)
    setPerdendo(false)
    if (r?.error) { setErroDaPerda(r.error); return }
    const { id, etapa } = perdaPendente
    const nome = motivos.find(m => m.id === perda.motivoId)?.nome ?? null
    setLeads(prev => prev.map(l => l.id === id
      ? { ...l, crm_stage_id: etapa, motivo_perda_id: perda.motivoId, crm_motivos_perda: nome ? { nome } : null } : l))
    setPerdaPendente(null)
  }

  return (
    <div className="crm-board-root" style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0 }}>
      {perdaPendente && (
        <PerguntaDaPerda motivos={motivos} enviando={perdendo} erro={erroDaPerda}
          onConfirmar={confirmarPerda} onVoltar={() => setPerdaPendente(null)} />
      )}
      <FiltersBar
        leads={leads}
        filters={filters}
        sort={sort}
        funnels={funnels}
        funnelId={funnelId}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        onClear={() => { setFilters(DEFAULT_FILTERS); setSort('newest') }}
      />

    {/* Quadro: rola na horizontal, uma coluna de cada vez no celular.
        `scroll-snap` faz a coluna parar alinhada em vez de ficar cortada ao
        meio, que é o que torna kanban usável no toque. E `100dvh` porque
        `100vh` no celular conta com a barra de endereço recolhida — a diferença
        vira uma faixa vazia embaixo do quadro. */}
    {/* `flex: 1` + `minHeight: 0`, e não `minHeight` em vh: com altura mínima
        o quadro cresce com a coluna mais cheia e quem rola passa a ser a
        página, levando embora o cabeçalho e a barra de filtros. Assim ele
        ocupa o que sobra da tela, e a rolagem vertical acontece DENTRO de cada
        coluna — que é onde os cards estão. */}
    <div className="crm-board-cols" style={{
      display: 'flex', gap: 12,
      flex: 1, minHeight: 0,
      paddingBottom: 4, marginTop: 12,
    }}>
      {stages.map(stage => {
        // Etapa nula não cai mais na primeira coluna: com vários funis o mesmo
        // lead apareceria no começo de todos eles. Todo caminho de escrita
        // resolve uma etapa (actions/leads.ts).
        const stageLeads = visibleLeads.filter(l => l.crm_stage_id === stage.id)
        const isOver           = overStage === stage.id
        const isDraggingToThis = isOver && draggingId !== null
        const bg     = softBg(stage.color)
        const border = softBorder(stage.color)

        return (
          <div
            key={stage.id}
            data-coluna-desfecho={stage.outcome}
            onDragEnter={e => handleDragEnter(e, stage.id)}
            onDragLeave={e => handleDragLeave(e, stage.id)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={e => handleDrop(e, stage.id)}
            style={{
              minWidth: 240, maxWidth: 260, flex: "0 0 248px",
              minHeight: 0,
              display: 'flex', flexDirection: 'column',
              borderRadius: 'var(--radius-card-token)',
              background: isDraggingToThis ? bg : 'transparent',
              border: `2px solid ${isDraggingToThis ? border : 'transparent'}`,
              transition: 'background 150ms, border-color 150ms',
              padding: isDraggingToThis ? 6 : 0,
            }}
          >
            {/* Cabeçalho */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: isDraggingToThis ? '4px 8px 10px' : '0 2px 10px',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>{stage.name}</span>
                <span style={{
                  fontSize: 'var(--text-overline)', fontWeight: 700, minWidth: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: stageLeads.length > 0 ? bg : 'var(--bg-app)',
                  color: stageLeads.length > 0 ? stage.color : 'var(--text-faint)',
                  borderRadius: 99, padding: '0 5px',
                  border: `1px solid ${stageLeads.length > 0 ? border : 'var(--border)'}`,
                }}>
                  {stageLeads.length}
                </span>
              </div>
              {!networkMode && (
              <CRMLeadModal
                branchId={branchId} slug={slug}
                stages={allStages} funnels={funnels} funnelId={funnelId}
                procedures={procedures}
                initialStageId={stage.id}
                onLeadCreated={handleLeadCreated}
                trigger={
                  // O nome diz a ETAPA (J-18): eram sete "Novo lead nesta etapa" iguais.
                  <button type="button" aria-label={`Novo lead em ${stage.name}`} title={`Novo lead em ${stage.name}`} style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: 'var(--bg-app)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    <Plus size={13} />
                  </button>
                }
              />
              )}
            </div>

            {/* Cards */}
            <div className="crm-coluna-cards" style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              flex: 1, padding: '0 2px 4px', minHeight: 0,
            }}>
              {stageLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead} slug={slug} branchId={branchId}
                  allStages={allStages} funnels={funnels} funnelId={funnelId}
                  procedures={procedures} branches={branches}
                  networkMode={networkMode}
                  podeCadastrarCliente={podeCadastrarCliente}
                  unidadesParaAgendar={unidadesParaAgendar}
                  nowMs={nowMs}
                  isDragging={draggingId === lead.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onLeadDeleted={handleLeadDeleted}
                  abrirAoMontar={leadPendente === lead.id}
                  onAbertoAoMontar={aoAbrirLeadDaUrl}
                  desfechos={desfechos}
                  onMoverPara={moverPara}
                />
              ))}

              {stageLeads.length === 0 && (
                <div style={{
                  border: `2px dashed ${isDraggingToThis ? stage.color : 'var(--border)'}`,
                  borderRadius: 10, padding: '20px 12px', textAlign: 'center',
                  background: isDraggingToThis ? bg : 'transparent',
                  transition: 'all 150ms',
                }}>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: isDraggingToThis ? stage.color : 'var(--text-faint)', fontWeight: isDraggingToThis ? 700 : 400 }}>
                    {isDraggingToThis ? 'Soltar aqui' : 'Sem leads'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>

    {/* A19 da 7ª simulação: a 1440 px as colunas de desfecho ficam fora da
        tela, e perder exigia rolar com o card na mão. Arrastando, o ganho e o
        perdido aparecem embaixo, à vista; soltar ali é soltar na coluna (o
        perdido pergunta o motivo, como sempre). */}
    {draggingId && desfechosParaSoltar.length > 0 && (
      <div data-soltar-desfechos style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 30,
        display: 'flex', gap: 10, padding: 8, borderRadius: 'var(--radius-card-token)',
        background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-popover)',
      }}>
        {desfechosParaSoltar.map(st => {
          const em = overStage === st.id
          return (
            <div key={st.id} data-soltar-desfecho={st.outcome}
              onDragEnter={e => handleDragEnter(e, st.id)}
              onDragLeave={e => handleDragLeave(e, st.id)}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={e => handleDrop(e, st.id)}
              style={{
                minWidth: 160, padding: '14px 18px', borderRadius: 'var(--radius-field-token)', textAlign: 'center',
                border: '2px dashed ' + (em ? st.color : 'var(--border)'), background: em ? softBg(st.color) : 'var(--bg-app)',
                fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: st.outcome === 'WON' ? 'var(--success)' : 'var(--text-muted)',
                transition: 'background 120ms, border-color 120ms',
              }}>
              {st.outcome === 'WON' ? <Trophy size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} /> : <XCircle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />}
              Soltar em {st.name}
            </div>
          )
        })}
      </div>
    )}
    </div>
  )
}
