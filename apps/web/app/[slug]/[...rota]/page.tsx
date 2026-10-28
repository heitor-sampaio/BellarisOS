import { notFound } from 'next/navigation'

// Pega o que não existe sob a unidade para a tela de "não encontrada" sair DENTRO
// do layout da unidade (sem isto, o 404 cai no da raiz, sem barra lateral).
export default function RotaInexistente() {
  notFound()
}
