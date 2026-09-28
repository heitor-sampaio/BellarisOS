/**
 * O servidor uazapi PRÓPRIO da clínica é um recurso legítimo — mas o endereço
 * tem de ser público e em https. Sem isto, apontava-se o servidor do app para
 * a rede interna dele (metadados de nuvem, serviços sem autenticação).
 * Não resolve DNS (um nome público que aponta para IP privado passa): fecha o
 * caso direto, que é o que um formulário permite digitar.
 */
export function enderecoPublico(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false
  // IPv6 literal (tem ':'): loopback, rede local única (fc00::/7) e link-local.
  // Só para literal — um domínio como "fcservidor.com.br" é público.
  if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) return false
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
  }
  return true
}
