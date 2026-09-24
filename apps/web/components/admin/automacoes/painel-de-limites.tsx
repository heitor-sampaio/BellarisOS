'use client'

import { X, ShieldCheck } from 'lucide-react'
import type { LimitesDaAutomacao } from '@estetica-os/types'

/**
 * Os limites de bom comportamento da automação.
 *
 * Fica numa gaveta própria, e não enterrado num node, porque valem para o
 * FLUXO inteiro: dois nodes de mensagem no mesmo grafo não deveriam ter
 * horários de silêncio diferentes.
 *
 * Nascem preenchidos (21h–8h, três contatos por dia) e não vazios: uma
 * automação recém-criada não deveria depender de alguém lembrar de configurar
 * isto para não acordar cliente às três da manhã.
 */
export function PainelDeLimites({
  limites, onChange, onFechar, somenteLeitura,
}: {
  limites:  LimitesDaAutomacao
  onChange: (l: LimitesDaAutomacao) => void
  onFechar: () => void
  somenteLeitura?: boolean
}) {
  return (
    <aside
      className="auto-gaveta"
      aria-label="Limites da automação"
      style={{
        width: 320, flexShrink: 0, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--hairline)', gap: 8,
      }}>
        <span style={{
          fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <ShieldCheck size={15} /> Limites
        </span>
        <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          Valem só para o que <strong>fala com o cliente</strong>. Avisar a
          equipe e anotar na oportunidade não acordam ninguém.
        </p>

        <div>
          <p style={{ fontSize: 11, fontWeight: 'var(--weight-bold)', color: 'var(--text-soft)', marginBottom: 5 }}>
            Não mandar mensagem entre
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="time" className="field" value={limites.silencioDe ?? ''}
              disabled={somenteLeitura}
              onChange={e => onChange({ ...limites, silencioDe: e.target.value || undefined })}
            />
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>e</span>
            <input
              type="time" className="field" value={limites.silencioAte ?? ''}
              disabled={somenteLeitura}
              onChange={e => onChange({ ...limites, silencioAte: e.target.value || undefined })}
            />
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
            A mensagem não é descartada: ela <strong>espera</strong> o horário.
            Descartar faria o lembrete simplesmente não acontecer.
          </p>
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 'var(--weight-bold)', color: 'var(--text-soft)', marginBottom: 5 }}>
            No máximo, por cliente por dia
          </p>
          <input
            type="number" min={1} max={20} className="field"
            value={limites.tetoPorClienteDia ?? ''}
            disabled={somenteLeitura}
            onChange={e => onChange({
              ...limites,
              tetoPorClienteDia: e.target.value ? Number(e.target.value) : undefined,
            })}
          />
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
            Conta as execuções desta automação com o mesmo cliente. Passou do
            teto, o fluxo para — esperar até amanhã acumularia a fila e
            mandaria tudo de uma vez.
          </p>
        </div>
      </div>
    </aside>
  )
}
