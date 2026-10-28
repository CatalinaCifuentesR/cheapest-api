#!/usr/bin/env bash
# Tormenta de reintentos para el experimento del Lab 5.
# Salida (CSV): ts,cliente,pedido,intento,http_code,latencia_s

set -u

OUT="${1:?Indique el archivo CSV de salida, p. ej. ./tormenta_reintentos.sh tormenta_apps.csv}"
CLIENTES="${CLIENTES:-50}"
DURACION="${DURACION:-120}"
TIMEOUT_CLIENTE="${TIMEOUT_CLIENTE:-3}"
PAUSA="${PAUSA:-5}"
BACKOFF="${BACKOFF:-0}"
VENTA_JSON="${VENTA_JSON:-venta.json}"
VENTA_URL="${VENTA_URL:-${BASE_URL:?Defina BASE_URL}/ventas/ventas}"

[ -f "$VENTA_JSON" ] || { echo "No existe $VENTA_JSON" >&2; exit 1; }

echo "ts,cliente,pedido,intento,http_code,latencia_s" > "$OUT"
FIN=$(( $(date +%s) + DURACION ))

cliente() {
  local id="$1" pedido=0 intento meta code lat espera
  sleep "$(awk -v s="$RANDOM" -v p="$PAUSA" 'BEGIN { srand(s); print rand() * p }')"
  while [ "$(date +%s)" -lt "$FIN" ]; do
    pedido=$((pedido + 1))
    intento=0
    while [ "$(date +%s)" -lt "$FIN" ]; do
      intento=$((intento + 1))
      meta=$(curl -s -o /dev/null --max-time "$TIMEOUT_CLIENTE" -w '%{http_code} %{time_total}' \
        -X POST "$VENTA_URL" -H 'Content-Type: application/json' -d @"$VENTA_JSON")
      code=${meta% *}
      lat=${meta#* }
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$id,$pedido,$intento,$code,$lat" >> "$OUT"
      case "$code" in 2*) break ;; esac
      if [ "$BACKOFF" = 1 ]; then
        espera=$(awk -v n="$intento" -v s="$RANDOM" 'BEGIN { srand(s); b = 0.5 * 2 ^ (n - 1); if (b > 8) b = 8; print b * (0.5 + rand() / 2) }')
        sleep "$espera"
      fi
    done
    sleep "$PAUSA"
  done
}

echo "Tormenta: $CLIENTES clientes durante ${DURACION}s, timeout de cliente ${TIMEOUT_CLIENTE}s, backoff=$BACKOFF → $OUT"
for i in $(seq 1 "$CLIENTES"); do
  cliente "$i" &
done
wait

awk -F, 'NR > 1 {
  peticiones++
  pedidos[$2 "-" $3] = 1
  if ($5 ~ /^2/) ok[$2 "-" $3] = 1
  if ($5 == "429") t429++
  if ($5 == "000") abandonadas++
}
END {
  np = length(pedidos); nok = length(ok)
  printf "Pedidos lógicos: %d (completados: %d)\n", np, nok
  printf "Peticiones enviadas: %d → %.2f intentos por pedido\n", peticiones, (np ? peticiones / np : 0)
  printf "Abandonadas por timeout del cliente: %d · respuestas 429: %d\n", abandonadas, t429
}' "$OUT"
