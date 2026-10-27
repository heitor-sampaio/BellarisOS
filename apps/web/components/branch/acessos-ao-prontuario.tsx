import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ShieldCheck } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'

/**
 * Quem abriu o prontuário desta cliente (2026-10-27): a lista que o admin da
 * rede vê no fim da aba Prontuário. Os dados vêm do servidor
 * (`lib/prontuario/acessos.ts`), que só os manda a quem pode vê-los.
 */
export interface AcessoNaFicha { id: string; quem: string; onde: string; em: string }

export function AcessosAoProntuario({ itens, total }: { itens: AcessoNaFicha[]; total: number }) {
  return (
    <section className="card" aria-label="Acessos ao prontuário" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ShieldCheck size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Acessos ao prontuário
        </h3>
        <span className="chip chip-brand" style={{ marginLeft: 'auto' }}>{total}</span>
      </div>
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 10 }}>
        Quem viu os dados de saúde desta cliente, e por onde. Só a administração da rede vê esta lista.
        {total > itens.length && ` Mostrando os ${itens.length} mais recentes.`}
      </p>
      {itens.length === 0 ? (
        <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)', padding: '6px 0' }}>Ninguém abriu ainda.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {itens.map((a, i) => (
            <li key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < itens.length - 1 ? '1px solid var(--hairline)' : 'none',
            }}>
              <span aria-hidden style={{
                width: 32, height: 32, borderRadius: 'var(--radius-row)', flexShrink: 0,
                background: 'var(--brand-soft)', color: 'var(--brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-extrabold)',
              }}>
                {iniciaisDoNome(a.quem)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{a.quem}</p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>{a.onde}</p>
              </div>
              <time dateTime={a.em} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {format(new Date(a.em), "dd/MM/yyyy · HH:mm", { locale: ptBR })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
