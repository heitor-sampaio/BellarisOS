import { PaginaNaoEncontrada } from '@/components/shared/pagina-nao-encontrada'

// Fora de qualquer portal. `/auth/redirect` leva cada pessoa ao início dela.
export default function NaoEncontrada() {
  return <PaginaNaoEncontrada voltarPara="/auth/redirect" rotuloDaVolta="Ir para o início" />
}
