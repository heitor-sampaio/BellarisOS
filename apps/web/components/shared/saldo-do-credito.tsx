'use client'

import { useEffect, useState } from 'react'
import { saldoDoCreditoDaCliente } from '@/actions/credito-na-tela'
import { textoDoSaldoDoCredito } from '@/lib/creditos/saldo-na-tela'

/**
 * "Crédito na clínica: R$ 450,00 · depois deste pagamento: R$ 360,00" (A36 da
 * 8ª simulação): junto da forma "Crédito interno" em toda tela de cobrança. O
 * saldo é o do banco; sem saldo que cubra, a tela avisa antes de o banco recusar.
 */
export function SaldoDoCredito({ clienteId, valor }: { clienteId: string; valor: number }) {
  const [saldo, setSaldo] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    saldoDoCreditoDaCliente(clienteId).then(r => { if (vivo && typeof r.saldo === 'number') setSaldo(r.saldo) })
    return () => { vivo = false }
  }, [clienteId])
  if (saldo === null) return null
  const t = textoDoSaldoDoCredito(saldo, valor)
  return (
    <p data-saldo-do-credito style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: t.cobre ? 'var(--text-muted)' : 'var(--danger)' }}>
      {t.texto}
    </p>
  )
}
