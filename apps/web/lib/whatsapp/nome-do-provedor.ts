/**
 * O nome que a CLÍNICA vê de cada provedor de WhatsApp (2026-10-08, pedido do
 * Heitor): a conexão por QR é "WhatsApp Web", não o nome do fornecedor. O
 * valor gravado (`provider`, o `provedor` dos eventos) continua `uazapi` —
 * automações e consultas o leem. Só a exibição passa por aqui.
 */
const NOMES: Record<string, string> = {
  uazapi:   'WhatsApp Web',
  official: 'WhatsApp Oficial',
}

export function nomeDoProvedor(provider: string): string {
  return NOMES[provider] ?? provider
}
