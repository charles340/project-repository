#define _CRT_SECURE_NO_WARNINGS

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
typedef SOCKET Socket;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int Socket;
#endif

#define MAX_HEADER_BYTES 8192
#define MAX_BODY_BYTES 2048
#define MAX_RESPONSE_BYTES 8192
#define MAX_ITEMS 16
#define VALUE_BYTES 25
#define MAX_ORIGINS 8
#define ORIGIN_BYTES 128

typedef enum {
  STRUCTURE_STACK,
  STRUCTURE_QUEUE,
  STRUCTURE_LINKED_LIST
} StructureKind;

typedef struct {
  char values[MAX_ITEMS][VALUE_BYTES];
  size_t count;
  size_t high_water_mark;
} Stack;

typedef struct {
  char values[MAX_ITEMS][VALUE_BYTES];
  size_t head;
  size_t count;
  size_t high_water_mark;
} Queue;

typedef struct ListNode {
  char value[VALUE_BYTES];
  struct ListNode* next;
} ListNode;

typedef struct {
  ListNode* head;
  ListNode* tail;
  size_t count;
  size_t allocations;
  size_t frees;
  size_t high_water_mark;
} LinkedList;

typedef struct {
  Stack stack;
  Queue queue;
  LinkedList linked_list;
} LabState;

typedef struct {
  char method[16];
  char target[256];
  char host[ORIGIN_BYTES];
  char origin[ORIGIN_BYTES];
  char body[MAX_BODY_BYTES + 1];
} HttpRequest;

typedef struct {
  char structure[24];
  char action[24];
  char value[VALUE_BYTES];
  bool has_value;
} ActionRequest;

typedef struct {
  char* data;
  size_t capacity;
  size_t length;
  bool failed;
} StringBuilder;

typedef struct {
  int status;
  char body[MAX_RESPONSE_BYTES];
} HttpResponse;

static void close_socket(Socket socket_value) {
#ifdef _WIN32
  closesocket(socket_value);
#else
  close(socket_value);
#endif
}

static bool copy_text(char* destination, size_t capacity, const char* source) {
  const size_t length = strlen(source);
  if (length >= capacity) {
    return false;
  }
  memcpy(destination, source, length + 1);
  return true;
}

static bool copy_trimmed(char* destination, size_t capacity, const char* source,
                         size_t length) {
  while (length > 0 && isspace((unsigned char)*source)) {
    ++source;
    --length;
  }
  while (length > 0 && isspace((unsigned char)source[length - 1])) {
    --length;
  }
  if (length >= capacity) {
    return false;
  }
  memcpy(destination, source, length);
  destination[length] = '\0';
  return true;
}

static bool equals_ignore_case(const char* left, const char* right) {
  while (*left != '\0' && *right != '\0') {
    if (tolower((unsigned char)*left) != tolower((unsigned char)*right)) {
      return false;
    }
    ++left;
    ++right;
  }
  return *left == '\0' && *right == '\0';
}

static bool parse_content_length(const char* value, size_t* content_length) {
  char* end = NULL;
  errno = 0;
  const unsigned long parsed = strtoul(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0' ||
      parsed > MAX_BODY_BYTES) {
    return false;
  }
  *content_length = (size_t)parsed;
  return true;
}

static bool parse_request_head(char* head, HttpRequest* request,
                               size_t* content_length) {
  char* line_end = strstr(head, "\r\n");
  if (line_end == NULL) {
    return false;
  }
  *line_end = '\0';
  char version[16];
  if (sscanf(head, "%15s %255s %15s", request->method, request->target,
             version) != 3 ||
      (strcmp(version, "HTTP/1.0") != 0 &&
       strcmp(version, "HTTP/1.1") != 0) ||
      request->target[0] != '/') {
    return false;
  }

  bool has_content_length = false;
  bool has_host = false;
  bool has_origin = false;
  char* line = line_end + 2;
  while (*line != '\0') {
    char* end = strstr(line, "\r\n");
    char* next_line = NULL;
    if (end != NULL) {
      *end = '\0';
      next_line = end + 2;
    } else {
      end = line + strlen(line);
    }
    if (*line == '\0') {
      break;
    }

    char* separator = strchr(line, ':');
    if (separator == NULL) {
      return false;
    }
    *separator = '\0';
    for (char* name = line; *name != '\0'; ++name) {
      *name = (char)tolower((unsigned char)*name);
    }
    const char* value = separator + 1;
    if (strcmp(line, "transfer-encoding") == 0) {
      return false;
    }
    if (strcmp(line, "content-length") == 0) {
      if (has_content_length) {
        return false;
      }
      char content_length_text[32];
      if (!copy_trimmed(content_length_text, sizeof(content_length_text), value,
                        strlen(value)) ||
          !parse_content_length(content_length_text, content_length)) {
        return false;
      }
      has_content_length = true;
    } else if (strcmp(line, "host") == 0) {
      if (has_host ||
          !copy_trimmed(request->host, sizeof(request->host), value,
                        strlen(value))) {
        return false;
      }
      has_host = true;
    } else if (strcmp(line, "origin") == 0) {
      if (has_origin ||
          !copy_trimmed(request->origin, sizeof(request->origin), value,
                        strlen(value))) {
        return false;
      }
      has_origin = true;
    }

    if (next_line == NULL) {
      break;
    }
    line = next_line;
  }
  return true;
}

