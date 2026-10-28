#!/usr/bin/env python3
"""
Carga simultánea GET + POST contra API Gateway (Lab 4 Cheapest).

Cada "thread" de la matriz = 1 usuario que envía 1 petición (Loops = 1).
Los usuarios arrancan repartidos de forma uniforme durante el ramp-up.
Los threads se reparten según --get-pct entre GET y POST.

Instalar:  pip install aiohttp
Ejemplo:   python carga_lab4.py --test "Alta carga" --threads 3000 --ramp 75 --get-pct 50 --rep 1
"""
import argparse
import asyncio
import csv
import os
import random
import string
import time
from datetime import datetime, timezone

import aiohttp

HOST = "https://dj66tdcni9.execute-api.us-east-1.amazonaws.com"
TIENDA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
MONEDA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
PRODUCTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
GET_URL = f"{HOST}/lab/logistics/tenderos/productos-disponibles"
POST_URL = f"{HOST}/lab/logistics/pedidos"
N_ITEMS = 1  # se sobrescribe con --items


def cuerpo_pedido(n):
    # Mismo patron de items que el script del Lab 3 (load_test.py), para que el
    # POST sea comparable con el monolito. --items controla cuantos items lleva.
    items = []
    for i in range(N_ITEMS):
        items.append({
            "productoId": PRODUCTO,
            "cantidad": (i % 5) + 1,
            "precioUnitario": 10000 + (i * 137),
            "descuento": 0 if i % 3 else 500,
            "monedaId": MONEDA,
        })
    sufijo = "".join(random.choices(string.ascii_lowercase, k=4))
    return {
        "identificador": f"PED-{n}-{int(time.time() * 1000)}-{sufijo}",
        "tiendaId": TIENDA,
        "fechaHoraCreacion": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "montoTotal": sum(it["precioUnitario"] * it["cantidad"] for it in items),
        "monedaId": MONEDA,
        "items": items,
    }


async def peticion(sesion, tipo, n, retraso, t0, resultados):
    await asyncio.sleep(retraso)
    inicio = time.perf_counter()
    inicio_abs = time.time()
    codigo = 0
    try:
        if tipo == "GET":
            async with sesion.get(GET_URL, params={"tiendaId": TIENDA, "zona": "Zona Norte"}) as r:
                await r.read()
                codigo = r.status
        else:
            async with sesion.post(POST_URL, json=cuerpo_pedido(n)) as r:
                await r.read()
                codigo = r.status
    except Exception:
        codigo = 0
    fin = time.perf_counter()
    ok = 200 <= codigo < 300
    resultados.append((tipo, inicio_abs, (fin - inicio) * 1000, codigo, ok))


def percentil(valores, p):
    if not valores:
        return 0.0
    v = sorted(valores)
    k = max(0, min(len(v) - 1, int(round(p / 100 * len(v) + 0.5)) - 1))
    return v[k]


async def main():
    global N_ITEMS
    ap = argparse.ArgumentParser()
    ap.add_argument("--items", type=int, default=1,
                    help="Items por pedido en el POST (el script del Lab 3 usaba 25)")
    ap.add_argument("--test", required=True, help="Nombre de la fila de la matriz")
    ap.add_argument("--threads", type=int, required=True, help="Threads totales")
    ap.add_argument("--ramp", type=float, required=True, help="Ramp-up en segundos")
    ap.add_argument("--get-pct", type=float, default=50, help="%% de GET (el resto es POST)")
    ap.add_argument("--rep", type=int, default=1, help="Número de repetición")
    ap.add_argument("--limite", type=int, default=1500, help="Conexiones simultáneas máximas")
    ap.add_argument("--salida", default="resultados_lab4.csv")
    a = ap.parse_args()
    N_ITEMS = max(1, a.items)

    n_get = round(a.threads * a.get_pct / 100)
    n_post = a.threads - n_get
    tipos = ["GET"] * n_get + ["POST"] * n_post
    random.shuffle(tipos)

    inicio_utc = datetime.now(timezone.utc)
    print(f"[{a.test} rep {a.rep}] {n_get} GET + {n_post} POST, ramp-up {a.ramp}s")
    print(f"Inicio UTC: {inicio_utc:%Y-%m-%dT%H:%M:%SZ}")

    resultados = []
    conector = aiohttp.TCPConnector(limit=a.limite, ssl=True)
    tiempo = aiohttp.ClientTimeout(total=60)
    t0 = time.perf_counter()
    async with aiohttp.ClientSession(connector=conector, timeout=tiempo) as sesion:
        tareas = []
        for i, tipo in enumerate(tipos):
            retraso = (i / max(1, a.threads)) * a.ramp
            tareas.append(peticion(sesion, tipo, i, retraso, t0, resultados))
        await asyncio.gather(*tareas)
    fin_utc = datetime.now(timezone.utc)
    print(f"Fin UTC:    {fin_utc:%Y-%m-%dT%H:%M:%SZ}")

    nuevo = not os.path.exists(a.salida)
    with open(a.salida, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if nuevo:
            w.writerow(["Test", "Ramp-Up", "Threads totales", "Distribucion GET/POST", "# Repeticion",
                        "Endpoint", "Muestras", "p99 (ms)", "p95 (ms)", "Throughput (req/s)",
                        "Error %", "Inicio UTC", "Fin UTC"])
        for tipo in ("GET", "POST"):
            filas = [r for r in resultados if r[0] == tipo]
            if not filas:
                continue
            lat = [r[2] for r in filas]
            errores = sum(1 for r in filas if not r[4])
            ini = min(r[1] for r in filas)
            fin = max(r[1] + r[2] / 1000 for r in filas)
            thr = len(filas) / max(0.001, fin - ini)
            p99, p95 = percentil(lat, 99), percentil(lat, 95)
            err = 100 * errores / len(filas)
            codigos = {}
            for r in filas:
                codigos[r[3]] = codigos.get(r[3], 0) + 1
            print(f"{tipo:4} n={len(filas):6} p99={p99:8.0f} ms  p95={p95:8.0f} ms  "
                  f"thr={thr:6.2f} req/s  error={err:5.2f}%  codigos={codigos}")
            w.writerow([a.test, f"{a.ramp:g}s", a.threads, f"{a.get_pct:g}/{100 - a.get_pct:g}", a.rep,
                        tipo, len(filas), round(p99), round(p95), round(thr, 2), round(err, 2),
                        f"{inicio_utc:%Y-%m-%dT%H:%M:%SZ}", f"{fin_utc:%Y-%m-%dT%H:%M:%SZ}"])

    total = len(resultados)
    ini = min(r[1] for r in resultados)
    fin = max(r[1] + r[2] / 1000 for r in resultados)
    print(f"TOTAL throughput = {total / max(0.001, fin - ini):.2f} req/s "
          f"(REQ3 pide >= 83.3 en el pico)")
    print(f"Resultados agregados en {a.salida}")


if __name__ == "__main__":
    asyncio.run(main())