'use client'

import { useState, useMemo } from 'react'
import { iniciaisDoNome } from '@estetica-os/utils'
import { usePathname, useRouter } from 'next/navigation'
import { Search, UserPlus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { unitTag, isUnitTag } from '@estetica-os/utils'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { useTagsDaRede } from '@/components/shared/use-tags-da-rede'
import { opcoesDeTag, temTag, alternarTag } from '@/lib/tags/escolha'

interface ClientItem {
  id:         string
  name:       string
  phone:      string
  tags:       string[]
  isActive:   boolean
  isNew:      boolean
  lastVisit:  string | null
  branchId?:  string
  branchName?: string
}

interface Props {
  clients:           ClientItem[]
  basePath:          string          // e.g. "/bellaris-sp/clients" or "/admin/clients"
  totalActive:       number
  newClientHref?:    string | null   // null = hide button; undefined = basePath + "/new"
  availableBranches?: { id: string; name: string }[]  // admin-only: shows branch filter
}

type Filter = 'ativos' | 'novos' | 'inativos'


function lastVisitLabel(iso: string | null): string {
  if (!iso) return 'Sem visitas'
  const diff = Date.now() - new Date(iso).getTime()
  // Concluído antes da hora marcada (scheduled_at mais tarde que agora): é
  // hoje, não "-1 dias" (simulação de um dia de clínica, 2026-10-20).
  const days = Math.max(0, Math.floor(diff / 86400000))
  if (days === 0) return 'Última visita: Hoje'
  if (days === 1) return 'Última visita: Ontem'
  if (days < 7)  return `Última visita: ${days} dias`
  return `Última visita: ${formatDistanceToNow(new Date(iso), { locale: ptBR, addSuffix: true })}`
}

export function ClientsSidebar({
  clients,
  basePath,
  totalActive,
  newClientHref,
  availableBranches,
}: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const [search,           setSearch]           = useState('')
  const [filter,           setFilter]           = useState<Filter>('ativos')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [tagsEscolhidas,   setTagsEscolhidas]   = useState<string[]>([])

  // Unidade é uma TAG (quem frequenta), não o branch_id de cadastro.
  const selectedBranchName = availableBranches?.find(b => b.id === selectedBranchId)?.name

  /**
   * As tags da rede (Configurações → Tags), mais as que algum cliente carregado
   * tem fora dela (arquivada) — menos as de unidade.
   *
   * As de unidade saem porque já têm filtro próprio: apareceriam duas vezes,
   * uma como "Unidade: Centro" na lista de tags e outra no seletor de unidade,
   * fazendo a mesma pergunta em dois lugares.
   */
  const vocabulario = useTagsDaRede()
  const tagsDisponiveis = useMemo(
    () => opcoesDeTag(vocabulario ?? [], clients.flatMap(c => c.tags.filter(t => !isUnitTag(t)))),
    [vocabulario, clients],
  )

  const filtered = clients.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    const matchFilter =
      filter === 'ativos'   ? c.isActive :
      filter === 'novos'    ? c.isActive && c.isNew :
      filter === 'inativos' ? !c.isActive : true
    const matchBranch = !selectedBranchId
      || (selectedBranchName ? c.tags.includes(unitTag(selectedBranchName)) : c.branchId === selectedBranchId)
    // TODAS as tags marcadas, como no inbox: marcar duas estreita a busca.
    // Sem caixa: "VIP" e "vip" são a mesma tag (Configurações → Tags).
    const matchTags = tagsEscolhidas.every(t => temTag(c.tags, t))
    return matchSearch && matchFilter && matchBranch && matchTags
  })

  // Extract selected client id from pathname like /[slug]/clients/[id] or /admin/clients/[id]
  const pathParts  = pathname.split('/')
  const selectedId = pathParts[pathParts.indexOf('clients') + 1] ?? null

  // A situação: escolha única, e "Ativos" é o normal (o gatilho só fica rosé
  // fora dele). O "VIP" que morava aqui era uma tag fixa — vai pelo filtro de
  // tags, como qualquer outra (pedido do Heitor, 2026-10-14).
  const situacoes: { valor: Filter; rotulo: string }[] = [
    { valor: 'ativos',   rotulo: 'Ativos' },
    { valor: 'novos',    rotulo: 'Novos' },
    // "Arquivadas": o nome da ação na ficha (J-23) — era "Inativos".
    { valor: 'inativos', rotulo: 'Arquivadas' },
  ]

  const addHref = newClientHref === undefined ? `${basePath}/new` : newClientHref
  const temFiltroDeUnidade = !!availableBranches && availableBranches.length > 1

  /** Mesmo desenho dos campos da coluna; rosé quando o filtro está valendo. */
  /**
   * Gatilho de filtro que abre uma lista. Da barra, é um liga/desliga — ou o
   * filtro está valendo, ou não —, então usa a classe do sistema.
   */
  function classeGatilho(ativo: boolean) {
    return ativo ? 'filtro-toggle is-ativo' : 'filtro-toggle'
  }
  // Aqui o estilo local tinha 25px de altura e raio de pílula — num controle
  // que não é pílula, ao lado de um segmentado de 34.

  return (
    <div className="clients-master-list" style={{
      width: 'var(--client-list-w)', flexShrink: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - var(--topbar-h) - 2 * var(--content-pad-y))',
      position: 'sticky', top: 'calc(var(--topbar-h) + var(--content-pad-y))',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
              Clientes
            </h2>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
              {totalActive.toLocaleString('pt-BR')} ativos
            </span>
          </div>
          {addHref !== null && (
            <button
              type="button"
              onClick={() => router.push(addHref!)}
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: 'var(--brand)', color: 'var(--surface)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Novo cliente"
              aria-label="Novo cliente"
            >
              <UserPlus size={14} />
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Buscar por nome…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="field campo-busca"
            style={{ paddingLeft: 28, fontSize: 'var(--text-sm-sz)' }}
          />
        </div>

        {/* Situação, unidade e tags no mesmo padrão do resto do sistema (o
            quadro de oportunidades): um gatilho que abre a lista, com o
            escolhido no rótulo. Aqui isso importa mais que em outras telas — a
            coluna tem 336px, e despejar as tags como chips empurraria a lista
            de clientes para fora da tela. */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <PickerCompacto
            rotuloBotao={filter === 'ativos' ? 'Situação' : situacoes.find(o => o.valor === filter)!.rotulo}
            opcoes={situacoes}
            selecionadas={[filter]}
            textoListaVazia=""
            larguraPainel={180}
            classeBotao={classeGatilho(filter !== 'ativos')}
            onEscolher={v => setFilter(v as Filter)}
          />
          {temFiltroDeUnidade && (
            <PickerCompacto
              rotuloBotao={selectedBranchName ?? 'Unidade'}
              opcoes={availableBranches!.map(b => ({ valor: b.id, rotulo: b.name }))}
              selecionadas={selectedBranchId ? [selectedBranchId] : []}
              textoListaVazia="Nenhuma unidade."
              larguraPainel={220}
              classeBotao={classeGatilho(!!selectedBranchId)}
              // Escolher a que já está marcada limpa: é como desmarcar um
              // rádio, e sem isso a única saída seria recarregar a página.
              onEscolher={id => setSelectedBranchId(prev => (prev === id ? '' : id))}
            />
          )}

          <PickerCompacto
            rotuloBotao={tagsEscolhidas.length > 0 ? `Tags · ${tagsEscolhidas.length}` : 'Tags'}
            opcoes={tagsDisponiveis.map(t => ({ valor: t, rotulo: t }))}
            selecionadas={tagsEscolhidas}
            multiplo
            textoListaVazia="A rede ainda não tem tags (Configurações → Tags)."
            larguraPainel={220}
            classeBotao={classeGatilho(tagsEscolhidas.length > 0)}
            onEscolher={t => setTagsEscolhidas(prev => alternarTag(prev, t))}
          />
        </div>
      </div>

      {/* A lista rola por dentro; cabeçalho, busca e filtros ficam parados.
          `minHeight: 0` é o que permite isso: sem ele o item flex não encolhe
          abaixo do conteúdo, a lista cresce até o tamanho de todos os clientes
          e quem rola passa a ser a página, levando os filtros embora. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhum cliente encontrado
          </div>
        ) : (
          filtered.map(c => {
            const isSelected = c.id === selectedId
            const initials   = iniciaisDoNome(c.name)
            const isVip      = c.tags.includes('VIP')
            // A arquivada tem a marca na linha (J-23).
            const badgeLabel = !c.isActive ? 'Arquivada' : isVip ? 'VIP' : c.isNew ? 'Novo' : 'Regular'
            const badgeColor = !c.isActive ? 'var(--warning)' : isVip ? 'var(--brand)' : c.isNew ? 'var(--success)' : 'var(--text-faint)'
            const badgeBg    = !c.isActive ? 'var(--warning-soft)' : isVip ? 'var(--brand-soft)' : c.isNew ? 'var(--success-soft)' : 'var(--bg-app)'

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`${basePath}/${c.id}`)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '11px 16px',
                  background: isSelected ? 'var(--brand-soft)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--hairline)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-app)' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: isSelected ? 'var(--brand)' : 'var(--brand-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-sm-sz)', fontWeight: 800,
                  color: isSelected ? 'var(--on-brand)' : 'var(--brand)',
                }}>
                  {initials}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: isSelected ? 'var(--brand)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <span style={{
                      fontSize: 'var(--text-overline)', fontWeight: 700, flexShrink: 0,
                      padding: '2px 6px', borderRadius: 10,
                      background: badgeBg, color: badgeColor,
                    }}>
                      {badgeLabel}
                    </span>
                  </div>
                  {c.branchName ? (
                    <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--brand)', marginTop: 2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.branchName}
                    </p>
                  ) : (
                    <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastVisitLabel(c.lastVisit)}
                    </p>
                  )}
                  {c.branchName && (
                    <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastVisitLabel(c.lastVisit)}
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
