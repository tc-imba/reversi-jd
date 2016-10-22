# Gomoku Judge Daemon

## Prerequisites

Git

Node.js >= 6.0

TDM-GCC

## Windows Sandbox

Everything is running inside a sandbox in low IL. You need to set IL of the runtime directory so that it can be read or written by sandboxed applications.

```batch
icacls "DIRECTORY_OF_RUNTIME" /setintegritylevel (OI)(CI)low /t /c
```

## Compiler

The compiler requires GCC installed and in path. On Windows, TDM-GCC x86 is recommended.

### Windows & Sandbox

On Windows, Mingw-GCC uses `%USERPROFILE%\AppData\Local\Temp`, which is not accessible by default in low IL when it is spawned by the sandbox.

A workaround:

```batch
icacls "%USERPROFILE%\AppData\Local\Temp" /setintegritylevel (OI)(CI)low /t /c
```
