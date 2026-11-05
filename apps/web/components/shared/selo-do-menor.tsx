/**
 * A marca "Menor" no bloco da agenda (decisão 2 do Heitor, 2026-11-05): a
 * menor de idade é atendida com o responsável. O bloco é estreito: uma
 * palavra, com o responsável (ou a falta dele) no `title`.
 */
export interface MenorDoAgendamento {
  /** "Responsável: Marta Lima (Mãe) · (71) 98888-7777", ou nulo sem responsável no cadastro. */
  responsavel: string | null
}

export function SeloDoMenor({ menor }: { menor?: MenorDoAgendamento | null }) {
  if (!menor) return null
  const dica = menor.responsavel ?? 'Menor de idade, sem responsável legal no cadastro'
  return (
    <span data-menor title={dica} aria-label={`Menor de idade. ${dica}`} style={{
      flexShrink: 0, fontSize: 'var(--text-overline)', fontWeight: 'var(--weight-bold)',
      color: menor.responsavel ? 'var(--brand)' : 'var(--warning)',
    }}>
      Menor
    </span>
  )
}
