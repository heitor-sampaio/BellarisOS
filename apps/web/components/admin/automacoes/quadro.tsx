'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useNodesInitialized,
  applyEdgeChanges, applyNodeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  BackgroundVariant, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TIPOS_DE_GATILHO } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import { NoDoQuadro, type DadosDoNo } from './no-do-quadro'
import { resumoDoNo } from '@/lib/automacoes/resumo'
import { novoIdDeLigacao } from '@/lib/automacoes/ids'
import { saidasDoNo } from '@/lib/automacoes/encaixe'

/**
 * O quadro infinito.
 *
 * A conversão entre o nosso grafo (`nos`/`ligacoes`, o que vai para o banco) e
 * o formato do React Flow acontece só aqui. O resto do sistema — motor,
 * validador, resumo — nunca vê `Node`/`Edge` da biblioteca: trocar a lib um dia
 * não deveria obrigar a reescrever o executor.
 */

const TIPOS_DE_NO = { bellaris: NoDoQuadro }

interface Props {
  grafo:       GrafoDeAutomacao
  onChange:    (grafo: GrafoDeAutomacao) => void
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  /** ids com problema, para destacar. */
  comProblema: Set<string>
  /**
   * Muda de valor para pedir um reenquadramento: um node novo entrou (e está
   * selecionado: o quadro mostra ele e o anterior) ou uma versão foi carregada.
   */
  enquadrarEm?: number
  somenteLeitura?: boolean
}

/**
 * O provider é obrigatório para `useReactFlow` funcionar fora do `<ReactFlow>`
 * — e é dele que vem o `fitView` chamado quando um node novo entra.
 */
export function Quadro(props: Props) {
  return (
    <ReactFlowProvider>
      <QuadroInterno {...props} />
    </ReactFlowProvider>
  )
}

