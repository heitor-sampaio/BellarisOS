'use client'

import { AlertTriangle } from 'lucide-react'
import { domingoFechadoNoHorario } from '@/lib/agenda/horario'

/**
 * A faixa do domingo fechado do horário de funcionamento (A2 da 7ª simulação:
 * a rede 24 h não achava o domingo fechado no meio da lista). Só enquanto o
 * domingo está fechado ("Aberta 24 horas" o abre — A24 da 18ª). O /setup e a
 * Nova unidade usam a mesma (A9 da 24ª: a segunda unidade não tinha).
 * `horario` é o JSON do campo do `EditorDeHorario` (null = o padrão).
 */
export function AvisoDoDomingoFechado({ horario }: { horario: string | null }) {
  if (!domingoFechadoNoHorario(horario)) return null
  return (
    <p data-domingo-fechado role="note" style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 'var(--radius-field-token)',
      background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
      fontSize: 'var(--text-xs-sz)', color: 'var(--text)', lineHeight: 1.45, margin: 0,
    }}>
      <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} aria-hidden />
      <span>O domingo vem fechado. Se a unidade abre aos domingos (ou 24 horas), marque o domingo na lista abaixo e ajuste o horário de cada dia.</span>
    </p>
  )
}
