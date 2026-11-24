import type { AppModule } from '@estetica-os/types'
import { ABAS_DE_CONFIGURACAO, type ChaveDeAba } from '@/lib/configuracoes/abas'

/**
 * Por que Configurações mostra só estas abas (27ª simulação; princípio 7: "tela
 * que uma pessoa nova não entende sozinha é defeito"). Quem não tem
 * Configurações em Gerenciar chega aqui pelas abas dos outros módulos — a LGPD
 * pelo Prontuário em Gerenciar, Comissões e taxas pelo Financeiro, Tags e
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
  const partes = ABAS_DE_CONFIGURACAO.filter(a => visiveis.includes(a.key)).map(a => {
    const aba = a as { label: string; module: AppModule; alternativas?: readonly AppModule[] }
    const de = [aba.module, ...(aba.alternativas ?? [])].find(m => o.gerencia(m)) ?? aba.module
    return `${aba.label} (vem de ${o.nomeDoModulo(de)} em Gerenciar)`
  })
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
  return `Você vê ${partes.length === 1 ? 'a aba' : 'as abas'} ${lista}. As outras pedem ${o.nomeDoModulo('settings')} em Gerenciar, ou a permissão de cada uma, e as suas permissões não têm.`
}
