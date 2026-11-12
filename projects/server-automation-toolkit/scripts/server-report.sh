#!/usr/bin/env bash
set -euo pipefail

printf 'Server report\n'
printf 'Generated: %s\n' "$(date '+%Y-%m-%d %H:%M %z')"
printf 'Host: %s\n' "$(hostname)"
printf 'System: %s\n' "$(uname -srmo)"
printf '\nUptime\n'
uptime

printf '\nDisk usage\n'
df -h

if command -v free >/dev/null 2>&1; then
  printf '\nMemory usage\n'
  free -h
fi

printf '\nTop processes by CPU\n'
ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 6
