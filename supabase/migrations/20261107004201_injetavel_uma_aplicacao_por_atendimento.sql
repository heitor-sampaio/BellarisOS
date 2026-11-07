-- D14 da 9ª simulação (2026-11-07): "Registrar aplicação" gravava de novo a
-- cada clique — a Marina ficou com 2 aplicações iguais de 56 UI no mesmo
-- atendimento, e o "Finalizar" somava as duas na comparação com a baixa.
--
-- Uma aplicação por MAPA por ATENDIMENTO. A gravação trava o mapa (dois
-- "Registrar" ao mesmo tempo passam um de cada vez) e, havendo a aplicação
-- deste mapa neste atendimento, a ATUALIZA (só com p_atualizar: o atendimento
-- ainda aberto) em vez de inserir outra. Sem atendimento, insere como antes.
-- As duplicadas de antes (1 par na produção, dado de [sim]) ficam.
--
-- Só o servidor chama (a action confere a rede, o alcance, o mapa e a cliente).

create or replace function public.injetavel_registrar_aplicacao(
  p_mapa uuid, p_cliente uuid, p_agendamento uuid, p_profissional uuid,
  p_view text, p_points jsonb, p_totals jsonb, p_notes text, p_atualizar boolean
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  -- A fila: o mapa travado até o fim da transação.
  perform 1 from public.injectable_maps m where m.id = p_mapa for update;
  if not found then
    raise exception 'Planejamento não encontrado.' using errcode = 'P0002';
  end if;

  if p_agendamento is not null then
    select a.id into v_id
      from public.injectable_applications a
     where a.map_id = p_mapa and a.appointment_id = p_agendamento
     order by a.created_at
     limit 1;
    if v_id is not null then
      if not p_atualizar then
        return jsonb_build_object('id', v_id, 'novo', false, 'atualizada', false);
      end if;
      update public.injectable_applications
         set view = coalesce(p_view, 'front'), points = p_points, totals = coalesce(p_totals, '[]'::jsonb),
             notes = p_notes, professional_id = p_profissional, applied_at = now()
       where id = v_id;
      return jsonb_build_object('id', v_id, 'novo', false, 'atualizada', true);
    end if;
  end if;

  insert into public.injectable_applications (client_id, map_id, appointment_id, professional_id, view, points, totals, notes)
  values (p_cliente, p_mapa, p_agendamento, p_profissional, coalesce(p_view, 'front'), p_points, coalesce(p_totals, '[]'::jsonb), p_notes)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'novo', true, 'atualizada', false);
end $$;

revoke execute on function public.injetavel_registrar_aplicacao(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.injetavel_registrar_aplicacao(uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, boolean) to service_role;

notify pgrst, 'reload schema';