static bool receive_request(Socket client, HttpRequest* request) {
  char incoming[MAX_HEADER_BYTES + MAX_BODY_BYTES + 5];
  size_t length = 0;
  size_t header_bytes = 0;
  size_t content_length = 0;
  bool headers_parsed = false;
  incoming[0] = '\0';
  request->host[0] = '\0';
  request->origin[0] = '\0';

  for (;;) {
    if (!headers_parsed) {
      char* separator = strstr(incoming, "\r\n\r\n");
      if (separator != NULL) {
        const size_t header_length = (size_t)(separator - incoming);
        if (header_length > MAX_HEADER_BYTES) {
          return false;
        }
        char head[MAX_HEADER_BYTES + 1];
        memcpy(head, incoming, header_length);
        head[header_length] = '\0';
        if (!parse_request_head(head, request, &content_length)) {
          return false;
        }
        header_bytes = header_length + 4;
        headers_parsed = true;
      } else if (length > MAX_HEADER_BYTES) {
        return false;
      }
    }

    if (headers_parsed && length >= header_bytes + content_length) {
      const size_t body_length = content_length;
      if (memchr(incoming + header_bytes, '\0', body_length) != NULL) {
        return false;
      }
      memcpy(request->body, incoming + header_bytes, body_length);
      request->body[body_length] = '\0';
      return true;
    }

    if (length >= sizeof(incoming) - 1) {
      return false;
    }
    const int received =
        recv(client, incoming + length, (int)(sizeof(incoming) - 1 - length), 0);
    if (received <= 0) {
      return false;
    }
    length += (size_t)received;
    incoming[length] = '\0';
    if (length > MAX_HEADER_BYTES + MAX_BODY_BYTES + 4) {
      return false;
    }
  }
}

static void builder_append(StringBuilder* builder, const char* text) {
  if (builder->failed) {
    return;
  }
  const size_t length = strlen(text);
  if (length >= builder->capacity - builder->length) {
    builder->failed = true;
    return;
  }
  memcpy(builder->data + builder->length, text, length + 1);
  builder->length += length;
}

static void builder_append_format(StringBuilder* builder, const char* format,
                                  ...) {
  if (builder->failed) {
    return;
  }
  va_list arguments;
  va_start(arguments, format);
  const int written = vsnprintf(builder->data + builder->length,
                                builder->capacity - builder->length, format,
                                arguments);
  va_end(arguments);
  if (written < 0 || (size_t)written >= builder->capacity - builder->length) {
    builder->failed = true;
    return;
  }
  builder->length += (size_t)written;
}

static void builder_append_json_string(StringBuilder* builder,
                                       const char* value) {
  builder_append(builder, "\"");
  for (const unsigned char* character = (const unsigned char*)value;
       *character != '\0'; ++character) {
    char escaped[8];
    switch (*character) {
      case '"':
        builder_append(builder, "\\\"");
        break;
      case '\\':
        builder_append(builder, "\\\\");
        break;
      case '\b':
        builder_append(builder, "\\b");
        break;
      case '\f':
        builder_append(builder, "\\f");
        break;
      case '\n':
        builder_append(builder, "\\n");
        break;
      case '\r':
        builder_append(builder, "\\r");
        break;
      case '\t':
        builder_append(builder, "\\t");
        break;
      default:
        if (*character < 0x20) {
          (void)snprintf(escaped, sizeof(escaped), "\\u%04x", *character);
          builder_append(builder, escaped);
        } else {
          escaped[0] = (char)*character;
          escaped[1] = '\0';
          builder_append(builder, escaped);
        }
    }
  }
  builder_append(builder, "\"");
}

static void skip_json_whitespace(const char** cursor) {
  while (**cursor != '\0' && isspace((unsigned char)**cursor)) {
    ++(*cursor);
  }
}

