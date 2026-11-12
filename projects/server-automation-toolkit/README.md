# Server Automation Toolkit

Small Bash utilities for routine Linux checks and safer directory backups. The report and service-status scripts are read-only. Backups are dry-run by default, verified after creation, and never cleaned up automatically.

## Requirements

- Bash
- Linux utilities: `date`, `hostname`, `uname`, `uptime`, `df`, `ps`, and `head`
- `systemctl` for the service-status check
- `realpath`, `tar`, and `mktemp` for backups
- A writable backup destination with enough free space

The memory section in the server report uses `free` when it is available and skips it otherwise.

## Run the scripts

Run commands from this project directory.

### Server report

```bash
bash scripts/server-report.sh
```

Prints the host name, operating system, uptime, disk usage, available memory information, and the top processes by CPU use. It does not change server state.

### Service status

```bash
bash scripts/service-status.sh nginx
```

Pass one systemd service name. The script checks whether it is active and does not start, stop, or restart it. It exits with status `0` when the service is active and `1` when it is inactive. Invalid arguments or a missing `systemctl` return status `2`.

### Directory backup

Start with a preview:

```bash
bash scripts/backup-directory.sh /var/www /backup
```

The default `--dry-run` mode prints the planned archive path without creating it. To create and verify the archive, opt in explicitly:

```bash
bash scripts/backup-directory.sh /var/www /backup --execute
```

The source must exist, the backup destination must be outside the source directory, and an existing archive is never overwritten. The script verifies the temporary archive before moving it into the destination. It does not remove older backups.

## Before using backups

Choose source and destination paths carefully, confirm the destination has enough free space, and protect the resulting archive: it contains a copy of the source data. Test a restore procedure before relying on an archive for recovery. The script does not encrypt archives or configure off-site storage.

## Existing project

This toolkit is connected to [charles340/server-automation](https://github.com/charles340/server-automation). The original [process monitor](https://github.com/charles340/server-automation/blob/main/bash/monitoring/process-monitor.sh) and [backup system](https://github.com/charles340/server-automation/blob/main/bash/advanced/backup-system.sh) are linked for reference. Review any existing script before running it on a server.
