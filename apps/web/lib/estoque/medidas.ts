/**
 * As medidas do cadastro do produto — a embalagem (`products.unit`) e o
 * conteúdo dela (`consumption_unit`). Puro: o modal do produto e os testes
 * usam a mesma lista (morava solta dentro do modal).
 *
 * "un" é a embalagem avulsa (uma unidade do produto); "U" é a medida da dose,
 * como a toxina ("frasco de 100 U" — J-11, 2026-10-30), ao lado de "UI".
 */
export const MEDIDAS_DO_PRODUTO = ['un', 'U', 'UI', 'ml', 'L', 'g', 'kg', 'cx', 'par', 'rolo', 'ampola', 'frasco'] as const
