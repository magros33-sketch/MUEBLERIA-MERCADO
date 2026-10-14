(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dinero = n => '$' + Number(n || 0).toLocaleString('es-MX', {maximumFractionDigits:0}) + ' MXN';
  const autorizado = () => el('adminPanel')?.style.display === 'block' && el('administracion')?.classList.contains('activa');
  let cache, carga, timer, secuencia = 0, encontrados = [], visibles = 20;
  async function leerGastos() {
    if (cache && Date.now() - cache.fecha < 60000) return cache.filas;
    if (carga) return carga;
    carga = (async () => {
      const filas = [];
      for (let offset = 0; ; ) {
        const p = new URLSearchParams({select:'id,fecha,concepto,categoria,importe,notas',order:'id.asc',limit:'500',offset:String(offset)});
        const r = await fetch(SUPABASE_URL + '/rest/v1/gastos?' + p, {headers:headersSupabase,cache:'no-store'});
        if (!r.ok) throw new Error('No se pudieron consultar los gastos. Pulsa Actualizar búsqueda para reintentar.');
        const pagina = await r.json();
        if (!Array.isArray(pagina)) throw new Error('No se pudieron leer los gastos.');
        filas.push(...pagina);
        if (!pagina.length) break;
        offset += pagina.length;
      }
      filas.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
      cache = {fecha:Date.now(),filas};
      return filas;
    })();
    try {return await carga;} finally {carga = null;}
  }
  function fechaMexico(valor) {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  }
  function renderizar() {
    const box = el('resultadosGastosAdmin');
    if (!box) return;
    const mes = el('mesBuscarGastosAdmin')?.value;
    const total = encontrados.reduce((s,g) => s + Number(g.importe || 0),0);
    box.innerHTML = '<div class="info-articulo"><strong>Total de los gastos encontrados' +
      (mes ? ' en ' + esc(mes) : ' · todos los meses') +
      '</strong><div class="precio-venta">' + dinero(total) + '</div>' +
      '<div>' + encontrados.length + ' pago(s). Se muestran ' + Math.min(visibles,encontrados.length) + '.</div></div>' +
      (encontrados.length ? encontrados.slice(0,visibles).map(g =>
        '<div class="historial"><strong>💸 ' + esc(g.concepto || 'Sin concepto') + '</strong>' +
        '<div class="fecha-operacion">📅 ' + esc(fechaMexico(g.fecha) || 'Sin fecha') + '</div>' +
        '<div class="dato">Categoría: ' + esc(g.categoria || 'otros') + '</div>' +
        '<div class="dato">Importe: <strong>' + dinero(g.importe) + '</strong></div>' +
        (g.notas ? '<div class="dato">' + esc(g.notas) + '</div>' : '') + '</div>').join('') :
        '<div class="ayuda">No hay gastos con esa búsqueda.</div>') +
      (visibles < encontrados.length ? '<button type="button" id="masGastosAdmin">Ver más pagos</button>' : '');
    const mas = el('masGastosAdmin');
    if (mas) mas.onclick = () => {visibles += 20;renderizar();};
  }
  async function buscar(actualizar = false) {
    clearTimeout(timer);
    const turno = ++secuencia;
    const texto = normalizar(el('buscarConceptoGastosAdmin')?.value);
    const box = el('resultadosGastosAdmin');
    if (!box) return;
    box.hidden = !texto || !autorizado();
    if (box.hidden) {box.innerHTML = '';encontrados = [];return;}
    const mes = el('mesBuscarGastosAdmin')?.value || '';
    if (actualizar) {cache = null;if (carga) {try {await carga;} catch (_) {}cache = null;}}
    box.textContent = 'Buscando gastos...';
    try {
      const filas = await leerGastos();
      if (turno !== secuencia || !autorizado()) return;
      const palabras = texto.split(' ');
      encontrados = filas.filter(g => palabras.every(p => normalizar([g.concepto,g.categoria].join(' ')).includes(p)) && (!mes || fechaMexico(g.fecha).slice(0,7) === mes));
      visibles = 20;
      renderizar();
    } catch (e) {
      if (turno === secuencia && autorizado()) box.innerHTML = '<div class="mensaje-error">' + esc(e.message || 'No se pudo buscar.') + '</div>';
    }
  }
  function limpiar() {
    clearTimeout(timer);++secuencia;
    if (el('buscarConceptoGastosAdmin')) el('buscarConceptoGastosAdmin').value = '';
    if (el('mesBuscarGastosAdmin')) el('mesBuscarGastosAdmin').value = '';
    if (el('resultadosGastosAdmin')) {el('resultadosGastosAdmin').innerHTML = '';el('resultadosGastosAdmin').hidden = true;}
    encontrados = [];cache = null;
  }
  function instalar() {
    const admin = el('adminPanel');
    if (!admin || el('buscarConceptoGastosAdmin')) return;
    const panel = document.createElement('div');panel.className = 'tarjeta';
    panel.innerHTML = '<h3>🔎 Buscar gastos por concepto</h3>' +
      '<label for="buscarConceptoGastosAdmin">Concepto o categoría</label><input id="buscarConceptoGastosAdmin" type="search" placeholder="Luz, sueldos, gasolina, renta…" autocomplete="off">' +
      '<label for="mesBuscarGastosAdmin">Mes (opcional)</label><input id="mesBuscarGastosAdmin" type="month">' +
      '<div class="ayuda">Escribe para ver los pagos y su suma. Sin mes seleccionado, busca en todos los meses. El total incluye todos los resultados.</div>' +
      '<button type="button" id="actualizarGastosAdmin">Actualizar búsqueda</button><button type="button" class="secundario" id="limpiarGastosAdmin">Limpiar búsqueda</button>' +
      '<div id="resultadosGastosAdmin" hidden></div>';
    const pin = el('pinActual')?.closest('.tarjeta');
    if (pin?.parentNode === admin) admin.insertBefore(panel,pin);else admin.appendChild(panel);
    el('buscarConceptoGastosAdmin').addEventListener('input',function () {
      ++secuencia;clearTimeout(timer);
      if (!normalizar(this.value)) buscar();else timer = setTimeout(() => buscar(),300);
    });
    el('mesBuscarGastosAdmin').onchange = () => buscar();
    el('actualizarGastosAdmin').onclick = () => buscar(true);
    el('limpiarGastosAdmin').onclick = limpiar;
    const salir = window.salirAdministracion;
    if (typeof salir === 'function') window.salirAdministracion = function () {limpiar();return salir.apply(this,arguments);};
    for (const nombre of ['cargarHistorialGastos','cargarRentasAdmin']) {
      const original = window[nombre];
      if (typeof original === 'function') window[nombre] = async function () {
        const resultado = await original.apply(this,arguments);cache = null;
        if (autorizado() && normalizar(el('buscarConceptoGastosAdmin')?.value)) await buscar(true);
        return resultado;
      };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();
