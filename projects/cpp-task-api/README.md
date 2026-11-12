# Server Maintenance Board

I built this local board for the server chores that are easy to forget: checking backups, applying patches, renewing certificates, and reviewing services. Add a due date and priority, then mark each task done. My portfolio has a live board for managing the list.

The backend is C++17 and uses the standard library and operating-system sockets. There are no extra packages or database to install. Tasks are saved in `tasks.db` in the folder where you start the server, so they're still there after a restart.

## Build

You'll need CMake and a C++17 compiler. From this folder, run:

```bash
cmake -S . -B build
cmake --build build --config Release
```

## Run

On Windows, start the API from PowerShell:

```powershell
.\build\Release\task-api-server.exe
```

On Linux or macOS:

```bash
./build/task-api-server
```

The API listens at `127.0.0.1:8080`. Leave it running, then open Server Maintenance Board in my portfolio. The built-in browser allowlist covers local portfolio addresses on ports `3000`, `3001`, and `3030`.

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

The server creates the parent folder if needed. Stop the server before backing up the data file. If it finds a damaged or unreadable file, it tells you and stops instead of quietly starting with an empty list.

## Use the API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check API availability |
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create a maintenance task |
| `PATCH` | `/api/tasks/{id}` | Change task completion |
| `DELETE` | `/api/tasks/{id}` | Remove a task |

Add a task with a title, optional due date, and priority:

```bash
curl http://127.0.0.1:8080/health
curl -X POST http://127.0.0.1:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Verify nightly backup restore","dueDate":"2026-10-15","priority":"high"}'
curl http://127.0.0.1:8080/api/tasks
```

You can leave `dueDate` blank or omit it. Dates use `YYYY-MM-DD` and must be real calendar dates. Priorities are `low`, `normal`, or `high`; the default is `normal`. Titles are trimmed, limited to 160 bytes, and can't contain control characters. The board holds up to 200 tasks.

Complete and remove a task:

```bash
curl -X PATCH http://127.0.0.1:8080/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
curl -X DELETE http://127.0.0.1:8080/api/tasks/1
```

After a change, the API writes a temporary file and then replaces `tasks.db`. If saving fails, it reports the problem and keeps the current list unchanged.

## Local-only behavior

The server only listens on this computer and checks the `Host` header and browser `Origin`. To allow another local app, add its exact address:

```bash
./build/task-api-server --cors-origin http://localhost:4567
```

These checks aren't a login system. Don't expose the API through a public network or proxy. The task file is plain text, so keep it somewhere with the right file permissions. If you host the portfolio over HTTPS, you'll need a trusted HTTPS proxy for the local API.
