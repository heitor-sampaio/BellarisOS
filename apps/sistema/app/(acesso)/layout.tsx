import { MolduraDeAcesso } from '@estetica-os/nucleo/components/plataforma/telas-de-acesso'

export default function AcessoLayout({ children }: { children: React.ReactNode }) {
  return <MolduraDeAcesso painel="Sistema">{children}</MolduraDeAcesso>
}
