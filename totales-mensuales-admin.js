(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const autorizado = () => el('adminPanel')?.style.display === 'block';
  const cancelado = estado => ['cancelado','cancelada'].includes(String(estado || '').trim().toLowerCase());
  const dinero = n => '$' + n.toLocaleString('es-MX', {maximumFractionDigits:0}) + ' MXN';
  let secuencia = 0;

  function rango(mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
    const [anio, numero] = mes.split('-').map(Number);
    const siguiente = numero === 12 ? (anio + 1) + '-01' : anio + '-' + String(numero + 1).padStart(2,'0');
    return [mes + '-01T00:00:00-06:00', siguiente + '-01T00:00:00-06:00'];
  }

  async function leer(tabla, columnas, limites) {
    const filas = [];
    for (let offset = 0; ; ) {
      const p = new URLSearchParams({select:columnas,order:'id.asc',limit:'500',offset:String(offset)});
      if (limites) {p.append('fecha','gte.' + limites[0]);p.append('fecha','lt.' + limites[1]);}
      const r = await fetch(SUPABASE_URL + '/rest/v1/' + tabla + '?' + p, {headers:headersSupabase,cache:'no-store'});
      if (!r.ok) throw new Error('No se pudo consultar ' + tabla + '. Pulsa Actualizar totales para reintentar.');
      const pagina = await r.json();
      if (!Array.isArray(pagina)) throw new Error('Respuesta inválida al consultar ' + tabla + '.');
      filas.push(...pagina);
      if (!pagina.length) return filas;
      offset += pagina.length;
    }
  }

  const campos = ['totalEntradasMesAdmin','totalComprasMesAdmin','totalGastosMesAdmin'];
  const suma = (filas, campo) => filas.reduce((s,x) => {
    const n = Number(x[campo] || 0);
    if (!Number.isFinite(n)) throw new Error('Hay un importe inválido. Revisa los registros del mes.');
    return s + n;
  },0);

  window.cargarTotalesMensualesAdmin = async function () {
    if (!autorizado()) return;
    const turno = ++secuencia;
    const mensaje = el('mensajeTotalesMensualesAdmin');
    campos.forEach(id => {el(id).textContent = 'Calculando…';});
    mensaje.textContent = '';
    el('detalleEntradasMesAdmin').textContent = '';
    try {
      const limites = rango(el('mesTotalesAdmin').value);
      const [ventas, compras, gastos, pagos, apartados] = await Promise.all([
        leer('ventas','id,total,estado',limites),
        leer('compras','id,total,estado',limites),
        leer('gastos','id,importe',limites),
        leer('apartado_pagos','id,apartado_id,importe',limites),
        leer('apartados','id,estado')
      ]);
      if (turno !== secuencia || !autorizado()) return;
      const anulados = new Set(apartados.filter(a => cancelado(a.estado)).map(a => String(a.id)));
      const totalVentas = suma(ventas.filter(v => !cancelado(v.estado)), 'total');
      const totalApartados = suma(pagos.filter(p => !anulados.has(String(p.apartado_id))), 'importe');
      const totales = [totalVentas + totalApartados, suma(compras.filter(c => !cancelado(c.estado)), 'total'), suma(gastos, 'importe')];
      campos.forEach((id,i) => {el(id).textContent = dinero(totales[i]);});
      el('detalleEntradasMesAdmin').textContent = 'Ventas: ' + dinero(totalVentas) + ' · Anticipos y abonos de apartados: ' + dinero(totalApartados);
      mensaje.textContent = 'Totales actualizados para ' + el('mesTotalesAdmin').value + '.';
    } catch (e) {
      if (turno !== secuencia || !autorizado()) return;
      campos.forEach(id => {el(id).textContent = 'No disponible';});
      mensaje.textContent = e.message || 'No se pudieron cargar los totales.';
    }
  };

  function instalar() {
    const mes = el('mesTotalesAdmin');
    if (!mes) return;
    mes.value = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit'}).format(new Date());
    mes.addEventListener('change',window.cargarTotalesMensualesAdmin);
    el('actualizarTotalesMensualesAdmin').onclick = window.cargarTotalesMensualesAdmin;
    const entrar = window.entrarAdministracion;
    window.entrarAdministracion = async function () {
      const resultado = await entrar.apply(this,arguments);
      if (autorizado()) await window.cargarTotalesMensualesAdmin();
      return resultado;
    };
    const salir = window.salirAdministracion;
    window.salirAdministracion = function () {
      ++secuencia;
      campos.forEach(id => {el(id).textContent = 'Selecciona un mes';});
      el('detalleEntradasMesAdmin').textContent = '';
      el('mensajeTotalesMensualesAdmin').textContent = '';
      return salir.apply(this,arguments);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();
