import { InternalServerErrorException } from '@nestjs/common';

// Inyección de fallos de Inventario (Lab 5).
// El estado arranca desde FAULT_DELAY_MS / RECOVERY_TIME_MS y se puede cambiar
// en caliente con POST /inventory/chaos (ver chaos.controller.ts).

export type FaultMode = 'off' | 'latency' | 'error';

export interface FaultState {
  mode: FaultMode;
  delayMs: number;
  errorRate: number;
  // Instante (epoch ms) en que el fallo se retira solo; null = hasta que se apague.
  until: number | null;
}

function parseEnvMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function initialState(): FaultState {
  const delayMs = parseEnvMs(process.env.FAULT_DELAY_MS);
  const recoveryMs = parseEnvMs(process.env.RECOVERY_TIME_MS);
  if (delayMs <= 0) {
    return { mode: 'off', delayMs: 0, errorRate: 0, until: null };
  }
  return {
    mode: 'latency',
    delayMs,
    errorRate: 0,
    until: recoveryMs > 0 ? Date.now() + recoveryMs : null,
  };
}

let state: FaultState = initialState();
let injectedAt: number | null = state.mode === 'off' ? null : Date.now();
// Llamadas recibidas en GET /inventory/items/disponibilidad (incluye los reintentos del
// sidecar). Sirve para calcular el factor de amplificación del ASR-2. Es acumulado desde
// que arrancó la tarea: lea el valor antes y después de cada experimento.
let llamadasDisponibilidad = 0;

export function setFault(next: {
  mode: FaultMode;
  delayMs?: number;
  errorRate?: number;
  durationMs?: number;
}): void {
  if (next.mode === 'off') {
    state = { mode: 'off', delayMs: 0, errorRate: 0, until: null };
    injectedAt = null;
    return;
  }
  state = {
    mode: next.mode,
    delayMs: next.mode === 'latency' ? (next.delayMs ?? 5000) : 0,
    errorRate: next.mode === 'error' ? (next.errorRate ?? 1) : 0,
    until:
      next.durationMs && next.durationMs > 0
        ? Date.now() + next.durationMs
        : null,
  };
  injectedAt = Date.now();
}

export function isFaulting(): boolean {
  if (state.mode === 'off') {
    return false;
  }
  return state.until === null || Date.now() < state.until;
}

export function getFault() {
  const active = isFaulting();
  return {
    ...state,
    active,
    llamadasDisponibilidad,
    injectedAt: injectedAt ? new Date(injectedAt).toISOString() : null,
    until: state.until ? new Date(state.until).toISOString() : null,
    now: new Date().toISOString(),
  };
}

export async function applyFault(): Promise<void> {
  llamadasDisponibilidad += 1;
  if (!isFaulting()) {
    return;
  }

  if (state.mode === 'latency') {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, state.delayMs);
    });
    return;
  }

  if (Math.random() < state.errorRate) {
    throw new InternalServerErrorException('Fallo inyectado (chaos)');
  }
}
