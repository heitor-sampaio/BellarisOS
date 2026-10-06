/**
 * Até 2026-10-06 o app Android espelhava a sessão (access e REFRESH token)
 * nas Preferences, na chave `supabase-session`, legível pelo JS do WebView.
 * O espelho saiu — a sessão é o cookie httpOnly —, mas os aparelhos já
 * instalados ainda guardam o último token, e o plugin segue no APK. Na
 * primeira abertura com o web novo, apaga. Idempotente: roda a cada carga, e
 * apagar o que não existe não faz nada.
 */
export const CHAVE_DA_SESSAO_ANTIGA = 'supabase-session'

interface Preferencias { remove(o: { key: string }): Promise<void> }

export async function limparSessaoAntigaDoAparelho(o: {
  nativo: boolean
  preferencias: () => Promise<Preferencias>
}): Promise<void> {
  if (!o.nativo) return
  try {
    await (await o.preferencias()).remove({ key: CHAVE_DA_SESSAO_ANTIGA })
  } catch { /* sem o plugin (APK novo) ou falha: nada a limpar */ }
}
