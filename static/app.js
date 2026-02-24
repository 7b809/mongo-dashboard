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

// NEW ELEMENTS
const loginModal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const deleteDatabaseBtn = document.getElementById("deleteDatabaseBtn");
const deleteCollectionBtn = document.getElementById("deleteCollectionBtn");

const confirmModalEl = document.getElementById("confirmModal");
const confirmMessage = document.getElementById("confirmMessage");
const confirmInput = document.getElementById("confirmInput");
const confirmActionBtn = document.getElementById("confirmActionBtn");
const confirmError = document.getElementById("confirmError");

let confirmModal;
if (confirmModalEl) {
  confirmModal = new bootstrap.Modal(confirmModalEl);
}

let state = {
  db: (typeof window !== 'undefined' && window.DEFAULT_DB) ? window.DEFAULT_DB : null,
  collection: null,
  page: 1,
  limit: parseInt(limitSelect.value, 10),
  totalPages: 1,
  totalCount: 0
};

let pendingConfirmAction = null;

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);

  if (res.status === 401) {
    showLogin();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let msg = await res.text();
    try { const j = JSON.parse(msg); msg = j.error || msg; } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return res.json();
}

function showLogin() {
  if (loginModal) {
    loginModal.style.display = "block";
  }
}

function hideLogin() {
  if (loginModal) {
    loginModal.style.display = "none";
  }
}

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const password = passwordInput.value;

    try {
      await fetchJSON("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      loginError.textContent = "";
      hideLogin();
      loadDatabases();

    } catch (e) {
      loginError.textContent = "Invalid password";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await fetch("/logout", { method: "POST" });
    location.reload();
  });
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
        renderCollections([]);
        loadCollections();
        document.querySelectorAll("#databasesList .list-group-item").forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
        tableContainer.innerHTML = `<div class="p-4 text-muted">Select a collection to view documents.</div>`;
      };
      databasesList.appendChild(btn);
      if (!defaultAutoClicked && state.db && state.db === name) {
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

  const keySet = new Set();
  docs.forEach(d => Object.keys(d).forEach(k => keySet.add(k)));
  const keys = Array.from(keySet);
  keys.sort((a, b) => (a === "_id" ? -1 : b === "_id" ? 1 : a.localeCompare(b)));

  const thead = `
    <thead class="table-light">
      <tr>
        ${keys.map(k => `<th scope="col" class="text-nowrap">${k}</th>`).join("")}
        <th>Actions</th>
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${docs.map(doc => `
        <tr>
          ${keys.map(k => `<td>${valueToCell(doc[k])}</td>`).join("")}
          <td>
            <button class="btn btn-sm btn-outline-danger delete-doc" data-id="${doc._id}">Delete</button>
          </td>
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
  tableContainer.innerHTML = `<div class="spinner-border m-4"></div>`;

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
  }
}

/* ================= DELETE LOGIC ================= */

document.addEventListener("click", function(e) {
  if (e.target.classList.contains("delete-doc")) {
    const id = e.target.dataset.id;

    confirmMessage.textContent = "Are you sure you want to delete this document?";
    confirmInput.classList.add("d-none");
    confirmError.textContent = "";

    pendingConfirmAction = async () => {
      await fetchJSON("/api/delete_doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db: state.db,
          collection: state.collection,
          id
        })
      });
      loadDocs();
    };

    confirmModal.show();
  }
});

if (deleteCollectionBtn) {
  deleteCollectionBtn.addEventListener("click", () => {
    if (!state.collection) return;

    confirmMessage.innerHTML = `Type <strong>${state.collection}</strong> to confirm deletion.`;
    confirmInput.classList.remove("d-none");
    confirmInput.value = "";
    confirmError.textContent = "";

    pendingConfirmAction = async () => {
      if (confirmInput.value !== state.collection) {
        confirmError.textContent = "Name does not match.";
        return;
      }

      await fetchJSON("/api/delete_collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db: state.db,
          collection: state.collection,
          confirm: confirmInput.value
        })
      });

      state.collection = null;
      loadCollections();
      tableContainer.innerHTML = `<div class="p-4 text-muted">Collection deleted.</div>`;
      confirmModal.hide();
    };

    confirmModal.show();
  });
}

if (deleteDatabaseBtn) {
  deleteDatabaseBtn.addEventListener("click", () => {
    if (!state.db) return;

    confirmMessage.innerHTML = `Type <strong>${state.db}</strong> to confirm deletion.`;
    confirmInput.classList.remove("d-none");
    confirmInput.value = "";
    confirmError.textContent = "";

    pendingConfirmAction = async () => {
      if (confirmInput.value !== state.db) {
        confirmError.textContent = "Name does not match.";
        return;
      }

      await fetchJSON("/api/delete_database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db: state.db,
          confirm: confirmInput.value
        })
      });

      state.db = null;
      state.collection = null;
      loadDatabases();
      tableContainer.innerHTML = `<div class="p-4 text-muted">Database deleted.</div>`;
      confirmModal.hide();
    };

    confirmModal.show();
  });
}

if (confirmActionBtn) {
  confirmActionBtn.addEventListener("click", async () => {
    if (pendingConfirmAction) {
      await pendingConfirmAction();
    }
  });
}

/* ================= PAGINATION ================= */

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