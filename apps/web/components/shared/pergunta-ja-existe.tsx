'use client'

import { AlertTriangle } from 'lucide-react'
import { textoDaFichaQueJaExiste, rotuloDoAtualizar, type FichaQueJaExiste } from '@/lib/clients/ja-existe-texto'

/**
 * "Já existe a ficha de X" nos caminhos RÁPIDOS de cadastro — o "+ Agendar"
 * com nome e telefone e o agendar pelo CRM (r2-cli-01, o Heitor em
 * 2026-11-03: "se já existir, retorna avisando que já existe, perguntando se
 * deseja cadastrar mesmo assim ou atualizar a ficha existente"). Nada foi
 * gravado; a resposta reenvia. A arquivada oferece "Reativar a ficha de X".
 */
export function PerguntaJaExiste({ ficha, pending, aoCadastrarMesmoAssim, aoAtualizar }: {
  ficha:                 FichaQueJaExiste
  pending:               boolean
  aoCadastrarMesmoAssim: (id: string) => void
  aoAtualizar:           (id: string) => void
}) {
  return (
    <div role="alert" data-ja-existe style={{
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
      color: 'var(--warning)', background: 'var(--warning-soft)',
      borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
      fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
    }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
        <span>
          {textoDaFichaQueJaExiste(ficha)} Nada foi gravado ainda.
          {!ficha.podeCadastrarMesmoAssim && ' O CPF é único na clínica.'}
        </span>
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ficha.podeCadastrarMesmoAssim && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => aoCadastrarMesmoAssim(ficha.id)}>
            Cadastrar mesmo assim
          </button>
        )}
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => aoAtualizar(ficha.id)}>
          {rotuloDoAtualizar(ficha)}
        </button>
      </span>
      <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-muted)' }}>
        {ficha.arquivada ? 'Reativar traz a ficha de volta, e o agendamento vai para ela.' : 'Unificar usa a ficha dela: o telefone digitado aqui entra nela, e o nome continua o da ficha.'}
      </span>
    </div>
  )
}