static int hex_value(char character) {
  if (character >= '0' && character <= '9') {
    return character - '0';
  }
  if (character >= 'a' && character <= 'f') {
    return character - 'a' + 10;
  }
  if (character >= 'A' && character <= 'F') {
    return character - 'A' + 10;
  }
  return -1;
}

static bool parse_json_string(const char** cursor, char* output,
                              size_t output_capacity) {
  const char* current = *cursor;
  size_t length = 0;
  if (*current != '"') {
    return false;
  }
  ++current;
  while (*current != '\0' && *current != '"') {
    unsigned char character = (unsigned char)*current++;
    if (character == '\\') {
      character = (unsigned char)*current++;
      switch (character) {
        case '"':
        case '\\':
        case '/':
          break;
        case 'b':
          character = '\b';
          break;
        case 'f':
          character = '\f';
          break;
        case 'n':
          character = '\n';
          break;
        case 'r':
          character = '\r';
          break;
        case 't':
          character = '\t';
          break;
        case 'u': {
          int code_point = 0;
          for (int digit = 0; digit < 4; ++digit) {
            const int value = hex_value(*current++);
            if (value < 0) {
              return false;
            }
            code_point = (code_point << 4) | value;
          }
          if (code_point > 0x7f) {
            return false;
          }
          character = (unsigned char)code_point;
          break;
        }
        default:
          return false;
      }
    } else if (character < 0x20) {
      return false;
    }
    if (length + 1 >= output_capacity) {
      return false;
    }
    output[length++] = (char)character;
  }
  if (*current != '"') {
    return false;
  }
  output[length] = '\0';
  *cursor = current + 1;
  return true;
}

static bool parse_action_body(const char* body, ActionRequest* action) {
  const char* cursor = body;
  bool has_structure = false;
  bool has_action = false;
  bool has_seen_value = false;
  skip_json_whitespace(&cursor);
  if (*cursor++ != '{') {
    return false;
  }

  for (;;) {
    char key[24];
    char value[VALUE_BYTES];
    skip_json_whitespace(&cursor);
    if (*cursor == '}') {
      ++cursor;
      skip_json_whitespace(&cursor);
      return *cursor == '\0' && has_structure && has_action;
    }
    if (!parse_json_string(&cursor, key, sizeof(key))) {
      return false;
    }
    skip_json_whitespace(&cursor);
    if (*cursor++ != ':') {
      return false;
    }
    skip_json_whitespace(&cursor);
    if (!parse_json_string(&cursor, value, sizeof(value))) {
      return false;
    }
    if (strcmp(key, "structure") == 0 && !has_structure) {
      if (!copy_text(action->structure, sizeof(action->structure), value)) {
        return false;
      }
      has_structure = true;
    } else if (strcmp(key, "action") == 0 && !has_action) {
      if (!copy_text(action->action, sizeof(action->action), value)) {
        return false;
      }
      has_action = true;
    } else if (strcmp(key, "value") == 0 && !has_seen_value) {
      if (!copy_text(action->value, sizeof(action->value), value)) {
        return false;
      }
      action->has_value = true;
      has_seen_value = true;
    } else {
      return false;
    }
    skip_json_whitespace(&cursor);
    if (*cursor == ',') {
      ++cursor;
      continue;
    }
    if (*cursor == '}') {
      ++cursor;
      skip_json_whitespace(&cursor);
      return *cursor == '\0' && has_structure && has_action;
    }
    return false;
  }
}

static bool valid_value(const char* value) {
  const size_t length = strlen(value);
  if (length == 0 || length >= VALUE_BYTES) {
    return false;
  }
  bool has_non_space = false;
  for (size_t index = 0; index < length; ++index) {
    const unsigned char character = (unsigned char)value[index];
    if (character < 0x20 || character > 0x7e) {
      return false;
    }
    if (!isspace(character)) {
      has_non_space = true;
    }
  }
  return has_non_space;
}

static int parse_structure(const char* name, StructureKind* structure) {
  if (strcmp(name, "stack") == 0) {
    *structure = STRUCTURE_STACK;
  } else if (strcmp(name, "queue") == 0) {
    *structure = STRUCTURE_QUEUE;
  } else if (strcmp(name, "linked-list") == 0) {
    *structure = STRUCTURE_LINKED_LIST;
  } else {
    return 0;
  }
  return 1;
}

