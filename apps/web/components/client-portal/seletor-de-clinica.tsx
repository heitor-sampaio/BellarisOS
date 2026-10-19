'use client'

import { useState, useTransition } from 'react'
import { ChevronRight } from 'lucide-react'
import { entrarNaClinica } from '@/actions/portal-clinicas'

export interface ClinicaDoSeletor {
  clientId: string
  unidade: string
  rede: string
}

/**
 * As clínicas da conta dela — cada uma é um botão que entra no portal daquela
 * clínica (`entrarNaClinica`). Lista, não seletor de filtro: é uma escolha de
 * DESTINO, um toque e pronto.
 */
export function SeletorDeClinica({ clinicas }: { clinicas: ClinicaDoSeletor[] }) {
  const [entrando, startEntrar] = useTransition()
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function entrar(clientId: string) {
    setEscolhida(clientId)
    setErro(null)
    startEntrar(async () => {
      const r = await entrarNaClinica(clientId)
      if (r?.error) setErro(r.error)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {clinicas.map(c => (
        <button
          key={c.clientId}
          type="button"
          onClick={() => entrar(c.clientId)}
          disabled={entrando}
          className="seletor-de-clinica-item"
          aria-busy={entrando && escolhida === c.clientId}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
            <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
              {c.unidade}
            </span>
            {c.rede && c.rede !== c.unidade && (
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{c.rede}</span>
            )}
          </span>
          <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </button>
      ))}
      {erro && (
        <p role="alert" style={{
          color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
          padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {erro}
        </p>
      )}
    </div>
  )
}
