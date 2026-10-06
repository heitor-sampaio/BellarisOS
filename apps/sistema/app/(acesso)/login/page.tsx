import { TelaDeLogin } from '@estetica-os/nucleo/components/plataforma/telas-de-acesso'
import { entrar } from '@/actions/acesso'

export default function LoginPage() {
  return <TelaDeLogin entrar={entrar} painel="Sistema" />
}