static bool parse_structure_query(const char* target, char* name,
                                  size_t capacity) {
  const char* query = strchr(target, '?');
  if (query == NULL || strncmp(query + 1, "structure=", 10) != 0) {
    return false;
  }
  const char* value = query + 11;
  if (*value == '\0' || strchr(value, '&') != NULL || strchr(value, '#') != NULL) {
    return false;
  }
  return copy_text(name, capacity, value);
}

static size_t structure_size(const LabState* state, StructureKind structure) {
  switch (structure) {
    case STRUCTURE_STACK:
      return state->stack.count;
    case STRUCTURE_QUEUE:
      return state->queue.count;
    case STRUCTURE_LINKED_LIST:
      return state->linked_list.count;
  }
  return 0;
}

static void reset_linked_list(LinkedList* list) {
  ListNode* current = list->head;
  while (current != NULL) {
    ListNode* next = current->next;
    free(current);
    ++list->frees;
    current = next;
  }
  list->head = NULL;
  list->tail = NULL;
  list->count = 0;
}

static void reset_structure(LabState* state, StructureKind structure) {
  switch (structure) {
    case STRUCTURE_STACK:
      memset(state->stack.values, 0, sizeof(state->stack.values));
      state->stack.count = 0;
      break;
    case STRUCTURE_QUEUE:
      memset(state->queue.values, 0, sizeof(state->queue.values));
      state->queue.head = 0;
      state->queue.count = 0;
      break;
    case STRUCTURE_LINKED_LIST:
      reset_linked_list(&state->linked_list);
      break;
  }
}

static void update_high_water_mark(LabState* state, StructureKind structure) {
  const size_t size = structure_size(state, structure);
  size_t* high_water_mark = NULL;
  switch (structure) {
    case STRUCTURE_STACK:
      high_water_mark = &state->stack.high_water_mark;
      break;
    case STRUCTURE_QUEUE:
      high_water_mark = &state->queue.high_water_mark;
      break;
    case STRUCTURE_LINKED_LIST:
      high_water_mark = &state->linked_list.high_water_mark;
      break;
  }
  if (high_water_mark != NULL && size > *high_water_mark) {
    *high_water_mark = size;
  }
}

