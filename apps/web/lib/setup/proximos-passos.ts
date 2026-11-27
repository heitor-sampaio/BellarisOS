/**
 * Os próximos passos do fim do setup (A3 da 6ª simulação), na ordem em que um
 * depende do outro: o procedimento pede quem o realiza e os insumos que
 * consome, e a taxa da maquininha vale desde a primeira venda no cartão. A
 * segunda unidade é o último (A2 da 10ª: a clínica única não começa por ela).
 *
 * A10 da 39ª (princípio 7, o Heitor, 26/11: intuitivo não é explicativo): cada
 * passo é o nome e o link, na ordem — o "porquê" de cada um saiu. Ficam duas
 * frases curtas que dizem ONDE (não por quê), que os testes da A2 da 14ª e da
 * A2 da 10ª pedem: a aba das taxas e a Equipe depois da outra unidade.
 */
export interface ProximoPasso {
  titulo:   string
  href:     string
  /** Só onde a frase diz ONDE fica (A10 da 39ª). */
  porque?:  string
  /** A funcionalidade do plano: fora dele, o passo não aparece. */
  recurso?: string
}

export const PROXIMOS_PASSOS: readonly ProximoPasso[] = [
  { titulo: 'Equipe', href: '/admin/team' },
  { titulo: 'Salas', href: '/admin/settings?tab=unidades#salas' },
  { titulo: 'Estoque', href: '/admin/estoque' },
  // A1 da 7ª simulação: o procedimento pede a ficha e o termo JÁ existentes.
  { titulo: 'Fichas', href: '/admin/settings?tab=fichas', recurso: 'fichas' },
  { titulo: 'Documentos', href: '/admin/settings?tab=documentos', recurso: 'documentos' },
  { titulo: 'Procedimentos', href: '/admin/procedures' },
  { titulo: 'Taxas da maquininha', porque: 'Em Configurações → Comissões e taxas.', href: '/admin/settings?tab=comissoes' },
  { titulo: 'Fidelidade', href: '/admin/settings?tab=fidelidade', recurso: 'fidelidade' },
  { titulo: 'Funil de oportunidades', href: '/admin/oportunidades', recurso: 'oportunidades' },
  // A1 da 8ª simulação: a 2ª unidade e as salas não apareciam. A2 da 10ª: ela
  // era o PRIMEIRO passo, e a clínica de uma unidade (o tamanho real do
  // cliente, CLAUDE.md §1) lia primeiro o que não tem — vai para o fim.
  { titulo: 'Outra unidade (se a rede tiver)', porque: 'Depois, na Equipe, quem atende nela.', href: '/admin/settings?tab=unidades' },
]
