-- A10 da 5ª simulação (2026-11-02): não havia categoria para "Avaliação", e a
-- avaliação grátis foi cadastrada em "Bioestimuladores". A avaliação é o
-- primeiro procedimento de quase toda clínica: entra nas padrão da REDE NOVA.
-- As redes que já existem não ganham a categoria por aqui (o banco é de teste
-- e as redes [sim] não se mexem); quem quiser cria em Procedimentos →
-- Categorias.
--
-- Corpo de partida: o da produção (pg_get_functiondef), com o search_path dela.

create or replace function private.categorias_de_procedimento_padrao()
returns text[]
language sql
immutable
set search_path to 'public', 'extensions'
as $function$ select array[
  'Avaliação',
  'Toxina botulínica', 'Preenchimento', 'Fios', 'Bioestimuladores',
  'Limpeza de pele', 'Peeling', 'Microagulhamento', 'Laser',
  'Depilação', 'Massagem', 'Drenagem linfática', 'Corpo',
  'Estética íntima', 'Tricologia', 'Outros'
] $function$;

notify pgrst, 'reload schema';
