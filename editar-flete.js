(function(){
  const enCurso=new Set();
  const pesos=n=>'$'+Number(n||0).toLocaleString('es-MX',{maximumFractionDigits:0});
  window.editarFleteVenta=async function(id){
    if(enCurso.has(id))return;
    enCurso.add(id);
    let guardado=false;
    try{
      const r=await fetch(SUPABASE_URL+'/rest/v1/ventas?select=id,total,flete,flete_metodo,estado&id=eq.'+encodeURIComponent(id),{headers:headersSupabase,cache:'no-store'});
      if(!r.ok)throw Error('No se pudo consultar la venta.');
      const venta=(await r.json())[0];
      if(!venta)throw Error('No se encontró la venta.');
      if(['cancelada','cancelado'].includes(String(venta.estado||'').trim().toLowerCase()))throw Error('No se puede modificar una venta cancelada.');
      const texto=prompt('Importe TOTAL del flete de esta venta, en pesos completos.\nEscribe 0 si no se cobra.\n\nFlete actual: '+pesos(venta.flete),String(venta.flete||0));
      if(texto===null)return;
      const importe=Number(texto);
      if(!texto.trim()||!Number.isSafeInteger(importe)||importe<0)throw Error('Indica un importe válido, sin centavos ni cantidades negativas.');
      let metodo='';
      if(importe>0){
        const metodos=['efectivo','tarjeta','transferencia','aplazo'];
        const pago=prompt('Forma de pago del flete:\n1. Efectivo\n2. Tarjeta\n3. Transferencia\n4. Aplazo',String(Math.max(0,metodos.indexOf(venta.flete_metodo))+1));
        if(pago===null)return;
        if(!/^[1-4]$/.test(pago.trim()))throw Error('Selecciona una forma de pago del 1 al 4.');
        metodo=metodos[Number(pago.trim())-1];
      }
      if(importe===Number(venta.flete||0)&&metodo===String(venta.flete_metodo||'')){alert('No hay cambios que guardar.');return;}
      const nuevoTotal=Number(venta.total||0)-Number(venta.flete||0)+importe;
      if(!confirm('¿Guardar el flete en esta venta?\n\nFlete anterior: '+pesos(venta.flete)+'\nFlete nuevo: '+pesos(importe)+(importe>0?' ('+metodo+')':'')+'\nTotal de la venta: '+pesos(nuevoTotal)+'\n\nSe conserva la fecha original de la venta y el día sigue cerrado.'))return;
      const respuesta=await fetch(SUPABASE_URL+'/rest/v1/rpc/editar_flete_venta_segura',{
        method:'POST',headers:headersSupabase,
        body:JSON.stringify({p_venta_id:id,p_flete:importe,p_metodo:metodo,p_flete_anterior:Number(venta.flete||0),p_metodo_anterior:venta.flete_metodo||null})
      });
      if(!respuesta.ok){let detalle;try{detalle=await respuesta.json()}catch(_){}throw Error(detalle?.message||'No se pudo confirmar el cambio. Consulta la venta antes de intentarlo de nuevo.');}
      const resultado=await respuesta.json();
      guardado=true;
      window.dispatchEvent(new CustomEvent('venta-flete-actualizado',{detail:{id,total:resultado.total,metodoPago:resultado.metodo_pago}}));
      alert('✅ Flete guardado: '+pesos(resultado.flete)+'\nTotal de la venta: '+pesos(resultado.total));
      await cargarHistorialVentas();
      await cargarResumenVentasDia();
    }catch(e){
      alert(guardado?'El flete SÍ quedó guardado. Vuelve a abrir Ventas para actualizar los importes.':'❌ '+String(e.message||e));
    }finally{enCurso.delete(id);}
  };
})();
