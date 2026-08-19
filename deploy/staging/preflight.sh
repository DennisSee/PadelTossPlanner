#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../.." && pwd)
env_file=${1:-"$script_dir/.env"}
compose_file=${2:-"$script_dir/compose.yml"}

ok() {
  printf 'OK  %s\n' "$1"
}

warn() {
  printf 'WAARSCHUWING  %s\n' "$1" >&2
}

fail() {
  printf 'FOUT  %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Vereist commando ontbreekt: $1"
}

read_env_value() {
  local key=$1
  local line
  local value
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$env_file" | tail -n 1 || true)
  [[ -n "$line" ]] || return 1
  value=${line#*=}
  value=${value%$'\r'}
  value=$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
    value=${value:1:${#value}-2}
  fi
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

service_has_property() {
  local service=$1
  local property=$2
  printf '%s\n' "$compose_config" | awk -v service="$service" -v property="$property" '
    /^services:$/ { in_services=1; next }
    in_services && /^[^ ]/ { in_services=0; in_service=0 }
    in_services && $0 == "  " service ":" { in_service=1; next }
    in_service && /^  [[:alnum:]_.-]+:$/ { in_service=0 }
    in_service && $0 == "    " property ":" { found=1 }
    END { exit(found ? 0 : 1) }
  '
}

service_has_network() {
  local service=$1
  local network=$2
  printf '%s\n' "$compose_config" | awk -v service="$service" -v network="$network" '
    /^services:$/ { in_services=1; next }
    in_services && /^[^ ]/ { in_services=0; in_service=0 }
    in_services && $0 == "  " service ":" { in_service=1; next }
    in_service && /^  [[:alnum:]_.-]+:$/ { in_service=0 }
    in_service && $0 == "    networks:" { in_networks=1; next }
    in_networks && /^    [^ ]/ { in_networks=0 }
    in_networks && $0 ~ "^      " network ":" { found=1 }
    END { exit(found ? 0 : 1) }
  '
}

network_is_internal() {
  local network=$1
  printf '%s\n' "$compose_config" | awk -v network="$network" '
    /^networks:$/ { in_network_roots=1; next }
    in_network_roots && /^[^ ]/ { in_network_roots=0; in_network=0 }
    in_network_roots && $0 == "  " network ":" { in_network=1; next }
    in_network && /^  [[:alnum:]_.-]+:$/ { in_network=0 }
    in_network && $0 == "    internal: true" { found=1 }
    END { exit(found ? 0 : 1) }
  '
}

for command_name in docker curl openssl git grep sed awk free df ss; do
  require_command "$command_name"
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose-plugin ontbreekt."
ok "Vereiste lokale commando's zijn beschikbaar."

[[ -f "$env_file" ]] || fail "Staging .env ontbreekt."
for variable_name in APP_ENV SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
  read_env_value "$variable_name" >/dev/null || fail "Vereiste variabele ontbreekt of is leeg: $variable_name"
done
app_environment=$(read_env_value APP_ENV)
[[ "$app_environment" == "staging" ]] || fail "APP_ENV moet staging zijn."
if grep -Eqi '^[[:space:]]*(export[[:space:]]+)?SUPABASE_(SERVICE_ROLE|SECRET)_KEY[[:space:]]*=' "$env_file"; then
  fail "Een verboden Supabase service-/secret-keyvariabele staat in de staging-env."
fi
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY+x}" || -n "${SUPABASE_SECRET_KEY+x}" ]]; then
  fail "Een verboden Supabase service-/secret-keyvariabele staat in het proces."
fi
ok "Stagingvariabelen zijn aanwezig; waarden zijn niet getoond."

[[ -f "$compose_file" ]] || fail "Composebestand ontbreekt."
if ! compose_config=$(docker compose --env-file "$env_file" -f "$compose_file" config 2>/dev/null); then
  fail "docker compose config is mislukt."
fi
services=$(docker compose --env-file "$env_file" -f "$compose_file" config --services 2>/dev/null)
for expected_service in caddy web planner-api; do
  printf '%s\n' "$services" | grep -Fxq "$expected_service" || fail "Compose-service ontbreekt: $expected_service"
done
for service in $services; do
  if service_has_property "$service" ports && [[ "$service" != "caddy" ]]; then
    fail "Alleen Caddy mag hostpoorten publiceren; gevonden bij $service."
  fi
done
service_has_property caddy ports || fail "Caddy publiceert geen hostpoorten."
service_has_network caddy edge || fail "Caddy mist edge-netwerk."
service_has_network caddy application || fail "Caddy mist application-netwerk."
service_has_network web application || fail "Web mist application-netwerk."
service_has_network web web-egress || fail "Web mist web-egress-netwerk."
service_has_network planner-api application || fail "Planner-API mist application-netwerk."
if service_has_network planner-api web-egress; then
  fail "Planner-API mag geen web-egress hebben."
fi
network_is_internal application || fail "Application-netwerk is niet intern."
if network_is_internal edge || network_is_internal web-egress; then
  fail "Edge en web-egress moeten niet-interne egressnetwerken blijven."
fi
ok "Compose-topologie is read-only gevalideerd."

printf '\nGeheugen:\n'
free -h
printf '\nSwap:\n'
if command -v swapon >/dev/null 2>&1 && [[ -n "$(swapon --noheadings --show 2>/dev/null || true)" ]]; then
  swapon --show
else
  warn "Geen actieve swap gevonden; 2 GiB swap is sterk aanbevolen vóór lokale builds."
fi
printf '\nVrije schijfruimte:\n'
df -h /
printf '\nBestaande listeners op 80/443:\n'
ss -ltn '( sport = :80 or sport = :443 )' || true
printf '\nGit-commit:\n'
git -C "$repo_root" rev-parse --verify --short=12 HEAD

ok "Preflight is voltooid; niets is gestart, gestopt, gebouwd of gewijzigd."
