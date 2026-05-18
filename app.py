import os
import uuid
import shutil
import threading
import time
import torch
import logging
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename

# ── Demucs API Python (pas subprocess) ────────────────────────────────────────
from demucs.pretrained import get_model
from demucs.apply import apply_model
from demucs.audio import AudioFile, save_audio

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = Path("uploads")
OUTPUT_FOLDER = Path("outputs")
UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {"mp3", "wav", "flac", "ogg", "m4a", "aac"}
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

MODEL_NAME = os.environ.get("DEMUCS_MODEL", "htdemucs_6s")

jobs: dict = {}

STEM_LABELS = {
    "vocals": {"fr": "Voix",        "icon": "🎤", "color": "#ff6b9d"},
    "drums":  {"fr": "Percussions", "icon": "🥁", "color": "#ff9f43"},
    "bass":   {"fr": "Basses",      "icon": "🎸", "color": "#54a0ff"},
    "guitar": {"fr": "Guitare",     "icon": "🎵", "color": "#5f27cd"},
    "other":  {"fr": "Autres",      "icon": "🎹", "color": "#00d2d3"},
    "piano":  {"fr": "Piano",       "icon": "🎹", "color": "#1dd1a1"},
}

# ── Chargement du modèle UNE SEULE FOIS au démarrage ──────────────────────────
log.info(f"Chargement du modèle {MODEL_NAME}...")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL = get_model(MODEL_NAME)
MODEL.to(DEVICE)
MODEL.eval()
log.info(f"Modèle chargé sur {DEVICE} ✓")

# Mutex : un seul job à la fois (évite OOM sur Render free tier)
_model_lock = threading.Semaphore(1)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def cleanup_loop():
    while True:
        time.sleep(300)
        cutoff = time.time() - 3600
        for job_id, job in list(jobs.items()):
            if job.get("created_at", 0) < cutoff:
                shutil.rmtree(OUTPUT_FOLDER / job_id, ignore_errors=True)
                src = UPLOAD_FOLDER / job.get("filename", "")
                if src.exists():
                    src.unlink(missing_ok=True)
                jobs.pop(job_id, None)


threading.Thread(target=cleanup_loop, daemon=True).start()


def run_demucs(job_id: str, filepath: Path):
    jobs[job_id]["status"] = "processing"
    out_dir = OUTPUT_FOLDER / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── Chargement audio ──────────────────────────────────────────────────
        wav = AudioFile(filepath).read(
            streams=0,
            samplerate=MODEL.samplerate,
            channels=MODEL.audio_channels,
        )
        # wav shape : (channels, samples) → ajouter batch dim
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()  # normalisation
        wav = wav.unsqueeze(0).to(DEVICE)     # (1, C, T)

        # ── Séparation (modèle déjà en mémoire) ──────────────────────────────
        with _model_lock:
            with torch.no_grad():
                sources = apply_model(
                    MODEL,
                    wav,
                    device=DEVICE,
                    shifts=1,
                    split=True,
                    overlap=0.25,
                    progress=False,
                )[0]  # (stems, C, T)

        # ── Sauvegarde des pistes ─────────────────────────────────────────────
        stems = {}
        for stem_idx, stem_name in enumerate(MODEL.sources):
            audio = sources[stem_idx]           # (C, T)
            # re-dénormalisation
            audio = audio * ref.std() + ref.mean()
            out_path = out_dir / f"{stem_name}.wav"
            save_audio(audio.cpu(), str(out_path), samplerate=MODEL.samplerate)

            if stem_name in STEM_LABELS:
                stems[stem_name] = str(out_path.relative_to(OUTPUT_FOLDER))

        if not stems:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = "Aucune piste générée."
            return

        jobs[job_id]["status"] = "done"
        jobs[job_id]["stems"] = stems

    except Exception as e:
        log.exception(f"Erreur job {job_id}")
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)
    finally:
        if filepath.exists():
            filepath.unlink(missing_ok=True)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "Aucun fichier reçu."}), 400
    file = request.files["file"]
    if not file.filename or not allowed_file(file.filename):
        return jsonify({"error": "Format non supporté. Utilisez mp3, wav, flac, ogg, m4a."}), 400

    job_id = str(uuid.uuid4())
    filename = secure_filename(f"{job_id}_{file.filename}")
    filepath = UPLOAD_FOLDER / filename

    file.save(filepath)
    jobs[job_id] = {
        "status": "queued",
        "filename": filename,
        "original_name": file.filename,
        "created_at": time.time(),
        "stems": {},
    }

    thread = threading.Thread(target=run_demucs, args=(job_id, filepath), daemon=True)
    thread.start()

    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job introuvable."}), 404
    return jsonify({
        "status": job["status"],
        "stems": job.get("stems", {}),
        "error": job.get("error", ""),
        "stem_labels": STEM_LABELS,
    })


@app.route("/download/<path:filepath>")
def download(filepath):
    full_path = OUTPUT_FOLDER / filepath
    if not full_path.exists():
        return jsonify({"error": "Fichier introuvable."}), 404
    return send_file(full_path, as_attachment=True)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME, "device": DEVICE})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
