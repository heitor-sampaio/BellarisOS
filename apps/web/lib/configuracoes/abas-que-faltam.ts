import type { AppModule } from '@estetica-os/types'
import { ABAS_DE_CONFIGURACAO, ABAS_DA_REDE_TODA, type ChaveDeAba } from '@/lib/configuracoes/abas'

/**
 * Por que Configurações mostra só estas abas (27ª simulação; princípio 7: "tela
 * que uma pessoa nova não entende sozinha é defeito"). Quem não tem
 * Configurações em Gerenciar chega aqui pelas abas dos outros módulos — a LGPD
 * por Clientes ou o Prontuário em Gerenciar (Q09, 24/11), Comissões e taxas pelo Financeiro, Tags e
 * Importações por Clientes ou o CRM — e via só aquelas, sem dizer por quê. A
 * nota diz de que permissão vem cada uma e o que pede o resto, no estilo da
 * "A aba X pede Y em Gerenciar" (`motivoDaAbaFechada`). Puro.
 * Nulo = Configurações em Gerenciar (a tela é dela), ou nenhuma aba.
 */
export function porQueSoEstasAbas(visiveis: readonly ChaveDeAba[], o: {
  gerencia: (m: AppModule) => boolean
  /** O nome do módulo, como a tela de Cargos o mostra. */
  nomeDoModulo: (m: AppModule) => string
}): string | null {
  if (o.gerencia('settings') || !visiveis.length) return null
  const abas = ABAS_DE_CONFIGURACAO.filter(a => visiveis.includes(a.key))
  // D11 da 33ª (A-CONF1 da 25ª, como `rotuloDasAbasAlcancadas`): quem chega
  // aqui não tem Configurações em Gerenciar — não é a Admin da rede, que tem
  // tudo —, e a aba da rede toda diz "Esta configuração é só da Admin da
  // rede." lá dentro. Ela não "vem da permissão": a nota diz de quem é.
  const partes = abas.filter(a => !ABAS_DA_REDE_TODA.includes(a.key)).map(a => {
    const aba = a as { label: string; module: AppModule; alternativas?: readonly AppModule[] }
    const de = [aba.module, ...(aba.alternativas ?? [])].find(m => o.gerencia(m)) ?? aba.module
    return `${aba.label} (vem de ${o.nomeDoModulo(de)} em Gerenciar)`
  })
  const daRede = abas.filter(a => ABAS_DA_REDE_TODA.includes(a.key)).map(a => a.label)
  const ve = partes.length ? `Você vê ${partes.length === 1 ? 'a aba' : 'as abas'} ${emLista(partes)}.` : ''
  const daRedeToda = daRede.length === 1
    ? `A aba ${daRede[0]} é da rede toda: só a Admin da rede a muda.`
    : daRede.length ? `As abas ${emLista(daRede)} são da rede toda: só a Admin da rede as muda.` : ''
  return [ve, daRedeToda, `As outras pedem ${o.nomeDoModulo('settings')} em Gerenciar, ou a permissão de cada uma, e as suas permissões não têm.`]
    .filter(Boolean).join(' ')
}

const emLista = (xs: readonly string[]) => (xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

/**
 * O topo das Configurações de quem não tem a tela inteira: as abas dela, numa
 * frase ("Tags, importações e LGPD da rede" — 2026-10-21: a SDR lia "Cargos,
 * modelos de ficha e integrações"). A sigla fica em maiúsculas. Puro.
 */
export function abasDoTopo(rotulos: readonly string[]): string {
  const xs = rotulos.map(r => (r === r.toUpperCase() ? r : r.toLowerCase()))
  const lista = xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`
  return `${lista.replace(/^./, c => c.toUpperCase())} da rede`
}
