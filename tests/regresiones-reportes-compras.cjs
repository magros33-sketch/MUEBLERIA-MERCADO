const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=require('path').resolve(__dirname,'..');
const html=fs.readFileSync(root+'/index.html','utf8');
const report=fs.readFileSync(root+'/reportes-apartados.js','utf8');
const purchase=html.slice(html.indexOf('<!-- compras-multiples-final-20261012 -->')).match(/<script>([\s\S]*?)<\/script>/)[1];
const filter=html.slice(html.indexOf('window.filtrarReporteVentas=function'),html.indexOf('window.cargarReporteVentasDiarias=async',html.indexOf('window.filtrarReporteVentas=function')));
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name)}
function context(fields,fetch){const c={console:{error(){},warn(){}},document:{readyState:'loading',getElementById:id=>fields[id]||null,addEventListener(){}},setTimeout(){},localStorage:{getItem(){return null},setItem(){},removeItem(){}},fetch,SUPABASE_URL:'https://mock.invalid',headersSupabase:{},crypto:{randomUUID:()=> 'detail'},Intl,Date,URLSearchParams,articulos:[{id:'a',stock:5}]};c.window=c;return vm.createContext(c)}
async function buy(anticipo,forma='credito',fail=''){
 const fields={compraProveedorId:{value:'p'},compraFormaPago:{value:forma},compraPlazoDias:{value:'15'},compraAnticipo:{value:String(anticipo)},mensajeCompra:{innerHTML:''}};
 const requests=[];const c=context(fields,async(url,o)=>{requests.push({url,method:o.method,body:JSON.parse(o.body)});if(fail==='network'&&url.endsWith('/pagos_proveedores'))throw Error('network');return {ok:!(fail==='payment'&&url.endsWith('/pagos_proveedores'))&&!(fail==='balance'&&url.includes('/compras?id=')),json:async()=>[{id:'c'}],text:async()=> 'mock failure'}});
 c.compraItems=[{articulo_id:'a',cantidad:2,costo:500,subtotal:1000,proveedor_id:'p'}];vm.runInContext(purchase,c);await c.registrarCompra();return {c,fields,requests};
}
(async()=>{
await test('Sintaxis de todos los scripts internos y del reporte',()=>{for(const x of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(x[1]))new vm.Script(x[2]);new vm.Script(report)});
await test('Compra 1000 con anticipo 300: pago único, saldo 700 y stock +2',async()=>{const r=await buy(300);assert.equal(r.requests.filter(x=>x.url.endsWith('/pagos_proveedores')).length,1);assert.equal(r.requests.at(-1).body.pagado,300);assert.equal(r.requests.at(-1).body.saldo,700);assert.equal(r.requests.find(x=>x.url.includes('/articulos?')).body.stock,7);assert.equal(r.c.compraItems.length,0);assert.equal(r.fields.compraAnticipo.value,'0')});
await test('Anticipo completo: crédito pagado, saldo cero',async()=>{const r=await buy(1000);assert.equal(r.requests.at(-1).body.metodo_pago,'credito_pagado');assert.equal(r.requests.at(-1).body.saldo,0)});
await test('Crédito sin anticipo: conserva saldo y no crea pago',async()=>{const r=await buy(0);assert.equal(r.requests[0].body.saldo,1000);assert.equal(r.requests.length,3)});
await test('Contado: totalmente pagado sin duplicar anticipo',async()=>{const r=await buy(300,'contado');assert.equal(r.requests[0].body.pagado,1000);assert.equal(r.requests[0].body.saldo,0);assert.equal(r.requests.length,3)});
for(const value of [-1,1001,'abc'])await test('Anticipo inválido '+value+': cero escrituras',async()=>{const r=await buy(value);assert.equal(r.requests.length,0);assert.equal(r.c.compraItems.length,1)});
for(const fail of ['payment','balance','network'])await test('Fallo '+fail+': conserva aviso y evita repetir nota guardada',async()=>{const r=await buy(300,'credito',fail);assert.equal(r.c.compraItems.length,0);assert.match(r.fields.mensajeCompra.innerHTML,/No repitas/);const n=r.requests.length;await r.c.registrarCompra();assert.equal(r.requests.length,n)});
await test('Calendario día/semana/mes incluye abonos y admite fecha válida',async()=>{
 const fields={reporteVentasDiarias:{innerHTML:'',textContent:''},fechaConsultaReportes:{value:'2026-10-16'}};
 const data={ventas:[{fecha:'2026-10-16T16:00:00Z',total:1000,estado:'completada'},{fecha:'2026-10-16T16:00:00Z',total:900,estado:'cancelada'}],gastos:[{fecha:'2026-10-16T17:00:00Z',importe:100}],apartado_pagos:[{apartado_id:'ok',fecha:'2026-10-16T16:00:00Z',importe:300},{apartado_id:'cancel',fecha:'2026-10-16T16:00:00Z',importe:500}],apartados:[{id:'ok',estado:'pendiente'},{id:'cancel',estado:'cancelado'}]};
 const c=context(fields,async url=>({ok:true,json:async()=>data[new URL(url).pathname.split('/').at(-1)]}));vm.runInContext(filter,c);vm.runInContext(report,c);await c.cargarReporteVentasDiarias();assert.equal(c.__reporteDiarioDatos['2026-10-16'].pagosApartados,300);
 for(const period of ['dia','semana','mes']){c.filtrarReporteVentas(period);assert.match(fields.reporteVentasDiarias.innerHTML,/\$1300/);assert.match(fields.reporteVentasDiarias.innerHTML,/\$1200/);assert.equal(fields.reporteVentasDiarias.textContent,'')}
 fields.fechaConsultaReportes.value='invalid';c.filtrarReporteVentas('dia');assert.match(fields.reporteVentasDiarias.textContent,/fecha válida/);
});
await test('La página carga el reporte una sola vez antes de navegación',()=>{assert.equal((html.match(/<script src="\.\/reportes-apartados\.js"><\/script>/g)||[]).length,1);assert.ok(html.indexOf('<script src="./reportes-apartados.js"')<html.indexOf('<script src="./navegacion-atras.js"'))});
console.log(count+' comprobaciones correctas. Sin red ni datos reales.');
})().catch(e=>{console.error(e);process.exitCode=1});
