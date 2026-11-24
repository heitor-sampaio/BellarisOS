/**
 * O que a tela de Cargos diz de um cargo de SISTEMA (D6 da 15ª simulação).
 *
 * São dois, e opostos: o "Admin da rede" (`NETWORK_ADMIN`) tem tudo, e o "Não
 * definido" (`NAO_DEFINIDO`) não tem nada — é o cargo de quem ainda não ganhou
 * um (`20261021000003_cargos_modelo.sql`). Até a 15ª, os dois diziam "Acesso
 * total à rede", com o cadeado, porque a tela decidia só por `is_system`.
 * Decide-se pela CHAVE do cargo no banco, nunca pelo rótulo.
 */
const NAO_DEFINIDO = 'NAO_DEFINIDO'

export function resumoDoCargoDeSistema(key: string | null | undefined): string {
  return key === NAO_DEFINIDO ? 'Sem acesso: é o cargo de quem ainda não tem um' : 'Acesso total à rede'
}

export function explicacaoDoCargoDeSistema(key: string | null | undefined): string {
  return key === NAO_DEFINIDO
    ? 'É o cargo do sistema de quem ainda não tem um: não abre nenhum módulo — quem tem este cargo entra e não vê nada. Na Equipe, quem tem a Equipe em Gerenciar o dá e o troca por outro cargo. Ele não pode ser editado nem excluído.'
    : 'É o cargo do sistema: tem acesso a tudo na rede, em todas as unidades, e por isso não passa por esta matriz. Ele não pode ser editado nem excluído — se pudesse, dava para trancar a si mesmo para fora da própria rede.'
}
