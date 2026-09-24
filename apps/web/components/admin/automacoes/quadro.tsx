'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useNodesInitialized,
  applyEdgeChanges, applyNodeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  BackgroundVariant, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { NODES, SAIDAS_DE, TIPOS_DE_GATILHO } from '@estetica-os/types'
import type { GrafoDeAutomacao, TipoDeNo, ConfigCondicaoEscolha } from '@estetica-os/types'
import { NoDoQuadro, type DadosDoNo } from './no-do-quadro'
import { resumoDoNo } from '@/lib/automacoes/resumo'
import { novoIdDeLigacao } from '@/lib/automacoes/ids'

/**
 * O quadro infinito.
 *
 * A conversão entre o nosso grafo (`nos`/`ligacoes`, o que vai para o banco) e
 * o formato do React Flow acontece só aqui. O resto do sistema — motor,
 * validador, resumo — nunca vê `Node`/`Edge` da biblioteca: trocar a lib um dia
 * não deveria obrigar a reescrever o executor.
 */

const TIPOS_DE_NO = { bellaris: NoDoQuadro }

/** As saídas deste node: fixas no catálogo, ou os casos do SWITCH. */
export function saidasDoNo(tipo: TipoDeNo, config: Record<string, unknown>): string[] {
  if (tipo === NODES.CONDICAO_ESCOLHA) {
    const casos = (config as unknown as ConfigCondicaoEscolha).casos ?? []
    // 'padrao' sempre existe: um valor que ninguém previu não pode fazer o
    // fluxo sumir sem deixar rastro.
    return [...casos.map(c => c.chave), 'padrao']
  }
  return [...(SAIDAS_DE[tipo] ?? [])]
}

interface Props {
  grafo:       GrafoDeAutomacao
  onChange:    (grafo: GrafoDeAutomacao) => void
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  /** ids com problema, para destacar. */
  comProblema: Set<string>
  /** Muda de valor para pedir um reenquadramento (node novo entrou). */
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
  const { fitView } = useReactFlow()
  const caixa = useRef<HTMLDivElement>(null)

  /**
   * Enquadra o fluxo — e num quadro estreito começa pelo GATILHO.
   *
   * Enquadrar tudo em 390px daria zoom de 0,45 num fluxo de três passos:
   * ilegível. Com o piso de zoom, o que se via era o MEIO do fluxo, cortado
   * dos dois lados — a tela abria no lugar errado e ninguém sabia para que
   * lado arrastar. Começando no gatilho, o caminho é sempre o mesmo: seguir as
   * setas para a direita.
   */
  const enquadrar = useCallback((duracao: number) => {
    const estreito = (caixa.current?.clientWidth ?? 0) < 700
    const gatilho = grafo.nos.find(
      n => (TIPOS_DE_GATILHO as readonly string[]).includes(n.tipo),
    )

    if (estreito && gatilho) {
      fitView({ nodes: [{ id: gatilho.id }], padding: 0.3, maxZoom: 1, minZoom: 0.8, duration: duracao })
      return
    }
    fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.65, duration: duracao })
  }, [fitView, grafo.nos])

  // Os nodes precisam estar MEDIDOS para o enquadramento valer: chamado antes
  // disso, o React Flow calcula sobre caixas de tamanho zero e o quadro abre
  // com o fluxo fora da vista.
  const medidos = useNodesInitialized()
  useEffect(() => { if (medidos) enquadrar(0) }, [medidos, enquadrar])

  useEffect(() => {
    if (!enquadrarEm) return
    // O node novo nasce à direita do último e cairia fora da área visível. O
    // quadro é infinito: sem reenquadrar, "não aconteceu nada" é o que a
    // pessoa vê ao clicar na paleta.
    fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.65, duration: 260 })
  }, [enquadrarEm, fitView])

  useEffect(() => {
    const alvo = caixa.current
    if (!alvo) return

    // Reenquadra quando a ÁREA do quadro muda de tamanho. Cobre de uma vez os
    // três casos em que o fluxo sairia de vista: o painel de configuração
    // abrindo e comendo 320px, a barra lateral recolhendo, e a janela mudando
    // de tamanho. Tentar acertar isso com um `setTimeout` depois de abrir o
    // painel é cravar um número que a máquina lenta desmente.
    // A PRIMEIRA medida também enquadra, só que sem animação. Ela chegava a ser
    // ignorada — fazia sentido enquanto a prop `fitView` do React Flow cuidava
    // da abertura. Sem ela, ignorar a primeira deixava o fluxo enquadrado para
    // um quadro que ainda não tinha o tamanho final: os cards apareciam
    // transbordando por cima da paleta.
    let primeira = true
    const obs = new ResizeObserver(() => {
      // Pelo mesmo caminho do enquadramento inicial: girar o aparelho atravessa
      // a fronteira do estreito, e reenquadrar "tudo" ali devolveria o fluxo
      // cortado pelo meio que este ajuste resolveu.
      enquadrar(primeira ? 0 : 200)
      primeira = false
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
