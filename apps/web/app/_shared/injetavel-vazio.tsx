import { Syringe } from 'lucide-react'

/**
 * O lado direito enquanto nenhum planejamento está aberto.
 *
 * No celular esta coluna nem aparece (`ListaDetalhe` mostra só a lista), então
 * o texto é um convite de desktop — no aparelho a lista já é a tela.
 */
export function InjetavelVazio() {
  return (
    <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
      <Syringe size={20} style={{ color: 'var(--text-faint)' }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 10 }}>
        Escolha um planejamento ao lado, ou comece um novo.
      </p>
      <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', marginTop: 4 }}>
        Marcar o mapa é planejar; registrar a aplicação congela o que foi
        aplicado no prontuário. O cliente é opcional aqui; registrar a
        aplicação, que é prontuário, exige um.
      </p>
    </div>
  )
}
