'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { ChevronRight, Timer } from 'lucide-react'
import { Dica } from '@/components/shared/dica'
import { useAgora } from '@/lib/use-agora'
import { osEmAndamento, quandoDoEmAndamento, type EmAndamentoNaTela } from '@/lib/agenda/em-andamento-da-equipe'

/**
 * O bloco "Em andamento" das telas da equipe (o Heitor, 25/11): o painel da
 * unidade (no topo da "Agenda de hoje"), o da rede (com a unidade em cada
 * linha) e a faixa acima da grade da Agenda, no dia e na semana. A Minha
 * agenda mostra o dela no destaque (lib/agenda/minha-agenda), sem este bloco.
 *
 * Cada linha: quem está sendo atendido, por quem, em qual sala, desde quando e
 * até quando. Só aparece quando houver algo. Os itens vêm do servidor
 * (`lerEmAndamento`, já pela abrangência e pela vista pessoal); aqui a regra
 * única (`emAndamento`, por `osEmAndamento`) roda de novo com o relógio que
 * anda — o que acabou sai da tela aberta sem recarregar. Até hidratar, o
 * instante do servidor (`agora`): sem erro de hidratação.
 */
export function EmAndamentoAgora({ itens, agora, base, mostrarUnidade = false, style }: {
  itens: EmAndamentoNaTela[]
  /** O instante em que o servidor leu (ISO). */
  agora: string
  /** Onde abre o atendimento (`/<slug>/agenda` ou `/admin/agenda`); nulo = sem o Atendimento em Ver, a linha não abre. */
  base: string | null
  /** Mais de uma unidade na tela: cada linha diz a dela. */
  mostrarUnidade?: boolean
  /** O espaço em volta (só quando o bloco aparece). */
  style?: CSSProperties
}) {
  const doRelogio = useAgora()
  const instante = new Date(doRelogio ?? Date.parse(agora))
  const visiveis = osEmAndamento(itens, instante)
  if (visiveis.length === 0) return null
  return (
    <section data-em-andamento aria-label="Em andamento" style={{
      background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)', borderRadius: 'var(--radius-card-token)',
      padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, ...style,
    }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--brand)' }}>
        <Timer size={15} aria-hidden style={{ flexShrink: 0 }} />
        <span>Em andamento · {visiveis.length}</span>
        <Dica rotulo="Sobre o Em andamento">
          Os agendamentos em aberto (agendado, confirmado, check-in ou em atendimento) com o início já passado e o fim
          ainda por vir, de qualquer dia: o atendimento longo que começou ontem também aparece. Sai daqui quando é
          concluído ou quando o horário acaba.
        </Dica>
      </p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visiveis.map(item => {
          const { desde, ate } = quandoDoEmAndamento(item, instante)
          const detalhe = [item.quemAtende, item.sala, mostrarUnidade ? item.unidade : null].filter(Boolean).join(' · ')
          const conteudo = (
            <>
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.cliente}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.procedimento} · {detalhe}
              </span>
              <span data-em-andamento-quando style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {desde} · {ate}
              </span>
            </>
          )
          const linha: CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-field-token)',
            background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', fontSize: 'var(--text-sm-sz)', minWidth: 0,
          }
          return (
            <li key={item.id} data-em-andamento-item={item.id}>
              {base
                ? <Link href={`${base}/${item.id}`} style={linha}>{conteudo}<ChevronRight size={14} aria-hidden style={{ color: 'var(--text-faint)', flexShrink: 0 }} /></Link>
                : <div style={linha}>{conteudo}</div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
