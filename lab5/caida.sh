#!/usr/bin/env bash
source ./comun.sh
N="${1:?nombre}"
chaos '{"mode":"off"}' >/dev/null
./generador_trafico.sh ${N}.csv >/dev/null & GEN=$!
sleep 45; snap antes
echo "T_stop=$(date -u +%T)"; $DC stop inventario
sleep 60; snap caido
echo "T_start=$(date -u +%T)"; $DC start inventario
for i in $(seq 1 36); do sleep 5; echo "$(date -u +%T) $(res) ejections_active=$(curl -s http://localhost:9901/stats | grep ejections_active | awk '{print $2}')"; done
kill -TERM $GEN; wait $GEN 2>/dev/null
snap final; dup
echo "=== VENTANAS"; python ventanas.py ${N}.csv | grep -E "ventana|venta "
