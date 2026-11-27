"""Read-only connectivity diagnostic. Does not send private user data."""
import json
import os
import urllib.error
import urllib.request

endpoint = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
request = urllib.request.Request(endpoint + "/api/tags")
try:
    with urllib.request.urlopen(request, timeout=5) as response:
        models = json.load(response).get("models", [])
        print("Ollama reachable; models:", ", ".join(m.get("name", "?") for m in models) or "(none)")
except (urllib.error.URLError, TimeoutError, ValueError) as exc:
    print("Ollama not reachable:", exc)
    raise SystemExit(1)
