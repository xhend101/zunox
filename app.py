from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import json
import os
import sys

# Force UTF-8 output on Windows to avoid UnicodeEncodeError in print()
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Enable CORS for all routes
CORS(app)

SUNO_API_BASE = "https://api.sunoapi.org/api/v1"
MIN_CREDITS = 10

CREDIT_PATTERNS = [
    "the current credits are insufficient",
    "current credits are insufficient",
    "credits insufficient",
    "insufficient credits",
    "out of credits",
    "balance isn't enough",
    "balance isnt enough",
    "please top up",
    "top up to continue",
]

def is_credit_error(msg):
    if not msg: return False
    return any(pat in str(msg).lower() for pat in CREDIT_PATTERNS)

def check_key_credits(api_key):
    result = make_suno_request("GET", "/generate/credit", api_key)
    if result.get("code") == 200:
        return result.get("data", 0), True, None
    return None, False, result.get("msg", "Unknown error")

def make_suno_request(method, endpoint, api_key, data=None, params=None):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    url = f"{SUNO_API_BASE}{endpoint}"
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, params=params, timeout=30)
        else:
            resp = requests.post(url, headers=headers, json=data, timeout=30)
        
        print(f"[API] {method} {url} -> HTTP {resp.status_code}", flush=True)
        try:
            return resp.json()
        except Exception:
            return {"code": resp.status_code, "msg": resp.text[:200], "data": None}
    except requests.exceptions.Timeout:
        return {"code": 408, "msg": "Request timeout", "data": None}
    except Exception as e:
        return {"code": 500, "msg": str(e), "data": None}

def extract_task_id(result):
    data = result.get("data")
    if isinstance(data, dict):
        for k in ("taskId", "task_id", "id"):
            if data.get(k): return str(data[k])
    for k in ("taskId", "task_id"):
        if result.get(k): return str(result[k])
    return None

def extract_songs_and_status(result):
    data = result.get("data", {})
    if isinstance(data, list):
        # Filter out songs with 0 duration or no audio URL
        valid_songs = []
        filtered_count = 0
        for i, song in enumerate(data):
            if isinstance(song, dict):
                # Check if song has valid duration and audio URL
                duration = song.get("duration", 0)
                audio_url = song.get("audio_url") or song.get("url")
                song_title = song.get("title", f"Song {i+1}")
                
                if duration and duration > 0 and audio_url:
                    valid_songs.append(song)
                    print(f"[FILTER] Song {i+1} '{song_title}' - Duration: {duration}s - KEPT", flush=True)
                else:
                    filtered_count += 1
                    print(f"[FILTER] Song {i+1} '{song_title}' - Duration: {duration}s, URL: {bool(audio_url)} - FILTERED", flush=True)
        
        if filtered_count > 0:
            print(f"[FILTER] Filtered out {filtered_count} songs with 0 duration or no audio URL", flush=True)
        
        return ("complete" if valid_songs else "pending"), valid_songs
    if not isinstance(data, dict):
        return "pending", []

    status = str(data.get("status", "")).lower()
    songs = []
    response = data.get("response", {})
    if isinstance(response, dict):
        songs = response.get("sunoData") or response.get("songs") or response.get("data") or []
    if not songs:
        songs = data.get("sunoData") or data.get("songs") or data.get("data") or []
    if not isinstance(songs, list): songs = []

    # Filter out songs with 0 duration or no audio URL
    valid_songs = []
    filtered_count = 0
    for i, song in enumerate(songs):
        if isinstance(song, dict):
            duration = song.get("duration", 0)
            audio_url = song.get("audio_url") or song.get("url")
            song_title = song.get("title", f"Song {i+1}")
            
            if duration and duration > 0 and audio_url:
                valid_songs.append(song)
                print(f"[FILTER] Song {i+1} '{song_title}' - Duration: {duration}s - KEPT", flush=True)
            else:
                filtered_count += 1
                print(f"[FILTER] Song {i+1} '{song_title}' - Duration: {duration}s, URL: {bool(audio_url)} - FILTERED", flush=True)
    
    if filtered_count > 0:
        print(f"[FILTER] Filtered out {filtered_count} songs with 0 duration or no audio URL", flush=True)

    if status in ("success", "first_success", "complete", "finished"):
        status = "complete"
    elif status in ("running", "processing", "composing", "streaming"):
        status = "first"
    elif status in ("text_success", "writing"):
        status = "text"
    elif status in ("error", "failed", "rejected", "banned", "cancelled"):
        status = "error"
    elif not status or status in ("pending", "queued", "waiting"):
        status = "pending"

    return status, valid_songs


# ——————————————————————————————
# ROUTES
# ——————————————————————————————

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/keys/check-credits", methods=["POST"])
def check_credits():
    keys = (request.json or {}).get("keys", [])
    results, valid_keys = [], []
    for key in keys:
        credits, ok, msg = check_key_credits(key)
        if ok:
            sufficient = credits >= MIN_CREDITS
            results.append({
                "key": key, 
                "credits": credits, 
                "status": "ok", 
                "sufficient": sufficient, 
                "removed": not sufficient
            })
            if sufficient:
                valid_keys.append(key)
        else:
            results.append({
                "key": key, 
                "credits": None, 
                "status": "error", 
                "msg": msg, 
                "removed": True
            })

    return jsonify({
        "results": results, 
        "removed": len(keys) - len(valid_keys), 
        "remaining": len(valid_keys), 
        "min_credits": MIN_CREDITS
    })

