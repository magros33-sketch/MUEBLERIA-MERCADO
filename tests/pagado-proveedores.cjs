const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('const pagosProveedorEnCurso=new Set();'),html.indexOf('\n\n\n</script>',html.indexOf('const pagosProveedorEnCurso=new Set();')));
function setup({answers=['transferencia','2026-10-20'],confirmed=true,compra={},fail='',delay=false}={}){
 const writes=[],alerts=[],prompts=[],refresh=[];let release;
 const c={SUPABASE_URL:'https://mock.invalid',headersSupabase:{},fechaMexicoHoy:()=> '2026-10-26',prompt:(q)=>{prompts.push(q);return answers.shift()},confirm:()=>confirmed,alert:m=>alerts.push(m),cargarHistorialCompras:async()=>refresh.push('historial'),cargarDeudasProveedores:async()=>refresh.push('deudas'),fetch:async(url,o={})=>{
 if(!o.method){if(delay)await new Promise(r=>release=r);return {ok:true,json:async()=>[{id:'nota',proveedor_id:'valmar',total:1000,pagado:300,saldo:700,estado:'completada',...compra}]};}
 writes.push({url,method:o.method,body:JSON.parse(o.body)});return {ok:o.method!==fail,text:async()=> 'simulated failure'};
 }};vm.createContext(c);vm.runInContext(code,c);return {c,writes,alerts,prompts,refresh,release:()=>release()};
}
let n=0;async function test(name,f){await f();n++;console.log('PASS '+name)}
(async()=>{
 await test('Sintaxis de todos los scripts internos',()=>{for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(s[1]))new vm.Script(s[2]);});
 await test('Liquidación usa saldo restante, conserva anticipo, fecha y método; refresca vistas',async()=>{const r=setup();await r.c.registrarPagoProveedor('nota',true);assert.equal(r.writes.length,2);assert.equal(r.writes[0].body.importe,700);assert.equal(r.writes[0].body.fecha,'2026-10-20T12:00:00-06:00');assert.equal(r.writes[0].body.metodo_pago,'transferencia');assert.equal(r.writes[1].body.pagado,1000);assert.equal(r.writes[1].body.saldo,0);assert.equal(r.writes[1].body.metodo_pago,'credito_pagado');assert.equal(r.prompts.length,2);assert.deepEqual(r.refresh,['historial','deudas']);});
 await test('Saldo histórico con centavos se liquida exactamente',async()=>{const r=setup({compra:{total:32365.44,pagado:0,saldo:32365.44}});await r.c.registrarPagoProveedor('nota',true);assert.equal(r.writes[0].body.importe,32365.44);assert.equal(r.writes[1].body.saldo,0);});
 for(const [name,args] of [ ['cancelar método',{answers:[null]}],['método vacío',{answers:['']}],['método inválido',{answers:['bitcoin']}],['cancelar fecha',{answers:['efectivo',null]}],['fecha imposible',{answers:['efectivo','2026-02-30']}],['fecha inválida',{answers:['efectivo','hoy']}],['cancelar confirmación',{confirmed:false}],['nota pagada',{compra:{saldo:0}}],['nota cancelada',{compra:{estado:'cancelada'}}] ])await test(name+': cero escrituras',async()=>{const r=setup(args);await r.c.registrarPagoProveedor('nota',true);assert.equal(r.writes.length,0);});
 await test('Abono parcial mantiene saldo y no exige fecha de liquidación',async()=>{const r=setup({answers:['200','efectivo']});await r.c.registrarPagoProveedor('nota');assert.equal(r.writes[0].body.importe,200);assert.equal(r.writes[1].body.saldo,500);assert.equal(r.writes[1].body.pagado,500);assert.equal(r.writes[1].body.metodo_pago,'credito');});
 await test('Cancelar importe no registra nada',async()=>{const r=setup({answers:[null]});await r.c.registrarPagoProveedor('nota');assert.equal(r.writes.length,0);});
 await test('Importe superior al saldo no registra nada',async()=>{const r=setup({answers:['701']});await r.c.registrarPagoProveedor('nota');assert.equal(r.writes.length,0);});
 await test('Doble pulsación durante lectura crea un solo pago',async()=>{const r=setup({delay:true});const first=r.c.registrarPagoProveedor('nota',true);await r.c.registrarPagoProveedor('nota',true);r.release();await first;assert.equal(r.writes.length,2);});
 await test('Fallo al crear pago no cambia saldo',async()=>{const r=setup({fail:'POST'});await r.c.registrarPagoProveedor('nota',true);assert.equal(r.writes.length,1);assert.equal(r.refresh.length,0);});
 await test('Fallo al actualizar deuda advierte que el pago ya existe',async()=>{const r=setup({fail:'PATCH'});await r.c.registrarPagoProveedor('nota',true);assert.match(r.alerts[0],/No repitas el pago/);});
 console.log(n+' comprobaciones correctas; sin red ni registros reales.');
})().catch(e=>{console.error(e);process.exitCode=1});
