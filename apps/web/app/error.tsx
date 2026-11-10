'use client'

import { TelaDeErro } from '@/components/shared/tela-de-erro'

/**
 * A tela de erro de FORA dos portais (o login, o setup, o que quebra num
 * layout). Dentro de `/admin` e de `/[slug]`, cada portal tem o seu
 * `error.tsx`: a tela aparece DENTRO do layout, com o menu e a topbar (A32 da
 * 11ª simulação). O corpo é um só, `TelaDeErro`.
 */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErro {...props} />
}
