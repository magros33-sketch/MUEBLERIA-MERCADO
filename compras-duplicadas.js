(function () {
  'use strict';
  const registrar = window.registrarCompra;
  if (typeof registrar !== 'function' || window.__avisoCompraRepetida) return;
  window.__avisoCompraRepetida = true;
  let comprobando = false;
  const el = id => document.getElementById(id);
  window.registrarCompra = async function () {
    if (comprobando) return;
    const proveedor = String(el('compraProveedorId')?.value || '').trim();
    const items = Array.isArray(window.compraItems) ? window.compraItems : [];
    let total = items.reduce((s, x) => s + Number(x.subtotal || 0), 0);
    if (!items.length) {
      if (!window.articuloCompraSeleccionado) return registrar.apply(this, arguments);
      const cantidad = Number(el('compraCantidad')?.value || 0);
      const costo = Number(el('compraCosto')?.value || 0);
      if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isFinite(costo) || costo < 0) return registrar.apply(this, arguments);
      total = cantidad * costo;
    }
    if (!proveedor || !Number.isFinite(total) || total < 0) return registrar.apply(this, arguments);
    comprobando = true;
    const mensaje = el('mensajeCompra');
    try {
      if (mensaje) mensaje.textContent = 'Comprobando si esta compra ya está registrada...';
      const dia = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Mexico_City', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
      const siguiente = new Date(dia + 'T12:00:00Z');
      siguiente.setUTCDate(siguiente.getUTCDate() + 1);
      const fin = siguiente.toISOString().slice(0, 10);
      const parametros = new URLSearchParams({
        select:'id,fecha,total,estado', proveedor_id:'eq.' + proveedor,
        total:'eq.' + total, order:'fecha.desc',
        or:'(estado.is.null,estado.not.in.(cancelada,cancelado))', limit:'1'
      });
      parametros.append('fecha', 'gte.' + dia + 'T00:00:00-06:00');
      parametros.append('fecha', 'lt.' + fin + 'T00:00:00-06:00');
      const r = await fetch(SUPABASE_URL + '/rest/v1/compras?' + parametros, {headers:headersSupabase, cache:'no-store'});
      if (!r.ok) throw new Error('No se pudo comprobar si esta compra está repetida. Intenta registrarla de nuevo.');
      const existentes = await r.json();
      if (!Array.isArray(existentes)) throw new Error('No se pudo comprobar esta compra. Intenta de nuevo.');
      if (existentes.length) {
        const importe = '$' + total.toLocaleString('es-MX', {maximumFractionDigits:2}) + ' MXN';
        const operacion = String(existentes[0].id || '').slice(0, 8);
        if (!window.confirm('Ya existe una compra del mismo proveedor, de hoy y por ' + importe +
          (operacion ? '\nOperación: ' + operacion : '') +
          '\n\nPuede ser una nota repetida. ¿Registrar otra compra de todas formas?\n\nAceptar: registrar otra compra.\nCancelar: revisar sin registrar.')) {
          if (mensaje) mensaje.innerHTML = '<div class="ayuda">Compra no registrada. Se conservan los artículos y los datos para que puedas revisarlos.</div>';
          return;
        }
      }
      return await registrar.apply(this, arguments);
    } catch (error) {
      if (mensaje) mensaje.textContent = error.message || 'No se pudo comprobar esta compra. Intenta de nuevo.';
    } finally {comprobando = false;}
  };
})();
