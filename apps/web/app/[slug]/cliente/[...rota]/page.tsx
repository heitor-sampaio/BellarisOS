import { notFound } from 'next/navigation'

// Pega o que não existe no portal da cliente para a tela de "não encontrada" sair DENTRO
// do layout do portal (sem isto, o 404 cai no da raiz, sem barra lateral).
export default function RotaInexistente() {
  notFound()
}
