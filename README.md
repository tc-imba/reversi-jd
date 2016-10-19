# Gomoku Judge Daemon

## Windows Sandbox

Everything is running inside a sandbox in low IL. You need to set IL of the runtime directory so that it can be read or written by sandboxed applications.

```batch
icacls "DIRECTORY_OF_RUNTIME" /setintegritylevel (OI)(CI)low /t /c
```

TODO: Clean legacy files so that sandboxed applications cannot access other files.

## Compiler

The compiler requires GCC installed and in path. On Windows, TDM-GCC x86 is recommended.

### Windows & Sandbox

On Windows, Mingw-GCC uses `%USERPROFILE%\AppData\Local\Temp`, which is not accessible by default in low IL when it is spawned by the sandbox.

A workaround:

```batch
icacls "%USERPROFILE%\AppData\Local\Temp" /setintegritylevel (OI)(CI)low /t /c
```

## Match Runner

### CPU Affinity

TODO

