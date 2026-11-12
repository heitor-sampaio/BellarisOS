'use client'

import { AlertTriangle } from 'lucide-react'
import { textoDaFichaQueJaExiste, rotuloDoAtualizar, rotuloDoUsar, type FichaQueJaExiste } from '@/lib/clients/ja-existe-texto'

/**
 * "Já existe a ficha de X" nos caminhos RÁPIDOS de cadastro — o "+ Agendar"
 * com nome e telefone e o agendar pelo CRM (r2-cli-01, o Heitor em
 * 2026-11-03: "se já existir, retorna avisando que já existe, perguntando se
 * deseja cadastrar mesmo assim ou atualizar a ficha existente"). Nada foi
 * gravado; a resposta reenvia. A arquivada oferece "Reativar a ficha de X".
 *
 * Sem Clientes em Gerenciar (`ficha.podeUnificar === false`, C66): no lugar de
 * unificar/reativar, "Agendar para a ficha de X" (a ficha como está) — e, na
 * arquivada, só "Cadastrar mesmo assim".
 */
export function PerguntaJaExiste({ ficha, pending, aoCadastrarMesmoAssim, aoAtualizar, aoUsar }: {
  ficha:                 FichaQueJaExiste
  pending:               boolean
  aoCadastrarMesmoAssim: (id: string) => void
  aoAtualizar:           (id: string) => void
  /** "Agendar para a ficha de X", sem mexer nela (quem não tem Clientes em Gerenciar). */
  aoUsar:                (id: string) => void
}) {
  const unifica = ficha.podeUnificar !== false
  const usa = !unifica && !ficha.arquivada
  const nota = unifica
    ? (ficha.arquivada ? 'Reativar traz a ficha de volta, e o agendamento vai para ela.' : 'Unificar usa a ficha dela: o telefone digitado aqui entra nela, e o nome continua o da ficha.')
    : ficha.arquivada
      ? 'Reativar a ficha arquivada pede Clientes em Gerenciar: peça a quem cuida dos clientes, ou cadastre uma nova.'
      : 'O agendamento vai para a ficha dela como está: o que foi digitado aqui não entra nela.'
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
        {unifica && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => aoAtualizar(ficha.id)}>
            {rotuloDoAtualizar(ficha)}
          </button>
        )}
        {usa && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => aoUsar(ficha.id)}>
            {rotuloDoUsar(ficha)}
          </button>
        )}
      </span>
      <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-muted)' }}>
        {nota}
      </span>
    </div>
  )
}