static int apply_action(LabState* state, StructureKind structure,
                        const ActionRequest* action, char* message,
                        size_t message_capacity) {
  if (strcmp(action->action, "reset") == 0) {
    reset_structure(state, structure);
    if (structure == STRUCTURE_STACK) {
      (void)snprintf(message, message_capacity, "Stack reset.");
    } else if (structure == STRUCTURE_QUEUE) {
      (void)snprintf(message, message_capacity, "Queue reset.");
    } else {
      (void)snprintf(message, message_capacity, "Linked list reset; nodes freed.");
    }
    return 200;
  }

  const bool needs_value =
      (structure == STRUCTURE_STACK && strcmp(action->action, "push") == 0) ||
      (structure == STRUCTURE_QUEUE &&
       strcmp(action->action, "enqueue") == 0) ||
      (structure == STRUCTURE_LINKED_LIST &&
       (strcmp(action->action, "append") == 0 ||
        strcmp(action->action, "remove") == 0 ||
        strcmp(action->action, "find") == 0));
  if (needs_value && (!action->has_value || !valid_value(action->value))) {
    (void)snprintf(message, message_capacity,
                   "Enter a value using 1 to 24 printable ASCII characters.");
    return 422;
  }

  if (structure == STRUCTURE_STACK) {
    Stack* stack = &state->stack;
    if (strcmp(action->action, "push") == 0) {
      if (stack->count >= MAX_ITEMS) {
        (void)snprintf(message, message_capacity, "The stack is full.");
        return 409;
      }
      (void)copy_text(stack->values[stack->count], VALUE_BYTES, action->value);
      ++stack->count;
      update_high_water_mark(state, structure);
      (void)snprintf(message, message_capacity, "Pushed %s onto the stack.",
                     action->value);
      return 200;
    }
    if (strcmp(action->action, "pop") == 0) {
      if (stack->count == 0) {
        (void)snprintf(message, message_capacity, "The stack is empty.");
        return 409;
      }
      const char* removed = stack->values[stack->count - 1];
      (void)snprintf(message, message_capacity, "Popped %s from the stack.",
                     removed);
      memset(stack->values[stack->count - 1], 0, VALUE_BYTES);
      --stack->count;
      return 200;
    }
    if (strcmp(action->action, "peek") == 0) {
      if (stack->count == 0) {
        (void)snprintf(message, message_capacity, "The stack is empty.");
        return 409;
      }
      (void)snprintf(message, message_capacity, "Top item: %s.",
                     stack->values[stack->count - 1]);
      return 200;
    }
  } else if (structure == STRUCTURE_QUEUE) {
    Queue* queue = &state->queue;
    if (strcmp(action->action, "enqueue") == 0) {
      if (queue->count >= MAX_ITEMS) {
        (void)snprintf(message, message_capacity, "The queue is full.");
        return 409;
      }
      const size_t tail = (queue->head + queue->count) % MAX_ITEMS;
      (void)copy_text(queue->values[tail], VALUE_BYTES, action->value);
      ++queue->count;
      update_high_water_mark(state, structure);
      (void)snprintf(message, message_capacity, "Added %s to the back of the queue.",
                     action->value);
      return 200;
    }
    if (strcmp(action->action, "dequeue") == 0) {
      if (queue->count == 0) {
        (void)snprintf(message, message_capacity, "The queue is empty.");
        return 409;
      }
      (void)snprintf(message, message_capacity, "Removed %s from the front.",
                     queue->values[queue->head]);
      memset(queue->values[queue->head], 0, VALUE_BYTES);
      queue->head = (queue->head + 1) % MAX_ITEMS;
      --queue->count;
      if (queue->count == 0) {
        queue->head = 0;
      }
      return 200;
    }
    if (strcmp(action->action, "front") == 0) {
      if (queue->count == 0) {
        (void)snprintf(message, message_capacity, "The queue is empty.");
        return 409;
      }
      (void)snprintf(message, message_capacity, "Front item: %s.",
                     queue->values[queue->head]);
      return 200;
    }
  } else {
    LinkedList* list = &state->linked_list;
    if (strcmp(action->action, "append") == 0) {
      if (list->count >= MAX_ITEMS) {
        (void)snprintf(message, message_capacity, "The list is full.");
        return 409;
      }
      ListNode* node = (ListNode*)malloc(sizeof(*node));
      if (node == NULL) {
        (void)snprintf(message, message_capacity, "Could not allocate a list node.");
        return 500;
      }
      (void)copy_text(node->value, sizeof(node->value), action->value);
      node->next = NULL;
      if (list->tail == NULL) {
        list->head = node;
      } else {
        list->tail->next = node;
      }
      list->tail = node;
      ++list->count;
      ++list->allocations;
      update_high_water_mark(state, structure);
      (void)snprintf(message, message_capacity, "Appended %s to the list.",
                     action->value);
      return 200;
    }
    if (strcmp(action->action, "remove") == 0) {
      ListNode* previous = NULL;
      ListNode* current = list->head;
      while (current != NULL && strcmp(current->value, action->value) != 0) {
        previous = current;
        current = current->next;
      }
      if (current == NULL) {
        (void)snprintf(message, message_capacity, "%s is not in the list.",
                       action->value);
        return 404;
      }
      if (previous == NULL) {
        list->head = current->next;
      } else {
        previous->next = current->next;
      }
      if (list->tail == current) {
        list->tail = previous;
      }
      (void)snprintf(message, message_capacity, "Removed %s and freed its node.",
                     current->value);
      free(current);
      --list->count;
      ++list->frees;
      return 200;
    }
    if (strcmp(action->action, "find") == 0) {
      for (ListNode* current = list->head; current != NULL;
           current = current->next) {
        if (strcmp(current->value, action->value) == 0) {
          (void)snprintf(message, message_capacity, "Found %s in the list.",
                         action->value);
          return 200;
        }
      }
      (void)snprintf(message, message_capacity, "%s is not in the list.",
                     action->value);
      return 404;
    }
  }

  (void)snprintf(message, message_capacity,
                 "That operation is not available for this structure.");
  return 422;
}

static const char* structure_name(StructureKind structure) {
  switch (structure) {
    case STRUCTURE_STACK:
      return "stack";
    case STRUCTURE_QUEUE:
      return "queue";
    case STRUCTURE_LINKED_LIST:
      return "linked-list";
  }
  return "unknown";
}

static const char* structure_label(StructureKind structure) {
  switch (structure) {
    case STRUCTURE_STACK:
      return "Stack";
    case STRUCTURE_QUEUE:
      return "Queue";
    case STRUCTURE_LINKED_LIST:
      return "Linked list";
  }
  return "Unknown";
}

