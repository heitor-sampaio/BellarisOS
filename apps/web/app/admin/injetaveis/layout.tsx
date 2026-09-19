import { ListaDeInjetaveis } from '@/app/_shared/lista-de-injetaveis'

/** Planejamentos de injetáveis de toda a rede: lista à esquerda, aberto à direita. */
export default function AdminInjetaveisLayout({ children }: { children: React.ReactNode }) {
  return (
    <ListaDeInjetaveis branchId={null} basePath="/admin/injetaveis">
      {children}
    </ListaDeInjetaveis>
  )
}
