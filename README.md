# 🎛️ StemSplit — Séparateur de pistes audio IA

Sépare n'importe quel audio en **5 pistes** : Voix, Percussions, Basses, Guitare, Autres.  
Propulsé par **Demucs htdemucs_6s** (Meta Research) — 100 % gratuit, sans clé API.

---

## 🚀 Déploiement sur Render (gratuit)

### 1. Mettre sur GitHub

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/TON_USER/stemsplit.git
git push -u origin main
```

### 2. Créer le service sur Render

1. Va sur [render.com](https://render.com) → **New → Web Service**
2. Connecte ton dépôt GitHub
3. Paramètres :
   - **Environment** : Python 3
   - **Build command** : `pip install -r requirements.txt`
   - **Start command** : `gunicorn app:app --workers 1 --timeout 600 --bind 0.0.0.0:$PORT`
4. **Instance type** : Free
5. Clique **Deploy**

> ⚠️ Le premier démarrage prend ~5 min (téléchargement du modèle Demucs ~320 Mo).

---

## ⚙️ Utilisation

1. Dépose un fichier audio (MP3, WAV, FLAC, OGG, M4A — max 50 Mo)
2. Clique **Séparer les pistes**
3. Attends 2–5 minutes (traitement CPU)
4. Télécharge chaque piste séparément

---

## 📁 Structure

```
stemsplit/
├── app.py              ← Backend Flask
├── templates/
│   └── index.html      ← Frontend
├── requirements.txt
├── render.yaml
├── Procfile
└── .gitignore
```

---

## ⚠️ Limitations tier gratuit Render

- RAM : 512 Mo → fichiers courts recommandés (< 4 min)
- CPU lent → traitement ~2–5 min
- Veille après 15 min d'inactivité (premier appel lent)
- Pas de persistance disque → les fichiers sont supprimés après 1h

---

## 🔧 Lancer en local

```bash
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```
