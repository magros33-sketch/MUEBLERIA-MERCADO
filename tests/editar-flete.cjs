const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('path').join(__dirname,'../editar-flete.js'),'utf8');
async function run(respuestas,{confirmar=true,estado='completada',fallar=false}={}){
 const requests=[],avisos=[],eventos=[];let refrescos=0;
 const venta={id:'v',total:2000,flete:0,flete_metodo:null,estado};
 const c={SUPABASE_URL:'https://mock.invalid',headersSupabase:{},prompt:()=>respuestas.shift(),confirm:()=>confirmar,alert:s=>avisos.push(s),CustomEvent:function(type,{detail}){this.type=type;this.detail=detail},dispatchEvent:e=>eventos.push(e),cargarHistorialVentas:async()=>{refrescos++},cargarResumenVentasDia:async()=>{refrescos++},fetch:async(url,o={})=>{requests.push({url,...o});return o.method==='POST'?{ok:!fallar,json:async()=>fallar?{message:'El flete cambió en otro dispositivo'}:{id:'v',total:2150,flete:150,metodo_pago:'mixto'}}:{ok:true,json:async()=>[venta]}}};
 c.window=c;vm.createContext(c);vm.runInContext(code,c);await c.editarFleteVenta('v');return {requests,avisos,eventos,refrescos};
}
(async()=>{
 const r=await run(['150','1']);const post=r.requests.find(x=>x.method==='POST');assert.deepEqual(JSON.parse(post.body),{p_venta_id:'v',p_flete:150,p_metodo:'efectivo',p_flete_anterior:0,p_metodo_anterior:null});assert.equal(r.requests.length,2);assert.equal(r.refrescos,2);assert.equal(r.eventos[0].detail.total,2150);
 for(const respuestas of [[null],['150',null],['-1'],['1.5'],[''],['150','5']]){const r=await run(respuestas);assert.equal(r.requests.length,1);assert.equal(r.refrescos,0)}
 for(const opciones of [{confirmar:false},{estado:'cancelada'}]){const r=await run(['150','1'],opciones);assert.equal(r.requests.length,1)}
 const fallo=await run(['150','1'],{fallar:true});assert.equal(fallo.eventos.length,0);assert.match(fallo.avisos[0],/otro dispositivo/);
 console.log('PASS Edición de flete: total y pago, cancelación sin escrituras, importes inválidos, venta cancelada y concurrencia. Sin red.');
})().catch(e=>{console.error(e);process.exitCode=1});
