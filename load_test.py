"""
load_test.py - Script de pruebas de carga para el backend monolitico de Cheapest.
"""

import argparse
import asyncio
import csv
import json
import statistics
import time
import itertools
from datetime import datetime, timezone

import httpx

BASE_URL = "http://localhost:3000"

_id_counter = itertools.count()

def build_post_body(n_items: int = 25) -> dict:
    PRODUCTO_ID_REAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    items = []
    for i in range(n_items):
        items.append({
            "productoId": PRODUCTO_ID_REAL,
            "cantidad": (i % 5) + 1,
            "precioUnitario": 10000 + (i * 137),
            "descuento": 0 if i % 3 else 500,
            "monedaId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        })
    return {
        "identificador": f"PED-LOADTEST-{time.time_ns()}-{next(_id_counter)}",
        "tiendaId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "fechaHoraCreacion": datetime.now(timezone.utc).isoformat(),
        "montoTotal": sum(it["precioUnitario"] * it["cantidad"] for it in items),
        "monedaId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "estado": "creado",
        "items": items,
    }


async def fire_request(client, method, url, body_fn, results, delay):
    if delay > 0:
        await asyncio.sleep(delay)

    ts = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    status_code = None
    error = ""

    try:
        if method == "GET":
            resp = await client.get(url, timeout=30.0)
        else:
            body = body_fn()
            resp = await client.post(url, json=body, timeout=30.0,
                                      headers={"Content-Type": "application/json",
                                               "Accept": "application/json"})
        status_code = resp.status_code
        if status_code >= 400:
            error = resp.text[:300].replace("\n", " ")
    except httpx.TimeoutException:
        error = "timeout"
    except httpx.ConnectError:
        error = "connection_error"
    except Exception as e:
        error = f"error:{type(e).__name__}"

    latency_ms = (time.perf_counter() - start) * 1000

    results.append({
        "timestamp_iso": ts,
        "method": method,
        "endpoint": url,
        "status_code": status_code,
        "latency_ms": round(latency_ms, 2),
        "error": error,
    })


async def run_load_test(method, path, users, ramp_up, duration, body_fn):
    url = f"{BASE_URL}{path}"
    results = []
    limits = httpx.Limits(max_connections=users + 10, max_keepalive_connections=users)

    async with httpx.AsyncClient(limits=limits) as client:
        tasks = []
        end_time = time.perf_counter() + duration if duration else None
        interval = ramp_up / users if users > 0 else 0

        if duration:
            i = 0
            while time.perf_counter() < end_time:
                tasks.append(asyncio.create_task(
                    fire_request(client, method, url, body_fn, results, 0)
                ))
                i += 1
                if i <= users:
                    await asyncio.sleep(interval)
                else:
                    await asyncio.sleep(max(duration / (users * 3), 0.001))
        else:
            for i in range(users):
                delay = i * interval
                tasks.append(asyncio.create_task(
                    fire_request(client, method, url, body_fn, results, delay)
                ))

        await asyncio.gather(*tasks)

    return results


def percentile(data, p):
    if not data:
        return 0.0
    data_sorted = sorted(data)
    k = (len(data_sorted) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(data_sorted) - 1)
    if f == c:
        return data_sorted[f]
    return data_sorted[f] + (data_sorted[c] - data_sorted[f]) * (k - f)


def summarize(results, method, total_duration_s):
    latencies = [r["latency_ms"] for r in results]
    errors = [r for r in results if r["error"] or (r["status_code"] and r["status_code"] >= 400)]

    total = len(results)
    error_pct = (len(errors) / total * 100) if total else 0.0
    throughput = total / total_duration_s if total_duration_s > 0 else 0.0

    print(f"\n=== Resumen {method} ===")
    print(f"Total requests: {total}")
    print(f"Throughput: {throughput:.2f} req/s")
    if latencies:
        print(f"Latencia promedio: {statistics.mean(latencies):.2f} ms")
        print(f"Latencia p95: {percentile(latencies, 95):.2f} ms")
        print(f"Latencia p99: {percentile(latencies, 99):.2f} ms")
    print(f"Error %: {error_pct:.2f}%  ({len(errors)}/{total})")
    if errors:
        print(f"Ejemplo de error: {errors[0]['error']}")


def export_csv(results, filename):
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp_iso", "status_code", "latency_ms", "error"])
        writer.writeheader()
        for r in results:
            writer.writerow({
                "timestamp_iso": r["timestamp_iso"],
                "status_code": r["status_code"],
                "latency_ms": r["latency_ms"],
                "error": r["error"],
            })
    print(f"Resultados exportados a {filename}")


def main():
    parser = argparse.ArgumentParser(description="Load tester para Cheapest backend")
    parser.add_argument("--endpoint", required=True, choices=["GET", "POST"])
    parser.add_argument("--users", type=int, required=True)
    parser.add_argument("--ramp-up", type=float, required=True)
    parser.add_argument("--duration", type=float, default=0)
    parser.add_argument("--path", type=str, default=None)
    parser.add_argument("--body", type=str, default=None)
    args = parser.parse_args()

    if args.endpoint == "GET":
        path = args.path or "/logistics/tenderos/productos-disponibles?tiendaId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&zona=Zona%20Norte"
        body_fn = None
        csv_name = "results_get.csv"
    else:
        path = "/logistics/pedidos"
        if args.body:
            with open(args.body, "r", encoding="utf-8") as f:
                fixed_body = json.load(f)
            body_fn = lambda: fixed_body
        else:
            body_fn = build_post_body
        csv_name = "results_post.csv"

    print(f"Lanzando prueba {args.endpoint} -> {BASE_URL}{path}")
    print(f"Users={args.users} Ramp-up={args.ramp_up}s Duration={args.duration}s")

    t0 = time.perf_counter()
    results = asyncio.run(run_load_test(args.endpoint, path, args.users, args.ramp_up, args.duration, body_fn))
    total_time = time.perf_counter() - t0

    summarize(results, args.endpoint, total_time)
    export_csv(results, csv_name)


if __name__ == "__main__":
    main()
