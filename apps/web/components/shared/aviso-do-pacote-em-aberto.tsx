import { formatBRL } from '@estetica-os/utils'

/**
 * A41 da 11ª simulação (decidido pelos princípios 1 e 2): o pacote vendido no
 * crediário libera as sessões, e a ficha e o agendar da sessão dizem o que
 * ainda está em aberto dele. Só aviso — nada é recusado.
 */
export function AvisoDoPacoteEmAberto({ valor, parcelas }: { valor: number; parcelas: number }) {
  if (!(valor > 0)) return null
  return (
    <p data-pacote-em-aberto role="status" style={{
      fontSize: 'var(--text-xs-sz)', color: 'var(--text)', lineHeight: 1.45, padding: '8px 10px',
      borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
    }}>
      <strong>{formatBRL(valor)}</strong> deste pacote ainda em aberto ({parcelas === 1 ? '1 parcela' : `${parcelas} parcelas`} do crediário).
      {' '}As sessões seguem liberadas; o que falta se recebe no Financeiro.
    </p>
  )
}
