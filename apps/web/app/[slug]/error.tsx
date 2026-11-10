'use client'

import { TelaDeErro } from '@/components/shared/tela-de-erro'

/**
 * O erro (e o "Você não tem acesso a esta área") DENTRO do portal — A32 da 11ª
 * simulação (2026-11-10): a tela vinha sem menu e sem topbar, só com "Ir para
 * o início", porque o único `error.tsx` era o da raiz, acima do layout do
 * portal. Aqui a tela fica no lugar da página, com o menu à mão. O corpo é o
 * mesmo da raiz (`TelaDeErro`).
 */
export default function ErroDoPortal(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErro {...props} />
}
