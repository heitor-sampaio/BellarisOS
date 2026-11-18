'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatBRL } from '@estetica-os/utils'
import { rotaDaClienteNoPdv } from '@/lib/rotas'
import { textoDoPacoteEmAberto } from '@/lib/pacotes/regras'

/**
 * A41 da 11ª simulação (decidido pelos princípios 1 e 2): o pacote vendido no
 * crediário libera as sessões, e a ficha e o agendar da sessão dizem o que
 * ainda está em aberto dele. Só aviso — nada é recusado.
 *
 * Desde o PDV (PDV1/CX1, a revisão do Heitor de 2026-11-13), a parcela se
 * recebe no PDV: o aviso diz isso e leva a cliente ao PDV da unidade do
 * pacote, onde as parcelas dela aparecem. Só chega aqui para quem recebe (o
 * PDV ou o Financeiro em Gerenciar — a página só lê o em aberto a ela).
 *
 * Liberar as sessões antes de pago é da REDE desde o item 8 da auditoria
 * (decisão do Claude pelo princípio 1, 2026-11-18; Configurações → Geral): sem
 * liberar, o aviso diz que as sessões esperam o pagamento.
 */
export function AvisoDoPacoteEmAberto({ valor, parcelas, clienteId, unidadeId, slug, liberaAsSessoes = true }: {
  valor: number; parcelas: number
  /** A regra da rede (`tenants.pacote_crediario_libera`): o padrão libera. */
  liberaAsSessoes?: boolean
  /** Com a cliente, o "Receber no PDV" (a "Nova venda" com ela, onde estão as parcelas). */
  clienteId?: string | null
  /** A unidade do pacote: o PDV em que as parcelas dele estão. */
  unidadeId?: string | null
  slug?: string | null
}) {
  const pathname = usePathname()
  if (!(valor > 0)) return null
  return (
    <p data-pacote-em-aberto role="status" style={{
      fontSize: 'var(--text-xs-sz)', color: 'var(--text)', lineHeight: 1.45, padding: '8px 10px',
      borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
    }}>
      <strong>{formatBRL(valor)}</strong> deste pacote ainda em aberto ({parcelas === 1 ? '1 parcela' : `${parcelas} parcelas`} do crediário).
      {' '}{textoDoPacoteEmAberto(liberaAsSessoes)}
      {clienteId && (
        <>
          {' '}
          <Link href={rotaDaClienteNoPdv(pathname, slug, unidadeId, clienteId)} style={{ color: 'var(--brand)', fontWeight: 700 }}>
            Receber no PDV
          </Link>
        </>
      )}
    </p>
  )
}
