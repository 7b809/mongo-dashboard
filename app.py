
import os
import math
from datetime import datetime, date
from flask import Flask, jsonify, render_template, request
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

# Load .env for local dev. In Vercel, env vars come from the dashboard.
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DEFAULT_DB = os.getenv("MONGODB_DB")  # Optional: used only to auto-select in UI

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI must be set as an environment variable.")

# Create a single global client for connection reuse across invocations
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)

app = Flask(__name__)


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
    # Pass optional default DB to the client to auto-select
    return render_template("index.html", default_db=DEFAULT_DB)


@app.route("/api/databases", methods=["GET"]) 
def list_databases():
    """Return list of database names the user can access."""
    try:
        # Use list_database_names for a simple list
        names = sorted(client.list_database_names())
        return jsonify({"databases": names})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/collections", methods=["GET"]) 
def list_collections():
    """Return collection names for a given database (?db=)."""
    db_name = request.args.get("db")
    if not db_name:
        return jsonify({"error": "Missing 'db' parameter."}), 400
    try:
        # Validate DB exists in visible list
        if db_name not in client.list_database_names():
            return jsonify({"error": f"Database '{db_name}' not found."}), 404
        names = sorted(client[db_name].list_collection_names())
        return jsonify({"collections": names})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/docs", methods=["GET"]) 
def get_docs():
    """
    Query params:
      - db (required)
      - collection (required)
      - page (1-based; default 1)
      - limit (default 25, max 100)
    Returns:
      { docs: [...], page: 1, limit: 25, total_count: n, total_pages: m }
    """
    db_name = request.args.get("db")
    coll_name = request.args.get("collection")

    if not db_name or not coll_name:
        return jsonify({"error": "Missing 'db' or 'collection' parameter."}), 400

    try:
        # Validate DB
        if db_name not in client.list_database_names():
            return jsonify({"error": f"Database '{db_name}' not found."}), 404
        _db = client[db_name]

        # Validate collection
        if coll_name not in _db.list_collection_names():
            return jsonify({"error": f"Collection '{coll_name}' not found in '{db_name}'."}), 404

        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 25))
        page = max(page, 1)
        limit = min(max(limit, 1), 100)
        skip = (page - 1) * limit

        coll = _db[coll_name]

        # Count for pagination
        total_count = coll.count_documents({})
        total_pages = max(1, math.ceil(total_count / limit)) if total_count else 1

        # Fetch docs; default sort by _id ascending (roughly "first" docs)
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


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
