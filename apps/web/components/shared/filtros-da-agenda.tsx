'use client'

import { useState } from 'react'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { alternarTag } from '@/lib/tags/escolha'
import { temFiltro, type FiltrosDaAgenda } from '@/lib/agenda/filtros'

/**
 * Os filtros da Agenda (o Heitor, 18/11: "Então precisa arrumar"): profissional,
 * sala e tags, na barra do cabeçalho — a da unidade e a da rede. Cada um é o
 * `PickerCompacto` (§13: filtro que abre uma lista), com o escolhido no rótulo.
 * Quem muda a URL é a tela (o servidor relê a agenda com o filtro): aqui só a
 * escolha.
 *
 * - `profissionais: null` — o filtro não aparece (Agenda "só os meus": ela só
 *   vê os dela).
 * - `salas: null` ou vazio — não aparece (unidade sem sala; a rede sem unidade
 *   escolhida, onde as salas são de cada unidade).
 * - `tags` vazio — a rede não tem tag nenhuma: não aparece (regra das Tags).
 */
export function FiltrosDaAgendaNaBarra({ profissionais, salas, tags, filtros, onMudar }: {
  profissionais: { id: string; name: string }[] | null
  salas:         { id: string; name: string }[] | null
  tags:          string[]
  filtros:       FiltrosDaAgenda
  onMudar:       (mudanca: Partial<FiltrosDaAgenda>) => void
}) {
  // As tags marcadas à mão, à frente da URL: o painel fica aberto e a segunda
  // marca não pode partir da lista de antes de o servidor responder.
  const [marcadas, setMarcadas] = useState(filtros.tags)
  // A URL mudou (o servidor respondeu, ou outro filtro): vale a dela.
  const daUrl = JSON.stringify(filtros.tags)
  const [vista, setVista] = useState(daUrl)
  if (vista !== daUrl) { setVista(daUrl); setMarcadas(filtros.tags) }
  const classe = (ativo: boolean) => (ativo ? 'filtro-toggle is-ativo' : 'filtro-toggle')
  const nomeDaProfissional = profissionais?.find(p => p.id === filtros.profissional)?.name
  const nomeDaSala = salas?.find(s => s.id === filtros.sala)?.name
  return (
    <>
      {profissionais && profissionais.length > 0 && (
        <span data-filtro-profissional style={{ display: 'contents' }}>
          <PickerCompacto
            rotuloBotao={nomeDaProfissional ?? 'Profissional'}
            opcoes={[{ valor: '', rotulo: 'Todas as profissionais' }, ...profissionais.map(p => ({ valor: p.id, rotulo: p.name }))]}
            selecionadas={[filtros.profissional ?? '']}
            textoListaVazia="Ninguém atende aqui ainda."
            larguraPainel={240}
            classeBotao={classe(!!filtros.profissional)}
            onEscolher={v => onMudar({ profissional: v || null })}
          />
        </span>
      )}
      {salas && salas.length > 0 && (
        <span data-filtro-sala style={{ display: 'contents' }}>
          <PickerCompacto
            rotuloBotao={nomeDaSala ?? 'Sala'}
            opcoes={[{ valor: '', rotulo: 'Todas as salas' }, ...salas.map(s => ({ valor: s.id, rotulo: s.name }))]}
            selecionadas={[filtros.sala ?? '']}
            textoListaVazia="Sem sala cadastrada nesta unidade."
            larguraPainel={220}
            classeBotao={classe(!!filtros.sala)}
            onEscolher={v => onMudar({ sala: v || null })}
          />
        </span>
      )}
      {tags.length > 0 && (
        <span data-filtro-tags style={{ display: 'contents' }}>
          <PickerCompacto
            rotuloBotao={marcadas.length > 0 ? `Tags · ${marcadas.length}` : 'Tags'}
            opcoes={tags.map(t => ({ valor: t, rotulo: t }))}
            selecionadas={marcadas}
            multiplo
            textoListaVazia="A rede ainda não tem tags: a Admin da rede cria em Configurações → Tags."
            larguraPainel={220}
            classeBotao={classe(marcadas.length > 0)}
            onEscolher={t => { const novas = alternarTag(marcadas, t); setMarcadas(novas); onMudar({ tags: novas }) }}
          />
        </span>
      )}
      {temFiltro(filtros) && (
        <button type="button" data-limpar-filtros className="btn-ghost"
          onClick={() => { setMarcadas([]); onMudar({ profissional: null, sala: null, tags: [] }) }}>
          Limpar filtros
        </button>
      )}
    </>
  )
}
