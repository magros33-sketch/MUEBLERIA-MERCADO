(function () {
  'use strict';
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dinero = v => '$' + Number(v || 0).toLocaleString('es-MX', {maximumFractionDigits: 0});
  let cache, carga, temporizador, secuencia = 0, visibles = 20, coincidencias = [];
  const el = id => document.getElementById(id);
  async function leerTabla(tabla, columnas) {
    const filas = [];
    // Leer todas las páginas: no limitar la búsqueda a los primeros 1000 registros.
    for (let offset = 0; ; ) {
      const parametros = new URLSearchParams({select: columnas, order: 'id.asc', limit: '500', offset: String(offset)});
      const r = await fetch(SUPABASE_URL + '/rest/v1/' + tabla + '?' + parametros, {headers: headersSupabase, cache: 'no-store'});
      if (!r.ok) throw new Error('No se pudo consultar ' + tabla + '. Intenta actualizar la búsqueda.');
      const pagina = await r.json();
      if (!Array.isArray(pagina)) throw new Error('Respuesta no válida al consultar ' + tabla + '.');
      filas.push(...pagina);
      if (!pagina.length) break;
      offset += pagina.length;
      // Content-Range permite detectar el final aunque el servidor reduzca el tamaño de página.
      const rango = r.headers?.get('content-range') || '';
      const total = rango.split('/')[1];
      if (total && total !== '*' && offset >= Number(total)) break;
    }
    return filas;
  }
  async function cargarIndice() {
    if (cache && Date.now() - cache.fecha < 60000) return cache.filas;
    if (carga) return carga;
    carga = (async function () {
      const [ventas, clientes, articulos, detalles] = await Promise.all([
        leerTabla('ventas', 'id,cliente_id,tipo_cliente,fecha,metodo_pago,total,estado'),
        leerTabla('clientes', 'id,nombre,codigo_cliente'),
        leerTabla('articulos', 'id,nombre,codigo'),
        leerTabla('ventas_detalle', 'id,venta_id,articulo_id,cantidad,precio_unitario,subtotal')
      ]);
      const clientesPorId = new Map(clientes.map(c => [String(c.id), c]));
      const articulosPorId = new Map(articulos.map(a => [String(a.id), a]));
      const lineasPorVenta = new Map();
      for (const d of detalles) {
        const id = String(d.venta_id);
        if (!lineasPorVenta.has(id)) lineasPorVenta.set(id, []);
        lineasPorVenta.get(id).push({...d, articulo: articulosPorId.get(String(d.articulo_id))});
      }
      const filas = ventas.filter(v => !['cancelada', 'cancelado'].includes(normalizar(v.estado))).map(v => {
        const cliente = clientesPorId.get(String(v.cliente_id));
        const nombreCliente = cliente ? [cliente.codigo_cliente, cliente.nombre].filter(Boolean).join(' — ') : 'Público general';
        const lineas = lineasPorVenta.get(String(v.id)) || [];
        const texto = normalizar([v.id, nombreCliente, ...lineas.map(d => [d.articulo?.nombre, d.articulo?.codigo].filter(Boolean).join(' '))].join(' '));
        return {venta: v, nombreCliente, lineas, texto};
      }).sort((a, b) => new Date(b.venta.fecha) - new Date(a.venta.fecha));
      cache = {fecha: Date.now(), filas};
      return filas;
    })();
    try {return await carga;} finally {carga = null;}
  }
  function renderizar() {
    const box = el('resultadosBuscarVentas');
    if (!box) return;
    if (!coincidencias.length) {
      box.innerHTML = '<div class="ayuda">No se encontraron ventas con esa búsqueda.</div>';
      return;
    }
    box.innerHTML = '<div class="ayuda">' + coincidencias.length + ' venta(s) encontrada(s). Se muestran ' + Math.min(visibles, coincidencias.length) + '.</div>' +
      coincidencias.slice(0, visibles).map(({venta: v, nombreCliente, lineas}) => {
        const d = new Date(v.fecha);
        const fecha = Number.isNaN(d.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-MX', {timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short'}).format(d);
        return '<div class="historial"><strong>💰 Venta · Ticket ' + esc(String(v.id).slice(0, 8)) + '</strong>' +
          '<div class="fecha-operacion">📅 ' + esc(fecha) + '</div><div class="dato">Cliente: <strong>' + esc(nombreCliente) + '</strong></div>' +
          '<div class="dato">Método: ' + esc(v.metodo_pago || '') + '</div>' +
          '<div class="dato">Total: <strong>' + dinero(v.total) + ' MXN</strong></div>' +
          (lineas.length ? '<div class="dato"><strong>Artículos:</strong><ul>' + lineas.map(d => '<li>' + esc(d.articulo?.nombre || 'Artículo no disponible') + (d.articulo?.codigo ? ' (' + esc(d.articulo.codigo) + ')' : '') + ' · ' + Number(d.cantidad || 0) + ' × ' + dinero(d.precio_unitario) + '</li>').join('') + '</ul></div>' : '<div class="ayuda">No hay detalle disponible para este ticket.</div>') +
          '<button type="button" data-editar-venta-buscada="' + esc(v.id) + '">✏️ Editar venta</button>' +
          '<button type="button" class="eliminar" data-cancelar-venta-buscada="' + esc(v.id) + '">🗑️ Eliminar venta y devolver stock</button></div>';
      }).join('') +
      (visibles < coincidencias.length ? '<button type="button" id="masVentasBuscadas">Ver más resultados</button>' : '');
    box.querySelectorAll('[data-editar-venta-buscada]').forEach(b => b.onclick = () => window.editarVenta(b.dataset.editarVentaBuscada));
    box.querySelectorAll('[data-cancelar-venta-buscada]').forEach(b => b.onclick = () => window.cancelarVenta(b.dataset.cancelarVentaBuscada));
    const mas = el('masVentasBuscadas');
    if (mas) mas.onclick = () => {visibles += 20; renderizar();};
  }
  async function buscar(actualizar = false) {
    clearTimeout(temporizador);
    const turno = ++secuencia;
    const texto = normalizar(el('buscarVentasHistoricas')?.value);
    const box = el('resultadosBuscarVentas');
    if (!box) return;
    box.hidden = !texto;
    if (!texto) {box.innerHTML = ''; coincidencias = []; return;}
    if (actualizar) {cache = null; if (carga) {try {await carga;} catch (_) {} cache = null;}}
    box.textContent = 'Buscando ventas de todas las fechas...';
    try {
      const filas = await cargarIndice();
      if (turno !== secuencia) return;
      const palabras = texto.split(' ');
      coincidencias = filas.filter(x => palabras.every(p => x.texto.includes(p)));
      visibles = 20;
      renderizar();
    } catch (e) {
      if (turno === secuencia) box.innerHTML = '<div class="mensaje-error">' + esc(e.message || 'No se pudo buscar. Intenta actualizar.') + '</div>';
    }
  }
  function instalar() {
    const historial = el('historialVentas');
    if (!historial || el('buscarVentasHistoricas')) return;
    const panel = document.createElement('div');
    panel.className = 'tarjeta';
    panel.innerHTML = '<h3>🔎 Buscar una venta</h3><label for="buscarVentasHistoricas">Cliente, artículo o número de ticket</label>' +
      '<input id="buscarVentasHistoricas" type="search" autocomplete="off" placeholder="Nombre, código o número de operación">' +
      '<div class="ayuda">Busca en todas las fechas, sin cambiar el calendario. El número de ticket es la operación que aparece en la venta.</div>' +
      '<button type="button" id="actualizarBuscarVentas">Actualizar búsqueda</button>' +
      '<button type="button" class="secundario" id="limpiarBuscarVentas">Limpiar búsqueda</button>' +
      '<div id="resultadosBuscarVentas" hidden></div>';
    const tarjeta = historial.closest('.tarjeta');
    tarjeta.parentNode.insertBefore(panel, tarjeta);
    el('buscarVentasHistoricas').addEventListener('input', function () {
      ++secuencia;
      clearTimeout(temporizador);
      if (!normalizar(this.value)) buscar();
      else temporizador = setTimeout(() => buscar(), 300);
    });
    el('actualizarBuscarVentas').onclick = () => buscar(true);
    el('limpiarBuscarVentas').onclick = () => {el('buscarVentasHistoricas').value = ''; buscar();};
    // Las funciones actuales refrescan este historial al editar, cancelar o registrar.
    const cargarHistorial = window.cargarHistorialVentas;
    if (typeof cargarHistorial === 'function') window.cargarHistorialVentas = async function () {
      const resultado = await cargarHistorial.apply(this, arguments);
      cache = null;
      if (normalizar(el('buscarVentasHistoricas')?.value)) await buscar(true);
      return resultado;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
})();