function QuadroInterno({
  grafo, onChange, selecionado, onSelecionar, comProblema, enquadrarEm, somenteLeitura,
}: Props) {
  const { fitView, getNodesBounds, getInternalNode } = useReactFlow()
  const caixa = useRef<HTMLDivElement>(null)

  // O enquadramento lê o grafo e a seleção do momento, sem ser recriado a cada
  // mudança. Recriado, ele refazia o ResizeObserver — e a primeira medida de
  // cada observer novo reenquadrava o quadro inteiro a cada arrasto.
  const atual = useRef({ grafo, selecionado })
  useEffect(() => { atual.current = { grafo, selecionado } })

  /**
   * Enquadra o fluxo — e num quadro estreito começa pelo GATILHO.
   *
   * Enquadrar tudo em 390px daria zoom de 0,45 num fluxo de três passos:
   * ilegível. Com o piso de zoom, o que se via era o MEIO do fluxo, cortado
   * dos dois lados — a tela abria no lugar errado e ninguém sabia para que
   * lado arrastar. Começando no gatilho, o caminho é sempre o mesmo: seguir as
   * setas para a direita.
   */
  const enquadrarFluxo = useCallback((duracao: number) => {
    const estreito = (caixa.current?.clientWidth ?? 0) < 700
    const gatilho = atual.current.grafo.nos.find(
      n => (TIPOS_DE_GATILHO as readonly string[]).includes(n.tipo),
    )

    if (estreito && gatilho) {
      fitView({ nodes: [{ id: gatilho.id }], padding: 0.3, maxZoom: 1, minZoom: 0.8, duration: duracao })
      return
    }
    fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.65, duration: duracao })
  }, [fitView])

  /**
   * Enquadra o passo aberto no painel, com o que leva a ele (J-14).
   *
   * Com o painel aberto o quadro fica estreito, e o enquadramento pelo gatilho
   * deixava o passo que acabou de nascer — sempre à direita — fora da vista,
   * "atrás do painel". O anterior entra junto quando os dois cabem legíveis;
   * senão, só o passo, inteiro.
   */
  const enquadrarPasso = useCallback((id: string, duracao: number) => {
    const largura = caixa.current?.clientWidth ?? 0
    const altura  = caixa.current?.clientHeight ?? 0
    const anterior = atual.current.grafo.ligacoes.find(l => l.para === id)?.de
    const ids = anterior ? [anterior, id] : [id]
    const caixaDosDois = getNodesBounds(ids)
    const zoomQueCabe = Math.min(
      largura / Math.max(caixaDosDois.width * 1.6, 1),
      altura / Math.max(caixaDosDois.height * 1.6, 1),
    )
    const alvo = zoomQueCabe >= 0.65 ? ids : [id]
    fitView({ nodes: alvo.map(i => ({ id: i })), padding: 0.3, maxZoom: 1, minZoom: 0.65, duration: duracao })
  }, [fitView, getNodesBounds])

  const enquadrar = useCallback((duracao: number) => {
    const { grafo: g, selecionado: sel } = atual.current
    if (sel && g.nos.some(n => n.id === sel)) enquadrarPasso(sel, duracao)
    else enquadrarFluxo(duracao)
  }, [enquadrarPasso, enquadrarFluxo])

  /**
   * Roda `fn` quando todos os nodes estiverem MEDIDOS. Chamado antes disso, o
   * React Flow calcula sobre caixas de tamanho zero: o node que acabou de
   * nascer ficava de fora do enquadramento e caía atrás do painel.
   */
  const quandoMedidos = useCallback((fn: () => void) => {
    let tentativas = 0
    const passo = () => {
      const faltam = atual.current.grafo.nos.some(n => !getInternalNode(n.id)?.measured?.width)
      if (!faltam || ++tentativas > 60) fn()
      else requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }, [getInternalNode])

  // A abertura: enquadra uma vez, quando os nodes já têm tamanho.
  const medidos = useNodesInitialized()
  const abriu = useRef(false)
  useEffect(() => {
    if (!medidos || abriu.current) return
    abriu.current = true
    enquadrarFluxo(0)
  }, [medidos, enquadrarFluxo])

  useEffect(() => {
    if (!enquadrarEm) return
    // O node novo nasce à direita do anterior e cairia fora da área visível.
    // O quadro é infinito: sem reenquadrar, "não aconteceu nada" é o que a
    // pessoa vê ao clicar na paleta.
    abriu.current = true
    quandoMedidos(() => enquadrar(260))
  }, [enquadrarEm, quandoMedidos, enquadrar])

  useEffect(() => {
    const alvo = caixa.current
    if (!alvo) return

    // Reenquadra quando a LARGURA do quadro muda. Cobre de uma vez os três
    // casos em que o fluxo sairia de vista: o painel de configuração abrindo e
    // comendo 320px, a barra lateral recolhendo, e a janela mudando de
    // tamanho. Tentar acertar isso com um `setTimeout` depois de abrir o
    // painel é cravar um número que a máquina lenta desmente.
    // A PRIMEIRA medida também enquadra, só que sem animação: sem ela, o fluxo
    // ficava enquadrado para um quadro que ainda não tinha o tamanho final, e
    // os cards apareciam transbordando por cima da paleta.
    // Só a ALTURA mudando não reenquadra (J-14): a faixa de problemas do
    // rodapé perde uma linha quando a primeira ligação resolve um erro, o
    // quadro ganha 24 px, e o reenquadramento deslocava o fluxo inteiro 12 px
    // debaixo do mouse de quem acabou de ligar.
    let largura = -1
    const obs = new ResizeObserver(entradas => {
      const w = Math.round(entradas[0]?.contentRect.width ?? 0)
      if (w === largura) return
      const primeira = largura < 0
      largura = w
      enquadrar(primeira ? 0 : 200)
    })
    obs.observe(alvo)
    return () => obs.disconnect()
  }, [enquadrar])
  const nodes: Node[] = useMemo(() => grafo.nos.map(n => ({
    id: n.id,
    type: 'bellaris',
    position: n.pos,
    selected: n.id === selecionado,
    data: {
      tipo:   n.tipo,
      config: n.config as Record<string, unknown>,
      resumo: resumoDoNo(n.tipo, n.config as Record<string, unknown>),
      temProblema: comProblema.has(n.id),
      saidas: saidasDoNo(n.tipo, n.config as Record<string, unknown>),
    } satisfies DadosDoNo,
  })), [grafo.nos, selecionado, comProblema])

  const edges: Edge[] = useMemo(() => grafo.ligacoes.map(l => ({
    id: l.id,
    source: l.de,
    target: l.para,
    sourceHandle: l.saida ?? null,
    animated: false,
    style: { stroke: 'var(--border-strong, var(--border))', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--border-strong, var(--border))' },
  })), [grafo.ligacoes])

  const aoMudarNodes = useCallback((mudancas: NodeChange[]) => {
    // Só posição e remoção voltam para o grafo: seleção é estado da tela, e
    // gravá-la sujaria o "há mudanças não salvas" a cada clique.
    const relevantes = mudancas.filter(m => m.type === 'position' || m.type === 'remove')
    if (!relevantes.length) return

    const atualizados = applyNodeChanges(relevantes, nodes)
    const vivos = new Set(atualizados.map(n => n.id))

    onChange({
      nos: atualizados.map(n => {
        const original = grafo.nos.find(o => o.id === n.id)!
        return { ...original, pos: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }
      }),
      // Ligação de node apagado tem de sumir junto — senão o grafo guarda uma
      // seta para o nada e o validador acusa um órfão que ninguém vê.
      ligacoes: grafo.ligacoes.filter(l => vivos.has(l.de) && vivos.has(l.para)),
    })
  }, [nodes, grafo, onChange])

  const aoMudarEdges = useCallback((mudancas: EdgeChange[]) => {
    const atualizadas = applyEdgeChanges(mudancas.filter(m => m.type === 'remove'), edges)
    const vivas = new Set(atualizadas.map(e => e.id))
    if (vivas.size === grafo.ligacoes.length) return
    onChange({ ...grafo, ligacoes: grafo.ligacoes.filter(l => vivas.has(l.id)) })
  }, [edges, grafo, onChange])

  const aoConectar = useCallback((c: Connection) => {
    if (!c.source || !c.target) return

    // Uma saída leva a um lugar só. Ligar "sim" a dois nodes pareceria
    // "faça os dois", e o executor segue um — o caminho errado, em silêncio.
    const jaUsada = grafo.ligacoes.some(
      l => l.de === c.source && (l.saida ?? null) === (c.sourceHandle ?? null),
    )

    const limpas = jaUsada
      ? grafo.ligacoes.filter(l => !(l.de === c.source && (l.saida ?? null) === (c.sourceHandle ?? null)))
      : grafo.ligacoes

    onChange({
      ...grafo,
      ligacoes: [...limpas, {
        id:    novoIdDeLigacao(),
        de:    c.source,
        para:  c.target,
        saida: c.sourceHandle ?? undefined,
      }],
    })
  }, [grafo, onChange])

  return (
    <div ref={caixa} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={TIPOS_DE_NO}
        onNodesChange={somenteLeitura ? undefined : aoMudarNodes}
        onEdgesChange={somenteLeitura ? undefined : aoMudarEdges}
        onConnect={somenteLeitura ? undefined : aoConectar}
        onNodeClick={(_, n) => onSelecionar(n.id)}
        onPaneClick={() => onSelecionar(null)}
        nodesDraggable={!somenteLeitura}
        nodesConnectable={!somenteLeitura}
        // Sem a prop `fitView`: ela enquadra TUDO no mesmo instante em que os
        // nodes são medidos, e sobrescrevia o enquadramento pelo gatilho que o
        // quadro estreito precisa. Quem enquadra agora é o efeito acima.
        // `minZoom` no enquadramento: com um painel aberto comendo 360px, um
        // fluxo largo encolhia a ponto de ninguém ler o que está escrito nos
        // cards. Cortado e legível é melhor que inteiro e ilegível — o quadro
        // rola.
        fitViewOptions={{ padding: 0.2, maxZoom: 1, minZoom: 0.65 }}
        proOptions={{ hideAttribution: false }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        style={{ background: 'var(--bg-app)' }}
      >
        {/* Os pontos estavam em `--border` (#f0e6e3) sobre o fundo nude
            (#faf5f3): dois tons quase iguais, e a superfície ficava lisa —
            nada dizia que ali se arrasta e se dá zoom. */}
        <Background
          variant={BackgroundVariant.Dots} gap={18} size={1.4}
          color="color-mix(in srgb, var(--text-faint) 55%, transparent)"
        />
        {/* Sem minimapa: um fluxo de clínica tem meia dúzia de nodes e cabe
            na tela. O mapa custaria um canto do quadro para resumir o que já
            está à vista. */}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
