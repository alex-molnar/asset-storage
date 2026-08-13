import json
import time
import statistics
import threading
import subprocess
import urllib.request
import urllib.error
import re
from collections import defaultdict

# model,prompt_i,run_i,ttft_s,wall_s,gen_s,eval_count,tps_eval,tps_wall,mem_peak_mib
# qwen2.5:3b,1,1,11.2643,42.3571,31.0928,220,7.0756,7.0756,2651.0
# qwen2.5:3b,1,2,0.6189,31.2118,30.5930,220,7.1914,7.1912,2133.0
# qwen2.5:3b,2,1,1.5641,32.4407,30.8766,220,7.1251,7.1251,2137.0
# qwen2.5:3b,2,2,0.5371,31.2572,30.7201,220,7.1636,7.1614,2151.0
# qwen2.5:3b,3,1,2.8045,4.7727,1.9683,15,7.6150,7.6209,2151.0
# qwen2.5:3b,3,2,0.6251,2.4205,1.7955,14,7.8037,7.7974,2159.0
# qwen2.5:3b,4,1,1.9177,32.3929,30.4752,220,7.2191,7.2190,2163.0
# qwen2.5:3b,4,2,0.6181,31.4311,30.8130,220,7.1401,7.1398,2172.0
# phi3:mini,1,1,11.7710,46.9186,35.1476,220,6.2594,6.2593,3800.0
# phi3:mini,1,2,0.7811,35.5130,34.7319,220,6.3340,6.3342,3892.0
# phi3:mini,2,1,2.0331,12.6850,10.6519,67,6.2902,6.2899,3892.0
# phi3:mini,2,2,0.3372,11.1692,10.8320,72,6.6484,6.6470,3980.0
# phi3:mini,3,1,3.4339,7.0133,3.5794,24,6.7062,6.7050,3980.0
# phi3:mini,3,2,0.2589,3.7173,3.4583,21,6.0694,6.0723,4051.0
# phi3:mini,4,1,2.0423,37.4965,35.4543,220,6.2051,6.2052,4063.0
# phi3:mini,4,2,0.4460,35.5138,35.0679,220,6.2736,6.2735,4156.0
# llama3.2:latest,1,1,11.9513,44.7409,32.7896,220,6.7126,6.7094,4154.0
# llama3.2:latest,1,2,0.9207,33.2829,32.3623,220,6.7982,6.7980,2624.0
# llama3.2:latest,2,1,1.6007,21.3238,19.7232,137,6.9460,6.9461,2624.0
# llama3.2:latest,2,2,0.7853,26.4696,25.6843,174,6.7751,6.7746,2671.0
# llama3.2:latest,3,1,2.1761,4.2323,2.0563,15,7.3099,7.2948,2671.0
# llama3.2:latest,3,2,0.6378,2.6821,2.0443,15,7.3505,7.3374,2671.0
# llama3.2:latest,4,1,1.7342,34.5489,32.8146,220,6.7042,6.7043,2694.0
# llama3.2:latest,4,2,0.6869,33.3186,32.6317,220,6.7424,6.7419,2727.0

# === MODEL SUMMARY (medians) ===
# model,median_ttft_s,median_tps_eval,median_tps_wall,median_wall_s,max_mem_peak_mib
# qwen2.5:3b,1.095,7.178,7.176,31.344,2651.0
# phi3:mini,1.407,6.282,6.282,24.099,4156.0
# llama3.2:latest,1.261,6.787,6.786,29.876,4154.0

# curl localhost:11434/api/chat -d '{
#   "model": "qwen3.5:4b",
#   "think": false,
#   "message": {
#     "role": "user",
#     "content": "Explain Kubernetes requests vs limits in 5 bullet points."
#   }
# }'

# ====== CONFIG ======
OLLAMA_URL = "http://127.0.0.1:11434"
MODELS = [
    "qwen2.5:3b",
    # "qwen3.5:4b",
    "phi3:mini",
    # "mistral:7b",
    "llama3.2:latest"
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