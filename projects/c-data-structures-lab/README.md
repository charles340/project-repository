# C Data Structures Lab

I made this little lab so I can try three common data structures and see what happens under the hood. Add or remove values, watch the layout change, and check how much memory the C server is using.

The browser UI talks to a small C17 server. It uses arrays for the stack and circular queue, and `malloc`/`free` for the linked list. You can build it with CMake; there are no extra libraries to install.

## What to try

| Structure | Operations | What to notice |
| --- | --- | --- |
| Stack | Push, pop, peek | Last in, first out; both updates take constant time. |
| Queue | Enqueue, dequeue, inspect front | First in, first out; a circular buffer reuses slots with modulo arithmetic. |
| Linked list | Append, find, remove first match | Nodes point to the next node; removal frees the node's allocated memory. |

Each structure holds up to 16 values. Values can be 1-24 printable ASCII characters. The lab shows the item count, a storage estimate, and the most items you've had at once. For the linked list, it also counts how many nodes were allocated and freed. Reset a structure whenever you want a clean start.

## Build the C server

You'll need CMake and a C17 compiler. From this folder, run:

```bash
cmake -S . -B build
cmake --build build --config Release
```

On Windows, start the server from PowerShell:

```powershell
.\build\Release\c-data-structures-lab.exe
```

On Linux or macOS:

```bash
./build/c-data-structures-lab
```

By default, the server listens at `127.0.0.1:8091`. Leave it running while you use the UI.
Idle client connections time out after five seconds, so an unused browser connection won't block the next request.

## Open the UI

Start the C server, then open **C Data Structures Lab** in my portfolio to use the in-app playground. The **Open project in a new tab** link loads the standalone HTML, CSS, and JavaScript version.

To run it outside the portfolio, open a second terminal in this folder and start a small static file server:

```powershell
py -m http.server 3000
```

```bash
python3 -m http.server 3000
```

Then visit `http://localhost:3000`. The C server already allows this local address. Don't open `index.html` directly as a `file://` URL; browsers block its API requests.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check whether the C server is running |
| `GET` | `/api/state?structure=stack` | Read a structure's current state |
| `POST` | `/api/action` | Apply an operation and return the updated state |

Example:

```bash
curl http://127.0.0.1:8091/api/state?structure=stack
curl -X POST http://127.0.0.1:8091/api/action \
  -H "Content-Type: application/json" \
  -d '{"structure":"stack","action":"push","value":"backup"}'
```

Use `stack`, `queue`, or `linked-list` as the structure name. Each action needs a `structure` and `action`; adding values, or finding and removing list items, also needs a `value`. If an operation can't run, the API returns a short error message.

## A few C ideas in the code

- The stack uses a fixed-size array and checks its limits.
- The queue wraps around and reuses slots with modulo arithmetic.
- The linked list connects nodes with pointers and frees them when they're removed.
- `struct` and `enum` keep the data and operations organized.
- The server reads small HTTP requests, escapes JSON strings, and reports errors.
- CMake builds the same C17 project on Windows, Linux, and macOS.

The server only listens on your computer and accepts browser requests from a short list of local addresses. That's not a login system, so don't expose it to the internet. Everything stays in memory; restarting the server clears the lab. This is a learning project, not a production web server.
