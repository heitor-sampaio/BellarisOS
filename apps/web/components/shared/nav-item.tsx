'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { emitNavStart } from '@/components/shared/navigation-progress'
import { useSidebar } from '@/components/shared/sidebar-context'

interface NavItemProps {
  icon:  ReactNode
  label: string
  href:  string
}

export function NavItem({ icon, label, href }: NavItemProps) {
  const pathname             = usePathname()
  const router               = useRouter()
  const [isPending, startT]  = useTransition()
  const { collapsed }        = useSidebar()
  // Hover no estado, não no DOM: ele muda fundo E cor, e mexer nos dois via
  // `style` obrigaria a restaurar a cor exata no mouseleave — que depende de
  // estar ativo e de a barra estar recolhida.
  const [hover, setHover]    = useState(false)

  const active     = pathname === href || pathname.startsWith(href + '/')
  const showActive = active || isPending

  function handleClick() {
    if (active && !isPending) return
    emitNavStart()
    startT(() => router.push(href))
  }

  // Expandido = sidebar branco (original): ativo = pill rosé + texto branco.
  // Recolhido = sidebar rosé: ativo = pill branco + texto rosé; inativo = branco translúcido.
  //
  // O hover do expandido é o mesmo do `.btn-ghost` (brand-soft + brand): funciona
  // como prévia do ativo, que é a versão preenchida da mesma cor. Antes só o
  // recolhido tinha realce e no expandido não havia retorno nenhum ao passar o
  // mouse — em 14 itens, achar a linha certa virava trabalho.
  const realce = hover && !showActive

  const background = showActive
    ? (collapsed ? 'var(--on-brand)' : 'var(--brand)')
    : realce
      ? (collapsed ? 'rgba(255,255,255,0.14)' : 'var(--brand-soft)')
      : 'transparent'
  const color = showActive
    ? (collapsed ? 'var(--brand)' : 'var(--on-brand)')
    : realce
      ? (collapsed ? 'var(--on-brand)' : 'var(--brand)')
      : (collapsed ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)')
  const boxShadow = showActive
    ? (collapsed ? '0 6px 16px -6px rgba(90, 20, 40, 0.4)' : 'var(--shadow-nav-active)')
    : 'none'

  return (
    <button
      type="button"
      onClick={handleClick}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        // Ícone fica praticamente parado (padding simétrico centraliza no recolhido);
        // o rótulo colapsa (max-width 0 + fade) enquanto a barra encolhe ao redor.
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'flex-start',
        gap:            collapsed ? 0 : 10,
        // 6px em vez de 9px: com 14 entradas e 4 áreas, a barra passava da tela
        // e o rodapé (recolher/sair) ficava atrás de scroll. O alvo de clique
        // continua em 30px de altura, acima do mínimo confortável.
        padding:        collapsed ? '6px 17px' : '6px 12px',
        borderRadius:   'var(--radius-field-token)',
        fontSize:       'var(--text-sm-sz)',
        fontWeight:     'var(--weight-bold)',
        border:         'none',
        cursor:         active && !isPending ? 'default' : 'pointer',
        width:          '100%',
        textAlign:      'left',
        whiteSpace:     'nowrap',
        overflow:       'hidden',
        transition:     'background 120ms ease, color 120ms ease, box-shadow 120ms ease, padding var(--sidebar-anim) var(--sidebar-ease)',
        background,
        color,
        boxShadow,
      }}
    >
      <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isPending
          ? <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />
          : icon}
      </span>
      <span style={{
        opacity:    collapsed ? 0 : 1,
        maxWidth:   collapsed ? 0 : 220,
        overflow:   'hidden',
        textOverflow: 'ellipsis',
        transition: 'opacity 160ms ease, max-width var(--sidebar-anim) var(--sidebar-ease)',
      }}>
        {label}
      </span>
    </button>
  )
}
