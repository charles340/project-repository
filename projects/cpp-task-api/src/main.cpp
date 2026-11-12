#include <algorithm>
#include <charconv>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
using Socket = SOCKET;
constexpr Socket invalidSocket = INVALID_SOCKET;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using Socket = int;
constexpr Socket invalidSocket = -1;
#endif

namespace {

constexpr std::size_t maxHeaderBytes = 16 * 1024;
constexpr std::size_t maxBodyBytes = 64 * 1024;
constexpr std::size_t maxTasks = 200;

struct Task {
  int id;
  std::string title;
  std::string dueDate;
  std::string priority;
  bool completed;
};

struct TaskInput {
  std::string title;
  std::string dueDate;
  std::string priority = "normal";
};

struct Request {
  std::string method;
  std::string target;
  std::unordered_map<std::string, std::string> headers;
  std::string body;
};

struct Response {
  int status;
  std::string body;
};

void closeSocket(Socket socket) {
#ifdef _WIN32
  closesocket(socket);
#else
  close(socket);
#endif
}

std::string lower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
    return static_cast<char>(std::tolower(ch));
  });
  return value;
}

std::string trim(const std::string& value) {
  const auto first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) {
    return "";
  }
  const auto last = value.find_last_not_of(" \t\r\n");
  return value.substr(first, last - first + 1);
}

bool parseRequestHead(const std::string& head, Request& request,
                      std::size_t& contentLength) {
  std::istringstream input(head);
  std::string line;
  if (!std::getline(input, line)) {
    return false;
  }
  if (!line.empty() && line.back() == '\r') {
    line.pop_back();
  }

  std::istringstream requestLine(line);
  std::string version;
  if (!(requestLine >> request.method >> request.target >> version) ||
      (version != "HTTP/1.0" && version != "HTTP/1.1")) {
    return false;
  }

  bool contentLengthSeen = false;
  while (std::getline(input, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    if (line.empty()) {
      continue;
    }
    const auto separator = line.find(':');
    if (separator == std::string::npos) {
      return false;
    }

    const auto name = lower(trim(line.substr(0, separator)));
    const auto value = trim(line.substr(separator + 1));
    if (name == "transfer-encoding") {
      return false;
    }
    if (name == "content-length") {
      if (contentLengthSeen) {
        return false;
      }
      const auto result = std::from_chars(
          value.data(), value.data() + value.size(), contentLength);
      if (result.ec != std::errc{} || result.ptr != value.data() + value.size() ||
          contentLength > maxBodyBytes) {
        return false;
      }
      contentLengthSeen = true;
    }
    request.headers.emplace(name, value);
  }
  return true;
}

bool receiveRequest(Socket client, Request& request) {
  std::string incoming;
  char buffer[4096];
  std::size_t contentLength = 0;
  std::size_t headerEnd = std::string::npos;
  bool headParsed = false;

  while (true) {
    if (headerEnd == std::string::npos) {
      headerEnd = incoming.find("\r\n\r\n");
      if (headerEnd == std::string::npos && incoming.size() > maxHeaderBytes) {
        return false;
      }
      if (headerEnd != std::string::npos) {
        if (headerEnd > maxHeaderBytes ||
            !parseRequestHead(incoming.substr(0, headerEnd), request, contentLength)) {
          return false;
        }
        headParsed = true;
      }
    }

    if (headParsed && incoming.size() >= headerEnd + 4 + contentLength) {
      request.body = incoming.substr(headerEnd + 4, contentLength);
      return true;
    }

    const int received = recv(client, buffer, sizeof(buffer), 0);
    if (received <= 0 ||
        incoming.size() + static_cast<std::size_t>(received) >
            maxHeaderBytes + maxBodyBytes + 4) {
      return false;
    }
    incoming.append(buffer, static_cast<std::size_t>(received));
  }
}

void skipWhitespace(const std::string& value, std::size_t& position) {
  while (position < value.size() &&
         std::isspace(static_cast<unsigned char>(value[position]))) {
    ++position;
  }
}

void appendUtf8(std::string& output, std::uint32_t codePoint) {
  if (codePoint <= 0x7f) {
    output.push_back(static_cast<char>(codePoint));
  } else if (codePoint <= 0x7ff) {
    output.push_back(static_cast<char>(0xc0 | (codePoint >> 6)));
    output.push_back(static_cast<char>(0x80 | (codePoint & 0x3f)));
  } else if (codePoint <= 0xffff) {
    output.push_back(static_cast<char>(0xe0 | (codePoint >> 12)));
    output.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | (codePoint & 0x3f)));
  } else {
    output.push_back(static_cast<char>(0xf0 | (codePoint >> 18)));
    output.push_back(static_cast<char>(0x80 | ((codePoint >> 12) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | (codePoint & 0x3f)));
  }
}

