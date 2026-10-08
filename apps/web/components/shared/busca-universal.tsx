'use client'

import {
  useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, useTransition,
  type ChangeEvent, type KeyboardEvent, type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowRight, CalendarClock, CalendarPlus, Filter, Layers, Loader2, MessageCircle, Package,
  Search, ShoppingBag, Sparkles, User, UserPlus, UserRound, X,
} from 'lucide-react'
import type { ResolvedPermissions } from '@estetica-os/types'
import { buscarTudo } from '@/actions/busca'
import { emitNavStart } from '@/components/shared/navigation-progress'
import { paginasDaBusca, paginasQueCasam } from '@/lib/busca/paginas'
import { destinoDoResultado } from '@/lib/busca/destino'
import { acaoDeCadastrar, acoesDoCliente, acoesGerais, type AcaoDaBusca, type IdDaAcao } from '@/lib/busca/acoes'
import {
  GRUPOS, TERMO_MAXIMO, TERMO_MINIMO,
  type GrupoDaBusca, type ResultadoDaBusca, type TipoDaBusca,
} from '@/lib/busca/tipos'

/**
 * A busca universal da topbar — um atalho para tudo: cliente, conversa,
 * oportunidade, agendamento, equipe, catálogo e as próprias páginas.
 *
 * - Páginas casam NA HORA, aqui mesmo (o catálogo vem do menu).
 * - O resto vai ao servidor (`buscarTudo`) depois de 2 letras e 250 ms, e é
 *   lá que o alcance é aplicado: a busca não acha o que a tela própria do
 *   registro não mostraria.
 * - `Ctrl/⌘+K` foca de qualquer lugar; `/` também, fora de campo de texto.
 * - No celular, a lupa abre a busca em tela cheia, embaixo da topbar (§13).
 * - AÇÕES (fase 2, 2026-10-08, `lib/busca/acoes.ts`): sem termo, "Novo
 *   agendamento" e "Cadastrar cliente" no topo; no cliente achado, "Agendar" e
 *   "Vender" na própria linha (→ entra nelas, ← volta); o termo que não achou
 *   ninguém vira "Cadastrar «termo» como cliente", no fim. Cada uma abre o
 *   modal que já existe, pela URL — e só aparece para quem a tela libera.
 */

const ICONES: Record<TipoDaBusca, ReactNode> = {
  acao:         <ArrowRight size={15} />,
  cliente:      <User size={15} />,
  conversa:     <MessageCircle size={15} />,
  oportunidade: <Filter size={15} />,
  agendamento:  <CalendarClock size={15} />,
  membro:       <UserRound size={15} />,
  procedimento: <Sparkles size={15} />,
  pacote:       <Layers size={15} />,
  produto:      <Package size={15} />,
  pagina:       <ArrowRight size={15} />,
}

const ICONE_DA_ACAO: Record<IdDaAcao, ReactNode> = {
  'novo-agendamento': <CalendarPlus size={15} />,
  'cadastrar-cliente': <UserPlus size={15} />,
  'cadastrar-termo':  <UserPlus size={15} />,
  agendar:            <CalendarPlus size={13} />,
  vender:             <ShoppingBag size={13} />,
}

const ROTULO_DO_GRUPO = new Map(GRUPOS.map(g => [g.tipo, g.rotulo]))
const ID_DA_LISTA = 'busca-universal-lista'
const idDoItem = (i: number) => `busca-universal-item-${i}`
const idDaAcao = (i: number, a: number) => `busca-universal-item-${i}-acao-${a}`
const comoItem = (a: AcaoDaBusca): ResultadoDaBusca =>
  ({ tipo: 'acao', id: a.id, titulo: a.rotulo, subtitulo: null, href: a.href })

/** Mac mostra ⌘; o resto, Ctrl. Lido só no navegador (o servidor não sabe). */
function useEhMac(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  )
}

const ehCelular = () => window.matchMedia('(max-width: 1023px)').matches

function ehCampoDeTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function BuscaUniversal({ slug, permissions, plano = null, agendaPropria = false }: {
  plano?: { funcionalidades: readonly string[] } | null
  /** A agenda do cargo é "só a própria" (outra tela, sem o modal de criar): sem os atalhos de agendar. */
  agendaPropria?: boolean
  /** Slug do portal da unidade; nulo no portal da rede. */
  slug:        string | null
  permissions: ResolvedPermissions
}) {
  const pathname = usePathname()
  const router   = useRouter()
  const [, startTransition] = useTransition()
  const ehMac = useEhMac()

  const [termo, setTermo]             = useState('')
  // Painel do desktop e sobreposição do celular guardam a PÁGINA em que foram
  // abertos: trocar de página os fecha sozinho, sem efeito para isso.
  const [abertoEm, setAbertoEm]       = useState<string | null>(null)
  const [celularEm, setCelularEm]     = useState<string | null>(null)
  const aberto    = abertoEm === pathname
  const noCelular = celularEm === pathname
  const [ativo, setAtivo]             = useState(0)
  // A ação da linha ativa em que o teclado está (→/←); nulo = a linha em si.
  const [subAtivo, setSubAtivo]       = useState<number | null>(null)
  const [achados, setAchados]         = useState<GrupoDaBusca[]>([])
  const [procurando, setProcurando]   = useState(false)
  const [erro, setErro]               = useState<string | null>(null)

  const termoRef   = useRef('')
  const raizRef    = useRef<HTMLDivElement>(null)
  const campoRef   = useRef<HTMLInputElement>(null)
  const campoCelRef = useRef<HTMLInputElement>(null)

  const paginas = useMemo(() => paginasDaBusca(slug, permissions, plano), [slug, permissions, plano])
  const quem = useMemo(() => ({ pathname, slug, permissoes: permissions, agendaPropria }), [pathname, slug, permissions, agendaPropria])

  // -- O que aparece -----------------------------------------------------------
  const limpo = termo.trim()
  const curto = limpo.length < TERMO_MINIMO
  const grupos: { tipo: TipoDaBusca; rotulo: string; itens: ResultadoDaBusca[] }[] = useMemo(() => {
    if (!limpo) {
      // Sem termo: as ações e as páginas do menu como atalhos (sem as abas, que são muitas).
      const gerais = acoesGerais({ ...quem, termo: '' }).map(comoItem)
      const atalhos = paginas.filter(p => !p.key.includes(':')).slice(0, 8)
        .map(p => ({ tipo: 'pagina' as const, id: p.key, titulo: p.titulo, subtitulo: null, href: p.href }))
      return [
        ...(gerais.length > 0 ? [{ tipo: 'acao' as const, rotulo: 'Ações', itens: gerais }] : []),
        ...(atalhos.length > 0 ? [{ tipo: 'pagina' as const, rotulo: 'Atalhos', itens: atalhos }] : []),
      ]
    }
    // O cliente achado leva as ações dele na linha.
    const doServidor = (curto ? [] : achados).map(g => g.tipo !== 'cliente' ? g
      : { ...g, itens: g.itens.map(r => ({ ...r, acoes: acoesDoCliente(quem, r.id) })) })
    const gerais = acoesGerais({ ...quem, termo: limpo }).map(comoItem)
    const dasPaginas = paginasQueCasam(paginas, limpo)
    // Não achou cliente nenhum (com a busca já de volta): o atalho de cadastrar
    // o termo, no FIM — no topo, o Enter cadastraria em vez de abrir a conversa achada.
    const achouCliente = doServidor.some(g => g.tipo === 'cliente' && g.itens.length > 0)
    const cadastrar = !curto && !procurando && !achouCliente ? acaoDeCadastrar(quem, limpo) : null
    const todos = [
      ...(gerais.length > 0 ? [{ tipo: 'acao' as const, itens: gerais }] : []),
      ...doServidor,
      ...(dasPaginas.length > 0 ? [{ tipo: 'pagina' as const, itens: dasPaginas }] : []),
    ].map(g => ({ ...g, rotulo: ROTULO_DO_GRUPO.get(g.tipo) ?? '' }))
    return cadastrar ? [...todos, { tipo: 'acao' as const, rotulo: 'Não achou?', itens: [comoItem(cadastrar)] }] : todos
  }, [limpo, curto, achados, paginas, quem, procurando])

  const itens = useMemo(() => grupos.flatMap(g => g.itens), [grupos])
  // Onde cada grupo começa na lista corrida (é por ela que o teclado anda).
  const inicioDoGrupo = useMemo(() => {
    const inicios: number[] = []
    let soma = 0
    for (const g of grupos) { inicios.push(soma); soma += g.itens.length }
    return inicios
  }, [grupos])
  const buscando = !curto && procurando
  const ativoValido = itens.length > 0 ? Math.min(ativo, itens.length - 1) : -1

  // -- Busca no servidor -------------------------------------------------------
  /** Toda digitação passa por aqui: é onde a busca começa a "buscar". */
  function mudarTermo(texto: string) {
    const novo = texto.slice(0, TERMO_MAXIMO)
    setTermo(novo)
    setAtivo(0)
    setSubAtivo(null)
    setErro(null)
    if (novo.trim().length >= TERMO_MINIMO) setProcurando(true)
    else setAchados([])
  }

  useEffect(() => {
    const t = termo.trim()
    termoRef.current = t
    if (t.length < TERMO_MINIMO) return

    const espera = setTimeout(async () => {
      try {
        const res = await buscarTudo(t, slug)
        // Resposta atrasada não sobrescreve a busca atual ("an" chegando
        // depois de "ana souza").
        if (termoRef.current !== t) return
        if (res.error) { setErro(res.error); setAchados([]) }
        else setAchados(res.grupos ?? [])
      } catch {
        if (termoRef.current !== t) return
        setErro('Não consegui buscar agora. Tente de novo.')
        setAchados([])
      }
      setProcurando(false)
    }, 250)
    return () => clearTimeout(espera)
  }, [termo, slug])

  // -- Abrir e fechar ----------------------------------------------------------
  function abrir() {
    if (ehCelular()) {
      setCelularEm(pathname)
    } else {
      setAbertoEm(pathname)
      campoRef.current?.focus()
      campoRef.current?.select()
    }
  }

  function fechar() {
    setAbertoEm(null)
    setCelularEm(null)
    campoRef.current?.blur()
  }

  // Ctrl/⌘+K de qualquer lugar; "/" fora de campo de texto. Com um modal
  // aberto, não: a busca abriria atrás dele, inerte. Esc fecha a sobreposição
  // do celular de onde o foco estiver.
  const aoAtalho = useEffectEvent(() => abrir())
  const aoEsc = useEffectEvent(() => { if (noCelular) fechar() })
  useEffect(() => {
    function aoTeclar(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') { aoEsc(); return }
      const atalho = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k'
      const barra  = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !ehCampoDeTexto(e.target)
      if (!atalho && !barra) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      aoAtalho()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  // Clique fora fecha o painel do desktop.
  useEffect(() => {
    if (!aberto) return
    function aoTocar(e: PointerEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAbertoEm(null)
    }
    window.addEventListener('pointerdown', aoTocar)
    return () => window.removeEventListener('pointerdown', aoTocar)
  }, [aberto])

  // A sobreposição do celular nasce com o campo focado.
  useEffect(() => {
    if (noCelular) campoCelRef.current?.focus()
  }, [noCelular])

  // O item ativo fica à vista quando o teclado desce além da borda.
  useEffect(() => {
    if (ativoValido < 0) return
    document.getElementById(idDoItem(ativoValido))?.scrollIntoView({ block: 'nearest' })
  }, [ativoValido])

  // -- Navegar -----------------------------------------------------------------
  function ir(r: ResultadoDaBusca) {
    irPara(destinoDoResultado(pathname, slug, r))
  }

  function irPara(href: string) {
    fechar()
    mudarTermo('')
    emitNavStart()
    startTransition(() => router.push(href))
  }

  function aoTeclarNoCampo(e: KeyboardEvent<HTMLInputElement>) {
    const atual = itens[ativoValido]
    const acoesDaLinha = atual?.acoes ?? []
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSubAtivo(null)
      if (itens.length > 0) setAtivo((ativoValido + 1) % itens.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSubAtivo(null)
      if (itens.length > 0) setAtivo((ativoValido - 1 + itens.length) % itens.length)
    } else if (e.key === 'ArrowRight' && acoesDaLinha.length > 0
      // Só no fim do texto: no meio dele, a seta é do cursor.
      && (e.currentTarget.selectionStart ?? 0) >= e.currentTarget.value.length) {
      e.preventDefault()
      setSubAtivo(s => s === null ? 0 : Math.min(s + 1, acoesDaLinha.length - 1))
    } else if (e.key === 'ArrowLeft' && subAtivo !== null) {
      e.preventDefault()
      setSubAtivo(s => (s === null || s === 0 ? null : s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const acao = subAtivo !== null ? acoesDaLinha[subAtivo] : undefined
      if (acao) irPara(acao.href)
      else if (atual) ir(atual)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // O Esc do campo é este (limpa, depois fecha); o da janela é para quando
      // o foco está fora do campo.
      e.stopPropagation()
      if (termo) mudarTermo('')
      else fechar()
    }
  }

  // -- Pedaços -----------------------------------------------------------------
  const listaAberta = aberto || noCelular

  // As props comuns aos dois campos (desktop e celular). O ref vai à parte, no
  // próprio input: passar o ref por uma função durante o render é o que o
  // React proíbe.
  const propsDoCampo = {
    type:         'text' as const,
    className:    'field campo-busca',
    value:        termo,
    placeholder:  'Buscar cliente, conversa, página…',
    autoComplete: 'off',
    spellCheck:   false,
    role:         'combobox' as const,
    'aria-label':  'Busca universal',
    'aria-expanded': listaAberta,
    'aria-controls': ID_DA_LISTA,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': listaAberta && ativoValido >= 0
      ? (subAtivo !== null && itens[ativoValido]?.acoes?.[subAtivo] ? idDaAcao(ativoValido, subAtivo) : idDoItem(ativoValido))
      : undefined,
    onChange:  (e: ChangeEvent<HTMLInputElement>) => mudarTermo(e.target.value),
    onKeyDown: aoTeclarNoCampo,
  }

  // O estado da busca fica FORA do listbox: dentro dele só pode haver opções e
  // grupos — e é numa região viva que o leitor de tela o anuncia.
  const estado = (
    <div aria-live="polite">
      {erro && <p className="busca-aviso erro" role="alert">{erro}</p>}
      {buscando && (
        <p className="busca-aviso">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Buscando…
        </p>
      )}
      {!buscando && !erro && limpo && itens.length === 0 && (
        <p className="busca-aviso">
          {curto ? 'Continue digitando…' : <>Nada encontrado para “{limpo}”.</>}
        </p>
      )}
    </div>
  )

  const lista = (
    <div id={ID_DA_LISTA} role="listbox" aria-label="Resultados da busca">
      {grupos.map((g, gi) => (
        <div key={g.tipo + g.rotulo} className="busca-grupo" role="group" aria-label={g.rotulo}>
          <p className="overline busca-grupo-titulo">{g.rotulo}</p>
          {g.itens.map((r, ri) => {
            const i = (inicioDoGrupo[gi] ?? 0) + ri
            const linhaAtiva = i === ativoValido
            const item = (
              <div
                key={`${r.tipo}:${r.id}`}
                id={idDoItem(i)}
                role="option"
                aria-selected={linhaAtiva && subAtivo === null}
                className="busca-item"
                data-tipo={r.tipo}
                onPointerMove={() => { if (!linhaAtiva || subAtivo !== null) { setAtivo(i); setSubAtivo(null) } }}
                // O mousedown não tira o foco do campo; quem navega é o click —
                // no celular, o pointerdown de um arrasto para rolar a lista
                // abriria o item em que o dedo encostou.
                onMouseDown={e => e.preventDefault()}
                onClick={() => ir(r)}
              >
                <span className="busca-item-icone" aria-hidden>{r.tipo === 'acao' ? ICONE_DA_ACAO[r.id as IdDaAcao] ?? ICONES.acao : ICONES[r.tipo]}</span>
                <span className="busca-item-texto">
                  <span className="busca-item-titulo">{r.titulo}</span>
                  {r.subtitulo && <span className="busca-item-sub">{r.subtitulo}</span>}
                </span>
              </div>
            )
            if (!r.acoes?.length) return item
            // A linha com ações: o registro e, ao lado, as ações dele — cada uma
            // uma opção da lista (o teclado chega nelas com →).
            return (
              <div key={`${r.tipo}:${r.id}`} role="none" className="busca-linha">
                {item}
                <div role="none" className="busca-linha-acoes">
                  {r.acoes.map((a, ai) => (
                    <div
                      key={a.id}
                      id={idDaAcao(i, ai)}
                      role="option"
                      aria-selected={linhaAtiva && subAtivo === ai}
                      aria-label={`${a.rotulo} para ${r.titulo}`}
                      className="busca-acao"
                      onPointerMove={() => { if (!linhaAtiva || subAtivo !== ai) { setAtivo(i); setSubAtivo(ai) } }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => irPara(a.href)}
                    >
                      <span aria-hidden>{ICONE_DA_ACAO[a.id]}</span>{a.rotulo}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  return (
    <>
      {/* Desktop: o campo fica na topbar, e o painel abre logo abaixo. */}
      <div
        ref={raizRef}
        className="busca-universal"
        // Sair por Tab fecha o painel (o clique fora já fechava).
        onBlur={e => {
          if (!raizRef.current?.contains(e.relatedTarget as Node | null)) setAbertoEm(null)
        }}
      >
        <div className="busca-campo">
          <Search size={14} className="busca-lupa-icone" aria-hidden />
          <input
            ref={campoRef}
            {...propsDoCampo}
            onFocus={() => setAbertoEm(pathname)}
          />
          {!aberto && (
            <kbd className="busca-atalho" aria-hidden>{ehMac ? '⌘' : 'Ctrl'} K</kbd>
          )}
        </div>
        {aberto && !noCelular && (
          <div className="busca-painel">
            {estado}
            {lista}
            <p className="busca-rodape" aria-hidden>
              ↑↓ para escolher · → para as ações · Enter para abrir · Esc para fechar
            </p>
          </div>
        )}
      </div>

      {/* Celular: a lupa abre a busca em tela cheia, embaixo da topbar. */}
      <button
        type="button"
        className="btn-ghost show-mobile busca-abrir"
        aria-label="Buscar"
        onClick={() => setCelularEm(pathname)}
        style={{ padding: 8 }}
      >
        <Search size={19} />
      </button>
      {noCelular && (
        <div className="busca-sobreposicao" role="dialog" aria-modal="true" aria-label="Busca">
          <div className="busca-sobreposicao-cabeca">
            <div className="busca-campo">
              <Search size={14} className="busca-lupa-icone" aria-hidden />
              <input ref={campoCelRef} {...propsDoCampo} />
            </div>
            <button type="button" className="btn-ghost" aria-label="Fechar a busca" onClick={fechar} style={{ padding: 8 }}>
              <X size={18} />
            </button>
          </div>
          <div className="busca-sobreposicao-lista">{estado}{lista}</div>
        </div>
      )}
    </>
  )
}
