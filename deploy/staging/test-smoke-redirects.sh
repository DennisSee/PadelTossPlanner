#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
validator="$script_dir/validate-smoke-redirect.py"
base_url="https://test-tos.oddbounce.nl"

command -v python3 >/dev/null 2>&1 || {
  printf 'FOUT  python3 ontbreekt.\n' >&2
  exit 1
}

run_fixture() {
  local name=$1
  local expected_result=$2
  local location=$3
  local expected_path=$4
  local actual_result="reject"
  local validator_output

  if validator_output=$(printf '%s' "$location" | python3 "$validator" "$base_url" "$expected_path" 2>&1); then
    actual_result="accept"
  fi
  if [[ -n "$validator_output" ]]; then
    printf 'FOUT  Redirectvalidator schreef onverwachte uitvoer voor fixture: %s\n' "$name" >&2
    exit 1
  fi
  if [[ "$actual_result" != "$expected_result" ]]; then
    printf 'FOUT  Redirectfixture faalde: %s\n' "$name" >&2
    exit 1
  fi
}

run_fixture "ongecodeerd relatief" "accept" "/login?next=/account" "/account"
run_fixture "gecodeerd relatief" "accept" "/login?next=%2Faccount" "/account"
run_fixture "gecodeerd TOS-pad" "accept" "/login?next=%2Ftos" "/tos"
run_fixture "gecodeerd beheerpad" "accept" "/login?next=%2Fbeheer" "/beheer"
run_fixture "absoluut same-origin" "accept" \
  "https://test-tos.oddbounce.nl/login?next=%2Faccount" "/account"
run_fixture "externe origin" "reject" \
  "https://evil.example/login?next=%2Faccount" "/account"
run_fixture "protocol-relative origin" "reject" \
  "//evil.example/login?next=%2Faccount" "/account"
run_fixture "absolute externe next" "reject" \
  "/login?next=https%3A%2F%2Fevil.example" "/account"
run_fixture "gecodeerde externe bypass" "reject" \
  "/login?next=%2F%2Fevil.example" "/account"
run_fixture "verkeerde protected bestemming" "reject" \
  "/login?next=%2Ftos" "/account"
run_fixture "token in Location" "reject" \
  "/login?next=%2Faccount&access_token=fixture" "/account"
run_fixture "refresh-token in Location" "reject" \
  "/login?next=%2Faccount&refresh_token=fixture" "/account"
run_fixture "OTP in Location" "reject" \
  "/login?next=%2Faccount&otp=fixture" "/account"
run_fixture "credentials in absolute URL" "reject" \
  "https://fixture:fixture@test-tos.oddbounce.nl/login?next=%2Faccount" "/account"

printf 'OK  Alle veilige en onveilige redirectfixtures zijn correct beoordeeld.\n'
