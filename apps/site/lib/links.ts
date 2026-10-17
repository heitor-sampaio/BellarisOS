/**
 * Para onde o site leva (2026-10-17): a CLÍNICA é outro app, em outro host
 * (`CLINICA_URL`, o mesmo nome dos outros serviços — docs/regras/infra.md).
 * Lido a cada pedido: no build do Docker as variáveis não existem.
 */
export function linksDaClinica() {
  const base = (process.env.CLINICA_URL || 'https://app.bellarisos.com').replace(/\/$/, '')
  return {
    comecar:     `${base}/register`,
    entrar:      `${base}/login`,
    privacidade: `${base}/privacidade`,
  }
}

/** O endereço do próprio site (canonical, sitemap, imagem de compartilhamento). */
export function enderecoDoSite() {
  return (process.env.SITE_URL || 'https://bellarisos.com').replace(/\/$/, '')
}
