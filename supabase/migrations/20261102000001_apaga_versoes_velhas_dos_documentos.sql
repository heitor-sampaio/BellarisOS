-- As versões antigas da lista e do resumo de documentos emitidos, sem o
-- `p_professional_id` (o "só os meus"), ficaram no banco quando a frente H
-- criou as novas. Ninguém as chama (lib/metrics/documentos.ts usa as de 10 e 5
-- argumentos). Revisão do Heitor, doc-04 (2026-11-02): "pode apagar versão
-- velha do sistema".
drop function if exists public.documentos_emitidos_pagina(uuid, uuid[], timestamptz, timestamptz, text, text, text, integer, integer);
drop function if exists public.documentos_emitidos_resumo(uuid, uuid[], timestamptz, timestamptz);

notify pgrst, 'reload schema';
