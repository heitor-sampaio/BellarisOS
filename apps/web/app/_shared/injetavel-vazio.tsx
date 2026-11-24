import { Syringe } from 'lucide-react'

/**
 * O lado direito enquanto nenhum planejamento está aberto.
 *
 * No celular esta coluna nem aparece (`ListaDetalhe` mostra só a lista), então
 * o texto é um convite de desktop — no aparelho a lista já é a tela.
 */
export function InjetavelVazio({ podeEditar }: {
  /**
   * Cria e grava o mapa: o Atendimento em Gerenciar com o Prontuário em Ver
   * (CLAUDE.md §11). Sem isso, só se escolhe um planejamento para ver — o
   * convite a começar um novo é de quem pode (CLAUDE.md §14).
   */
  podeEditar: boolean
}) {
  return (
    <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
      <Syringe size={20} style={{ color: 'var(--text-faint)' }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 10 }}>
        {podeEditar ? 'Escolha um planejamento ao lado, ou comece um novo.' : 'Escolha um planejamento ao lado para ver.'}
      </p>
      {podeEditar && (
        <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', marginTop: 4 }}>
          Marcar o mapa é planejar; registrar a aplicação congela o que foi
          aplicado no prontuário. O cliente é opcional aqui; registrar a
          aplicação, que é prontuário, exige um.
        </p>
      )}
    </div>
  )
}
