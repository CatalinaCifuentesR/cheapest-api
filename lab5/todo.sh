#!/usr/bin/env bash
source ./comun.sh
ENV=../apps/ventas/sidecar/envoy.yaml.tmpl
echo "##### CONFIG 2 SOLO REINTENTOS"
sed -i 's/enforcing_consecutive_5xx: 100/enforcing_consecutive_5xx: 0/' $ENV
grep -n "enforcing_consecutive_5xx" $ENV
$DC up -d --build ventas-sidecar; sleep 10; curl -s http://localhost:9901/ready; echo
./tormenta.sh solo_reintentos 2>&1 | tee solo_reintentos_salida.txt
sleep 20
echo "##### CONFIG 3 SIN SIDECAR"
sed -i 's/enforcing_consecutive_5xx: 0/enforcing_consecutive_5xx: 100/' $ENV
$DC up -d --build ventas-sidecar
VENTAS_INVENTARIO_BASE_URL=http://inventario:3002 $DC up -d ventas; sleep 12
$DC exec -T ventas printenv INVENTARIO_BASE_URL
./tormenta.sh sin_sidecar 2>&1 | tee sin_sidecar_salida.txt
$DC up -d ventas; sleep 10
echo "##### LISTO"
