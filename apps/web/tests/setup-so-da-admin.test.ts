import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVISOS_DA_URL } from '@/lib/aviso-da-url'
import { saidaDoSetup } from '@/lib/setup/quem-abre'

/**
 * O /setup (o primeiro acesso da rede) é configuração da rede toda — só da
 * Admin da rede (o Heitor, 18/11: "Configuração da rede toda só pela conta
 * admin"). As actions (`actions/setup.ts`) já recusavam quem não é; a página
 * ainda abria o assistente para quem tem "A rede inteira" sem ser a Admin, e
 * a recusa vinha só no fim ("botão que a pessoa não pode usar").
 */

const WEB = join(__dirname, '..')

describe('o /setup é só da Admin da rede', () => {
  it('a Admin da rede abre o assistente', () => {
    expect(saidaDoSetup({ isNetworkAdmin: true, branchId: null }, null)).toBeNull()
  })
  it('quem tem "A rede inteira" sem ser a Admin vai ao painel da rede, com o aviso', () => {
    expect(saidaDoSetup({ isNetworkAdmin: false, branchId: null }, null)).toBe('/admin/dashboard?aviso=setup-da-rede')
  })
  it('quem é de unidade vai ao painel da unidade dela, com o aviso (C61 continua)', () => {
    expect(saidaDoSetup({ isNetworkAdmin: false, branchId: 'b1' }, 'centro')).toBe('/centro/dashboard?aviso=setup-da-rede')
    expect(saidaDoSetup({ isNetworkAdmin: false, branchId: 'b1' }, null)).toBe('/')
  })
  it('o aviso diz de quem é o setup e serve aos dois destinos', () => {
    expect(AVISOS_DA_URL['setup-da-rede']).toBe('A configuração inicial da rede é só da Admin da rede. Você está no painel.')
  })
  it('a página decide pela regra, antes de qualquer outra trava de equipe', () => {
    const pagina = readFileSync(join(WEB, 'app/(setup)/setup/page.tsx'), 'utf8')
    expect(pagina).toContain('saidaDoSetup(')
    expect(pagina).not.toContain('if (ctx.branchId !== null)')
    expect(pagina.indexOf('saidaDoSetup(')).toBeLessThan(pagina.indexOf("assertPermission(ctx, 'settings', 'MANAGE')"))
  })
})
