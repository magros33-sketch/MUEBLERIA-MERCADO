from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
marker = '<!-- compras-multiples-final-20261012 -->'

if marker in s:
    raise SystemExit(0)

patch = r'''<!-- compras-multiples-final-20261012 -->
<script>
(function(){
  const esc=(v)=>typeof escaparHTML==='function'?escaparHTML(String(v??'')):String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const el=(id)=>document.getElementById(id);
  const money=(n)=>'$'+Number(n||0).toFixed(2);
  window.compraItems=Array.isArray(window.compraItems)?window.compraItems:[];
  window.articuloCompraSeleccionado=window.articuloCompraSeleccionado||null;

  function render(){
    const box=el('compraItemsListaFinal'), totalBox=el('compraTotalMultipleFinal');
    if(!box)return;
    if(!window.compraItems.length){box.innerHTML='<div class="ayuda">Todavía no hay modelos añadidos a esta compra.</div>'}
    else box.innerHTML=window.compraItems.map((x,i)=>'<div class="info-articulo"><strong>📦 '+esc(x.nombre)+'</strong><br>Código: '+esc(x.codigo||'Sin código')+'<br>Cantidad: <strong>'+Number(x.cantidad)+'</strong> × '+money(x.costo)+' = <strong>'+money(x.subtotal)+'</strong><button type="button" class="eliminar" data-quitar-compra="'+i+'">🗑️ Quitar modelo</button></div>').join('');
    if(totalBox)totalBox.innerHTML='<strong>Total de esta compra: '+money(window.compraItems.reduce((s,x)=>s+Number(x.subtotal||0),0))+'</strong>';
    box.querySelectorAll('[data-quitar-compra]').forEach(b=>b.onclick=()=>{window.compraItems.splice(Number(b.dataset.quitarCompra),1);render()});
  }

  function asegurarUI(){
    const guardar=document.querySelector('#compras button[onclick="registrarCompra()"]');
    if(!guardar)return;
    let wrap=el('compraItemsFinal');
    if(!wrap){
      wrap=document.createElement('div'); wrap.id='compraItemsFinal'; wrap.className='tarjeta';
      wrap.innerHTML='<h3>🧾 Modelos de esta compra</h3><div class="ayuda">Añade todos los modelos que quieras de este mismo proveedor antes de registrar.</div><div id="compraItemsListaFinal"></div><div id="compraTotalMultipleFinal" class="precio-venta"></div>';
      guardar.parentNode.insertBefore(wrap,guardar);
    }
    let add=el('btnAgregarModeloCompraFinal');
    if(!add){add=document.createElement('button');add.type='button';add.id='btnAgregarModeloCompraFinal';add.textContent='➕ Añadir modelo a la compra';guardar.parentNode.insertBefore(add,guardar)}
    add.onclick=window.agregarArticuloCompra; render();
  }

  window.agregarArticuloCompra=function(){
    const a=window.articuloCompraSeleccionado, msg=el('mensajeCompra');
    if(!a){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Selecciona un modelo antes de añadirlo.</div>';return false}
    const prov=String(el('compraProveedorId')?.value||''), provArt=String(a.proveedor_id||'');
    if(prov&&provArt&&prov!==provArt){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Este modelo pertenece a otro proveedor.</div>';return false}
    const cantidad=Number(el('compraCantidad')?.value||0), costo=Number(el('compraCosto')?.value||0);
    if(!Number.isInteger(cantidad)||cantidad<1){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Indica una cantidad válida.</div>';return false}
    if(!Number.isFinite(costo)||costo<0){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Indica un costo válido.</div>';return false}
    const existente=window.compraItems.find(x=>String(x.articulo_id)===String(a.id));
    if(existente){existente.cantidad+=cantidad;existente.costo=costo;existente.subtotal=existente.cantidad*costo}
    else window.compraItems.push({articulo_id:a.id,nombre:a.nombre||'',codigo:a.codigo||'',cantidad,costo,subtotal:cantidad*costo,proveedor_id:a.proveedor_id||null});
    ['compraCodigo','compraNombre','compraCantidad','compraCosto'].forEach(id=>{if(el(id))el(id).value=''});
    ['resultadoCompra','estadoCodigo','estadoNombre'].forEach(id=>{if(el(id))el(id).innerHTML=''});
    window.articuloCompraSeleccionado=null;
    if(msg)msg.innerHTML='<div class="mensaje-exito">✅ Modelo añadido. Selecciona otro modelo para seguir.</div>';
    render(); return true;
  };

  function envolverSeleccion(){
    const actual=window.seleccionarArticuloCompra;
    if(typeof actual!=='function'||actual.__comprasFinalWrapped)return;
    const wrapped=function(a){window.articuloCompraSeleccionado=a||null;return actual.apply(this,arguments)};
    wrapped.__comprasFinalWrapped=true;window.seleccionarArticuloCompra=wrapped;
  }

  window.registrarCompra=async function(){
    const msg=el('mensajeCompra'), proveedorId=String(el('compraProveedorId')?.value||'').trim();
    if(!proveedorId){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Selecciona un proveedor.</div>';return}
    if(!window.compraItems.length&&window.articuloCompraSeleccionado)window.agregarArticuloCompra();
    if(!window.compraItems.length){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Añade al menos un modelo a la compra.</div>';return}
    if(!window.compraItems.every(x=>!x.proveedor_id||String(x.proveedor_id)===proveedorId)){if(msg)msg.innerHTML='<div class="mensaje-error">❌ Todos los modelos deben ser del mismo proveedor.</div>';return}
    const total=window.compraItems.reduce((s,x)=>s+Number(x.subtotal||0),0), forma=String(el('compraFormaPago')?.value||'contado').toLowerCase(), plazo=Number(el('compraPlazoDias')?.value||30);
    try{
      const rc=await fetch(SUPABASE_URL+'/rest/v1/compras',{method:'POST',headers:{...headersSupabase,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({proveedor_id:proveedorId,id_proveedor:proveedorId,fecha:new Date().toISOString(),total,estado:'completada',metodo_pago:forma,pagado:forma==='contado'?total:0,saldo:forma==='contado'?0:total,notas:forma==='credito'?'Crédito a '+plazo+' días':'Compra de contado'})});
      if(!rc.ok)throw new Error('No se pudo registrar la compra: '+await rc.text());
      const filas=await rc.json(), compra=Array.isArray(filas)?filas[0]:filas;
      const detalles=window.compraItems.map(x=>({id:crypto.randomUUID(),compra_id:compra.id,articulo_id:x.articulo_id,cantidad:x.cantidad,costo_unitario:x.costo,subtotal:x.subtotal}));
      const rd=await fetch(SUPABASE_URL+'/rest/v1/compra_detalles',{method:'POST',headers:{...headersSupabase,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(detalles)});
      if(!rd.ok)throw new Error('No se pudieron guardar los modelos de la compra: '+await rd.text());
      for(const x of window.compraItems){
        const art=(Array.isArray(articulos)?articulos:[]).find(a=>String(a.id)===String(x.articulo_id));
        if(!art)throw new Error('No se encontró el artículo '+x.nombre);
        const ra=await fetch(SUPABASE_URL+'/rest/v1/articulos?id=eq.'+encodeURIComponent(x.articulo_id),{method:'PATCH',headers:{...headersSupabase,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({stock:Number(art.stock||0)+Number(x.cantidad||0),costo:x.costo})});
        if(!ra.ok)throw new Error('No se pudo actualizar el stock de '+x.nombre+': '+await ra.text());
      }
      const n=window.compraItems.length; window.compraItems=[];window.articuloCompraSeleccionado=null;render();
      if(msg)msg.innerHTML='<div class="mensaje-exito">✅ Compra registrada con '+n+' modelo(s). Total: '+money(total)+'</div>';
      if(typeof cargarArticulos==='function')await cargarArticulos();
      if(typeof cargarHistorialCompras==='function')await cargarHistorialCompras();
      if(typeof cargarDeudasProveedores==='function')await cargarDeudasProveedores();
    }catch(e){console.error(e);if(msg)msg.innerHTML='<div class="mensaje-error">❌ '+esc(e.message||String(e))+'</div>'}
  };

  function iniciar(){envolverSeleccion();asegurarUI()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(iniciar,50));else setTimeout(iniciar,50);
  setTimeout(iniciar,500);setTimeout(iniciar,1500);
})();
</script>
'''

s = s.replace('</body>', patch + '</body>', 1)
p.write_text(s, encoding='utf-8')
