import { TelaNovaSenha } from '@estetica-os/nucleo/components/plataforma/telas-de-acesso'
import { trocarSenha } from '@/actions/acesso'

export default function NovaSenhaPage() {
  return <TelaNovaSenha trocar={trocarSenha} />
}
