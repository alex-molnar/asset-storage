#!/usr/bin/env python3
import argparse
import json
import sys
import time
import urllib.request
import urllib.error


def format_bytes(n: int) -> str:
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    x = float(n)
    for u in units:
        if x < 1024 or u == units[-1]:
            return f"{x:.1f} {u}"
        x /= 1024.0
    return f"{n} B"


def progress_bar(pct: float, width: int = 30) -> str:
    pct = max(0.0, min(100.0, pct))
    filled = int(width * pct / 100)
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def pull_model(base_url: str, model: str, insecure: bool = False) -> int:
    url = base_url.rstrip("/") + "/api/pull"
    payload = {"model": model, "stream": True}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=3600) as resp:
            last_line = ""
            last_pct = -1.0
            start = time.time()

            print(f"Pulling model: {model}")
            print(f"Endpoint: {url}")

            for raw in resp:
                if not raw:
                    continue

                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                try:
                    evt = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if "error" in evt:
                    print(f"\nError: {evt['error']}", file=sys.stderr)
                    return 1

                status = evt.get("status", "")
                total = evt.get("total")
                completed = evt.get("completed")

                if isinstance(total, int) and total > 0 and isinstance(completed, int):
                    pct = (completed / total) * 100.0
                    if pct != last_pct or status != last_line:
                        bar = progress_bar(pct)
                        msg = (
                            f"\r{bar} {pct:6.2f}%  "
                            f"{format_bytes(completed)}/{format_bytes(total)}  "
                            f"{status}"
                        )
                        print(msg, end="", flush=True)
                        last_pct = pct
                        last_line = status
                else:
                    # Some events only contain status text
                    if status and status != last_line:
                        print(f"\r{status}{' ' * 40}", end="", flush=True)
                        last_line = status

            elapsed = time.time() - start
            print(f"\nDone in {elapsed:.1f}s")
            return 0

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} {e.reason}\n{body}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"Connection error: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled by user.", file=sys.stderr)
        return 130


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pull an Ollama model and show percentage progress."
    )
    parser.add_argument("model", help="Model name, e.g. qwen2.5:3b")
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:11434",
        help="Ollama base URL (default: http://127.0.0.1:11434)",
    )
    args = parser.parse_args()
    return pull_model(args.url, args.model)


if __name__ == "__main__":
    raise SystemExit(main())