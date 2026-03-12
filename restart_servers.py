#!/usr/bin/env python3
"""
Restart or start the MathMind servers (Python backend + React frontend) and stream logs.
"""

import os
import shutil
import subprocess
import sys
import time
import threading

SERVERS = {
    "backend": {
        "name": "Python Backend",
        "command": ["python", "server-python/server.py"],
        "port": 5000,
    },
    "frontend": {
        "name": "React Frontend",
        "command": ["npm", "run", "dev", "--prefix", "client"],
        "port": 5173,
    },
}


def is_port_in_use(port):
    """Check if a port is in use on Windows."""
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        return f":{port}" in result.stdout
    except Exception:
        return False


def kill_process_on_port(port):
    """Kill only Python/Node processes using the specified port."""
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )

        killed = set()
        for line in result.stdout.splitlines():
            if f":{port}" not in line:
                continue
            parts = line.split()
            if len(parts) < 5:
                continue
            pid = parts[-1]
            if not pid.isdigit() or pid in killed:
                continue

            try:
                proc_result = subprocess.run(
                    ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV"],
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
                )
                proc_name = proc_result.stdout.lower()
                if ("python" in proc_name or "node" in proc_name) and "chrome" not in proc_name:
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True,
                        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
                    )
                    print(f"  Killed process {pid} on port {port}")
                    killed.add(pid)
            except Exception:
                pass
    except Exception:
        pass


def start_server(name, config):
    """Start a server and stream its stdout/stderr to this console."""
    print(f"Starting {config['name']}...")
    cmd = config["command"]

    # Resolve npm on Windows; keep list form to handle spaces in paths
    use_shell = False
    if os.name == "nt" and cmd and cmd[0].lower() == "npm":
        npm_path = shutil.which("npm") or shutil.which("npm.cmd")
        cmd = [npm_path or "npm.cmd"] + cmd[1:]

    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    # Force esbuild to use the packaged Windows binary explicitly
    if name == "frontend":
        src_esbuild = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "client",
            "node_modules",
            "@esbuild",
            "win32-x64",
            "esbuild.exe",
        )
        temp_esbuild = os.path.join(os.environ.get("TEMP", os.getcwd()), "esbuild-mathmind.exe")
        try:
            if os.path.exists(src_esbuild):
                shutil.copy2(src_esbuild, temp_esbuild)
                env["ESBUILD_BINARY_PATH"] = temp_esbuild
        except Exception:
            env["ESBUILD_BINARY_PATH"] = src_esbuild

    try:
        process = subprocess.Popen(
            cmd,
            cwd=os.path.dirname(os.path.abspath(__file__)),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=False,  # read bytes to avoid codepage decode errors
            shell=use_shell,
            env=env,
        )
    except FileNotFoundError as e:
        print(f"  ! Could not start {config['name']}: {e}")
        return None
    return process


def stream_logs(name, process):
    """Continuously read and prefix process output."""
    if not process or not process.stdout:
        return
    prefix = f"[{name}] ".encode("utf-8")
    out = getattr(sys.stdout, "buffer", sys.stdout)
    for raw in iter(process.stdout.readline, b""):
        if not raw:
            break
        try:
            out.write(prefix + raw)
        except Exception:
            safe = raw.decode("utf-8", errors="replace").encode("utf-8")
            out.write(prefix + safe)
        try:
            out.flush()
        except Exception:
            pass


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    print("MathMind Server Manager\n")

    backend_running = is_port_in_use(5000)
    frontend_running = is_port_in_use(5173)

    print("Current status:")
    print(f"  Backend  (port 5000):  {'RUNNING' if backend_running else 'STOPPED'}")
    print(f"  Frontend (port 5173): {'RUNNING' if frontend_running else 'STOPPED'}")
    print()

    if backend_running or frontend_running:
        print("Stopping existing servers...")
        if backend_running:
            kill_process_on_port(5000)
        if frontend_running:
            kill_process_on_port(5173)
        time.sleep(2)

    print("\nStarting servers...")

    backend_proc = start_server("backend", SERVERS["backend"])
    if backend_proc:
        threading.Thread(target=stream_logs, args=("backend", backend_proc), daemon=True).start()
    print("  Waiting for backend to initialize...")
    time.sleep(4)

    frontend_proc = start_server("frontend", SERVERS["frontend"])
    if frontend_proc:
        threading.Thread(target=stream_logs, args=("frontend", frontend_proc), daemon=True).start()
    print("  Waiting for frontend to initialize...")
    time.sleep(5)

    backend_ok = is_port_in_use(5000)
    frontend_ok = is_port_in_use(5173)

    print("\n" + "=" * 50)
    if backend_ok and frontend_ok:
        print("Both servers started successfully.")
    else:
        print("Warning: Some servers may not have started:")
        if not backend_ok:
            print("   - Backend (port 5000) not detected")
        if not frontend_ok:
            print("   - Frontend (port 5173) not detected")

    print("\nAccess URLs:")
    print("  Frontend: http://localhost:5173")
    print("  Backend:  http://localhost:5000")
    print("\nLogs are streaming below. Press Ctrl+C to stop both servers.")

    try:
        while True:
            procs = [p for p in (backend_proc, frontend_proc) if p]
            if any(p.poll() is not None for p in procs):
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping servers...")
        for proc in (backend_proc, frontend_proc):
            if proc and proc.poll() is None:
                proc.terminate()
        for proc in (backend_proc, frontend_proc):
            if proc:
                try:
                    proc.wait(timeout=5)
                except Exception:
                    pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
