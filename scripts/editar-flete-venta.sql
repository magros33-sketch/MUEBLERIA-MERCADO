create or replace function public.editar_flete_venta_segura(p_venta_id uuid,p_flete numeric,p_metodo text,p_flete_anterior numeric,p_metodo_anterior text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v public.ventas%rowtype; v_total numeric; v_metodos text[]; v_metodo text;
begin
 if p_flete is null or p_flete<0 or trunc(p_flete)<>p_flete then raise exception 'Indica el flete en pesos enteros, sin cantidades negativas';end if;
 if p_flete>0 and (p_metodo is null or p_metodo not in ('efectivo','tarjeta','transferencia','aplazo')) then raise exception 'Indica una forma de pago válida para el flete';end if;
 select * into v from public.ventas where id=p_venta_id for update;
 if not found then raise exception 'Venta no encontrada';end if;
 if lower(trim(v.estado)) in ('cancelada','cancelado') then raise exception 'No se puede modificar una venta cancelada';end if;
 if v.flete is distinct from p_flete_anterior or nullif(v.flete_metodo,'') is distinct from nullif(p_metodo_anterior,'') then raise exception 'El flete cambió en otro dispositivo. Vuelve a consultar la venta';end if;
 v_total:=v.total-v.flete+p_flete;
 select array_agg(distinct coalesce(nullif(trim(metodo_pago),''),v.metodo_pago)) into v_metodos from public.ventas_detalle where venta_id=p_venta_id;
 if coalesce(cardinality(v_metodos),0)=0 then v_metodos:=array[v.metodo_pago];end if;
 if p_flete>0 and not(p_metodo=any(v_metodos)) then v_metodos:=array_append(v_metodos,p_metodo);end if;
 v_metodo:=case when cardinality(v_metodos)>1 then 'mixto' else v_metodos[1] end;
 update public.ventas set flete=p_flete,flete_metodo=case when p_flete>0 then p_metodo else null end,total=v_total,metodo_pago=v_metodo where id=p_venta_id;
 return jsonb_build_object('id',p_venta_id,'flete',p_flete,'total',v_total,'metodo_pago',v_metodo);
end $$;
notify pgrst,'reload schema';
