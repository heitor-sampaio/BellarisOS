import { TelaEsqueciASenha } from '@estetica-os/nucleo/components/plataforma/telas-de-acesso'
import { pedirNovaSenha } from '@/actions/acesso'

export default function EsqueciASenhaPage() {
  return <TelaEsqueciASenha pedir={pedirNovaSenha} />
}
