import { unidadesDoMembro } from '@/lib/unidades/do-membro'

/**
 * O membro está ao alcance de quem edita (EQ-05 do catálogo de Plataforma):
 * editar pede alcançar ALGUMA unidade dele; `todas` (trocar o cargo, desativar
 * e reativar — o login e o cargo são um só) pede TODAS. `minhas` são as
 * unidades de quem edita (null = "A rede inteira", que alcança todos).
 *
 * Quem tem "A rede inteira" está em todas as unidades: quem tem alguma o
 * alcança para editar, nunca em todas — duas unidades não são a rede (EQ-03;
 * D14 da 40ª simulação: a Gilvânia, de Lavras e Varginha, não achava ação
 * nenhuma na linha do Edivaldo).
 */
export function alcancaOMembro(
  minhas: string[] | null,
  membro: { branch_id: string | null; outras_unidades?: string[] | null },
  todas = false,
): boolean {
  if (minhas === null) return true
  const dele = unidadesDoMembro({ branchId: membro.branch_id, outrasUnidades: membro.outras_unidades })
  if (dele === null) return !todas
  return todas ? dele.every(u => minhas.includes(u)) : dele.some(u => minhas.includes(u))
}

/**
 * A abrangência do membro fica como está: ele tem "A rede inteira" (`antes`
 * nulo) e quem edita não a tem — só quem a tem dá ou tira "A rede inteira"
 * (EQ-04). Ela edita o "Atende" (só as unidades dela) e o horário.
 */
export function mantemAAbrangencia(minhas: string[] | null, antes: string[] | null): boolean {
  return antes === null && minhas !== null
}
