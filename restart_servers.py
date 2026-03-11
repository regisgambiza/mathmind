#!/usr/bin/env python3
"""
Restart or start the MathMind servers (Python backend + React frontend).
"""

import subprocess
import sys
import time
import os
import signal

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
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        )
        return f":{port}" in result.stdout
    except Exception:
        return False


def kill_process_on_port(port):
    """Kill any process using the specified port."""
    try:
        # Find PID using the port
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        )
        
        killed_pids = set()  # Track already killed PIDs to avoid duplicates
        for line in result.stdout.splitlines():
            if f":{port}" in line:
                parts = line.split()
                if parts:
                    pid = parts[-1]
                    if pid not in killed_pids and pid.isdigit():
                        try:
                            subprocess.run(
                                ["taskkill", "/F", "/PID", pid],
                                capture_output=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
                            )
                            print(f"  Killed process {pid} on port {port}")
                            killed_pids.add(pid)
                        except Exception:
                            pass
    except Exception:
        pass


def start_server(name, config):
    """Start a server in the background."""
    print(f"Starting {config['name']}...")
    # Use shell=True on Windows to resolve npm properly
    # CREATE_NO_WINDOW keeps it in background but we lose logs
    # For debugging, use CREATE_NEW_CONSOLE to see output in separate window
    process = subprocess.Popen(
        config["command"],
        cwd=os.path.dirname(os.path.abspath(__file__)),
        shell=True,
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )
    return process


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print("MathMind Server Manager\n")
    
    # Check current status
    backend_running = is_port_in_use(5000)
    frontend_running = is_port_in_use(5173)
    
    print("Current status:")
    print(f"  Backend  (port 5000):  {'RUNNING' if backend_running else 'STOPPED'}")
    print(f"  Frontend (port 5173): {'RUNNING' if frontend_running else 'STOPPED'}")
    print()
    
    # Stop existing servers if running
    if backend_running or frontend_running:
        print("Stopping existing servers...")
        if backend_running:
            kill_process_on_port(5000)
        if frontend_running:
            kill_process_on_port(5173)
        time.sleep(2)
    
    # Start both servers
    print("\nStarting servers...")
    
    backend_proc = start_server("backend", SERVERS["backend"])
    print("  Waiting for backend to initialize...")
    time.sleep(4)  # Give backend time to initialize

    frontend_proc = start_server("frontend", SERVERS["frontend"])
    print("  Waiting for frontend to initialize...")
    time.sleep(5)  # Give frontend time to initialize

    # Verify servers started
    backend_ok = is_port_in_use(5000)
    frontend_ok = is_port_in_use(5173)

    print("\n" + "="*50)
    if backend_ok and frontend_ok:
        print("✅ Both servers started successfully!")
    else:
        print("⚠️  Warning: Some servers may not have started:")
        if not backend_ok:
            print("   - Backend (port 5000) not detected")
        if not frontend_ok:
            print("   - Frontend (port 5173) not detected")
    
    print("\nAccess URLs:")
    print("  Frontend: http://localhost:5173")
    print("  Backend:  http://localhost:5000")
    print("\nServers are running in new console windows.")
    print("Press Ctrl+C in each window to stop the servers.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
