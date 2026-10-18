const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const code=html.match(/<script id="ventas-multiples">([\s\S]*?)<\/script>/)[1];
function setup(flete,metodo='efectivo'){
 const fields={ventaFlete:{value:String(flete)},ventaFleteMetodo:{value:metodo},totalVenta:{innerHTML:''},mensajeVenta:{innerHTML:''}};
 let writes=0;
 const c={document:{readyState:'loading',addEventListener(){},getElementById:id=>fields[id]},localStorage:{getItem(){return null}},Intl,Date,console,fetch(){writes++;throw Error('No se permiten escrituras')}};
 c.window=c;vm.createContext(c);
 vm.runInContext(code.replace('let ventaItems=[];','let ventaItems=[{subtotal:2000}];'),c);
 return {c,fields,get writes(){return writes}};
}
(async()=>{
 for(const [flete,total] of [[0,'$2,000'],[150,'$2,150']]){
  const r=setup(flete);r.c.actualizarTotalVenta();assert.equal(r.fields.totalVenta.innerHTML,total);
 }
 for(const value of [-1,1.5,'abc']){
  const r=setup(value);await r.c.registrarVenta();assert.match(r.fields.mensajeVenta.innerHTML,/pesos completos/);assert.equal(r.writes,0);assert.equal(r.c.__ventaRegistroEnCurso,false);
 }
 const r=setup(150,'');await r.c.registrarVenta();assert.match(r.fields.mensajeVenta.innerHTML,/forma de pago del flete/);assert.equal(r.writes,0);
 console.log('PASS Flete cero, total con flete, negativos, centavos, valor inválido y pago obligatorio. Sin red.');
})().catch(e=>{console.error(e);process.exitCode=1});