@app.route("/api/keys/remove-exhausted", methods=["POST"])
def remove_exhausted_keys():
    req = request.json or {}
    exhausted_key = req.get("exhaustedKey")
    remaining_keys = req.get("remainingKeys", [])
    
    if not exhausted_key:
        return jsonify({"success": False, "error": "No exhausted key provided"})
    
    print(f"[KEY-REMOVAL] Removing exhausted API key: {exhausted_key[:8]}...", flush=True)
    
    # Verify the key is actually exhausted
    credits, ok, msg = check_key_credits(exhausted_key)
    is_exhausted = not ok or (credits is not None and credits < MIN_CREDITS)
    
    return jsonify({
        "success": True,
        "removedKey": exhausted_key,
        "isExhausted": is_exhausted,
        "remainingKeys": remaining_keys,
        "message": "API key removed due to credit exhaustion" if is_exhausted else "API key still has credits"
    })

@app.route("/api/generate", methods=["POST"])
def generate_music():
    req = request.json or {}
    api_key = req.get("apiKey")
    all_keys = req.get("allKeys", [])
    
    if not api_key:
        return jsonify({"success": False, "error": "No API key. Add one in Settings."})

    custom_mode  = req.get("customMode", False)
    instrumental = req.get("instrumental", True)
    model        = req.get("model", "V5_5")

    # Use environment variable for Vercel deployment, fallback to request host
    host = os.environ.get('VERCEL_URL') or os.environ.get('APP_HOST') or request.host_url.rstrip("/")
    # Ensure proper URL format for Vercel
    if host and not host.startswith(('http://', 'https://')):
        host = f"https://{host}"
    
    payload = {
        "customMode":   custom_mode,
        "instrumental": instrumental,
        "model":        model,
        "callBackUrl":  f"{host}/api/callback"
    }

    if custom_mode:
        payload["style"] = req.get("style", "")
        payload["title"] = req.get("title", "")
        if not instrumental:
            payload["prompt"] = req.get("lyrics", "")
    else:
        payload["prompt"] = req.get("prompt", "")

    if req.get("negativeTags"):                          payload["negativeTags"]         = req["negativeTags"]
    if req.get("vocalGender") and not instrumental:      payload["vocalGender"]           = req["vocalGender"]
    if req.get("styleWeight") is not None:               payload["styleWeight"]           = float(req["styleWeight"])
    if req.get("weirdnessConstraint") is not None:       payload["weirdnessConstraint"]   = float(req["weirdnessConstraint"])

    # Try generation with current API key
    result = make_suno_request("POST", "/generate", api_key, data=payload)

    # Check if it's a credit error and we have other keys to try
    if result.get("code") != 200 and is_credit_error(result.get("msg")) and all_keys:
        # Find current key index
        current_index = all_keys.index(api_key) if api_key in all_keys else -1
        
        # Try next available keys
        for i in range(current_index + 1, len(all_keys)):
            next_key = all_keys[i]
            print(f"[AUTO-SWITCH] Trying next API key {i+1}/{len(all_keys)}", flush=True)
            
            # Check if next key has sufficient credits
            credits, ok, msg = check_key_credits(next_key)
            if ok and credits >= MIN_CREDITS:
                print(f"[AUTO-SWITCH] Using API key with {credits} credits", flush=True)
                result = make_suno_request("POST", "/generate", next_key, data=payload)
                
                if result.get("code") == 200:
                    task_id = extract_task_id(result)
                    if task_id:
                        print(f"[AUTO-SWITCH] Successfully generated with new API key", flush=True)
                        return jsonify({
                            "success": True,
                            "taskId": task_id,
                            "title": req.get("title", req.get("prompt", "Untitled"))[:60],
                            "model": model,
                            "instrumental": instrumental,
                            "style": req.get("style", ""),
                            "regenerating": True,
                            "newApiKey": next_key,
                            "message": "Switched to new API key due to credit exhaustion"
                        })
            else:
                print(f"[AUTO-SWITCH] Next API key insufficient credits: {credits}", flush=True)

    if result.get("code") == 200:
        task_id = extract_task_id(result)
        if not task_id:
            return jsonify({"success": False, "error": "No taskId in response"})
        return jsonify({
            "success": True, 
            "taskId": task_id,
            "title": req.get("title", req.get("prompt", "Untitled"))[:60],
            "model": model,
            "instrumental": instrumental,
            "style": req.get("style", "")
        })

    return jsonify({"success": False, "error": result.get("msg", "Generation failed")})

@app.route("/api/track/<task_id>", methods=["GET"])
def get_track(task_id):
    api_key = request.args.get("apiKey")
    if not api_key:
        return jsonify({"success": False, "error": "No API key"})
        
    result = make_suno_request("GET", "/generate/record-info", api_key, params={"taskId": task_id})
    code = result.get("code")
    if code != 200:
        return jsonify({"success": False, "track": {"taskId": task_id, "status": "error"}})
        
    status_str, songs = extract_songs_and_status(result)
    
    return jsonify({
        "success": True, 
        "track": {
            "taskId": task_id,
            "status": status_str,
            "songs": songs
        }
    })

@app.route("/api/callback", methods=["POST"])
def suno_callback():
    return jsonify({"code": 200, "msg": "ok"})

# Vercel serverless handler
# Check if running in Vercel environment
if os.environ.get('VERCEL'):
    # Export the app for Vercel serverless
    app.debug = False
else:
    # Local development
    if __name__ == "__main__":
        app.run(debug=True, host="0.0.0.0", port=5000)
