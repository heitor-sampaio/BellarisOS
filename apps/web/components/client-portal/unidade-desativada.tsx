import { AlertTriangle } from 'lucide-react'

/**
 * O agendamento marcado numa unidade que a rede desativou (F72; H6 e
 * princípio 3): o cartão do app diz, e diz o que fazer. Sem isso, a Marina
 * via a sessão 4 marcada na Pampulha como qualquer outra (14ª simulação).
 * Remarcar leva às unidades ativas ("Em qual unidade?").
 */
export function AvisoUnidadeDesativada({ nome, aberto, faleCom }: {
  nome: string | null | undefined; aberto: boolean
  /** "fale com <a rede>" (CA1: o NOME da rede, `falaDaRedeDoPortal`). */
  faleCom: string
}) {
  return (
    <p data-unidade-desativada role="note" style={{
      display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8,
      fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--warning)', lineHeight: 1.4,
    }}>
      <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        {nome ? `A unidade ${nome} foi desativada.` : 'Esta unidade foi desativada.'}
        {aberto ? ` Remarque para outra unidade ou ${faleCom}.` : ''}
      </span>
    </p>
  )
}
