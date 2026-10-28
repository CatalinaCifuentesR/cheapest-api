#!/usr/bin/env bash
source ./comun.sh
./generador_trafico.sh reinicio.csv >/dev/null & GEN=$!
sleep 15; echo "T_stop=$(date -u +%T)"; $DC stop inventario
sleep 40; kill -TERM $GEN; wait $GEN 2>/dev/null
echo "antes de reiniciar Ventas:"; res
echo "T_restart_ventas=$(date -u +%T)"; $DC restart ventas
until curl -sf http://localhost:3003/health >/dev/null; do sleep 1; done
echo "ventas arriba $(date -u +%T)"; res
$DC start inventario; echo "T_start=$(date -u +%T)"
for i in $(seq 1 30); do sleep 5; echo "$(date -u +%T) $(res)"; done
dup
