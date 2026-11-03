import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { partsInTZ } from '@/lib/datetime'
import type { AbertoDeAntes, GrupoDeAbertos } from '@/lib/metrics/abertos-de-antes'

/**
 * O aviso dos atendimentos de dias anteriores ainda abertos (J-32), na agenda
 * e no dashboard da unidade, em dois grupos (agenda-03, 2026-11-02): os que a
 * cliente CHEGOU (ou começaram) e nada foi fechado, e os agendados que
 * passaram SEM CHEGADA — "marcar falta ou concluir?". Cada linha leva à tela
 * do atendimento. Os números vêm de lib/metrics (ind-02). Só no portal da
 * unidade e no dashboard da rede (H3), com a unidade de cada linha.
 */
export function AbertosDeAntes({ base, abertos, semChegada, mostrarUnidade = false }: {
  /** Onde abre o atendimento: `/<slug>/agenda` na unidade, `/admin/agenda` na rede (H3). */
  base: string
  abertos: GrupoDeAbertos; semChegada: GrupoDeAbertos
  /** No dashboard da rede com mais de uma unidade, cada linha diz a dela. */
  mostrarUnidade?: boolean
}) {
  if (!abertos.total && !semChegada.total) return null
  return (
    <section data-abertos-de-antes role="status" style={{
      background: 'var(--warning-soft)', borderRadius: 'var(--radius-card-token)', padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {abertos.total > 0 && (
        <Grupo base={base} mostrarUnidade={mostrarUnidade} grupo={abertos} chave="abertos"
          titulo={abertos.total === 1 ? 'atendimento de dias anteriores ainda aberto' : 'atendimentos de dias anteriores ainda abertos'}
          explicacao="A cliente chegou (ou o atendimento começou) e nada foi fechado. Abra para concluir ou registrar o que houve." />
      )}
      {semChegada.total > 0 && (
        <Grupo base={base} mostrarUnidade={mostrarUnidade} grupo={semChegada} chave="sem-chegada"
          titulo={semChegada.total === 1 ? 'agendamento de dias anteriores passou sem chegada' : 'agendamentos de dias anteriores passaram sem chegada'}
          explicacao="Ninguém marcou a chegada: marcar falta ou concluir? A falta não registrada distorce a agenda e os números." />
      )}
    </section>
  )
}

function Grupo({ base, mostrarUnidade, grupo, chave, titulo, explicacao }: {
  base: string; mostrarUnidade: boolean; grupo: GrupoDeAbertos; chave: 'abertos' | 'sem-chegada'; titulo: string; explicacao: string
}) {
  const quando = (iso: string) => {
    const p = partsInTZ(new Date(iso))
    const dd = (n: number) => String(n).padStart(2, '0')
    return `${dd(p.day)}/${dd(p.month)} ${dd(p.hour)}:${dd(p.minute)}`
  }
  const rotulo = (s: AbertoDeAntes['status']) =>
    s === 'ARRIVED' ? 'Chegou' : s === 'IN_PROGRESS' ? 'Em atendimento' : s === 'CONFIRMED' ? 'Confirmado' : 'Agendado'
  return (
    <div data-grupo={chave} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--warning)' }}>
        <AlertTriangle size={15} aria-hidden style={{ flexShrink: 0 }} />
        {grupo.total} {titulo}
      </p>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)' }}>{explicacao}</p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {grupo.itens.map(a => (
          <li key={a.id}>
            <Link href={`${base}/${a.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-field-token)',
              background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', fontSize: 'var(--text-sm-sz)',
            }}>
              <strong style={{ flexShrink: 0 }}>{quando(a.scheduledAt)}</strong>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.clientName}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', whiteSpace: 'nowrap' }}>
                · {rotulo(a.status)} · {a.professionalName}{mostrarUnidade ? ` · ${a.branchName}` : ''}
              </span>
              <ChevronRight size={14} aria-hidden style={{ marginLeft: 'auto', color: 'var(--text-faint)', flexShrink: 0 }} />
            </Link>
          </li>
        ))}
      </ul>
      {grupo.total > grupo.itens.length && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)' }}>e mais {grupo.total - grupo.itens.length}.</p>
      )}
    </div>
  )
}
