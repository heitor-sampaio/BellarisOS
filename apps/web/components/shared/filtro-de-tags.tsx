'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { Dica } from '@/components/shared/dica'
import { alternarTag, opcoesDeTag, temTag } from '@/lib/tags/escolha'
import { buscaComAsTags } from '@/lib/tags/filtro-na-url'

/**
 * O filtro "Tags" de uma lista que mora na URL (`?tags=`) — CLAUDE.md §1,
 * Tags: o filtro personalizado da rede, ao lado dos filtros fixos da tela. A
 * consulta é do servidor (a página lê `?tags=` e filtra no banco); aqui só se
 * escolhe e se navega. As opções são o vocabulário da rede, lido no SERVIDOR
 * (`tagsAtivasDaRede`) e passado como prop — quem só tem o Financeiro também
 * as vê —, mais a marcada que saiu dele (arquivada). Sem tag nenhuma na rede,
 * o filtro não aparece.
 */
export function FiltroDeTags({ tagsDaRede, escolhidas, sobre, limpar = [] }: {
  tagsDaRede: string[]
  /** As tags da URL. */
  escolhidas: string[]
  /** O que o filtro recorta, na dica ao lado. */
  sobre: string
  /** Os parâmetros da URL que trocar a tag zera (a página da lista, nos Relatórios). */
  limpar?: string[]
}) {
  const router = useRouter()
  const caminho = usePathname()
  const [, iniciar] = useTransition()
  // Com o nome do vocabulário ("vip" na URL marca "VIP").
  const daUrl = escolhidas.map(t => tagsDaRede.find(v => temTag([v], t)) ?? t)
  const [marcadas, setMarcadas] = useState(daUrl)
  const [chaveDaUrl, setChaveDaUrl] = useState(daUrl.join('\u0000'))
  if (chaveDaUrl !== daUrl.join('\u0000')) { setChaveDaUrl(daUrl.join('\u0000')); setMarcadas(daUrl) }

  const opcoes = opcoesDeTag(tagsDaRede, marcadas)
  if (opcoes.length === 0) return null

  function escolher(tag: string) {
    const novas = alternarTag(marcadas, tag)
    setMarcadas(novas)
    const q = new URLSearchParams(window.location.search)
    for (const p of limpar) q.delete(p)
    iniciar(() => { router.push(`${caminho}${buscaComAsTags(q.toString(), novas)}`) })
  }

  return (
    <span data-filtro-de-tags style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <PickerCompacto
        rotuloBotao={marcadas.length > 0 ? `Tags · ${marcadas.length}` : 'Tags'}
        opcoes={opcoes.map(t => ({ valor: t, rotulo: t }))}
        selecionadas={marcadas}
        multiplo
        textoListaVazia="A rede ainda não tem tags: a Admin da rede cria em Configurações → Tags."
        larguraPainel={220}
        classeBotao={marcadas.length > 0 ? 'filtro-toggle is-ativo' : 'filtro-toggle'}
        onEscolher={escolher}
      />
      <Dica rotulo="Sobre o filtro de tags">{sobre}</Dica>
    </span>
  )
}
