cmake_minimum_required(VERSION 3.20)
project(c_data_structures_lab LANGUAGES C)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

add_executable(c-data-structures-lab src/main.c)

if(WIN32)
  target_link_libraries(c-data-structures-lab PRIVATE ws2_32)
endif()
