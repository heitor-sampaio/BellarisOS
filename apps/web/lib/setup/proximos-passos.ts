/**
 * Os próximos passos do fim do setup (A3 da 6ª simulação), na ordem em que um
 * depende do outro: o procedimento pede quem o realiza e os insumos que
 * consome, e a taxa da maquininha vale desde a primeira venda no cartão. A
 * segunda unidade é o último (A2 da 10ª: a clínica única não começa por ela).
 */
export const PROXIMOS_PASSOS = [
  { titulo: 'Equipe', porque: 'Quem atende, e em quais unidades: sem profissional, o procedimento não tem quem o realize.', href: '/admin/team' },
  { titulo: 'Salas', porque: 'As salas ou cabines: o agendar oferece a livre. Com duas unidades, ficam no “Ver detalhes” de cada uma.', href: '/admin/settings?tab=unidades#salas' },
  { titulo: 'Estoque', porque: 'Os insumos: o procedimento só baixa o que já está cadastrado.', href: '/admin/estoque' },
  // A1 da 7ª simulação: o procedimento pede a ficha e o termo JÁ existentes.
  { titulo: 'Fichas', porque: 'A anamnese de cada procedimento: ele escolhe uma ficha que já existe.', href: '/admin/settings?tab=fichas', recurso: 'fichas' },
  { titulo: 'Termos e contratos', porque: 'O termo que o procedimento pede antes de começar — também escolhido de um que já existe.', href: '/admin/settings?tab=documentos', recurso: 'documentos' },
  { titulo: 'Procedimentos', porque: 'O catálogo, com quem realiza, os insumos, a ficha, o termo e o preço.', href: '/admin/procedures' },
  { titulo: 'Taxas da maquininha', porque: 'O que a operadora desconta em cada forma e bandeira.', href: '/admin/settings?tab=comissoes' },
  { titulo: 'Fidelidade', porque: 'Os pontos e as recompensas: o programa nasce desligado, e a clínica liga se quiser.', href: '/admin/settings?tab=fidelidade', recurso: 'fidelidade' },
  { titulo: 'Funil de oportunidades', porque: 'As etapas, as origens dos leads e os motivos de perda do comercial.', href: '/admin/oportunidades', recurso: 'oportunidades' },
  // A1 da 8ª simulação: a 2ª unidade e as salas não apareciam. A2 da 10ª: ela
  // era o PRIMEIRO passo, e a clínica de uma unidade (o tamanho real do
  // cliente, CLAUDE.md §1) lia primeiro o que não tem — vai para o fim.
  { titulo: 'Outra unidade (se a clínica tiver)', porque: 'Cadastrada a segunda unidade, marque na Equipe quem atende nela: cada pessoa atende nas unidades marcadas.', href: '/admin/settings?tab=unidades' },
] as const
