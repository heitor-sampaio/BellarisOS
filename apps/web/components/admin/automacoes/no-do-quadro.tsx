'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Zap, Clock, Users, GitBranch, Split, Timer, CalendarClock,
  MessageSquare, Bell, MoveRight, Trophy, Tag, UserCheck, PenLine, AlarmClock,
  AlertCircle, type LucideIcon,
} from 'lucide-react'
import { NODES, type TipoDeNo } from '@estetica-os/types'
import { ROTULOS } from '@/lib/automacoes/validar'

/**
 * Um node no quadro.
 *
 * Desenho: card branco com borda, como toda superfície neutra do sistema — o
 * rosé fica no GATILHO, que é o único elemento hierarquicamente diferente
 * (é por onde tudo começa). Hierarquia por preenchimento, não por sombra.
 *
 * O resumo da configuração aparece no próprio card, e não só no painel
 * lateral: quem abre um fluxo de dez nodes precisa entender o que ele faz sem
 * clicar em cada um.
 */

const ICONE: Record<TipoDeNo, LucideIcon> = {
  [NODES.GATILHO_EVENTO]:        Zap,
  [NODES.GATILHO_AGENDA]:        Clock,
  [NODES.BUSCAR_CLIENTES]:       Users,
  [NODES.CONDICAO_SE]:           GitBranch,
  [NODES.CONDICAO_ESCOLHA]:      Split,
  [NODES.ESPERA_DURACAO]:        Timer,
  [NODES.ESPERA_ATE]:            CalendarClock,
  [NODES.ACAO_MENSAGEM]:         MessageSquare,
  [NODES.ACAO_NOTIFICAR_EQUIPE]: Bell,
  [NODES.ACAO_MOVER_ETAPA]:      MoveRight,
  [NODES.ACAO_DESFECHO]:         Trophy,
  [NODES.ACAO_TAG_CLIENTE]:      Tag,
  [NODES.ACAO_ATRIBUIR]:         UserCheck,
  [NODES.ACAO_ANOTAR]:           PenLine,
  [NODES.ACAO_LEMBRETE]:         AlarmClock,
}

export interface DadosDoNo extends Record<string, unknown> {
  tipo:       TipoDeNo
  config:     Record<string, unknown>
  resumo:     string
  temProblema: boolean
  /** Saídas nomeadas; vazio = saída única. */
  saidas:     string[]
}

const ALCA = {
  width: 9, height: 9,
  background: 'var(--surface)',
  border: '1.5px solid var(--border-strong, #d9c7c2)',
} as const

function NoDoQuadroBase({ data, selected }: NodeProps) {
  const d = data as DadosDoNo
  const ehGatilho = d.tipo === NODES.GATILHO_EVENTO || d.tipo === NODES.GATILHO_AGENDA
  const Icone = ICONE[d.tipo] ?? Zap

  return (
    <div
      style={{
        width: 216,
        background: ehGatilho ? 'var(--brand)' : 'var(--surface)',
        color: ehGatilho ? 'var(--on-brand)' : 'var(--text)',
        border: `1px solid ${
          d.temProblema ? '#fda29b'
          : selected    ? 'var(--brand)'
          : ehGatilho   ? 'var(--brand)'
          : 'var(--border)'
        }`,
        borderRadius: 'var(--radius-card-token)',
        // Sombra só no elemento de marca — a regra do design system.
        boxShadow: ehGatilho ? 'var(--shadow-brand-card)' : 'none',
        padding: '11px 13px',
        fontSize: 'var(--text-xs-sz)',
      }}
    >
      {/* Gatilho não tem entrada: nada o antecede. */}
      {!ehGatilho && <Handle type="target" position={Position.Left} style={ALCA} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: d.resumo ? 5 : 0 }}>
        <Icone size={14} />
        <span style={{ fontWeight: 'var(--weight-bold)', flex: 1, minWidth: 0 }}>
          {ROTULOS[d.tipo] ?? d.tipo}
        </span>
        {d.temProblema && <AlertCircle size={13} color={ehGatilho ? 'var(--on-brand)' : '#b42318'} />}
      </div>

      {d.resumo && (
        <p style={{
          color: ehGatilho ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
          lineHeight: 1.45,
          // Duas linhas no máximo: o card é um resumo, não o formulário.
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {d.resumo}
        </p>
      )}

      {/* Saídas nomeadas viram alças com rótulo — é o que torna o IF legível
          sem abrir nada: "sim" em cima, "não" embaixo. */}
      {d.saidas.length > 0 ? (
        d.saidas.map((saida, i) => {
          const passo = 100 / (d.saidas.length + 1)
          const topo = passo * (i + 1)
          return (
            <div key={saida}>
              <Handle
                type="source" position={Position.Right} id={saida}
                style={{ ...ALCA, top: `${topo}%` }}
              />
              <span style={{
                position: 'absolute', right: -6, top: `${topo}%`,
                transform: 'translate(100%, -50%)',
                fontSize: 9.5, fontWeight: 'var(--weight-bold)',
                color: 'var(--text-muted)', whiteSpace: 'nowrap',
                paddingLeft: 10,
              }}>
                {saida}
              </span>
            </div>
          )
        })
      ) : (
        <Handle type="source" position={Position.Right} style={ALCA} />
      )}
    </div>
  )
}

export const NoDoQuadro = memo(NoDoQuadroBase)
