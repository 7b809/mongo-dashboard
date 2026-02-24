
const databasesList = document.getElementById("databasesList");
const collectionsList = document.getElementById("collectionsList");
const refreshDatabases = document.getElementById("refreshDatabases");
const refreshCollections = document.getElementById("refreshCollections");

const activeDatabase = document.getElementById("activeDatabase");
const activeCollection = document.getElementById("activeCollection");
const tableContainer = document.getElementById("tableContainer");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageIndicator = document.getElementById("pageIndicator");
const countInfo = document.getElementById("countInfo");
const limitSelect = document.getElementById("limitSelect");

let state = {
  db: (typeof window !== 'undefined' && window.DEFAULT_DB) ? window.DEFAULT_DB : null,
  collection: null,
  page: 1,
  limit: parseInt(limitSelect.value, 10),
  totalPages: 1,
  totalCount: 0
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = await res.text();
    try { const j = JSON.parse(msg); msg = j.error || msg; } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

function setActiveBadges() {
  activeDatabase.textContent = state.db || '—';
  activeCollection.textContent = state.collection ? `${state.collection}` : '—';
}

async function loadDatabases() {
  databasesList.innerHTML = `<div class="p-3 text-muted">Loading databases…</div>`;
  try {
    const data = await fetchJSON("/api/databases");
    const names = data.databases || [];
    databasesList.innerHTML = "";
    if (!names.length) {
      databasesList.innerHTML = `<div class="p-3 text-muted">No databases found.</div>`;
      return;
    }
    let defaultAutoClicked = false;
    names.forEach(name => {
      const btn = document.createElement("button");
      btn.className = `list-group-item list-group-item-action ${state.db === name ? "active" : ""}`;
      btn.textContent = name;
      btn.onclick = () => {
        state.db = name;
        state.collection = null;
        state.page = 1;
        setActiveBadges();
        renderCollections([]); // clear collections
        loadCollections();
        document.querySelectorAll("#databasesList .list-group-item").forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
        tableContainer.innerHTML = `<div class="p-4 text-muted">Select a collection to view documents.</div>`;
      };
      databasesList.appendChild(btn);
      if (!defaultAutoClicked && state.db && state.db === name) {
        // Auto-select default DB if provided
        btn.click();
        defaultAutoClicked = true;
      }
    });
  } catch (e) {
    databasesList.innerHTML = `<div class="p-3 text-danger small">Error: ${e.message}</div>`;
  }
}

async function loadCollections() {
  if (!state.db) {
    collectionsList.innerHTML = `<div class="p-3 text-muted">Select a database…</div>`;
    return;
  }
  collectionsList.innerHTML = `<div class="p-3 text-muted">Loading collections…</div>`;
  try {
    const data = await fetchJSON(`/api/collections?db=${encodeURIComponent(state.db)}`);
    const names = data.collections || [];
    renderCollections(names);
  } catch (e) {
    collectionsList.innerHTML = `<div class="p-3 text-danger small">Error: ${e.message}</div>`;
  }
}

function renderCollections(names) {
  collectionsList.innerHTML = "";
  if (!names.length) {
    collectionsList.innerHTML = `<div class="p-3 text-muted">No collections found.</div>`;
    return;
  }
  names.forEach(name => {
    const btn = document.createElement("button");
    btn.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${state.collection === name ? "active" : ""}`;
    btn.textContent = name;
    btn.onclick = () => {
      state.collection = name;
      state.page = 1;
      setActiveBadges();
      loadDocs();
      document.querySelectorAll("#collectionsList .list-group-item").forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
    };
    collectionsList.appendChild(btn);
  });
}

function valueToCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return `<code class="small text-break">${JSON.stringify(v)}</code>`;
  return String(v);
}

function buildTable(docs) {
  if (!docs.length) {
    return `<div class="p-4 text-muted">No documents found.</div>`;
  }
  // Gather column keys (union across docs; stable order, _id first)
  const keySet = new Set();
  docs.forEach(d => Object.keys(d).forEach(k => keySet.add(k)));
  const keys = Array.from(keySet);
  keys.sort((a, b) => (a === "_id" ? -1 : b === "_id" ? 1 : a.localeCompare(b)));

  const thead = `
    <thead class="table-light">
      <tr>${keys.map(k => `<th scope="col" class="text-nowrap">${k}</th>`).join("")}</tr>
    </thead>
  `;
  const tbody = `
    <tbody>
      ${docs.map(doc => `
        <tr>
          ${keys.map(k => `<td>${valueToCell(doc[k])}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
  return `<table class="table table-sm table-hover mb-0">${thead}${tbody}</table>`;
}

async function loadDocs() {
  if (!state.db || !state.collection) {
    tableContainer.innerHTML = `<div class="p-4 text-muted">Select a collection to view documents.</div>`;
    return;
  }
  setActiveBadges();
  const url = `/api/docs?db=${encodeURIComponent(state.db)}&collection=${encodeURIComponent(state.collection)}&page=${state.page}&limit=${state.limit}`;
  tableContainer.innerHTML = `<div class="spinner-border m-4" role="status"><span class="visually-hidden">Loading…</span></div>`;

  try {
    const data = await fetchJSON(url);
    const docs = data.docs || [];
    state.totalPages = data.total_pages || 1;
    state.totalCount = data.total_count || 0;
    state.page = data.page || 1;
    tableContainer.innerHTML = buildTable(docs);

    pageIndicator.textContent = `Page ${state.page} of ${state.totalPages}`;
    countInfo.textContent = state.totalCount
      ? `${state.totalCount.toLocaleString()} documents total`
      : "—";

    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.totalPages;
  } catch (e) {
    tableContainer.innerHTML = `<div class="p-4 text-danger small">Error: ${e.message}</div>`;
    pageIndicator.textContent = "Page — of —";
    countInfo.textContent = "—";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }
}

prevBtn.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadDocs();
  }
});

nextBtn.addEventListener("click", () => {
  if (state.page < state.totalPages) {
    state.page += 1;
    loadDocs();
  }
});

limitSelect.addEventListener("change", () => {
  state.limit = parseInt(limitSelect.value, 10);
  state.page = 1;
  loadDocs();
});

refreshCollections.addEventListener("click", () => {
  loadCollections();
});

refreshDatabases.addEventListener("click", () => {
  loadDatabases();
});

window.addEventListener("DOMContentLoaded", () => {
  setActiveBadges();
  loadDatabases();
});