static void append_state_items(StringBuilder* builder, const LabState* state,
                               StructureKind structure) {
  builder_append(builder, "\"items\":[");
  bool first = true;
  if (structure == STRUCTURE_STACK) {
    const Stack* stack = &state->stack;
    for (size_t index = 0; index < stack->count; ++index) {
      if (!first) {
        builder_append(builder, ",");
      }
      builder_append_json_string(builder, stack->values[index]);
      first = false;
    }
  } else if (structure == STRUCTURE_QUEUE) {
    const Queue* queue = &state->queue;
    for (size_t index = 0; index < queue->count; ++index) {
      const size_t slot = (queue->head + index) % MAX_ITEMS;
      if (!first) {
        builder_append(builder, ",");
      }
      builder_append_json_string(builder, queue->values[slot]);
      first = false;
    }
  } else {
    for (const ListNode* node = state->linked_list.head; node != NULL;
         node = node->next) {
      if (!first) {
        builder_append(builder, ",");
      }
      builder_append_json_string(builder, node->value);
      first = false;
    }
  }
  builder_append(builder, "]");
}

static void build_state_json(char* output, size_t output_capacity,
                             const LabState* state, StructureKind structure,
                             const char* message) {
  StringBuilder builder = {output, output_capacity, 0, false};
  output[0] = '\0';
  const size_t count = structure_size(state, structure);
  size_t memory_bytes = 0;
  size_t allocations = 0;
  size_t frees = 0;
  size_t high_water_mark = 0;
  if (structure == STRUCTURE_STACK) {
    memory_bytes = sizeof(state->stack.values);
    high_water_mark = state->stack.high_water_mark;
  } else if (structure == STRUCTURE_QUEUE) {
    memory_bytes = sizeof(state->queue.values);
    high_water_mark = state->queue.high_water_mark;
  } else {
    memory_bytes = count * sizeof(ListNode);
    allocations = state->linked_list.allocations;
    frees = state->linked_list.frees;
    high_water_mark = state->linked_list.high_water_mark;
  }

  builder_append(&builder, "{\"structure\":");
  builder_append_json_string(&builder, structure_name(structure));
  builder_append(&builder, ",\"label\":");
  builder_append_json_string(&builder, structure_label(structure));
  builder_append(&builder, ",\"message\":");
  builder_append_json_string(&builder, message);
  builder_append(&builder, ",");
  append_state_items(&builder, state, structure);
  builder_append_format(
      &builder,
      ",\"size\":%zu,\"capacity\":%d,\"memoryBytes\":%zu,"
      "\"allocations\":%zu,\"frees\":%zu,\"highWaterMark\":%zu}",
      count, MAX_ITEMS, memory_bytes, allocations, frees, high_water_mark);
  if (builder.failed) {
    output[0] = '\0';
  }
}

static HttpResponse make_error(int status, const char* message) {
  HttpResponse response;
  response.status = status;
  StringBuilder builder = {response.body, sizeof(response.body), 0, false};
  response.body[0] = '\0';
  builder_append(&builder, "{\"error\":");
  builder_append_json_string(&builder, message);
  builder_append(&builder, "}");
  return response;
}

static bool contains_origin(const char origins[MAX_ORIGINS][ORIGIN_BYTES],
                            size_t origin_count, const char* origin) {
  for (size_t index = 0; index < origin_count; ++index) {
    if (strcmp(origins[index], origin) == 0) {
      return true;
    }
  }
  return false;
}

static bool host_is_allowed(const char* host, int port) {
  char expected[ORIGIN_BYTES];
  (void)snprintf(expected, sizeof(expected), "localhost:%d", port);
  if (equals_ignore_case(host, expected) || equals_ignore_case(host, "localhost") ||
      equals_ignore_case(host, "127.0.0.1")) {
    return true;
  }
  (void)snprintf(expected, sizeof(expected), "127.0.0.1:%d", port);
  return equals_ignore_case(host, expected);
}

static bool parse_port(const char* text, int* port) {
  char* end = NULL;
  errno = 0;
  const long parsed = strtol(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0' || parsed < 1 ||
      parsed > 65535) {
    return false;
  }
  *port = (int)parsed;
  return true;
}

static bool add_origin(char origins[MAX_ORIGINS][ORIGIN_BYTES],
                       size_t* origin_count, const char* origin) {
  const char* separator = strstr(origin, "://");
  if (separator == NULL ||
      (strncmp(origin, "http://", 7) != 0 &&
       strncmp(origin, "https://", 8) != 0) ||
      strchr(separator + 3, '/') != NULL || strlen(origin) >= ORIGIN_BYTES) {
    return false;
  }
  if (contains_origin(origins, *origin_count, origin)) {
    return true;
  }
  if (*origin_count >= MAX_ORIGINS) {
    return false;
  }
  (void)copy_text(origins[*origin_count], ORIGIN_BYTES, origin);
  ++(*origin_count);
  return true;
}

