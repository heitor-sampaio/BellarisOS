'use client'

import type { PendenciasDoMembro } from '@/lib/equipe/repasse'
import { CANCELAR, LinhaDoAgendamento } from '@/components/admin/desativar-membro'

/**
 * Desmarcar uma unidade no "Atende" com agendamentos em aberto ali (D3 da 9ª
 * simulação, 2026-11-07; decidido pelo princípio 3): a Priscila passou a
 * atender só na Menino Deus, e os dela na Moinhos sumiram da grade sem aviso.
 * A janela de editar mostra o que fica, com o MESMO repasse do Desativar (H6):
 * para quem atende ali e está livre, um a um ou todos, ou cancelar — ou deixar
 * com ela (a grade da unidade mantém a coluna enquanto houver agendamento).
 */
export function RepasseDoAtende({ dados, escolhas, aoEscolher }: {
  dados: PendenciasDoMembro & { unidades: string }
  escolhas: Record<string, string>
  aoEscolher: (e: Record<string, string>) => void
}) {
  const texto = { fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5 } as const
  const linha = { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderTop: '1px solid var(--border)' } as const
  const n = dados.agendamentos.length

  function todosPara(pessoa: string) {
    const e: Record<string, string> = {}
    for (const a of dados.agendamentos) {
      if (pessoa === CANCELAR) e[a.id] = CANCELAR
      else e[a.id] = a.livres.some(p => p.id === pessoa) ? pessoa : (escolhas[a.id] ?? '')
    }
    aoEscolher(e)
  }

  return (
    <section data-repasse-do-atende role="alert" style={{
      gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8,
      background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
    }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)' }}>
        {dados.nome} tem {n} {n === 1 ? 'agendamento' : 'agendamentos'} em aberto em {dados.unidades}. Sem atender lá, quem
        fica com {n === 1 ? 'ele' : 'eles'}?
      </p>
      <p style={texto}>
        O que ficar com {dados.nome} continua na agenda de {dados.unidades}, na coluna dela, até alguém remarcar ou trocar a profissional.
      </p>
      {!dados.podeRepassarAgendamentos ? (
        <p style={texto}>Seu cargo não repassa agendamentos (pede a Agenda em Gerenciar, de todos): eles ficam com {dados.nome}.</p>
      ) : (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...texto }}>
            Todos para
            <select className="filtro-select" defaultValue="" onChange={e => todosPara(e.target.value)}>
              <option value="">Escolher um a um</option>
              {dados.quemAtende.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              <option value={CANCELAR}>Cancelar todos</option>
            </select>
          </label>
          <div>
            {dados.agendamentos.map(a => (
              <LinhaDoAgendamento key={a.id} a={a} nome={dados.nome} valor={escolhas[a.id] ?? ''} estilo={linha}
                deNovo="salve aqui de novo" onEscolher={v => aoEscolher({ ...escolhas, [a.id]: v })} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/** O repasse escolhido, no formato de `EntradaDoRepasse` (lib/equipe/repasse.ts). */
export function repasseDasEscolhas(escolhas: Record<string, string>) {
  return {
    agendamentos: Object.entries(escolhas).filter(([, p]) => p && p !== CANCELAR).map(([id, para]) => ({ id, para })),
    cancelar: Object.entries(escolhas).filter(([, p]) => p === CANCELAR).map(([id]) => id),
    oportunidades: [],
  }
}