bool parseHexQuad(const std::string& value, std::size_t& position,
                  std::uint32_t& result) {
  if (position + 4 > value.size()) {
    return false;
  }
  result = 0;
  for (int digit = 0; digit < 4; ++digit) {
    const unsigned char ch = static_cast<unsigned char>(value[position++]);
    result <<= 4;
    if (ch >= '0' && ch <= '9') {
      result |= ch - '0';
    } else if (ch >= 'a' && ch <= 'f') {
      result |= ch - 'a' + 10;
    } else if (ch >= 'A' && ch <= 'F') {
      result |= ch - 'A' + 10;
    } else {
      return false;
    }
  }
  return true;
}

bool parseJsonString(const std::string& value, std::size_t& position,
                     std::string& result) {
  if (position >= value.size() || value[position++] != '"') {
    return false;
  }

  while (position < value.size()) {
    const unsigned char ch = static_cast<unsigned char>(value[position++]);
    if (ch == '"') {
      return true;
    }
    if (ch < 0x20) {
      return false;
    }
    if (ch != '\\') {
      result.push_back(static_cast<char>(ch));
      continue;
    }
    if (position >= value.size()) {
      return false;
    }

    switch (value[position++]) {
      case '"':
        result.push_back('"');
        break;
      case '\\':
        result.push_back('\\');
        break;
      case '/':
        result.push_back('/');
        break;
      case 'b':
        result.push_back('\b');
        break;
      case 'f':
        result.push_back('\f');
        break;
      case 'n':
        result.push_back('\n');
        break;
      case 'r':
        result.push_back('\r');
        break;
      case 't':
        result.push_back('\t');
        break;
      case 'u': {
        std::uint32_t codePoint = 0;
        if (!parseHexQuad(value, position, codePoint)) {
          return false;
        }
        if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
          if (position + 2 > value.size() || value[position] != '\\' ||
              value[position + 1] != 'u') {
            return false;
          }
          position += 2;
          std::uint32_t lowSurrogate = 0;
          if (!parseHexQuad(value, position, lowSurrogate) ||
              lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff) {
            return false;
          }
          codePoint =
              0x10000 + ((codePoint - 0xd800) << 10) + (lowSurrogate - 0xdc00);
        } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
          return false;
        }
        appendUtf8(result, codePoint);
        break;
      }
      default:
        return false;
    }
  }
  return false;
}

bool parseTaskInput(const std::string& body, TaskInput& task) {
  std::size_t position = 0;
  skipWhitespace(body, position);
  if (position >= body.size() || body[position++] != '{') {
    return false;
  }
  bool hasTitle = false;
  bool hasDueDate = false;
  bool hasPriority = false;

  while (position < body.size()) {
    skipWhitespace(body, position);
    if (position < body.size() && body[position] == '}') {
      ++position;
      skipWhitespace(body, position);
      return position == body.size() && hasTitle;
    }

    std::string key;
    std::string value;
    if (!parseJsonString(body, position, key)) {
      return false;
    }
    skipWhitespace(body, position);
    if (position >= body.size() || body[position++] != ':') {
      return false;
    }
    skipWhitespace(body, position);
    if (!parseJsonString(body, position, value)) {
      return false;
    }

    if (key == "title" && !hasTitle) {
      task.title = std::move(value);
      hasTitle = true;
    } else if (key == "dueDate" && !hasDueDate) {
      task.dueDate = std::move(value);
      hasDueDate = true;
    } else if (key == "priority" && !hasPriority) {
      task.priority = std::move(value);
      hasPriority = true;
    } else {
      return false;
    }

    skipWhitespace(body, position);
    if (position < body.size() && body[position] == ',') {
      ++position;
      continue;
    }
    if (position < body.size() && body[position] == '}') {
      ++position;
      skipWhitespace(body, position);
      return position == body.size() && hasTitle;
    }
    return false;
  }
  return false;
}

