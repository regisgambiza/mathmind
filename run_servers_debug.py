#!/usr/bin/env python3
"""
Run MathMind servers in the current console window (for debugging).
Shows all server logs in real-time.
Press Ctrl+C to stop.
"""

import subprocess
import sys
import os
import signal
import time

script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

print("=" * 60)
print("MathMind Servers - Debug Mode")
print("=" * 60)
print("\nThis will start both servers in THIS console window.")
print("You will see all debug logs here.")
print("Press Ctrl+C to stop all servers.\n")

# Start backend
print("Starting Python Backend...")
backend_proc = subprocess.Popen(
    ["python", "server-python/server.py"],
    stdout=sys.stdout,
    stderr=sys.stderr,
)

# Wait for backend to start
time.sleep(3)

# Start frontend
print("\nStarting React Frontend...")
frontend_proc = subprocess.Popen(
    ["npm", "run", "dev", "--prefix", "client"],
    stdout=sys.stdout,
    stderr=sys.stderr,
    shell=True
)

print("\n" + "=" * 60)
print("Both servers started!")
print("  Frontend: http://localhost:5173")
print("  Backend:  http://localhost:5000")
print("=" * 60)
print("\nWatching for logs... (Press Ctrl+C to stop)\n")

try:
    backend_proc.wait()
except KeyboardInterrupt:
    print("\n\nShutting down...")
    backend_proc.terminate()
    frontend_proc.terminate()
    print("Servers stopped.")
