cmake_minimum_required(VERSION 3.31.6)
project(aurora_native_preparation LANGUAGES C CXX)

if(NOT ANDROID OR NOT ANDROID_ABI STREQUAL "arm64-v8a")
    message(FATAL_ERROR "The private preparation supports Android arm64-v8a only")
endif()
# CMake exposes only major.minor in CMAKE_ANDROID_NDK_VERSION. Check the SDK package's
# full revision instead; comparing that truncated variable would reject the correct pin.
file(STRINGS "${CMAKE_ANDROID_NDK}/source.properties" AURORA_NDK_REVISION
    REGEX "^Pkg\\.Revision[ \t]*=")
if(NOT AURORA_NDK_REVISION MATCHES "^Pkg\\.Revision[ \t]*=[ \t]*30\\.0\\.16248370[ \t]*$")
    message(FATAL_ERROR "Use the pinned stable Android NDK 30.0.16248370")
endif()
if(NOT DEFINED AURORA_LLAMA_SOURCE_DIR OR NOT IS_DIRECTORY "${AURORA_LLAMA_SOURCE_DIR}")
    message(FATAL_ERROR "Provide the pinned source checkout; CMake does not download dependencies")
endif()
find_package(Git REQUIRED)
set(AURORA_LLAMA_COMMIT "8642541b255bfb5dc39cd351a178be09013a55d6")
execute_process(COMMAND "${GIT_EXECUTABLE}" rev-parse HEAD
    WORKING_DIRECTORY "${AURORA_LLAMA_SOURCE_DIR}"
    OUTPUT_VARIABLE AURORA_OBSERVED_LLAMA_COMMIT OUTPUT_STRIP_TRAILING_WHITESPACE
    RESULT_VARIABLE AURORA_LLAMA_REV_RESULT)
execute_process(COMMAND "${GIT_EXECUTABLE}" status --porcelain --untracked-files=all
    WORKING_DIRECTORY "${AURORA_LLAMA_SOURCE_DIR}"
    OUTPUT_VARIABLE AURORA_LLAMA_DIRTY OUTPUT_STRIP_TRAILING_WHITESPACE
    RESULT_VARIABLE AURORA_LLAMA_STATUS_RESULT)
if(NOT AURORA_LLAMA_REV_RESULT EQUAL 0 OR NOT AURORA_LLAMA_STATUS_RESULT EQUAL 0 OR
   NOT AURORA_OBSERVED_LLAMA_COMMIT STREQUAL AURORA_LLAMA_COMMIT OR AURORA_LLAMA_DIRTY)
    message(FATAL_ERROR "llama.cpp checkout must be exact and clean")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
# One private JNI library. No server, tool runner, GPU, dynamic backend or network fetch.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_CPU ON CACHE BOOL "" FORCE)
set(GGML_CPU_ARM_ARCH "armv8-a" CACHE STRING "" FORCE)
foreach(option_name IN ITEMS
    GGML_BACKEND_DL GGML_CPU_ALL_VARIANTS GGML_NATIVE GGML_OPENMP GGML_OPENMP_FETCH
    GGML_CPU_KLEIDIAI GGML_LLAMAFILE GGML_BLAS GGML_ACCELERATE GGML_CUDA GGML_HIP
    GGML_VULKAN GGML_WEBGPU GGML_METAL GGML_RPC GGML_SYCL GGML_OPENVINO GGML_OPENCL
    GGML_HEXAGON GGML_BUILD_TESTS GGML_BUILD_EXAMPLES LLAMA_BUILD_COMMON
    LLAMA_BUILD_TOOLS LLAMA_BUILD_EXAMPLES LLAMA_BUILD_TESTS LLAMA_BUILD_APP
    LLAMA_BUILD_SERVER LLAMA_BUILD_UI LLAMA_BUILD_MTMD LLAMA_OPENSSL LLAMA_SUBPROCESS
    LLAMA_CONNECT)
    set(${option_name} OFF CACHE BOOL "" FORCE)
endforeach()
add_subdirectory("${AURORA_LLAMA_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/llama-pinned" EXCLUDE_FROM_ALL)

add_library(aurora_llama SHARED aurora_llama_jni.cpp)
target_link_libraries(aurora_llama PRIVATE llama)
target_compile_options(aurora_llama PRIVATE -Wall -Wextra -Werror
    -fvisibility=hidden -fvisibility-inlines-hidden -fstack-protector-strong)
target_link_options(aurora_llama PRIVATE
    "-Wl,--exclude-libs,ALL" "-Wl,--no-undefined" "-Wl,-z,relro" "-Wl,-z,now"
    "-Wl,-z,max-page-size=16384")
