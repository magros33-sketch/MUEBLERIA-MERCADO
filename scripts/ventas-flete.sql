alter table public.ventas add column if not exists flete numeric not null default 0 check(flete>=0 and trunc(flete)=flete);
alter table public.ventas add column if not exists flete_metodo text;
create or replace function public.registrar_venta_con_flete(p_venta_id uuid,p_cliente_id uuid,p_fecha timestamptz,p_tipo_cliente text,p_items jsonb,p_notas text,p_flete numeric,p_flete_metodo text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_resultado jsonb; v_metodo text;
begin
 if p_flete is null or p_flete<0 or trunc(p_flete)<>p_flete then raise exception 'Flete inválido: indica pesos enteros'; end if;
 if p_flete>0 and (p_flete_metodo is null or p_flete_metodo not in ('efectivo','tarjeta','transferencia','aplazo')) then raise exception 'Indica la forma de pago del flete'; end if;
 v_resultado:=public.registrar_venta_atomica(p_venta_id,p_cliente_id,p_fecha,p_tipo_cliente,p_items,p_notas);
 v_metodo:=v_resultado->>'metodo_pago';
 if p_flete>0 and v_metodo is distinct from p_flete_metodo then v_metodo:='mixto'; end if;
 update public.ventas set flete=p_flete,flete_metodo=case when p_flete>0 then p_flete_metodo else null end,total=total+p_flete,metodo_pago=v_metodo where id=p_venta_id;
 return v_resultado||jsonb_build_object('total',(v_resultado->>'total')::numeric+p_flete,'flete',p_flete,'metodo_pago',v_metodo);
end $$;
CREATE OR REPLACE FUNCTION public.editar_linea_ticket_segura(p_venta_id uuid, p_detalle_id uuid, p_cantidad integer, p_precio numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_estado text; v_articulo uuid; v_anterior integer; v_stock integer; v_total numeric; v_actual integer; v_notas text; v_desglose text; v_metodo text; v_metodo_original text;
begin
 if p_cantidad is null or p_cantidad<0 or p_precio is null or p_precio<0 or trunc(p_precio)<>p_precio then raise exception 'Cantidad o precio no válido: solo pesos enteros'; end if;
 select estado,notas,metodo_pago into v_estado,v_notas,v_metodo_original from public.ventas where id=p_venta_id for update;
 if not found then raise exception 'Venta no encontrada'; end if;
 if lower(trim(v_estado)) in ('cancelada','cancelado') then raise exception 'Venta cancelada'; end if;
 select articulo_id,cantidad into v_articulo,v_anterior from public.ventas_detalle where id=p_detalle_id and venta_id=p_venta_id for update;
 if not found then raise exception 'Artículo no encontrado en este ticket'; end if;
 if p_cantidad=0 and (select count(*) from public.ventas_detalle where venta_id=p_venta_id and cantidad>0)<=1 then raise exception 'Para quitar el último artículo cancela la venta'; end if;
 select stock into v_stock from public.articulos where id=v_articulo for update;
 if not found then raise exception 'Artículo no encontrado en inventario'; end if;
 v_actual:=v_stock+v_anterior-p_cantidad;
 if v_actual<0 then raise exception 'Stock insuficiente'; end if;
 update public.articulos set stock=v_actual where id=v_articulo;
 if p_cantidad=0 then delete from public.ventas_detalle where id=p_detalle_id and venta_id=p_venta_id;
 else update public.ventas_detalle set cantidad=p_cantidad,precio_unitario=p_precio,subtotal=p_cantidad*p_precio where id=p_detalle_id and venta_id=p_venta_id; end if;
 select coalesce(sum(subtotal),0)+(select flete from public.ventas where id=p_venta_id) into v_total from public.ventas_detalle where venta_id=p_venta_id;
 select case when count(distinct coalesce(nullif(trim(metodo_pago),''),nullif(trim(v_metodo_original),''),'sin especificar'))>1 then 'mixto' else min(coalesce(nullif(trim(metodo_pago),''),nullif(trim(v_metodo_original),''),'sin especificar')) end
 into v_metodo from public.ventas_detalle where venta_id=p_venta_id;
 if (select flete>0 from public.ventas where id=p_venta_id) then
   if v_metodo is distinct from (select flete_metodo from public.ventas where id=p_venta_id) then v_metodo:='mixto'; end if;
 end if;
 if position('Pago por artículo:' in coalesce(v_notas,''))>0 then
  select string_agg(coalesce(a.nombre,'Artículo')||' — $'||trim(to_char(d.subtotal,'FM999999999999990'))||' ('||coalesce(nullif(trim(d.metodo_pago),''),nullif(trim(v_metodo_original),''),'sin especificar')||')','; ' order by d.id)
  into v_desglose from public.ventas_detalle d left join public.articulos a on a.id=d.articulo_id where d.venta_id=p_venta_id;
  v_notas:=split_part(v_notas,'Pago por artículo:',1)||'Pago por artículo: '||coalesce(v_desglose,'');
 end if;
 update public.ventas set total=v_total,metodo_pago=v_metodo,notas=v_notas where id=p_venta_id;
 return jsonb_build_object('total',v_total,'stock',v_actual,'cantidad',p_cantidad,'metodo_pago',v_metodo);
end $function$
;
notify pgrst,'reload schema';