static int status_text(int status) {
  switch (status) {
    case 200:
      return 0;
    case 204:
      return 1;
    case 400:
      return 2;
    case 403:
      return 3;
    case 404:
      return 4;
    case 405:
      return 5;
    case 409:
      return 6;
    case 422:
      return 7;
    default:
      return 8;
  }
}

static const char* status_reason(int status) {
  switch (status_text(status)) {
    case 0:
      return "OK";
    case 1:
      return "No Content";
    case 2:
      return "Bad Request";
    case 3:
      return "Forbidden";
    case 4:
      return "Not Found";
    case 5:
      return "Method Not Allowed";
    case 6:
      return "Conflict";
    case 7:
      return "Unprocessable Content";
    default:
      return "Internal Server Error";
  }
}

static HttpResponse handle_request(
    const HttpRequest* request, LabState* state, int port,
    const char origins[MAX_ORIGINS][ORIGIN_BYTES], size_t origin_count) {
  if (!host_is_allowed(request->host, port)) {
    return make_error(403, "Host is not allowed.");
  }
  if (request->origin[0] != '\0' &&
      !contains_origin(origins, origin_count, request->origin)) {
    return make_error(403, "Origin is not allowed.");
  }
  if (strcmp(request->method, "OPTIONS") == 0) {
    return request->origin[0] == '\0' ? make_error(403, "Origin is required.")
                                      : (HttpResponse){204, ""};
  }
  if (strcmp(request->method, "GET") == 0 &&
      strcmp(request->target, "/health") == 0) {
    HttpResponse response;
    response.status = 200;
    (void)copy_text(response.body, sizeof(response.body),
                    "{\"status\":\"ok\",\"service\":\"c-data-structures-lab\"}");
    return response;
  }
  if (strcmp(request->method, "GET") == 0 &&
      strncmp(request->target, "/api/state", 10) == 0) {
    char structure_text[24];
    StructureKind structure;
    if (!parse_structure_query(request->target, structure_text,
                               sizeof(structure_text)) ||
        !parse_structure(structure_text, &structure)) {
      return make_error(400, "Choose stack, queue, or linked-list.");
    }
    HttpResponse response;
    response.status = 200;
    build_state_json(response.body, sizeof(response.body), state, structure,
                     "Current structure state.");
    if (response.body[0] == '\0') {
      return make_error(500, "Could not format the current state.");
    }
    return response;
  }
  if (strcmp(request->method, "POST") == 0 &&
      strcmp(request->target, "/api/action") == 0) {
    ActionRequest action;
    memset(&action, 0, sizeof(action));
    if (!parse_action_body(request->body, &action)) {
      return make_error(
          400, "Expected JSON with structure, action, and an optional value.");
    }
    StructureKind structure;
    if (!parse_structure(action.structure, &structure)) {
      return make_error(400, "Choose stack, queue, or linked-list.");
    }
    char message[192];
    const int status =
        apply_action(state, structure, &action, message, sizeof(message));
    if (status != 200) {
      return make_error(status, message);
    }
    HttpResponse response;
    response.status = 200;
    build_state_json(response.body, sizeof(response.body), state, structure,
                     message);
    if (response.body[0] == '\0') {
      return make_error(500, "Could not format the updated state.");
    }
    return response;
  }
  if (strcmp(request->target, "/api/action") == 0 ||
      strncmp(request->target, "/api/state", 10) == 0) {
    return make_error(405, "Method not allowed.");
  }
  return make_error(404, "Route not found.");
}

static void send_response(Socket client, const HttpResponse* response,
                          const char* origin,
                          const char origins[MAX_ORIGINS][ORIGIN_BYTES],
                          size_t origin_count) {
  char header[1024];
  const bool add_cors =
      origin[0] != '\0' && contains_origin(origins, origin_count, origin);
  const int header_length = snprintf(
      header, sizeof(header),
      "HTTP/1.1 %d %s\r\n"
      "Content-Type: application/json; charset=utf-8\r\n"
      "Content-Length: %zu\r\n"
      "Connection: close\r\n"
      "Cache-Control: no-store\r\n"
      "X-Content-Type-Options: nosniff\r\n"
      "%s%s%s"
      "%s\r\n",
      response->status, status_reason(response->status), strlen(response->body),
      add_cors ? "Access-Control-Allow-Origin: " : "",
      add_cors ? origin : "", add_cors ? "\r\nVary: Origin\r\n" : "",
      response->status == 204
          ? "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Access-Control-Max-Age: 600\r\n"
          : "");
  if (header_length < 0 || (size_t)header_length >= sizeof(header)) {
    return;
  }

  const size_t body_length = strlen(response->body);
  const size_t message_length = (size_t)header_length + body_length;
  char message[1024 + MAX_RESPONSE_BYTES];
  if (message_length >= sizeof(message)) {
    return;
  }
  memcpy(message, header, (size_t)header_length);
  memcpy(message + header_length, response->body, body_length);
  size_t sent = 0;
  while (sent < message_length) {
    const int count = send(client, message + sent,
                           (int)(message_length - sent), 0);
    if (count <= 0) {
      return;
    }
    sent += (size_t)count;
  }
}

