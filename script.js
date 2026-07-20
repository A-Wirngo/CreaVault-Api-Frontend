
const API_BASE = "https://creavault-api.onrender.com";

const TYPE_LABELS = {
  "3d": "3D",
  design_graphique: "Design graphique",
  montage_video: "Montage vidéo",
  web: "Web",
  photo: "Photo",
  autre: "Autre",
};

const STATUT_LABELS = {
  draft: "Brouillon",
  in_progress: "En cours",
  done: "Terminé",
};

const STATUT_CLASS = {
  draft: "var(--status-draft)",
  in_progress: "var(--status-progress)",
  done: "var(--status-done)",
};

const grid = document.getElementById("project-grid");
const emptyState = document.getElementById("empty-state");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const form = document.getElementById("project-form");

let currentProjects = [];

// ---------- CHARGEMENT ----------

async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects/`);
    if (!res.ok) throw new Error("Erreur serveur");
    currentProjects = await res.json();
    renderProjects();
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--text-muted)">Impossible de charger les projets. Vérifie que l'API est en ligne.</p>`;
  }
}

function renderProjects() {
  grid.innerHTML = "";
  emptyState.hidden = currentProjects.length !== 0;

  currentProjects.forEach((project) => {
    grid.appendChild(buildCard(project));
  });
}

function buildCard(project) {
  const card = document.createElement("article");
  card.className = "card";

  const statutColor = STATUT_CLASS[project.statut] || "var(--status-draft)";
  const cover = (project.medias || []).find((m) => m.est_couverture) || (project.medias || [])[0];

  card.innerHTML = `
    <span class="card__id">N°${String(project.id).padStart(3, "0")}</span>
    <span class="card__type">${TYPE_LABELS[project.type] || project.type}</span>
    <h3 class="card__title">${escapeHtml(project.titre)} ${project.est_favori ? '<span class="card__favori">★</span>' : ""}</h3>
    ${project.outil_utilise ? `<p class="card__tool">${escapeHtml(project.outil_utilise)}</p>` : ""}
    ${project.description ? `<p class="card__desc">${escapeHtml(project.description)}</p>` : ""}
    <span class="card__status">
      <span class="card__status-dot" style="background:${statutColor}"></span>
      ${STATUT_LABELS[project.statut] || project.statut}
    </span>
    ${buildMediaBlock(cover)}
    <div class="card__tags">${(project.tags || []).map((t) => `<span class="tag-pill">${escapeHtml(t.nom)}</span>`).join("")}</div>
    <div class="card__actions">
      <button class="btn btn--icon" data-action="edit" data-id="${project.id}">Modifier</button>
      <button class="btn btn--icon btn--danger" data-action="delete" data-id="${project.id}">Supprimer</button>
    </div>
  `;

  card.querySelector('[data-action="edit"]').addEventListener("click", () => openModal("edit", project));
  card.querySelector('[data-action="delete"]').addEventListener("click", () => handleDelete(project.id));

  return card;
}

function buildMediaBlock(media) {
  if (!media) return "";
  if (media.type === "image") {
    return `<div class="card__media"><img src="${escapeHtml(media.url_ou_chemin)}" alt="" loading="lazy"></div>`;
  }
  return `<div class="card__media"><a href="${escapeHtml(media.url_ou_chemin)}" target="_blank" rel="noopener">▶ Voir le média</a></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- MODALE ----------

function openModal(mode, project = null) {
  form.reset();
  document.getElementById("field-id").value = project ? project.id : "";
  modalTitle.textContent = mode === "edit" ? "Modifier le projet" : "Nouveau projet";

  if (project) {
    document.getElementById("field-titre").value = project.titre;
    document.getElementById("field-type").value = project.type;
    document.getElementById("field-statut").value = project.statut;
    document.getElementById("field-outil").value = project.outil_utilise || "";
    document.getElementById("field-description").value = project.description || "";
    document.getElementById("field-tags").value = (project.tags || []).map((t) => t.nom).join(", ");
    document.getElementById("field-favori").checked = !!project.est_favori;
  }

  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

document.getElementById("btn-new-project").addEventListener("click", () => openModal("create"));
document.getElementById("btn-close-modal").addEventListener("click", closeModal);
document.getElementById("btn-cancel").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

// ---------- CRÉATION / MODIFICATION ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("field-id").value;
  const payload = {
    titre: document.getElementById("field-titre").value.trim(),
    type: document.getElementById("field-type").value,
    statut: document.getElementById("field-statut").value,
    outil_utilise: document.getElementById("field-outil").value.trim() || null,
    description: document.getElementById("field-description").value.trim() || null,
    est_favori: document.getElementById("field-favori").checked,
  };

  const tagNames = document
    .getElementById("field-tags")
    .value.split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  try {
    let project;
    if (id) {
      const res = await fetch(`${API_BASE}/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Échec de la modification");
      project = await res.json();
    } else {
      const res = await fetch(`${API_BASE}/projects/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Échec de la création");
      project = await res.json();
    }

    await syncTags(project.id, tagNames, project.tags || []);
    closeModal();
    loadProjects();
  } catch (err) {
    alert("Une erreur est survenue : " + err.message);
  }
});

async function syncTags(projectId, desiredNames, currentTags) {
  const currentNames = currentTags.map((t) => t.nom.toLowerCase());

  for (const name of desiredNames) {
    if (!currentNames.includes(name)) {
      const tag = await createOrGetTag(name);
      await fetch(`${API_BASE}/projects/${projectId}/tags/${tag.id}`, { method: "POST" });
    }
  }

  for (const tag of currentTags) {
    if (!desiredNames.includes(tag.nom.toLowerCase())) {
      await fetch(`${API_BASE}/projects/${projectId}/tags/${tag.id}`, { method: "DELETE" });
    }
  }
}

async function createOrGetTag(nom) {
  const res = await fetch(`${API_BASE}/tags/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nom }),
  });
  return res.json();
}

// ---------- SUPPRESSION ----------

async function handleDelete(id) {
  if (!confirm("Supprimer ce projet ? Cette action est définitive.")) return;

  try {
    const res = await fetch(`${API_BASE}/projects/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Échec de la suppression");
    loadProjects();
  } catch (err) {
    alert("Une erreur est survenue : " + err.message);
  }
}

// ---------- DÉMARRAGE ----------

loadProjects();