bool parseSingleBooleanField(const std::string& body, const std::string& key,
                             bool& result) {
  std::size_t position = 0;
  skipWhitespace(body, position);
  if (position >= body.size() || body[position++] != '{') {
    return false;
  }
  skipWhitespace(body, position);

  std::string parsedKey;
  if (!parseJsonString(body, position, parsedKey) || parsedKey != key) {
    return false;
  }
  skipWhitespace(body, position);
  if (position >= body.size() || body[position++] != ':') {
    return false;
  }
  skipWhitespace(body, position);

  if (body.compare(position, 4, "true") == 0) {
    result = true;
    position += 4;
  } else if (body.compare(position, 5, "false") == 0) {
    result = false;
    position += 5;
  } else {
    return false;
  }

  skipWhitespace(body, position);
  if (position >= body.size() || body[position++] != '}') {
    return false;
  }
  skipWhitespace(body, position);
  return position == body.size();
}

bool isPriority(const std::string& priority) {
  return priority == "low" || priority == "normal" || priority == "high";
}

bool hasControlCharacters(const std::string& value) {
  return std::any_of(value.begin(), value.end(), [](unsigned char ch) {
    return ch < 0x20 || ch == 0x7f;
  });
}

bool isValidDate(const std::string& date) {
  if (date.empty()) {
    return true;
  }
  if (date.size() != 10 || date[4] != '-' || date[7] != '-') {
    return false;
  }
  for (std::size_t index = 0; index < date.size(); ++index) {
    if (index != 4 && index != 7 &&
        !std::isdigit(static_cast<unsigned char>(date[index]))) {
      return false;
    }
  }

  int year = 0;
  int month = 0;
  int day = 0;
  if (std::from_chars(date.data(), date.data() + 4, year).ec != std::errc{} ||
      std::from_chars(date.data() + 5, date.data() + 7, month).ec != std::errc{} ||
      std::from_chars(date.data() + 8, date.data() + 10, day).ec != std::errc{}) {
    return false;
  }
  if (year < 1900 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const bool leapYear = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
  const int daysInMonth[] = {31, leapYear ? 29 : 28, 31, 30, 31, 30,
                             31, 31, 30, 31, 30, 31};
  return day <= daysInMonth[month - 1];
}

std::vector<Task> loadTasks(const std::filesystem::path& dataFile, int& nextId) {
  std::error_code fileError;
  const bool fileExists = std::filesystem::exists(dataFile, fileError);
  if (fileError) {
    throw std::runtime_error("Could not inspect the task data file.");
  }
  if (!fileExists) {
    nextId = 1;
    return {};
  }
  if (!std::filesystem::is_regular_file(dataFile, fileError) || fileError) {
    throw std::runtime_error("The task data path is not a regular file.");
  }

  std::ifstream input(dataFile, std::ios::binary);
  if (!input) {
    throw std::runtime_error("Could not open the task data file.");
  }

  std::vector<Task> tasks;
  std::unordered_set<int> ids;
  std::string line;
  int highestId = 0;
  while (std::getline(input, line)) {
    if (line.empty()) {
      continue;
    }
    std::istringstream row(line);
    Task task{};
    int completed = 0;
    if (!(row >> task.id >> completed >> task.priority >> task.dueDate >>
          std::quoted(task.title))) {
      throw std::runtime_error("The task data file contains an invalid row.");
    }
    std::string extra;
    if ((row >> extra) || task.id < 1 || (completed != 0 && completed != 1) ||
        task.title.empty() || task.title.size() > 160 ||
        hasControlCharacters(task.title) ||
        !isPriority(task.priority) || !isValidDate(task.dueDate) ||
        task.id == std::numeric_limits<int>::max() ||
        !ids.insert(task.id).second) {
      throw std::runtime_error("The task data file contains invalid task data.");
    }
    task.completed = completed == 1;
    highestId = std::max(highestId, task.id);
    tasks.push_back(std::move(task));
  }
  if (input.bad()) {
    throw std::runtime_error("Could not read the task data file.");
  }
  nextId = highestId + 1;
  return tasks;
}

void saveTasks(const std::filesystem::path& dataFile,
               const std::vector<Task>& tasks) {
  const auto parent = dataFile.parent_path();
  std::error_code fileError;
  if (!parent.empty()) {
    std::filesystem::create_directories(parent, fileError);
    if (fileError) {
      throw std::runtime_error("Could not create the task data directory.");
    }
  }

  auto temporaryFile = dataFile;
  temporaryFile += ".tmp";
  std::ofstream output(temporaryFile, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("Could not create a temporary task data file.");
  }
  for (const auto& task : tasks) {
    output << task.id << '\t' << (task.completed ? 1 : 0) << '\t'
           << task.priority << '\t' << task.dueDate << '\t'
           << std::quoted(task.title) << '\n';
  }
  output.flush();
  if (!output) {
    output.close();
    std::filesystem::remove(temporaryFile, fileError);
    throw std::runtime_error("Could not write task data.");
  }
  output.close();

#ifdef _WIN32
  if (!MoveFileExW(temporaryFile.c_str(), dataFile.c_str(),
                   MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    std::filesystem::remove(temporaryFile, fileError);
    throw std::runtime_error("Could not replace the task data file.");
  }
#else
  std::filesystem::rename(temporaryFile, dataFile, fileError);
  if (fileError) {
    std::filesystem::remove(temporaryFile, fileError);
    throw std::runtime_error("Could not replace the task data file.");
  }
#endif
}

std::string jsonEscape(const std::string& value) {
  std::ostringstream output;
  for (unsigned char ch : value) {
    switch (ch) {
      case '"':
        output << "\\\"";
        break;
      case '\\':
        output << "\\\\";
        break;
      case '\b':
        output << "\\b";
        break;
      case '\f':
        output << "\\f";
        break;
      case '\n':
        output << "\\n";
        break;
      case '\r':
        output << "\\r";
        break;
      case '\t':
        output << "\\t";
        break;
      default:
        if (ch < 0x20) {
          const char hex[] = "0123456789abcdef";
          output << "\\u00" << hex[ch >> 4] << hex[ch & 0x0f];
        } else {
          output << static_cast<char>(ch);
        }
    }
  }
  return output.str();
}

std::string taskJson(const Task& task) {
  return "{\"id\":" + std::to_string(task.id) + ",\"title\":\"" +
         jsonEscape(task.title) + "\",\"dueDate\":\"" +
         jsonEscape(task.dueDate) + "\",\"priority\":\"" +
         jsonEscape(task.priority) + "\",\"completed\":" +
         (task.completed ? "true}" : "false}");
}

std::string tasksJson(const std::vector<Task>& tasks) {
  std::string result = "[";
  for (std::size_t index = 0; index < tasks.size(); ++index) {
    if (index > 0) {
      result += ',';
    }
    result += taskJson(tasks[index]);
  }
  result += ']';
  return result;
}

Response jsonResponse(int status, const std::string& body) {
  return {status, body};
}

std::optional<int> taskIdFromPath(const std::string& target) {
  constexpr const char* prefix = "/api/tasks/";
  if (target.compare(0, 11, prefix) != 0) {
    return std::nullopt;
  }
  const auto text = target.substr(11);
  if (text.empty()) {
    return std::nullopt;
  }
  int id = 0;
  const auto result =
      std::from_chars(text.data(), text.data() + text.size(), id);
  if (result.ec != std::errc{} || result.ptr != text.data() + text.size() ||
      id < 1) {
    return std::nullopt;
  }
  return id;
}

bool contains(const std::vector<std::string>& values,
              const std::string& value) {
  return std::find(values.begin(), values.end(), value) != values.end();
}

Response handleRequest(const Request& request, std::vector<Task>& tasks,
                       int& nextId, const std::vector<std::string>& origins,
                       int port, const std::filesystem::path& dataFile) {
  const auto originHeader = request.headers.find("origin");
  const std::string origin =
      originHeader == request.headers.end() ? "" : originHeader->second;
  if (!origin.empty() && !contains(origins, origin)) {
    return jsonResponse(403, "{\"error\":\"Origin is not allowed.\"}");
  }

  const auto hostHeader = request.headers.find("host");
  const std::string host =
      hostHeader == request.headers.end() ? "" : lower(hostHeader->second);
  const std::string portSuffix = ":" + std::to_string(port);
  if (host != "localhost" + portSuffix &&
      host != "127.0.0.1" + portSuffix && host != "localhost" &&
      host != "127.0.0.1") {
    return jsonResponse(403, "{\"error\":\"Host is not allowed.\"}");
  }

  if (request.method == "OPTIONS") {
    return origin.empty()
               ? jsonResponse(403, "{\"error\":\"Origin is required.\"}")
               : jsonResponse(204, "");
  }
  if (request.method == "GET" && request.target == "/health") {
    return jsonResponse(
        200, "{\"status\":\"ok\",\"service\":\"cpp-server-maintenance-api\"}");
  }
  if (request.method == "GET" && request.target == "/api/tasks") {
    return jsonResponse(200, tasksJson(tasks));
  }
  if (request.method == "POST" && request.target == "/api/tasks") {
    if (tasks.size() >= maxTasks) {
      return jsonResponse(409, "{\"error\":\"Task limit reached.\"}");
    }
    if (nextId == std::numeric_limits<int>::max()) {
      return jsonResponse(409, "{\"error\":\"Task ID limit reached.\"}");
    }
    TaskInput input;
    if (!parseTaskInput(request.body, input)) {
      return jsonResponse(
          400, "{\"error\":\"Expected title, dueDate, and priority fields.\"}");
    }
    input.title = trim(input.title);
    if (input.title.empty() || input.title.size() > 160) {
      return jsonResponse(422, "{\"error\":\"Title must be 1 to 160 bytes.\"}");
    }
    if (hasControlCharacters(input.title)) {
      return jsonResponse(
          422, "{\"error\":\"Title cannot contain control characters.\"}");
    }
    if (!isValidDate(input.dueDate)) {
      return jsonResponse(
          422, "{\"error\":\"Due date must be a real YYYY-MM-DD date.\"}");
    }
    if (!isPriority(input.priority)) {
      return jsonResponse(
          422, "{\"error\":\"Priority must be low, normal, or high.\"}");
    }
    tasks.push_back(
        {nextId, input.title, input.dueDate, input.priority, false});
    try {
      saveTasks(dataFile, tasks);
    } catch (const std::exception&) {
      tasks.pop_back();
      return jsonResponse(500, "{\"error\":\"Could not save task data.\"}");
    }
    ++nextId;
    return jsonResponse(201, taskJson(tasks.back()));
  }

  const auto id = taskIdFromPath(request.target);
  if (!id) {
    return jsonResponse(404, "{\"error\":\"Route not found.\"}");
  }
  const auto task = std::find_if(tasks.begin(), tasks.end(),
                                 [id](const Task& item) { return item.id == *id; });
  if (task == tasks.end()) {
    return jsonResponse(404, "{\"error\":\"Task not found.\"}");
  }
  if (request.method == "PATCH") {
    bool completed = false;
    if (!parseSingleBooleanField(request.body, "completed", completed)) {
      return jsonResponse(
          400, "{\"error\":\"Expected a JSON completed boolean.\"}");
    }
    const bool wasCompleted = task->completed;
    task->completed = completed;
    try {
      saveTasks(dataFile, tasks);
    } catch (const std::exception&) {
      task->completed = wasCompleted;
      return jsonResponse(500, "{\"error\":\"Could not save task data.\"}");
    }
    return jsonResponse(200, taskJson(*task));
  }
  if (request.method == "DELETE") {
    const auto taskIndex = static_cast<std::size_t>(task - tasks.begin());
    const Task removedTask = *task;
    tasks.erase(task);
    try {
      saveTasks(dataFile, tasks);
    } catch (const std::exception&) {
      tasks.insert(tasks.begin() + static_cast<std::ptrdiff_t>(taskIndex), removedTask);
      return jsonResponse(500, "{\"error\":\"Could not save task data.\"}");
    }
    return jsonResponse(204, "");
  }
  return jsonResponse(405, "{\"error\":\"Method not allowed.\"}");
}

std::string statusText(int status) {
  switch (status) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 204:
      return "No Content";
    case 400:
      return "Bad Request";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable Content";
    default:
      return "Internal Server Error";
  }
}

void sendResponse(Socket client, const Response& response,
                  const std::string& origin,
                  const std::vector<std::string>& allowedOrigins) {
  std::ostringstream output;
  output << "HTTP/1.1 " << response.status << ' ' << statusText(response.status)
         << "\r\n"
         << "Content-Type: application/json; charset=utf-8\r\n"
         << "Content-Length: " << response.body.size() << "\r\n"
         << "Connection: close\r\n"
         << "Cache-Control: no-store\r\n"
         << "X-Content-Type-Options: nosniff\r\n";

  if (!origin.empty() && contains(allowedOrigins, origin)) {
    output << "Access-Control-Allow-Origin: " << origin << "\r\n"
           << "Vary: Origin\r\n";
    if (response.status == 204) {
      output << "Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS\r\n"
             << "Access-Control-Allow-Headers: Content-Type\r\n"
             << "Access-Control-Max-Age: 600\r\n";
    }
  }
  output << "\r\n" << response.body;
  const std::string message = output.str();
  std::size_t sent = 0;
  while (sent < message.size()) {
    const int count = send(client, message.data() + sent,
                           static_cast<int>(message.size() - sent), 0);
    if (count <= 0) {
      return;
    }
    sent += static_cast<std::size_t>(count);
  }
}

class SocketRuntime {
 public:
  SocketRuntime() {
#ifdef _WIN32
    WSADATA data{};
    if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
      throw std::runtime_error("Could not initialize Winsock.");
    }
#endif
  }

  ~SocketRuntime() {
#ifdef _WIN32
    WSACleanup();
#endif
  }
};

