import json
import time
import statistics
import threading
import subprocess
import urllib.request
import urllib.error
import re
from collections import defaultdict


# ====== CONFIG ======
OLLAMA_URL = "http://127.0.0.1:11434"
MODELS = [
    "qwen2.5:3b",
    "qwen3.5:4b",
    "phi3:mini",
    "mistral:7b",
    "llama3.2:latest",
    "gemma4:e4b"
]
PROMPTS = [
    "Explain Kubernetes requests vs limits in 5 bullet points.",
    "Write a Python function to deduplicate a list while preserving order.",
    "Summarize this sentence in one line: A small CPU-only homelab server needs stable local AI inference.",
    "Given a pod restart loop, list a step-by-step debugging plan.",
]
RUNS_PER_MODEL = 2
NUM_PREDICT = 220
TEMPERATURE = 0.2
TIMEOUT_SECONDS = 240

# Optional k8s memory sampling for peak pod memory
ENABLE_K8S_MEM_SAMPLING = True
K8S_NAMESPACE = "llm"
K8S_LABEL_SELECTOR = "app.kubernetes.io/name=ollama"
SAMPLE_INTERVAL_SECONDS = 0.5
# ====================

def parse_mem_to_mib(s):
  s = s.strip()
  m = re.match(r"^([0-9.]+)(Ki|Mi|Gi)$", s)
  if not m:
    return None
  val = float(m.group(1))
  unit = m.group(2)
  if unit == "Ki":
    return val / 1024.0
  if unit == "Mi":
    return val
  if unit == "Gi":
    return val * 1024.0
  return None

def find_ollama_pod(namespace, selector):
  try:
    cmd = [
      "kubectl", "get", "pods",
      "-n", namespace,
      "-l", selector,
      "-o", "jsonpath={.items[0].metadata.name}"
    ]
    out = subprocess.check_output(cmd, text=True).strip()
    return out if out else None
  except Exception:
    return None

class MemSampler:
  def __init__(self, namespace, pod, interval=0.5):
    self.namespace = namespace
    self.pod = pod
    self.interval = interval
    self.max_mib = None
    self._stop = threading.Event()
    self._t = None

  def _sample_once(self):
    try:
      cmd = ["kubectl", "top", "pod", "-n", self.namespace, self.pod, "--no-headers"]
      out = subprocess.check_output(cmd, text=True).strip()
      if not out:
        return
      parts = out.split()
      # Expected: NAME CPU MEMORY
      if len(parts) < 3:
        return
      mem = parse_mem_to_mib(parts[2])
      if mem is None:
        return
      if self.max_mib is None or mem > self.max_mib:
        self.max_mib = mem
    except Exception:
      pass

  def _run(self):
    while not self._stop.is_set():
      self._sample_once()
      self._stop.wait(self.interval)

  def start(self):
    self._t = threading.Thread(target=self._run, daemon=True)
    self._t.start()

  def stop(self):
    self._stop.set()
    if self._t:
      self._t.join(timeout=1.0)

def run_one(model, prompt):
  url = OLLAMA_URL.rstrip("/") + "/api/generate"
  payload = {
    "model": model,
    "prompt": prompt,
    "stream": True,
    "options": {
      "temperature": TEMPERATURE,
      "num_predict": NUM_PREDICT
    }
  }
  data = json.dumps(payload).encode("utf-8")
  req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})

  t0 = time.time()
  first_token_time = None
  final_obj = None

  with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
    for raw in resp:
      if not raw:
        continue
      line = raw.decode("utf-8", errors="replace").strip()
      if not line:
        continue
      try:
        obj = json.loads(line)
      except json.JSONDecodeError:
        continue

      token_piece = obj.get("response", "")
      if first_token_time is None and token_piece:
        first_token_time = time.time()

      if obj.get("done") is True:
        final_obj = obj
        break

  t1 = time.time()
  if first_token_time is None:
    first_token_time = t1

  wall_s = t1 - t0
  ttft_s = first_token_time - t0
  gen_s = max(t1 - first_token_time, 1e-9)

  eval_count = (final_obj or {}).get("eval_count")
  eval_duration_ns = (final_obj or {}).get("eval_duration")
  prompt_eval_count = (final_obj or {}).get("prompt_eval_count")
  prompt_eval_duration_ns = (final_obj or {}).get("prompt_eval_duration")

  if isinstance(eval_count, int) and isinstance(eval_duration_ns, int) and eval_duration_ns > 0:
    tps_eval = eval_count / (eval_duration_ns / 1e9)
  else:
    tps_eval = None

  if isinstance(eval_count, int):
    tps_wall = eval_count / gen_s
  else:
    tps_wall = None

  return {
    "wall_s": wall_s,
    "ttft_s": ttft_s,
    "gen_s": gen_s,
    "eval_count": eval_count,
    "prompt_eval_count": prompt_eval_count,
    "prompt_eval_s": (prompt_eval_duration_ns / 1e9) if isinstance(prompt_eval_duration_ns, int) else None,
    "tps_eval": tps_eval,
    "tps_wall": tps_wall,
  }

