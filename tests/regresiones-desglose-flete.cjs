const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const a=html.indexOf('function desglosePagoVenta('),b=html.indexOf('const desglosesVentas=',a);
assert.ok(a>=0&&b>a);
const c={};vm.createContext(c);vm.runInContext(html.slice(a,b),c);
const cases=[
 ['histórica mixta sin método original',{total:2150,flete:150,flete_metodo:'tarjeta',metodo_pago:'mixto'},[],{efectivo:0,tarjeta:150,otros:2000}],
 ['histórica con método conocido',{total:2150,flete:150,flete_metodo:'tarjeta',metodo_pago:'efectivo'},[],{efectivo:2000,tarjeta:150,otros:0}],
 ['método por artículo',{total:2150,flete:150,flete_metodo:'tarjeta',metodo_pago:'mixto'},[{subtotal:2000,metodo_pago:'efectivo'}],{efectivo:2000,tarjeta:150,otros:0}],
 ['pago mixto por líneas',{total:2150,flete:150,flete_metodo:'transferencia',metodo_pago:'mixto'},[{subtotal:1200,metodo_pago:'efectivo'},{subtotal:800,metodo_pago:'tarjeta'}],{efectivo:1200,tarjeta:800,transferencia:150,otros:0}],
 ['flete con mismo método',{total:2150,flete:150,flete_metodo:'efectivo',metodo_pago:'efectivo'},[],{efectivo:2150,otros:0}],
 ['sin flete conserva ventas antiguas',{total:2000,metodo_pago:'efectivo'},[],{efectivo:2000,otros:0}],
 ['flete cero método desconocido',{total:2000,flete:0,metodo_pago:'mixto'},[],{otros:2000}],
 ['flete sin método registrado',{total:2150,flete:150,metodo_pago:'efectivo'},[{subtotal:2000,metodo_pago:'efectivo'}],{efectivo:2000,otros:150}],
 ['normalizar métodos',{total:2150,flete:150,flete_metodo:' TARJETA ',metodo_pago:' EFECTIVO '},[],{efectivo:2000,tarjeta:150,otros:0}],
 ['aplazo y transferencia',{total:2150,flete:150,flete_metodo:'transferencia',metodo_pago:'aplazo'},[],{aplazo:2000,transferencia:150,otros:0}]
];
for(const [name,v,lines,expected] of cases){const original=JSON.stringify({v,lines});const d=c.desglosePagoVenta(v,lines);for(const [k,n] of Object.entries(expected))assert.equal(d[k],n,name+' '+k);assert.equal(Object.values(d).reduce((s,x)=>s+x,0),v.total,name+' total');assert.equal(JSON.stringify({v,lines}),original);console.log('PASS '+name)}
console.log(cases.length+' casos: total conservado, sin modificar ventas, stock ni pagos.');
