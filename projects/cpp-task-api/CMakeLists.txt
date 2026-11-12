cmake_minimum_required(VERSION 3.20)
project(cpp_task_api LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(task-api-server src/main.cpp)

if(WIN32)
  target_link_libraries(task-api-server PRIVATE ws2_32)
endif()
