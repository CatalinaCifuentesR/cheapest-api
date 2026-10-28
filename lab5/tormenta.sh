#!/usr/bin/env bash
source ./comun.sh
N="${1:?nombre}"
chaos '{"mode":"off"}' >/dev/null
./generador_trafico.sh ${N}.csv >/dev/null & GEN=$!
sleep 60; snap antes
TINJ=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo "T_inj=$TINJ  (T_rem = +150 s)"
chaos '{"mode":"latency","delayMs":5000,"durationMs":150000}'
( CLIENTES=50 DURACION=120 ./tormenta_reintentos.sh ${N}_apps.csv ) & STORM=$!
sleep 30; snap fallo_30s
sleep 60; snap fallo_90s
wait $STORM
sleep 40; snap T_rem_mas_10s
sleep 50; snap final
kill -TERM $GEN; wait $GEN 2>/dev/null
echo "=== VENTANAS"; python ventanas.py ${N}.csv | grep -E "ventana|venta "
grep ",venta," ${N}.csv | sort > ${N}_v.csv
awk -F, -v t="$TINJ" '$1>=t && $5==1 && !a {print "TTD primera pending:",$1; a=1}' ${N}_v.csv
awk -F, -v t="$TINJ" '$1>=t && $5==1 && $4<0.5 && !a {print "primera pending rapida:",$1; a=1}' ${N}_v.csv
awk -F, '$5==1 {u=$1} END {print "ultima pending:",u}' ${N}_v.csv
echo "=== TORMENTA (apps)"
awk -F, 'NR>1 {p++; ped[$2"-"$3]=1; if($5 ~ /^2/) ok[$2"-"$3]=1; if($5=="000") ab++; if($5=="429") t429++} END {np=length(ped); printf "pedidos=%d completados=%d peticiones=%d intentos/pedido=%.2f abandonadas=%d 429=%d\n", np, length(ok), p, (np?p/np:0), ab, t429}' ${N}_apps.csv
