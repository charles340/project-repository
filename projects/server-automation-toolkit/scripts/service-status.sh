#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: bash scripts/service-status.sh SERVICE\n' >&2
  exit 2
fi

service="$1"
if [[ ! "$service" =~ ^[[:alnum:]_][[:alnum:]_.@-]*$ ]]; then
  printf 'Invalid service name: %s\n' "$service" >&2
  exit 2
fi

if ! command -v systemctl >/dev/null 2>&1; then
  printf 'systemctl is not available on this system.\n' >&2
  exit 2
fi

if systemctl is-active --quiet "$service"; then
  printf '%s is active.\n' "$service"
else
  printf '%s is not active.\n' "$service"
  exit 1
fi
