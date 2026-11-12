#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  printf 'Usage: bash scripts/backup-directory.sh SOURCE_DIR BACKUP_DIR [--dry-run|--execute]\n' >&2
  exit 2
fi

source_input="$1"
backup_input="$2"
mode="${3:---dry-run}"

if [[ "$mode" != "--dry-run" && "$mode" != "--execute" ]]; then
  printf 'Choose --dry-run or --execute.\n' >&2
  exit 2
fi

if [[ ! -d "$source_input" ]]; then
  printf 'Source directory does not exist: %s\n' "$source_input" >&2
  exit 1
fi

if ! command -v realpath >/dev/null 2>&1; then
  printf 'realpath is required on this system.\n' >&2
  exit 2
fi

source_dir="$(cd -- "$source_input" && pwd -P)"
backup_dir="$(realpath -m -- "$backup_input")"

if [[ "$source_dir" == "/" ]]; then
  printf 'Backing up the filesystem root is not supported.\n' >&2
  exit 2
fi

if [[ "$backup_dir" == "$source_dir" || "$backup_dir" == "$source_dir/"* ]]; then
  printf 'The backup directory must be outside the source directory.\n' >&2
  exit 2
fi

source_name="$(basename -- "$source_dir")"
archive_name="${source_name}_$(date '+%Y%m%d-%H%M%S')_$$.tar.gz"
archive_path="${backup_dir%/}/$archive_name"

if [[ "$mode" == "--dry-run" ]]; then
  printf 'Dry run: would archive %s\n' "$source_dir"
  printf 'Destination: %s\n' "$archive_path"
  printf 'Pass --execute to create and verify the archive.\n'
  exit 0
fi

if [[ -e "$archive_path" ]]; then
  printf 'Refusing to overwrite an existing archive: %s\n' "$archive_path" >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
temporary_archive="$(mktemp "${backup_dir%/}/.backup.XXXXXX")"
trap 'rm -f -- "$temporary_archive"' EXIT

tar -czf "$temporary_archive" -C "$(dirname -- "$source_dir")" "$source_name"
tar -tzf "$temporary_archive" >/dev/null
mv -- "$temporary_archive" "$archive_path"
trap - EXIT

printf 'Verified backup created: %s\n' "$archive_path"
