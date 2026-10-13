const VERSION = "muebleria-mercado-pwa-v2-reportes-apartados";
self.addEventListener("install", function(event) { self.skipWaiting(); });
self.addEventListener("activate", function(event) { event.waitUntil(self.clients.claim()); });

// Inyecta únicamente la corrección del reporte diario al documento de la app.
// No interceptamos ni almacenamos datos de Supabase.
self.addEventListener("fetch", function(event) {
  const request = event.request;
  if(request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith((async function(){
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if(!contentType.includes("text/html")) return response;

    const html = await response.text();
    const scriptTag = '<script src="./reportes-apartados.js"></script>';
    if(html.includes("reportes-apartados.js")){
      return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
    }

    const actualizado = html.includes("</body>")
      ? html.replace("</body>", scriptTag + "</body>")
      : html + scriptTag;

    return new Response(actualizado,{
      status:response.status,
      statusText:response.statusText,
      headers:response.headers
    });
  })());
});
