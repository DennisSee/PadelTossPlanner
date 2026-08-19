#!/usr/bin/env bash
set -euo pipefail

ok() {
  printf 'OK  %s\n' "$1"
}

fail() {
  printf 'FOUT  %s\n' "$1" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail "Gebruik: ./smoke-test.sh https://test-tos.oddbounce.nl"
base_url=${1%/}
if [[ ! "$base_url" =~ ^https://([A-Za-z0-9.-]+)(:([0-9]{1,5}))?$ ]]; then
  fail "Geef een HTTPS-base-URL zonder pad, query of credentials op."
fi
host=${BASH_REMATCH[1]}
port=${BASH_REMATCH[3]:-443}

for command_name in curl openssl grep tr; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Vereist commando ontbreekt: $command_name"
done

if ! openssl s_client \
  -connect "$host:$port" \
  -servername "$host" \
  -verify_hostname "$host" \
  -verify_return_error \
  </dev/null >/dev/null 2>&1; then
  fail "TLS-certificaat of hostnamevalidatie is mislukt."
fi
ok "TLS-certificaat en hostname zijn normaal gevalideerd."

response_body=''
request_path() {
  local path=$1
  local raw_response
  local response_status
  if ! raw_response=$(curl \
    --fail-with-body \
    --silent \
    --show-error \
    --location \
    --max-time 20 \
    --write-out $'\n%{http_code}' \
    "$base_url$path"); then
    fail "HTTP-controle is mislukt voor $path."
  fi
  response_status=${raw_response##*$'\n'}
  response_body=${raw_response%$'\n'*}
  [[ "$response_status" == "200" ]] || fail "$path retourneerde geen HTTP 200."
}

assert_no_sensitive_output() {
  if printf '%s' "$response_body" | grep -Eqi \
    'service[_ -]?role|secret[_ -]?key|players_private|schedule_private|statistics_private|diagnostics'; then
    fail "Response voor $1 bevat een verboden private marker."
  fi
}

request_path "/"
assert_no_sensitive_output "/"
printf '%s' "$response_body" | grep -Fq "T.C. Zuid TOS" || fail "Homepage mist de T.C. Zuid-marker."
ok "Homepage retourneert veilig HTTP 200."

request_path "/live"
assert_no_sensitive_output "/live"
if printf '%s' "$response_body" | grep -Eqi \
  'Traceback \(most recent call last\)|Unhandled Runtime Error|Internal Server Error|stack[ -]?trace'; then
  fail "Livepagina bevat een raw fout- of stacktracemarker."
fi
ok "Livepagina rendert veilig; een lege gepubliceerde toestand is toegestaan."

request_path "/api/health"
assert_no_sensitive_output "/api/health"
compact_body=$(printf '%s' "$response_body" | tr -d '[:space:]')
[[ "$compact_body" == '{"status":"ok","service":"web"}' ]] || fail "Web-healthcontract wijkt af."
ok "Web-healthcontract is exact geldig."

request_path "/api/planner/health"
assert_no_sensitive_output "/api/planner/health"
compact_body=$(printf '%s' "$response_body" | tr -d '[:space:]')
[[ "$compact_body" == '{"status":"ok","service":"planner-api"}' ]] || fail "Planner-healthcontract wijkt af."
ok "Planner-healthcontract is exact geldig."

ok "Smoke-test is voltooid; geen volledige HTML of configuratie is getoond."
