import os
import uuid
import time
import threading
import requests
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = Path("uploads")
OUTPUT_FOLDER = Path("outputs")
UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {"mp3", "wav", "flac", "ogg", "m4a", "aac"}
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

# URL de ton HF Space (à remplir après création)
HF_SPACE_URL = os.environ.get("HF_SPACE_URL", "https://TON-USERNAME-stemsplit.hf.space")

jobs: dict = {}

STEM_LABELS = {
    "vocals": {"fr": "Voix",        "icon": "🎤", "color": "#ff6b9d"},
    "drums":  {"fr": "Percussions", "icon": "🥁", "color": "#ff9f43"},
    "bass":   {"fr": "Basses",      "icon": "🎸", "color": "#54a0ff"},
    "guitar": {"fr": "Guitare",     "icon": "🎵", "color": "#5f27cd"},
    "other":  {"fr": "Autres",      "icon": "🎹", "color": "#00d2d3"},
}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def run_separation(job_id: str, filepath: Path, original_name: str):
    """Envoie le fichier au HF Space et récupère les pistes."""
    jobs[job_id]["status"] = "processing"
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(
                f"{HF_SPACE_URL}/separate",
                files={"file": (original_name, f)},
                timeout=300,
            )

        if resp.status_code != 200:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = f"Erreur HF Space: {resp.text[:300]}"
            return

        data = resp.json()
        stems = data.get("stems", {})

        # Télécharge chaque piste depuis HF et la stocke localement
        job_out = OUTPUT_FOLDER / job_id
        job_out.mkdir(parents=True, exist_ok=True)
        local_stems = {}

        for stem_name, stem_url in stems.items():
            dl = requests.get(f"{HF_SPACE_URL}{stem_url}", timeout=120)
            out_path = job_out / f"{stem_name}.wav"
            out_path.write_bytes(dl.content)
            local_stems[stem_name] = str(out_path.relative_to(OUTPUT_FOLDER))

        jobs[job_id]["status"] = "done"
        jobs[job_id]["stems"] = local_stems

    except requests.Timeout:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = "Délai dépassé (fichier trop long ?)"
    except Exception as e:
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
        return jsonify({"error": "Format non supporté."}), 400

    job_id = str(uuid.uuid4())
    filename = secure_filename(f"{job_id}_{file.filename}")
    filepath = UPLOAD_FOLDER / filename
    file.save(filepath)

    jobs[job_id] = {
        "status": "queued",
        "original_name": file.filename,
        "created_at": time.time(),
        "stems": {},
    }

    threading.Thread(
        target=run_separation,
        args=(job_id, filepath, file.filename),
        daemon=True
    ).start()

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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
