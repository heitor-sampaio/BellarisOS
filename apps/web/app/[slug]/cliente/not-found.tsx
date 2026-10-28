'use client'

import { useParams } from 'next/navigation'
import { PaginaNaoEncontrada } from '@/components/shared/pagina-nao-encontrada'

export default function NaoEncontradaNoPortal() {
  const { slug } = useParams<{ slug: string }>()
  return <PaginaNaoEncontrada voltarPara={`/${slug}/cliente`} />
}