int parsePort(const std::string& value) {
  int port = 0;
  const auto result =
      std::from_chars(value.data(), value.data() + value.size(), port);
  if (result.ec != std::errc{} || result.ptr != value.data() + value.size() ||
      port < 1 || port > 65535) {
    throw std::invalid_argument("Port must be between 1 and 65535.");
  }
  return port;
}

}

int main(int argc, char* argv[]) {
  int port = 8080;
  std::filesystem::path dataFile = "tasks.db";
  std::vector<std::string> origins = {
      "http://localhost:3000", "http://localhost:3001",
      "http://localhost:3030", "http://127.0.0.1:3000",
      "http://127.0.0.1:3001", "http://127.0.0.1:3030"};

  try {
    for (int index = 1; index < argc; ++index) {
      const std::string argument = argv[index];
      if (argument == "--help") {
        std::cout << "Usage: task-api-server [--port PORT] "
                     "[--data-file PATH] [--cors-origin ORIGIN]\n";
        return 0;
      }
      if (argument == "--port" && index + 1 < argc) {
        port = parsePort(argv[++index]);
      } else if (argument == "--data-file" && index + 1 < argc) {
        dataFile = argv[++index];
        if (dataFile.empty()) {
          throw std::invalid_argument("Data file path cannot be empty.");
        }
      } else if (argument == "--cors-origin" && index + 1 < argc) {
        const std::string origin = argv[++index];
        if ((origin.compare(0, 7, "http://") != 0 &&
             origin.compare(0, 8, "https://") != 0) ||
            origin.find('/', origin.find("://") + 3) != std::string::npos) {
          throw std::invalid_argument(
              "CORS origin must be an origin without a path.");
        }
        if (!contains(origins, origin)) {
          origins.push_back(origin);
        }
      } else {
        throw std::invalid_argument("Unknown or incomplete option: " + argument);
      }
    }

    int nextId = 1;
    std::vector<Task> tasks = loadTasks(dataFile, nextId);
    SocketRuntime runtime;
    Socket server = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (server == invalidSocket) {
      throw std::runtime_error("Could not create the server socket.");
    }

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(static_cast<unsigned short>(port));
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(server, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0) {
      closeSocket(server);
      throw std::runtime_error("Could not bind to 127.0.0.1:" +
                               std::to_string(port) + ".");
    }
    if (listen(server, 16) != 0) {
      closeSocket(server);
      throw std::runtime_error("Could not listen on the server socket.");
    }

    std::cout << "C++ Server Maintenance API listening on http://127.0.0.1:" << port
              << std::endl;

    while (true) {
      sockaddr_in clientAddress{};
#ifdef _WIN32
      int addressLength = sizeof(clientAddress);
#else
      socklen_t addressLength = sizeof(clientAddress);
#endif
      Socket client =
          accept(server, reinterpret_cast<sockaddr*>(&clientAddress), &addressLength);
      if (client == invalidSocket) {
        std::cerr << "Could not accept a client connection." << std::endl;
        continue;
      }

      Request request;
      if (receiveRequest(client, request)) {
        const auto origin = request.headers.find("origin");
        const std::string requestOrigin =
            origin == request.headers.end() ? "" : origin->second;
        const Response response =
            handleRequest(request, tasks, nextId, origins, port, dataFile);
        sendResponse(client, response, requestOrigin, origins);
      }
      closeSocket(client);
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << std::endl;
    return 1;
  }
}