def med(vals):
  vals = [v for v in vals if v is not None]
  if not vals:
    return None
  return statistics.median(vals)

def fmt(v, nd=2):
  if v is None:
    return "n/a"
  return f"{v:.{nd}f}"

all_rows = []
by_model = defaultdict(list)

pod_name = None
if ENABLE_K8S_MEM_SAMPLING:
  pod_name = find_ollama_pod(K8S_NAMESPACE, K8S_LABEL_SELECTOR)
  if pod_name:
    print(f"Detected Ollama pod: {pod_name}")
  else:
    print("Could not detect Ollama pod for memory sampling; continuing without mem peak.")
else:
  print("K8s memory sampling disabled.")

total_runs = len(MODELS) * len(PROMPTS) * RUNS_PER_MODEL
run_index = 0

for model in MODELS:
  for prompt_i, prompt in enumerate(PROMPTS, start=1):
    for run_i in range(1, RUNS_PER_MODEL + 1):
      run_index += 1
      print(f"\n[{run_index}/{total_runs}] model={model} prompt={prompt_i} run={run_i}")

      sampler = None
      if pod_name:
        sampler = MemSampler(K8S_NAMESPACE, pod_name, SAMPLE_INTERVAL_SECONDS)
        sampler.start()

      try:
        result = run_one(model, prompt)
        mem_peak = sampler.max_mib if sampler else None
        row = {
          "model": model,
          "prompt_i": prompt_i,
          "run_i": run_i,
          "ttft_s": result["ttft_s"],
          "wall_s": result["wall_s"],
          "gen_s": result["gen_s"],
          "eval_count": result["eval_count"],
          "tps_eval": result["tps_eval"],
          "tps_wall": result["tps_wall"],
          "mem_peak_mib": mem_peak,
        }
        all_rows.append(row)
        by_model[model].append(row)
        print(
          "  ttft_s={} wall_s={} tps_eval={} tps_wall={} mem_peak_mib={}".format(
            fmt(row["ttft_s"], 2),
            fmt(row["wall_s"], 2),
            fmt(row["tps_eval"], 2),
            fmt(row["tps_wall"], 2),
            fmt(row["mem_peak_mib"], 0),
          )
        )
      except urllib.error.HTTPError as e:
        print(f"  HTTP error: {e.code} {e.reason}")
      except Exception as e:
        print(f"  Error: {e}")
      finally:
        if sampler:
          sampler.stop()

print("\n=== RAW CSV ===")
print("model,prompt_i,run_i,ttft_s,wall_s,gen_s,eval_count,tps_eval,tps_wall,mem_peak_mib")
for r in all_rows:
  print(
    "{},{},{},{:.4f},{:.4f},{:.4f},{},{},{},{}".format(
      r["model"], r["prompt_i"], r["run_i"],
      r["ttft_s"], r["wall_s"], r["gen_s"],
      r["eval_count"] if r["eval_count"] is not None else "",
      f"{r['tps_eval']:.4f}" if r["tps_eval"] is not None else "",
      f"{r['tps_wall']:.4f}" if r["tps_wall"] is not None else "",
      f"{r['mem_peak_mib']:.1f}" if r["mem_peak_mib"] is not None else "",
    )
  )

print("\n=== MODEL SUMMARY (medians) ===")
print("model,median_ttft_s,median_tps_eval,median_tps_wall,median_wall_s,max_mem_peak_mib")
for model, rows in by_model.items():
  ttft = med([r["ttft_s"] for r in rows])
  tps_eval = med([r["tps_eval"] for r in rows])
  tps_wall = med([r["tps_wall"] for r in rows])
  wall = med([r["wall_s"] for r in rows])
  mem_peaks = [r["mem_peak_mib"] for r in rows if r["mem_peak_mib"] is not None]
  max_mem = max(mem_peaks) if mem_peaks else None
  print(
    "{},{},{},{},{},{}".format(
      model,
      fmt(ttft, 3),
      fmt(tps_eval, 3),
      fmt(tps_wall, 3),
      fmt(wall, 3),
      fmt(max_mem, 1),
    )
  )