const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('async function cargarResumenVentasDia()');
const end=html.indexOf('function mostrarHistorialSegunFecha()',start);
assert.ok(start>=0&&end>start);
async function resumen(venta,detalles=[],pagos=[],gastos=[]){
 const salida={innerHTML:''};
 const tablas={ventas:[{id:'v',fecha:'2026-10-23T18:00:00Z',estado:'completada',...venta}],ventas_detalle:detalles.map(d=>({venta_id:'v',...d})),apartado_pagos:pagos,apartados:[],gastos};
 const antes=JSON.stringify(tablas);
 const c={Intl,Date,console,SUPABASE_URL:'https://mock.invalid',headersSupabase:{},escaparHTML:String,
 document:{getElementById:id=>id==='resumenVentasDia'?salida:id==='fechaResumenVentas'?{value:'2026-10-23'}:null},
 fetch:async(url,opciones)=>{assert.ok(!opciones.method||opciones.method==='GET');return {ok:true,json:async()=>tablas[new URL(url).pathname.split('/').pop()]};}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);await c.cargarResumenVentasDia();
 assert.equal(JSON.stringify(tablas),antes,'No altera registros');
 function importe(etiqueta){const filas=[...salida.innerHTML.matchAll(/<strong>(.*?)<\/strong><div class="precio-venta">(-?)\$(\d+)<\/div>/g)];const fila=filas.find(x=>x[1].includes(etiqueta));assert.ok(fila,'Fila visible: '+etiqueta);return Number(fila[2]+fila[3]);}
 const metodos=['Contado','Tarjeta','Transferencia','Aplazo','Otros'];
 const total=metodos.reduce((s,k)=>s+importe(k),0);
 assert.equal(total+importe('Gastos del día'),importe('Neto del día'),'El desglose visible cuadra con el neto');
 return importe;
}
(async()=>{
 let valor=await resumen({total:2150,flete:150,flete_metodo:'tarjeta',metodo_pago:'mixto'});
 assert.equal(valor('Tarjeta'),150);assert.equal(valor('Otros'),2000);assert.equal(valor('Neto'),2150);
 console.log('PASS Venta histórica: muestra mercancía desconocida en Otros y flete en tarjeta');
 valor=await resumen({total:2150,flete:150,flete_metodo:'tarjeta',metodo_pago:'mixto'},[{subtotal:2000,metodo_pago:'efectivo'}],[{apartado_id:'a',fecha:'2026-10-23T18:00:00Z',importe:500,metodo_pago:'efectivo'}],[{fecha:'2026-10-23T18:00:00Z',importe:50}]);
 assert.equal(valor('Contado'),2500);assert.equal(valor('Tarjeta'),150);assert.equal(valor('Otros'),0);assert.equal(valor('Neto'),2600);
 console.log('PASS Métodos conocidos: conserva flete, anticipo único, gastos y neto');
 valor=await resumen({total:2150,flete:150,flete_metodo:'tarjeta',metodo_pago:'mixto',estado:'cancelada'});
 assert.equal(valor('Otros'),0);assert.equal(valor('Tarjeta'),0);assert.equal(valor('Neto'),0);
 console.log('PASS Venta cancelada: excluye mercancía y flete del resumen');
})().catch(e=>{console.error(e);process.exitCode=1});
