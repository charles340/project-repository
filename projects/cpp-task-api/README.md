# Server Maintenance Board

A small, local maintenance planner for the recurring work that keeps a server dependable: verifying backups, applying patches, renewing certificates, and reviewing service health. Each task has a priority, an optional due date, and a completion state. The portfolio includes a live React board for adding, filtering, completing, and removing tasks.

The API is written in C++17 and uses the standard library plus operating-system sockets. It does not need a database server or third-party packages. Tasks are stored in `tasks.db` beside the directory from which the server is launched, and survive server restarts.

## Build

Install CMake and a C++17 compiler, then run these commands from this project directory:

```bash
cmake -S . -B build
cmake --build build --config Release
```

## Run

On Windows, start the API from this project directory in PowerShell:

```powershell
.\build\Release\task-api-server.exe
```

On Linux or macOS:

```bash
./build/task-api-server
```

The API listens on `127.0.0.1:8080`. Open the Server Maintenance Board project in the portfolio while the API is running. The built-in CORS allowlist includes portfolio origins on ports `3000`, `3001`, and `3030` using either `localhost` or `127.0.0.1`.

Options:

```text
--port PORT             Change the local API port (default 8080)
--data-file PATH        Choose where the task data is stored (default tasks.db)
--cors-origin ORIGIN    Allow an additional exact browser origin; repeatable
--help                  Show options
```

For example, to keep the data file in a dedicated directory:

```bash
./build/task-api-server --data-file ./data/server-maintenance.db
```

The parent directory is created if needed. Back up the data file with the server stopped. If the file exists but cannot be read or contains invalid data, the server reports an error and exits rather than silently starting with an empty board.

## Use the API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check API availability |
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create a maintenance task |
| `PATCH` | `/api/tasks/{id}` | Change task completion |
| `DELETE` | `/api/tasks/{id}` | Remove a task |

Create a task with a title, optional ISO due date, and one of three priorities:

```bash
curl http://127.0.0.1:8080/health
curl -X POST http://127.0.0.1:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Verify nightly backup restore","dueDate":"2026-10-15","priority":"high"}'
curl http://127.0.0.1:8080/api/tasks
```

`dueDate` may be an empty string or omitted. Non-empty dates must be real `YYYY-MM-DD` dates. `priority` may be `low`, `normal`, or `high`; it defaults to `normal`. Titles are trimmed, limited to 1–160 bytes, and cannot contain control characters. The board supports up to 200 tasks.

Complete and remove a task:

```bash
curl -X PATCH http://127.0.0.1:8080/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
curl -X DELETE http://127.0.0.1:8080/api/tasks/1
```

Successful changes are written to a temporary file and then replace `tasks.db`, so an incomplete write does not leave a partially written task list. If saving fails, the API reports an error and keeps the in-memory task list unchanged.

## Local-only behavior

The server binds only to the loopback interface and checks the `Host` header and browser `Origin`. Add only exact origins you control, for example:

```bash
./build/task-api-server --cors-origin http://localhost:4567
```

These checks are not user authentication. Do not bind the API to a public interface or expose it through a network proxy. The task file is plain local data and should be protected using normal operating-system file permissions. The portfolio's browser demo uses HTTP, so an HTTPS-hosted portfolio needs a trusted HTTPS proxy to avoid mixed-content browser blocks.
