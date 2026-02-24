import os
import math
from datetime import datetime, date, timedelta
from flask import Flask, jsonify, render_template, request, session
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
from functools import wraps
import secrets

# Load .env for local dev. In Vercel, env vars come from the dashboard.
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DEFAULT_DB = os.getenv("MONGODB_DB")  # Optional: used only to auto-select in UI

# NEW: Admin password & session config
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
SESSION_TIMEOUT_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "30"))

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI must be set as an environment variable.")

if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD must be set as an environment variable.")

# Create a single global client for connection reuse across invocations
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)

app = Flask(__name__)

# Secure session configuration
app.secret_key = os.getenv("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True,
    PERMANENT_SESSION_LIFETIME=timedelta(minutes=SESSION_TIMEOUT_MINUTES)
)


# ==========================
# AUTH SYSTEM
# ==========================

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("authenticated"):
            return jsonify({"error": "Unauthorized"}), 401

        login_time = session.get("login_time")
        if login_time:
            elapsed = (datetime.utcnow() - login_time).total_seconds()
            if elapsed > SESSION_TIMEOUT_MINUTES * 60:
                session.clear()
                return jsonify({"error": "Session expired"}), 401

        return f(*args, **kwargs)
    return decorated


@app.route("/login", methods=["POST"])
def login():
    password = request.json.get("password")

    if password == ADMIN_PASSWORD:
        session["authenticated"] = True
        session["login_time"] = datetime.utcnow()
        return jsonify({"success": True})

    return jsonify({"error": "Invalid password"}), 401


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    session.clear()
    return jsonify({"success": True})


# ==========================
# EXISTING CODE (UNCHANGED)
# ==========================

def sanitize(value):
    """Recursively convert BSON/unsupported types to JSON-safe values."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()}
    return value


@app.route("/")
def home():
    return render_template("index.html", default_db=DEFAULT_DB)


@app.route("/api/databases", methods=["GET"])
@login_required
def list_databases():
    try:
        names = sorted(client.list_database_names())
        return jsonify({"databases": names})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/collections", methods=["GET"])
@login_required
def list_collections():
    db_name = request.args.get("db")
    if not db_name:
        return jsonify({"error": "Missing 'db' parameter."}), 400
    try:
        if db_name not in client.list_database_names():
            return jsonify({"error": f"Database '{db_name}' not found."}), 404
        names = sorted(client[db_name].list_collection_names())
        return jsonify({"collections": names})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/docs", methods=["GET"])
@login_required
def get_docs():
    db_name = request.args.get("db")
    coll_name = request.args.get("collection")

    if not db_name or not coll_name:
        return jsonify({"error": "Missing 'db' or 'collection' parameter."}), 400

    try:
        if db_name not in client.list_database_names():
            return jsonify({"error": f"Database '{db_name}' not found."}), 404
        _db = client[db_name]

        if coll_name not in _db.list_collection_names():
            return jsonify({"error": f"Collection '{coll_name}' not found in '{db_name}'."}), 404

        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 25))
        page = max(page, 1)
        limit = min(max(limit, 1), 100)
        skip = (page - 1) * limit

        coll = _db[coll_name]

        total_count = coll.count_documents({})
        total_pages = max(1, math.ceil(total_count / limit)) if total_count else 1

        cursor = coll.find({}, skip=skip, limit=limit).sort([("_id", 1)])
        docs = [sanitize(d) for d in cursor]

        return jsonify({
            "docs": docs,
            "page": page,
            "limit": limit,
            "total_count": total_count,
            "total_pages": total_pages
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================
# DELETE FEATURES (NEW)
# ==========================

@app.route("/api/delete_doc", methods=["POST"])
@login_required
def delete_doc():
    try:
        db = request.json.get("db")
        collection = request.json.get("collection")
        doc_id = request.json.get("id")

        result = client[db][collection].delete_one({"_id": ObjectId(doc_id)})

        return jsonify({"deleted": result.deleted_count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete_collection", methods=["POST"])
@login_required
def delete_collection():
    try:
        db = request.json.get("db")
        collection = request.json.get("collection")
        confirm = request.json.get("confirm")

        if confirm != collection:
            return jsonify({"error": "Confirmation text does not match."}), 400

        client[db].drop_collection(collection)
        return jsonify({"deleted": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete_database", methods=["POST"])
@login_required
def delete_database():
    try:
        db = request.json.get("db")
        confirm = request.json.get("confirm")

        if confirm != db:
            return jsonify({"error": "Confirmation text does not match."}), 400

        client.drop_database(db)
        return jsonify({"deleted": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================
# RUN
# ==========================

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)