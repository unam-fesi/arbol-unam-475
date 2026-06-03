#!/usr/bin/env bash
# ============================================================================
# deploy-edge-functions.sh
# ----------------------------------------------------------------------------
# Redeploya las Edge Functions de Supabase que fueron endurecidas el 1-jun-2026
# (security hardening: CORS whitelist, status codes correctos, SSRF blocks,
# códigos HTTP semánticos, validación de complejidad de password).
#
# Las funciones se leen de supabase/functions/<nombre>/index.ts (relativo a
# este repo). Asume que ya hiciste backup de las versiones desplegadas
# (con `supabase functions download` previo).
#
# Requisitos:
#   - supabase CLI instalado y autenticado (corré `supabase login` una vez)
#   - variable PROJECT_REF exportada (ej: export PROJECT_REF=hambscfdiaymowskislw)
#
# Uso:
#   export PROJECT_REF=hambscfdiaymowskislw
#   ./scripts/deploy-edge-functions.sh             # interactivo, pide confirmación
#   ./scripts/deploy-edge-functions.sh --yes       # sin confirmación
#   ./scripts/deploy-edge-functions.sh --only create-user update-user
#                                                  # solo esas dos
# ============================================================================

set -o pipefail
# Nota: no usamos `set -u` porque bash 3.2 (default en macOS) rompe al
# expandir arrays vacíos como "${arr[@]}" con set -u.

# ---- Colores para output ----
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'; C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""; C_OFF=""
fi

log()    { echo "${C_BLUE}▶${C_OFF} $*"; }
ok()     { echo "${C_GREEN}✓${C_OFF} $*"; }
warn()   { echo "${C_YELLOW}⚠${C_OFF} $*"; }
err()    { echo "${C_RED}✗${C_OFF} $*"; }
section(){ echo; echo "${C_BOLD}─── $* ───${C_OFF}"; }

# ---- Lista de funciones a redeployar (orden por prioridad) ----
ALL_FUNCTIONS=(
  # 🔴 Críticas (sin auth o con CORS *)
  "pum-ai-analyze"
  "backup-export"
  "weather-sync"
  # 🟠 Altas (IP en description, fallback admin, CORS *)
  "submit-public-report"
  "send-telegram-notification"
  # 🟡 Medias (códigos HTTP semánticos, complejidad password, logs)
  "create-user"
  "update-user"
  "delete-user"
  "get-user-email"
  "pum-ai"
)

# ---- Funciones que NO verifican JWT (son públicas) ----
# submit-public-report es la única — el QR ciudadano se escanea sin login.
NO_JWT_FUNCTIONS=("submit-public-report")

