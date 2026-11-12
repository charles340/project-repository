# C Data Structures Lab

I built this interactive lab to make three core C data structures easier to understand by using them. Add and remove values, watch the structure change, and see how the implementation uses memory.

The browser UI talks to a small C17 HTTP server. The server uses fixed arrays for a stack and circular queue, and `malloc`/`free` for a singly linked list. The code uses only the C standard library and operating-system sockets; no database or third-party runtime is needed.

## What to try

| Structure | Operations | What to notice |
| --- | --- | --- |
| Stack | Push, pop, peek | Last in, first out; both updates take constant time. |
| Queue | Enqueue, dequeue, inspect front | First in, first out; a circular buffer reuses slots with modulo arithmetic. |
| Linked list | Append, find, remove first match | Nodes point to the next node; removal frees the node's allocated memory. |

Each structure holds up to 16 values. Values may contain 1–24 printable ASCII characters. The lab displays the current item count, storage estimate, and high-water mark. For the linked list it also tracks cumulative node allocations and frees. Reset the selected structure to start over.

## Build the C server

Install CMake and a C17 compiler. Run these commands from this project directory:

```bash
cmake -S . -B build
cmake --build build --config Release
```

On Windows, run the server in PowerShell:

```powershell
.\build\Release\c-data-structures-lab.exe
```

On Linux or macOS:

```bash
./build/c-data-structures-lab
```

The API listens on `127.0.0.1:8091` by default. Keep it running while using the UI.

## Open the UI

In the portfolio, open **C Data Structures Lab** after starting the C server. The portfolio serves the included `index.html`, CSS, and JavaScript for the project.

To run this repository on its own, start a static file server in a second terminal from this project directory:

```powershell
py -m http.server 3000
```

```bash
python3 -m http.server 3000
```

Then open `http://localhost:3000`. The API allows this local origin by default. Opening `index.html` directly as a `file://` URL is not supported because browsers restrict requests from local files.

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

Supported structure names are `stack`, `queue`, and `linked-list`. Every action requires `structure` and `action`; add and linked-list search/remove actions also require `value`. Invalid operations, empty reads, and full structures return a readable JSON error.

## What the C code demonstrates

- Fixed-size arrays and bounds checks for the stack
- A circular queue that advances its head and tail with modulo arithmetic
- A singly linked list with head and tail pointers
- Dynamic node allocation, removal, reset, and `free`
- `struct` and `enum` to organize state and operations
- Bounded HTTP request parsing, JSON string escaping, and explicit error responses
- CMake-based C17 builds on Windows, Linux, and macOS

The server binds only to loopback and accepts browser requests only from its exact local-origin allowlist. These checks are not authentication; do not expose the server on a public interface. The lab keeps its structures in memory, so restarting the C server resets them. This is a learning project, not a production HTTP server.
