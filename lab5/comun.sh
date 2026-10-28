cd /c/dev/ARQUISOFT/cheapest-api/lab5
export VENTA_URL=http://localhost:3003/ventas/ventas BASE_URL=http://localhost
DC="docker compose -f ../docker-compose.yml"
chaos() { curl -s -X POST http://localhost:3002/inventory/chaos -H "Content-Type: application/json" -d "$1"; echo; }
res() { curl -s http://localhost:3003/ventas/outbox/resumen | grep -o '"PENDING":[0-9]*,"DELIVERED":[0-9]*,"FAILED":[0-9]*'; }
dup() { $DC exec -T postgres psql -U postgres -d cheapest -c 'SELECT "ventaId", count(*) FROM registros_venta_producto_tienda GROUP BY 1 HAVING count(*)>1;'; }
snap() {
  echo "--- SNAP $1 $(date -u +%T)"
  curl -s http://localhost:9901/stats | grep -E "inventario_cluster.upstream_rq_total|inventario_cluster.upstream_rq_retry:|inventario_cluster.upstream_rq_timeout|outlier_detection.ejections_active|outlier_detection.ejections_total"
  res; curl -s http://localhost:3002/inventory/chaos; echo
}