# ---- Parseo de args ----
YES=0
ONLY=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)  YES=1; shift ;;
    --only)    shift; while [[ $# -gt 0 && "$1" != --* ]]; do ONLY+=("$1"); shift; done ;;
    -h|--help)
      sed -n '3,28p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) err "Argumento desconocido: $1"; exit 1 ;;
  esac
done

if [[ ${#ONLY[@]} -gt 0 ]]; then
  FUNCTIONS=("${ONLY[@]}")
else
  FUNCTIONS=("${ALL_FUNCTIONS[@]}")
fi

# ---- Validaciones ----
section "Validando entorno"

if ! command -v supabase >/dev/null 2>&1; then
  err "supabase CLI no encontrado. Instalá con: brew install supabase/tap/supabase"
  exit 1
fi
ok "supabase CLI: $(supabase --version 2>&1 | head -1)"

if [[ -z "${PROJECT_REF:-}" ]]; then
  err "PROJECT_REF no está exportado."
  echo "  Exportalo así: export PROJECT_REF=hambscfdiaymowskislw"
  exit 1
fi
ok "PROJECT_REF: $PROJECT_REF"

# Encontrar la raíz del repo (donde está supabase/functions)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
ok "Repo root: $REPO_ROOT"

if [[ ! -d "supabase/functions" ]]; then
  err "No encontré supabase/functions/ en $REPO_ROOT"
  exit 1
fi

# Verificar que todas las funciones existen localmente
section "Verificando funciones a deployar"
MISSING=()
for fn in "${FUNCTIONS[@]}"; do
  if [[ -f "supabase/functions/$fn/index.ts" ]]; then
    mtime=$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "supabase/functions/$fn/index.ts" 2>/dev/null || echo "?")
    nojwt=""
    for nj in "${NO_JWT_FUNCTIONS[@]}"; do
      [[ "$fn" == "$nj" ]] && nojwt=" ${C_YELLOW}[no-verify-jwt]${C_OFF}"
    done
    echo "  ${C_GREEN}✓${C_OFF} $fn  (modificado: $mtime)$nojwt"
  else
    echo "  ${C_RED}✗${C_OFF} $fn  ← NO ENCONTRADO"
    MISSING+=("$fn")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  err "Faltan ${#MISSING[@]} función(es) locales. Abort."
  exit 1
fi

# ---- Confirmación ----
section "Confirmación"
echo "Vas a redeployar ${#FUNCTIONS[@]} función(es) al proyecto ${C_BOLD}$PROJECT_REF${C_OFF}."
echo "Las versiones desplegadas anteriores quedarán reemplazadas inmediatamente."
echo

if [[ $YES -ne 1 ]]; then
  read -r -p "¿Continuar? [y/N]: " ans
  if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
    warn "Cancelado por el usuario."
    exit 0
  fi
fi

# ---- Deploy ----
section "Deployando"
RESULTS_OK=()
RESULTS_FAIL=()

for fn in "${FUNCTIONS[@]}"; do
  echo
  log "$fn"

  # Determinar si esta función va sin JWT (pública)
  is_no_jwt=0
  for nj in "${NO_JWT_FUNCTIONS[@]}"; do
    if [[ "$fn" == "$nj" ]]; then
      is_no_jwt=1
    fi
  done

  if [[ $is_no_jwt -eq 1 ]]; then
    deploy_result=0
    supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt || deploy_result=$?
  else
    deploy_result=0
    supabase functions deploy "$fn" --project-ref "$PROJECT_REF" || deploy_result=$?
  fi

  if [[ $deploy_result -eq 0 ]]; then
    RESULTS_OK+=("$fn")
    ok "$fn deployada"
  else
    RESULTS_FAIL+=("$fn")
    err "$fn FALLÓ — continuando con las demás"
  fi
done

# ---- Resumen ----
section "Resumen"
echo "Total:     ${#FUNCTIONS[@]}"
echo "${C_GREEN}OK:        ${#RESULTS_OK[@]}${C_OFF}"
echo "${C_RED}Fallidas:  ${#RESULTS_FAIL[@]}${C_OFF}"

if [[ ${#RESULTS_OK[@]} -gt 0 ]]; then
  echo
  echo "${C_GREEN}Deployadas con éxito:${C_OFF}"
  for fn in "${RESULTS_OK[@]}"; do echo "  ✓ $fn"; done
fi

if [[ ${#RESULTS_FAIL[@]} -gt 0 ]]; then
  echo
  echo "${C_RED}Fallaron (revisar output arriba):${C_OFF}"
  for fn in "${RESULTS_FAIL[@]}"; do echo "  ✗ $fn"; done
  exit 1
fi

echo
ok "Todo OK. Recomendado: verificá manualmente en el Dashboard que:"
echo "    1. submit-public-report tenga 'Verify JWT' = OFF"
echo "    2. Las demás tengan 'Verify JWT' = ON"
echo "    3. Los secrets (GEMINI_API_KEY, OPENWEATHER_API_KEY, etc.) siguen presentes"
echo "    4. Si configuraste tokens internos (BACKUP_INTERNAL_TOKEN, WEATHER_INTERNAL_TOKEN),"
echo "       agregalos en Dashboard → Edge Functions → Manage secrets"
