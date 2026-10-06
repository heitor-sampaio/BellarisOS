/**
 * Os dois hosts da plataforma, para quem é ADMIN: o Sistema (administrar o
 * negócio) e o Suporte (atender as clínicas). São apps e hosts diferentes —
 * o link é absoluto e a sessão de cada um é a dele (cookie é do host). O
 * SUPORTE nem vê o seletor, e o sistema o recusa na porta.
 */
export function SeletorDePortal({ atual, urls }: { atual: 'sistema' | 'suporte'; urls: { sistema: string; suporte: string } }) {
  return (
    <nav className="portal-seletor" aria-label="Portal da plataforma">
      <a href={`${urls.sistema}/`} className="portal-seletor-item" aria-current={atual === 'sistema' ? 'page' : undefined}>Sistema</a>
      <a href={`${urls.suporte}/`} className="portal-seletor-item" aria-current={atual === 'suporte' ? 'page' : undefined}>Suporte</a>
    </nav>
  )
}