static bool initialize_sockets(void) {
#ifdef _WIN32
  WSADATA data;
  return WSAStartup(MAKEWORD(2, 2), &data) == 0;
#else
  return true;
#endif
}

static void cleanup_sockets(void) {
#ifdef _WIN32
  WSACleanup();
#endif
}

int main(int argc, char* argv[]) {
  int port = 8091;
  char origins[MAX_ORIGINS][ORIGIN_BYTES] = {{0}};
  size_t origin_count = 0;
  LabState state;
  memset(&state, 0, sizeof(state));

  const char* defaults[] = {
      "http://localhost:3000", "http://localhost:3001",
      "http://localhost:3030", "http://127.0.0.1:3000",
      "http://127.0.0.1:3001", "http://127.0.0.1:3030"};
  for (size_t index = 0; index < sizeof(defaults) / sizeof(defaults[0]);
       ++index) {
    if (!add_origin(origins, &origin_count, defaults[index])) {
      fprintf(stderr, "Could not configure the default browser origins.\n");
      return 1;
    }
  }

  for (int index = 1; index < argc; ++index) {
    if (strcmp(argv[index], "--help") == 0) {
      printf("Usage: c-data-structures-lab [--port PORT] "
             "[--cors-origin ORIGIN]\n");
      return 0;
    }
    if (strcmp(argv[index], "--port") == 0 && index + 1 < argc) {
      if (!parse_port(argv[++index], &port)) {
        fprintf(stderr, "Port must be between 1 and 65535.\n");
        return 1;
      }
    } else if (strcmp(argv[index], "--cors-origin") == 0 &&
               index + 1 < argc) {
      if (!add_origin(origins, &origin_count, argv[++index])) {
        fprintf(stderr, "CORS origin must be a valid exact origin.\n");
        return 1;
      }
    } else {
      fprintf(stderr, "Unknown or incomplete option: %s\n", argv[index]);
      return 1;
    }
  }

  if (!initialize_sockets()) {
    fprintf(stderr, "Could not initialize the socket runtime.\n");
    return 1;
  }
  Socket server = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
#ifdef _WIN32
  if (server == INVALID_SOCKET) {
#else
  if (server < 0) {
#endif
    fprintf(stderr, "Could not create the server socket.\n");
    cleanup_sockets();
    return 1;
  }

  int reuse_address = 1;
#ifdef _WIN32
  (void)setsockopt(server, SOL_SOCKET, SO_REUSEADDR,
                   (const char*)&reuse_address, sizeof(reuse_address));
#else
  (void)setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse_address,
                   sizeof(reuse_address));
#endif
  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((unsigned short)port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(server, (struct sockaddr*)&address, sizeof(address)) != 0) {
    fprintf(stderr, "Could not bind to 127.0.0.1:%d.\n", port);
    close_socket(server);
    cleanup_sockets();
    return 1;
  }
  if (listen(server, 16) != 0) {
    fprintf(stderr, "Could not listen on the server socket.\n");
    close_socket(server);
    cleanup_sockets();
    return 1;
  }

  printf("C Data Structures Lab listening on http://127.0.0.1:%d\n", port);
  for (;;) {
    struct sockaddr_in client_address;
#ifdef _WIN32
    int address_length = sizeof(client_address);
#else
    socklen_t address_length = sizeof(client_address);
#endif
    Socket client =
        accept(server, (struct sockaddr*)&client_address, &address_length);
#ifdef _WIN32
    if (client == INVALID_SOCKET) {
#else
    if (client < 0) {
#endif
      fprintf(stderr, "Could not accept a client connection.\n");
      continue;
    }
    HttpRequest request;
    memset(&request, 0, sizeof(request));
    if (receive_request(client, &request)) {
      const HttpResponse response =
          handle_request(&request, &state, port, origins, origin_count);
      send_response(client, &response, request.origin, origins, origin_count);
    }
    close_socket(client);
  }

  reset_linked_list(&state.linked_list);
  close_socket(server);
  cleanup_sockets();
  return 0;
}
