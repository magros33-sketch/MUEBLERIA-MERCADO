/* Corrección puntual: Reportes > Venta del día incluye pagos recibidos de apartados. */
(function(){
  function normalizar(v){
    return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  }

  function diaComercial(fecha){
    const d=new Date(fecha);
    if(Number.isNaN(d.getTime()))return "";
    const partes=new Intl.DateTimeFormat("en-CA",{
      timeZone:"America/Mexico_City",
      year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hour12:false
    }).formatToParts(d);
    const vals={};
    partes.forEach(function(p){vals[p.type]=p.value;});
    const base=vals.year+"-"+vals.month+"-"+vals.day;
    let clave=base;
    if(Number(vals.hour)>=20){
      const utcBase=new Date(base+"T12:00:00Z");
      utcBase.setUTCDate(utcBase.getUTCDate()+1);
      clave=utcBase.toISOString().slice(0,10);
    }
    return clave;
  }

  function dinero(n){return "$"+Number(n||0).toFixed(2);}

  window.cargarReporteVentasDiarias=async function(){
    const box=document.getElementById("reporteVentasDiarias");
    if(!box)return;
    box.innerHTML="🔄 Cargando ventas por día...";
    try{
      const [rv,rg,rp,ra]=await Promise.all([
        fetch(SUPABASE_URL+"/rest/v1/ventas?select=*&limit=5000",{headers:headersSupabase,cache:"no-store"}),
        fetch(SUPABASE_URL+"/rest/v1/gastos?select=*&limit=5000",{headers:headersSupabase,cache:"no-store"}),
        fetch(SUPABASE_URL+"/rest/v1/apartado_pagos?select=*&limit=10000",{headers:headersSupabase,cache:"no-store"}),
        fetch(SUPABASE_URL+"/rest/v1/apartados?select=id,estado&limit=10000",{headers:headersSupabase,cache:"no-store"})
      ]);
      if(!rv.ok)throw new Error("Ventas: "+await rv.text());
      if(!rg.ok)throw new Error("Gastos: "+await rg.text());
      if(!rp.ok)throw new Error("Pagos de apartados: "+await rp.text());
      if(!ra.ok)throw new Error("Apartados: "+await ra.text());

      const ventas=await rv.json();
      const gastos=await rg.json();
      const pagosApartados=await rp.json();
      const apartados=await ra.json();
      const apartadosCancelados=new Set(
        apartados
          .filter(function(a){return ["cancelada","cancelado"].includes(normalizar(a.estado));})
          .map(function(a){return a.id;})
      );
      const mapa={};

      ventas.forEach(function(v){
        if(["cancelada","cancelado"].includes(normalizar(v.estado)))return;
        const dia=diaComercial(v.fecha);
        if(!dia)return;
        if(!mapa[dia])mapa[dia]={ventas:0,cantidad:0,pagosApartados:0,gastos:0,cantidadPagosApartados:0};
        mapa[dia].ventas+=Number(v.total||0);
        mapa[dia].cantidad++;
      });

      pagosApartados.forEach(function(p){
        /* Un pago de un apartado cancelado no cuenta como dinero recibido. */
        if(apartadosCancelados.has(p.apartado_id))return;
        const dia=diaComercial(p.fecha);
        if(!dia)return;
        if(!mapa[dia])mapa[dia]={ventas:0,cantidad:0,pagosApartados:0,gastos:0,cantidadPagosApartados:0};
        mapa[dia].pagosApartados+=Number(p.importe||0);
        mapa[dia].cantidadPagosApartados++;
      });

      gastos.forEach(function(g){
        const dia=diaComercial(g.fecha);
        if(!dia)return;
        if(!mapa[dia])mapa[dia]={ventas:0,cantidad:0,pagosApartados:0,gastos:0,cantidadPagosApartados:0};
        mapa[dia].gastos+=Number(g.importe||0);
      });

      // Un único mapa alimenta el calendario y el resumen, también bajo el service worker.
      window.__reporteDiarioDatos=mapa;
      const fechaConsulta=document.getElementById("fechaConsultaReportes");
      if(fechaConsulta&&typeof window.filtrarReporteVentas==="function"){
        if(!fechaConsulta.value)fechaConsulta.value=new Intl.DateTimeFormat("en-CA",{
          timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"
        }).format(new Date());
        window.filtrarReporteVentas("dia");
        return;
      }
      const dias=Object.keys(mapa).sort().reverse();
      if(!dias.length){
        box.innerHTML='<div class="tarjeta">Todavía no hay operaciones para mostrar.</div>';
        return;
      }

      box.innerHTML=dias.map(function(dia){
        const x=mapa[dia];
        const recibido=x.ventas+x.pagosApartados;
        const neto=recibido-x.gastos;
        return '<div class="historial">'+
          '<div class="fecha-operacion">📅 '+dia+'</div>'+
          '<div class="dato">Operaciones de venta: <strong>'+x.cantidad+'</strong></div>'+
          '<div class="dato">Ventas: <strong>'+dinero(x.ventas)+'</strong></div>'+
          '<div class="dato">💵 Dinero recibido por apartados: <strong>'+dinero(x.pagosApartados)+'</strong></div>'+
          '<div class="dato">💰 Total de dinero recibido: <strong>'+dinero(recibido)+'</strong></div>'+
          '<div class="dato">Gastos: <strong>-'+dinero(x.gastos)+'</strong></div>'+
          '<div class="dato">Neto después de gastos: <strong>'+dinero(neto)+'</strong></div>'+
          '<div class="ayuda">Día comercial: de 20:00 a 19:59 hora de México. Los apartados cuentan por el dinero efectivamente recibido en cada pago, no por el valor total del mueble.</div>'+
        '</div>';
      }).join("");
    }catch(e){
      console.error("Error reporte ventas diarias:",e);
      box.innerHTML='<div class="mensaje-error">❌ No se pudo cargar el reporte.<br><br>'+escaparHTML(e.message||String(e))+'</div>';
    }
  };
})();
