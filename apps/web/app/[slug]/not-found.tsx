'use client'

import { useParams } from 'next/navigation'
import { PaginaNaoEncontrada } from '@/components/shared/pagina-nao-encontrada'

// A volta é ao dashboard DESTA unidade; o slug vem do endereço.
export default function NaoEncontradaNaUnidade() {
  const { slug } = useParams<{ slug: string }>()
  return <PaginaNaoEncontrada voltarPara={`/${slug}/dashboard`} />
}
