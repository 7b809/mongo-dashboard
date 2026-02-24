
# MongoDB Dashboard (Flask on Vercel) — URI → DBs → Collections → Docs

This dashboard connects to MongoDB Atlas using **only `MONGODB_URI`** and automatically lists **Databases → Collections → Documents** with pagination.

## Features
- **URI-only** connection; no DB required. (Optional `MONGODB_DB` to auto-select on load.)
- List databases (requires user permission to list DBs).
- List collections for selected DB.
- View paginated documents (25/50/100 per page), sorted by `_id` ascending.
- Clean Bootstrap UI, responsive layout.
- Ready for Vercel serverless deployment.

## Environment Variables
- `MONGODB_URI` – your MongoDB Atlas connection string (required)
- `MONGODB_DB` – optional default DB to auto-select in the UI
- `PORT` – local run port (default 8000)

## Local Development

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scriptsctivate
pip install -r requirements.txt
cp .env.example .env  # edit with your values
python app.py  # visit http://localhost:8000
```

## Deploy to Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. `vercel login` and then `vercel`
3. In Vercel Project Settings → Environment Variables, add: `MONGODB_URI` (and optionally `MONGODB_DB`)
4. Deploy: `vercel --prod`

## Notes
- Your MongoDB user must have permissions to **list databases** for the URI-only flow.
- For very large collections, counting all docs can be heavy; consider estimated counts or filters if needed.
- Pagination limit is capped at 100 per page for predictable performance.
