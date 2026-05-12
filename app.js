const STORAGE_KEYS = {
  config: "progressfit:supabase-config",
  localMode: "progressfit:local-mode",
  localData: "progressfit:local-data"
};

const TABLES = [
  "exercises",
  "workout_sessions",
  "workout_exercises",
  "strength_sets",
  "cardio_entries",
  "goals",
  "body_weight_entries"
];

const SEED_EXERCISES = [
  { name: "Développé couché", kind: "strength", muscle_group: "Pectoraux" },
  { name: "Squat", kind: "strength", muscle_group: "Jambes" },
  { name: "Soulevé de terre", kind: "strength", muscle_group: "Dos" },
  { name: "Développé militaire", kind: "strength", muscle_group: "Épaules" },
  { name: "Tractions", kind: "strength", muscle_group: "Dos" },
  { name: "Rowing barre", kind: "strength", muscle_group: "Dos" },
  { name: "Presse à cuisses", kind: "strength", muscle_group: "Jambes" },
  { name: "Curl biceps", kind: "strength", muscle_group: "Bras" },
  { name: "Extensions triceps", kind: "strength", muscle_group: "Bras" },
  { name: "Gainage", kind: "strength", muscle_group: "Core" },
  { name: "Course tapis", kind: "cardio", muscle_group: null },
  { name: "Vélo", kind: "cardio", muscle_group: null },
  { name: "Rameur", kind: "cardio", muscle_group: null },
  { name: "Elliptique", kind: "cardio", muscle_group: null }
];

const state = {
  mode: "setup",
  client: null,
  user: null,
  activeTab: "session",
  selectedProgressExerciseId: null,
  data: emptyData()
};

const elements = {
  setupPanel: document.querySelector("#setupPanel"),
  authPanel: document.querySelector("#authPanel"),
  mainApp: document.querySelector("#mainApp"),
  connectionStatus: document.querySelector("#connectionStatus"),
  supabaseUrl: document.querySelector("#supabaseUrl"),
  supabaseAnonKey: document.querySelector("#supabaseAnonKey"),
  authEmail: document.querySelector("#authEmail")
};

document.addEventListener("DOMContentLoaded", init);

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  drawProgressCanvas();
  drawBodyCanvas();
});

async function init() {
  bindChromeEvents();
  const bundledConfig = getBundledSupabaseConfig();
  const savedConfig = readJSON(STORAGE_KEYS.config);
  const localMode = localStorage.getItem(STORAGE_KEYS.localMode) === "true";
  const isAuthCallback = hasSupabaseAuthCallback();

  if (bundledConfig && window.supabase && (!localMode || isAuthCallback)) {
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(bundledConfig));
    localStorage.removeItem(STORAGE_KEYS.localMode);
    elements.supabaseUrl.value = bundledConfig.url;
    elements.supabaseAnonKey.value = bundledConfig.anonKey;
    await configureSupabase(bundledConfig.url, bundledConfig.anonKey);
    return;
  }

  if (savedConfig?.url && savedConfig?.anonKey && window.supabase) {
    elements.supabaseUrl.value = savedConfig.url;
    elements.supabaseAnonKey.value = savedConfig.anonKey;
    await configureSupabase(savedConfig.url, savedConfig.anonKey);
    return;
  }

  if (localMode) {
    await enterLocalMode();
    return;
  }

  showSetup();
}

function getBundledSupabaseConfig() {
  const config = window.PROGRESSFIT_SUPABASE;
  const url = config?.url?.trim();
  const anonKey = config?.anonKey?.trim();

  if (!url || !anonKey) return null;
  if (url.includes("xxxx.supabase.co") || anonKey.includes("eyJ...")) return null;

  return { url, anonKey };
}

function hasSupabaseAuthCallback() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    query.has("code") ||
    query.has("error") ||
    hash.has("access_token") ||
    hash.has("refresh_token") ||
    hash.has("error_description")
  );
}

function bindChromeEvents() {
  document.querySelector("#saveSupabaseConfig").addEventListener("click", async () => {
    const url = elements.supabaseUrl.value.trim();
    const anonKey = elements.supabaseAnonKey.value.trim();

    if (!url || !anonKey) {
      notify("Ajoute l’URL Supabase et la clé anon publique.");
      return;
    }

    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({ url, anonKey }));
    localStorage.removeItem(STORAGE_KEYS.localMode);
    await configureSupabase(url, anonKey);
  });

  document.querySelector("#useLocalMode").addEventListener("click", enterLocalMode);

  document.querySelector("#resetSupabaseConfig").addEventListener("click", async () => {
    localStorage.removeItem(STORAGE_KEYS.config);
    localStorage.removeItem(STORAGE_KEYS.localMode);
    state.client = null;
    state.user = null;
    showSetup();
  });

  document.querySelector("#sendMagicLink").addEventListener("click", sendMagicLink);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((item) => {
        item.classList.toggle("active", item === tab);
        item.setAttribute("aria-selected", item === tab ? "true" : "false");
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === state.activeTab);
      });
      renderActiveTab();
    });
  });

  document.body.addEventListener("click", handleActionClick);
  document.body.addEventListener("change", handleChange);
}

async function configureSupabase(url, anonKey) {
  try {
    state.client = window.supabase.createClient(url, anonKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce"
      }
    });
    state.mode = "supabase";
    state.client.auth.onAuthStateChange(async (_event, session) => {
      state.user = session?.user ?? null;
      if (state.user) {
        await loadSupabaseData();
        showMainApp();
      } else {
        showAuth();
      }
    });

    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;

    state.user = data.session?.user ?? null;
    if (!state.user) {
      showAuth();
      return;
    }

    await loadSupabaseData();
    showMainApp();
  } catch (error) {
    console.error(error);
    notify("Connexion Supabase impossible. Vérifie l’URL, la clé anon et le schéma SQL.");
    showSetup();
  }
}

async function sendMagicLink() {
  const email = elements.authEmail.value.trim();
  if (!email) {
    notify("Ajoute ton email.");
    return;
  }

  const { error } = await state.client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAuthRedirectUrl()
    }
  });

  if (error) {
    console.error(error);
    notify("Impossible d’envoyer le lien magique.");
    return;
  }

  notify("Lien envoyé. Ouvre-le depuis ton email pour synchroniser l’app.");
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function enterLocalMode() {
  localStorage.setItem(STORAGE_KEYS.localMode, "true");
  state.mode = "local";
  state.client = null;
  state.user = null;
  state.data = readJSON(STORAGE_KEYS.localData) ?? emptyData();
  seedLocalExercises();
  showMainApp();
}

function showSetup() {
  state.mode = "setup";
  elements.setupPanel.classList.remove("hidden");
  elements.authPanel.classList.add("hidden");
  elements.mainApp.classList.add("hidden");
  updateStatus("Configuration requise");
}

function showAuth() {
  elements.setupPanel.classList.add("hidden");
  elements.authPanel.classList.remove("hidden");
  elements.mainApp.classList.add("hidden");
  updateStatus("Connexion requise");
}

function showMainApp() {
  elements.setupPanel.classList.add("hidden");
  elements.authPanel.classList.add("hidden");
  elements.mainApp.classList.remove("hidden");
  updateStatus(state.mode === "supabase" ? `Supabase · ${state.user?.email ?? "connecté"}` : "Mode local");
  renderAll();
}

async function loadSupabaseData() {
  for (const table of TABLES) {
    const { data, error } = await state.client.from(table).select("*");
    if (error) throw error;
    state.data[table] = data ?? [];
  }

  if (state.data.exercises.length === 0) {
    const { error } = await state.client.from("exercises").insert(
      SEED_EXERCISES.map((exercise) => ({ ...exercise, is_custom: false }))
    );
    if (error) throw error;

    const { data, error: reloadError } = await state.client.from("exercises").select("*").order("name");
    if (reloadError) throw reloadError;
    state.data.exercises = data ?? [];
  }

  sortData();
  await refreshGoalStatuses();
}

function seedLocalExercises() {
  if (state.data.exercises.length > 0) return;

  state.data.exercises = SEED_EXERCISES.map((exercise) => ({
    id: crypto.randomUUID(),
    ...exercise,
    is_custom: false,
    created_at: now()
  }));
  saveLocalData();
}

function emptyData() {
  return Object.fromEntries(TABLES.map((table) => [table, []]));
}

function sortData() {
  state.data.exercises.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  state.data.workout_sessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  state.data.workout_exercises.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  state.data.strength_sets.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  state.data.body_weight_entries.sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));
  state.data.goals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function insertRow(table, row) {
  if (state.mode === "supabase") {
    const { data, error } = await state.client.from(table).insert(row).select("*").single();
    if (error) throw error;
    state.data[table].push(data);
    sortData();
    return data;
  }

  const item = {
    id: crypto.randomUUID(),
    ...row
  };
  state.data[table].push(item);
  sortData();
  saveLocalData();
  return item;
}

async function updateRow(table, id, patch) {
  if (state.mode === "supabase") {
    const { data, error } = await state.client.from(table).update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    replaceLocalRow(table, data);
    return data;
  }

  const item = state.data[table].find((row) => row.id === id);
  if (item) Object.assign(item, patch);
  saveLocalData();
  return item;
}

async function deleteRow(table, id) {
  if (state.mode === "supabase") {
    const { error } = await state.client.from(table).delete().eq("id", id);
    if (error) throw error;
  }

  state.data[table] = state.data[table].filter((row) => row.id !== id);
  saveLocalData();
}

function replaceLocalRow(table, row) {
  const index = state.data[table].findIndex((item) => item.id === row.id);
  if (index >= 0) {
    state.data[table][index] = row;
  } else {
    state.data[table].push(row);
  }
  sortData();
  saveLocalData();
}

function saveLocalData() {
  if (state.mode === "local") {
    localStorage.setItem(STORAGE_KEYS.localData, JSON.stringify(state.data));
  }
}

function renderAll() {
  renderSession();
  renderHistory();
  renderProgress();
  renderGoals();
  renderBody();
  renderActiveTab();
}

function renderActiveTab() {
  if (state.activeTab === "progress") {
    drawProgressCanvas();
  }

  if (state.activeTab === "body") {
    drawBodyCanvas();
  }
}

function renderSession() {
  const panel = document.querySelector("#session");
  const activeSession = state.data.workout_sessions.find((session) => !session.ended_at);

  if (!activeSession) {
    const finishedCount = state.data.workout_sessions.filter((s) => s.ended_at).length;
    panel.innerHTML = `
      <div class="card">
        <div class="session-hero">
          <div class="session-hero-icon" aria-hidden="true">🏋️</div>
          <h2>Prêt pour l'entraînement ?</h2>
          <p class="muted">Démarre une séance pour enregistrer tes exercices, tes séries et ton cardio.</p>
          <button class="primary-button" data-action="start-workout" style="margin-top:8px">Démarrer une séance</button>
          ${finishedCount > 0 ? `<p class="muted" style="font-size:.8rem">${finishedCount} séance${finishedCount > 1 ? "s" : ""} dans l'historique</p>` : ""}
        </div>
      </div>
    `;
    return;
  }

  const workoutExercises = exercisesForSession(activeSession.id);
  panel.innerHTML = `
    <div class="grid two-col">
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <span class="section-label">Séance en cours</span>
            <h2>${formatDateTime(activeSession.started_at)}</h2>
          </div>
          <button class="primary-button" data-action="finish-workout" data-session-id="${activeSession.id}">Terminer</button>
        </div>
        <div class="metric-grid">
          ${metric("Exercices", workoutExercises.length, "🏋️")}
          ${metric("Volume", `${formatNumber(totalSessionVolume(activeSession.id), 0)} kg`, "📦")}
          ${metric("Durée", `${sessionDuration(activeSession)} min`, "⏱️")}
          ${metric("Cardio", `${totalSessionCardio(activeSession.id)} min`, "🫀")}
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column;justify-content:center;gap:12px">
        <div class="card-title-group">
          <span class="section-label">Exercice</span>
          <h2>Ajouter à la séance</h2>
        </div>
        <button class="primary-button" data-action="open-add-exercise" data-session-id="${activeSession.id}">+ Ajouter un exercice</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Exercices (${workoutExercises.length})</h2>
        <button class="secondary-button" data-action="open-add-exercise" data-session-id="${activeSession.id}">+ Exercice</button>
      </div>
      <div class="list">
        ${workoutExercises.length ? workoutExercises.map(renderWorkoutExercise).join("") : emptyState("💪", "Aucun exercice", "Appuie sur &laquo;&nbsp;+ Exercice&nbsp;&raquo; pour commencer.")}
      </div>
    </div>
  `;
}

function renderWorkoutExercise(workoutExercise) {
  const exercise = exerciseById(workoutExercise.exercise_id);
  if (!exercise) return "";

  if (exercise.kind === "cardio") {
    const cardio = cardioForWorkoutExercise(workoutExercise.id);
    return `
      <article class="list-item">
        <div class="exercise-row">
          <div style="display:flex;flex-direction:column;gap:5px">
            <h3>${escapeHTML(exercise.name)}</h3>
            <span class="tag blue">🫀 Cardio</span>
          </div>
          <button class="secondary-button" data-action="open-cardio" data-workout-exercise-id="${workoutExercise.id}">
            ${cardio ? "Modifier" : "Saisir"}
          </button>
        </div>
        <p class="muted">${cardio ? cardioSummary(cardio) : "Durée et distance à renseigner."}</p>
      </article>
    `;
  }

  const sets = setsForWorkoutExercise(workoutExercise.id);
  const muscleGroup = exercise.muscle_group ? `<span class="tag">${escapeHTML(exercise.muscle_group)}</span>` : "";
  return `
    <article class="list-item">
      <div class="exercise-row">
        <div style="display:flex;flex-direction:column;gap:5px">
          <h3>${escapeHTML(exercise.name)}</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${muscleGroup}<span class="tag">💪 Force</span></div>
        </div>
        <button class="secondary-button" data-action="open-add-set" data-workout-exercise-id="${workoutExercise.id}">+ Série</button>
      </div>
      ${sets.length
        ? `<div class="sets-list">${sets.map(renderStrengthSet).join("")}</div>`
        : `<p class="muted" style="font-size:.85rem">Aucune série — appuie sur &laquo;&nbsp;+ Série&nbsp;&raquo;.</p>`
      }
    </article>
  `;
}

function renderStrengthSet(set) {
  return `
    <div class="set-row">
      <span class="set-index">${set.sort_order}</span>
      <span class="set-value">${formatNumber(set.weight_kg, 1)} kg × ${set.reps} reps</span>
      ${set.notes ? `<span class="muted" style="font-size:.8rem">${escapeHTML(set.notes)}</span>` : ""}
      <button class="danger-button" style="padding:4px 10px;min-height:0;font-size:.78rem" data-action="delete-set" data-set-id="${set.id}">✕</button>
    </div>
  `;
}

function renderHistory() {
  const panel = document.querySelector("#history");
  const sessions = state.data.workout_sessions.filter((session) => session.ended_at);

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title-group">
          <span class="section-label">Historique</span>
          <h2>Séances terminées</h2>
        </div>
        <span class="tag green">✓ ${sessions.length} séance${sessions.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="list">
        ${sessions.length ? sessions.map(renderHistorySession).join("") : emptyState("🗓️", "Aucune séance", "Les séances terminées apparaîtront ici.")}
      </div>
    </div>
  `;
}

function renderHistorySession(session) {
  const workoutExercises = exercisesForSession(session.id);
  const vol = totalSessionVolume(session.id);
  const exerciseLines = workoutExercises.map((item) => {
    const exercise = exerciseById(item.exercise_id);
    if (!exercise) return "";
    if (exercise.kind === "cardio") {
      const cardio = cardioForWorkoutExercise(item.id);
      return `<span class="tag">${escapeHTML(exercise.name)} · ${cardio ? cardioSummary(cardio) : "—"}</span>`;
    }
    return `<span class="tag">${escapeHTML(exercise.name)} · ${setsForWorkoutExercise(item.id).length} série(s)</span>`;
  }).join("");

  return `
    <article class="list-item">
      <div class="list-row">
        <div>
          <h3>${formatDateTime(session.started_at)}</h3>
          <div class="session-meta">
            <span class="tag">⏱ ${sessionDuration(session)} min</span>
            <span class="tag">🏋️ ${workoutExercises.length} exercice${workoutExercises.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style="text-align:right">
          <div class="session-volume">${formatNumber(vol, 0)}</div>
          <div class="muted" style="font-size:.75rem">kg total</div>
        </div>
      </div>
      ${exerciseLines ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${exerciseLines}</div>` : ""}
    </article>
  `;
}

function renderProgress() {
  const panel = document.querySelector("#progress");
  const exercises = state.data.exercises;
  if (!state.selectedProgressExerciseId || !exercises.some((exercise) => exercise.id === state.selectedProgressExerciseId)) {
    state.selectedProgressExerciseId = exercises[0]?.id ?? null;
  }

  const selected = exerciseById(state.selectedProgressExerciseId);
  const summary = selected ? progressSummary(selected.id) : null;

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title-group">
          <span class="section-label">Progrès</span>
          <h2>Par exercice</h2>
        </div>
        <select id="progressExerciseSelect" style="max-width:200px">
          ${exercises.map((exercise) => `
            <option value="${exercise.id}" ${exercise.id === state.selectedProgressExerciseId ? "selected" : ""}>
              ${escapeHTML(exercise.name)}
            </option>
          `).join("")}
        </select>
      </div>
      ${selected ? `
        <div class="metric-grid">
          ${metric("Séances", summary.sessionCount, "📅")}
          ${selected.kind === "strength"
            ? metric("Meilleure charge", `${formatNumber(summary.bestWeightKg ?? 0, 1)} kg`, "🏆")
            : metric("Plus longue durée", `${summary.longestDurationMinutes ?? 0} min`, "⏱️")}
          ${selected.kind === "strength"
            ? metric("Meilleure série", `${formatNumber(summary.bestSetVolumeKg ?? 0, 0)} kg`, "💥")
            : metric("Meilleure distance", `${formatNumber(summary.bestDistanceKm ?? 0, 2)} km`, "📍")}
          ${metric(
            selected.kind === "strength" ? "Volume total" : "Sorties",
            selected.kind === "strength" ? `${formatNumber(summary.totalVolumeKg, 0)} kg` : summary.points.length,
            "📊"
          )}
        </div>
        ${summary.points.length
          ? `<canvas id="progressChart" class="chart" aria-label="Graphique de progression"></canvas>`
          : emptyState("📈", "Pas encore de données", "Effectue des séances avec cet exercice pour voir ta progression.")
        }
      ` : emptyState("🏋️", "Aucun exercice", "Aucun exercice disponible pour le moment.")}
    </div>
  `;

  drawProgressCanvas();
}

function renderGoals() {
  const panel = document.querySelector("#goals");
  const completed = state.data.goals.filter((g) => goalProgress(g) >= 1 || g.completed_at).length;
  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title-group">
          <span class="section-label">Objectifs</span>
          <h2>Performance et régularité</h2>
          ${completed > 0 ? `<span class="tag gold" style="width:fit-content">🏆 ${completed} atteint${completed > 1 ? "s" : ""}</span>` : ""}
        </div>
        <button class="primary-button" data-action="open-add-goal">+ Objectif</button>
      </div>
      <div class="list">
        ${state.data.goals.length ? state.data.goals.map(renderGoal).join("") : emptyState("🎯", "Aucun objectif", "Crée un objectif pour suivre une cible concrète.")}
      </div>
    </div>
  `;
}

function renderGoal(goal) {
  const progress = goalProgress(goal);
  const complete = progress >= 1 || Boolean(goal.completed_at);
  const pct = Math.round(progress * 100);
  return `
    <article class="list-item ${complete ? "goal-complete" : ""}">
      <div class="list-row">
        <div style="display:flex;flex-direction:column;gap:4px">
          <h3>${complete ? "✅ " : ""}${escapeHTML(goal.title)}</h3>
          <p class="muted" style="font-size:.85rem">${goalDescription(goal)}</p>
        </div>
        <span class="tag ${complete ? "green" : "warning"}">${complete ? "Atteint" : `${pct} %`}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="progress-track" style="flex:1" aria-label="Progression ${pct}%">
          <div class="progress-bar" style="--progress: ${pct}%;"></div>
        </div>
        <span class="muted" style="font-size:.75rem;white-space:nowrap">${pct} %</span>
      </div>
    </article>
  `;
}

function renderBody() {
  const panel = document.querySelector("#body");
  const entries = state.data.body_weight_entries;

  let trend = "";
  if (entries.length >= 2) {
    const sorted = [...entries].sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
    const diff = Number(sorted[sorted.length - 1].weight_kg) - Number(sorted[0].weight_kg);
    const sign = diff > 0 ? "+" : "";
    trend = `<span class="tag ${diff <= 0 ? "green" : "warning"}">${sign}${formatNumber(diff, 1)} kg depuis le début</span>`;
  }

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title-group">
          <span class="section-label">Corps</span>
          <h2>Poids corporel</h2>
          ${trend}
        </div>
        <button class="primary-button" data-action="open-add-weight">+ Ajouter</button>
      </div>
      ${entries.length
        ? `<canvas id="bodyChart" class="chart" aria-label="Graphique du poids"></canvas>`
        : emptyState("⚖️", "Aucune mesure", "Ajoute ton poids pour suivre ton évolution.")
      }
      <div class="list" style="margin-top: 14px;">
        ${entries.map((entry) => `
          <article class="list-item">
            <div class="list-row">
              <div>
                <div style="font-size:1.1rem;font-weight:800;letter-spacing:-0.01em">${formatNumber(entry.weight_kg, 1)} kg</div>
                ${entry.note ? `<p class="muted" style="font-size:.82rem">${escapeHTML(entry.note)}</p>` : ""}
              </div>
              <span class="tag">${formatDate(entry.measured_at)}</span>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
  drawBodyCanvas();
}

async function handleActionClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;

  try {
    if (action === "start-workout") {
      await insertRow("workout_sessions", { started_at: now(), ended_at: null, notes: "" });
    }

    if (action === "finish-workout") {
      await updateRow("workout_sessions", trigger.dataset.sessionId, { ended_at: now() });
      await refreshGoalStatuses();
    }

    if (action === "open-add-exercise") openAddExerciseModal(trigger.dataset.sessionId);
    if (action === "open-add-set") openAddSetModal(trigger.dataset.workoutExerciseId);
    if (action === "open-cardio") openCardioModal(trigger.dataset.workoutExerciseId);
    if (action === "open-add-goal") openGoalModal();
    if (action === "open-add-weight") openWeightModal();

    if (action === "delete-set") {
      await deleteRow("strength_sets", trigger.dataset.setId);
    }

    renderAll();
  } catch (error) {
    console.error(error);
    notify(error.message ?? "Action impossible.");
  }
}

function handleChange(event) {
  if (event.target.id === "progressExerciseSelect") {
    state.selectedProgressExerciseId = event.target.value;
    renderProgress();
  }
}

function openAddExerciseModal(sessionId) {
  openModal("Ajouter un exercice", `
    <div class="form-grid">
      <form id="addExistingExerciseForm" class="form-grid">
        <label>
          Exercice existant
          <select name="exerciseId">
            ${state.data.exercises.map((exercise) => `
              <option value="${exercise.id}">${escapeHTML(exercise.name)} · ${exercise.kind === "strength" ? "Musculation" : "Cardio"}</option>
            `).join("")}
          </select>
        </label>
        <button class="primary-button" type="submit">Ajouter à la séance</button>
      </form>

      <hr />

      <form id="createExerciseForm" class="form-grid">
        <div class="form-grid two">
          <label>
            Nom
            <input name="name" required placeholder="Hip thrust" />
          </label>
          <label>
            Type
            <select name="kind">
              <option value="strength">Musculation</option>
              <option value="cardio">Cardio</option>
            </select>
          </label>
        </div>
        <label>
          Groupe musculaire
          <input name="muscle_group" placeholder="Jambes" />
        </label>
        <button class="secondary-button" type="submit">Créer et ajouter</button>
      </form>
    </div>
  `, (modal) => {
    modal.querySelector("#addExistingExerciseForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await addExerciseToSession(sessionId, form.get("exerciseId"));
      closeModal(modal);
    });

    modal.querySelector("#createExerciseForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const exercise = await insertRow("exercises", {
        name: String(form.get("name")).trim(),
        kind: form.get("kind"),
        muscle_group: String(form.get("muscle_group")).trim() || null,
        is_custom: true,
        created_at: now()
      });
      await addExerciseToSession(sessionId, exercise.id);
      closeModal(modal);
    });
  });
}

async function addExerciseToSession(sessionId, exerciseId) {
  const order = exercisesForSession(sessionId).length + 1;
  await insertRow("workout_exercises", {
    session_id: sessionId,
    exercise_id: exerciseId,
    sort_order: order
  });
}

function openAddSetModal(workoutExerciseId) {
  openModal("Ajouter une série", `
    <form id="setForm" class="form-grid">
      <div class="form-grid two">
        <label>
          Poids en kg
          <input name="weight_kg" inputmode="decimal" required placeholder="80" />
        </label>
        <label>
          Répétitions
          <input name="reps" inputmode="numeric" required placeholder="8" />
        </label>
      </div>
      <label>
        Note
        <textarea name="notes" placeholder="Série propre, RAS"></textarea>
      </label>
      <button class="primary-button" type="submit">Ajouter</button>
    </form>
  `, (modal) => {
    modal.querySelector("#setForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const sets = setsForWorkoutExercise(workoutExerciseId);
      await insertRow("strength_sets", {
        workout_exercise_id: workoutExerciseId,
        sort_order: sets.length + 1,
        weight_kg: parseDecimal(form.get("weight_kg")),
        reps: Number(form.get("reps")),
        notes: String(form.get("notes") ?? "")
      });
      closeModal(modal);
    });
  });
}

function openCardioModal(workoutExerciseId) {
  const existing = cardioForWorkoutExercise(workoutExerciseId);
  openModal("Saisir le cardio", `
    <form id="cardioForm" class="form-grid">
      <div class="form-grid two">
        <label>
          Durée en minutes
          <input name="duration_minutes" inputmode="numeric" required value="${existing?.duration_minutes ?? ""}" />
        </label>
        <label>
          Distance en km
          <input name="distance_km" inputmode="decimal" value="${existing?.distance_km ?? ""}" />
        </label>
      </div>
      <label>
        Note
        <textarea name="notes">${escapeHTML(existing?.notes ?? "")}</textarea>
      </label>
      <button class="primary-button" type="submit">Enregistrer</button>
    </form>
  `, (modal) => {
    modal.querySelector("#cardioForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const patch = {
        workout_exercise_id: workoutExerciseId,
        duration_minutes: Number(form.get("duration_minutes")),
        distance_km: form.get("distance_km") ? parseDecimal(form.get("distance_km")) : null,
        notes: String(form.get("notes") ?? "")
      };

      if (existing) {
        await updateRow("cardio_entries", existing.id, patch);
      } else {
        await insertRow("cardio_entries", patch);
      }

      closeModal(modal);
    });
  });
}

function openGoalModal() {
  const strengthExercises = state.data.exercises.filter((exercise) => exercise.kind === "strength");
  openModal("Nouvel objectif", `
    <form id="goalForm" class="form-grid">
      <label>
        Type
        <select name="kind" id="goalKind">
          <option value="exercise_target">Objectif exercice</option>
          <option value="weekly_sessions">Régularité</option>
        </select>
      </label>
      <label>
        Titre optionnel
        <input name="title" placeholder="Bench 80 × 5" />
      </label>
      <div id="exerciseGoalFields" class="form-grid">
        <label>
          Exercice
          <select name="exercise_id">
            ${strengthExercises.map((exercise) => `<option value="${exercise.id}">${escapeHTML(exercise.name)}</option>`).join("")}
          </select>
        </label>
        <div class="form-grid two">
          <label>
            Poids cible en kg
            <input name="target_weight_kg" inputmode="decimal" placeholder="80" />
          </label>
          <label>
            Répétitions
            <input name="target_reps" inputmode="numeric" placeholder="5" />
          </label>
        </div>
      </div>
      <div id="weeklyGoalFields" class="form-grid hidden">
        <label>
          Séances par semaine
          <input name="target_sessions_per_week" inputmode="numeric" value="3" />
        </label>
      </div>
      <button class="primary-button" type="submit">Créer</button>
    </form>
  `, (modal) => {
    const kind = modal.querySelector("#goalKind");
    const exerciseFields = modal.querySelector("#exerciseGoalFields");
    const weeklyFields = modal.querySelector("#weeklyGoalFields");

    kind.addEventListener("change", () => {
      exerciseFields.classList.toggle("hidden", kind.value !== "exercise_target");
      weeklyFields.classList.toggle("hidden", kind.value !== "weekly_sessions");
    });

    modal.querySelector("#goalForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const goalKind = form.get("kind");
      const title = String(form.get("title") ?? "").trim();

      if (goalKind === "exercise_target") {
        const exercise = exerciseById(form.get("exercise_id"));
        const targetWeight = parseDecimal(form.get("target_weight_kg"));
        const targetReps = Number(form.get("target_reps"));
        await insertRow("goals", {
          title: title || `${exercise?.name ?? "Objectif"} ${formatNumber(targetWeight, 1)} kg × ${targetReps}`,
          kind: "exercise_target",
          exercise_id: exercise?.id,
          target_weight_kg: targetWeight,
          target_reps: targetReps,
          target_sessions_per_week: null,
          created_at: now(),
          completed_at: null
        });
      } else {
        const target = Number(form.get("target_sessions_per_week"));
        await insertRow("goals", {
          title: title || `${target} séance(s) par semaine`,
          kind: "weekly_sessions",
          exercise_id: null,
          target_weight_kg: null,
          target_reps: null,
          target_sessions_per_week: target,
          created_at: now(),
          completed_at: null
        });
      }

      closeModal(modal);
    });
  });
}

function openWeightModal() {
  openModal("Ajouter un poids", `
    <form id="weightForm" class="form-grid">
      <div class="form-grid two">
        <label>
          Date
          <input name="measured_at" type="date" required value="${new Date().toISOString().slice(0, 10)}" />
        </label>
        <label>
          Poids en kg
          <input name="weight_kg" inputmode="decimal" required placeholder="72,4" />
        </label>
      </div>
      <label>
        Note
        <textarea name="note" placeholder="Après entraînement, matin, etc."></textarea>
      </label>
      <button class="primary-button" type="submit">Ajouter</button>
    </form>
  `, (modal) => {
    modal.querySelector("#weightForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await insertRow("body_weight_entries", {
        measured_at: form.get("measured_at"),
        weight_kg: parseDecimal(form.get("weight_kg")),
        note: String(form.get("note") ?? "")
      });
      closeModal(modal);
    });
  });
}

function openModal(title, html, onMount) {
  const template = document.querySelector("#modalTemplate");
  const modalNode = template.content.firstElementChild.cloneNode(true);
  modalNode.querySelector("h2").textContent = title;
  modalNode.querySelector(".modal-content").innerHTML = html;
  modalNode.querySelector("[data-close-modal]").addEventListener("click", () => closeModal(modalNode));
  modalNode.addEventListener("click", (event) => {
    if (event.target === modalNode) closeModal(modalNode);
  });
  document.body.append(modalNode);
  onMount?.(modalNode);
  const firstInput = modalNode.querySelector("input, select, textarea, button");
  firstInput?.focus();
  return modalNode;
}

function closeModal(modalNode) {
  modalNode.remove();
  renderAll();
}

async function refreshGoalStatuses() {
  const pendingGoals = state.data.goals.filter((goal) => !goal.completed_at && goalProgress(goal) >= 1);

  for (const goal of pendingGoals) {
    await updateRow("goals", goal.id, { completed_at: now() });
  }
}

function exercisesForSession(sessionId) {
  return state.data.workout_exercises
    .filter((item) => item.session_id === sessionId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function setsForWorkoutExercise(workoutExerciseId) {
  return state.data.strength_sets
    .filter((set) => set.workout_exercise_id === workoutExerciseId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function cardioForWorkoutExercise(workoutExerciseId) {
  return state.data.cardio_entries.find((entry) => entry.workout_exercise_id === workoutExerciseId);
}

function exerciseById(id) {
  return state.data.exercises.find((exercise) => exercise.id === id);
}

function totalSessionVolume(sessionId) {
  return exercisesForSession(sessionId).reduce((total, item) => {
    return total + setsForWorkoutExercise(item.id).reduce((setTotal, set) => {
      return setTotal + Number(set.weight_kg) * Number(set.reps);
    }, 0);
  }, 0);
}

function totalSessionCardio(sessionId) {
  return exercisesForSession(sessionId).reduce((total, item) => {
    return total + Number(cardioForWorkoutExercise(item.id)?.duration_minutes ?? 0);
  }, 0);
}

function sessionDuration(session) {
  const end = session.ended_at ? new Date(session.ended_at) : new Date();
  return Math.max(0, Math.round((end - new Date(session.started_at)) / 60000));
}

function progressSummary(exerciseId) {
  const exercise = exerciseById(exerciseId);
  const finishedSessions = state.data.workout_sessions
    .filter((session) => session.ended_at)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  const summary = {
    points: [],
    sessionCount: 0,
    totalVolumeKg: 0,
    bestWeightKg: 0,
    bestSetVolumeKg: 0,
    bestDistanceKm: 0,
    longestDurationMinutes: 0
  };

  for (const session of finishedSessions) {
    const matching = exercisesForSession(session.id).filter((item) => item.exercise_id === exerciseId);
    if (!matching.length) continue;

    summary.sessionCount += 1;

    if (exercise?.kind === "cardio") {
      const entries = matching.map((item) => cardioForWorkoutExercise(item.id)).filter(Boolean);
      const duration = entries.reduce((total, entry) => total + Number(entry.duration_minutes), 0);
      const distance = entries.reduce((total, entry) => total + Number(entry.distance_km ?? 0), 0);
      if (duration > 0) summary.points.push({ date: session.started_at, value: duration, label: "Minutes" });
      summary.longestDurationMinutes = Math.max(summary.longestDurationMinutes, ...entries.map((entry) => Number(entry.duration_minutes)));
      summary.bestDistanceKm = Math.max(summary.bestDistanceKm, distance);
      continue;
    }

    const sets = matching.flatMap((item) => setsForWorkoutExercise(item.id));
    const volume = sets.reduce((total, set) => total + Number(set.weight_kg) * Number(set.reps), 0);
    if (volume > 0) summary.points.push({ date: session.started_at, value: volume, label: "Volume" });
    summary.totalVolumeKg += volume;
    summary.bestWeightKg = Math.max(summary.bestWeightKg, ...sets.map((set) => Number(set.weight_kg)));
    summary.bestSetVolumeKg = Math.max(summary.bestSetVolumeKg, ...sets.map((set) => Number(set.weight_kg) * Number(set.reps)));
  }

  return summary;
}

function goalProgress(goal) {
  if (goal.completed_at) return 1;

  if (goal.kind === "weekly_sessions") {
    const target = Math.max(1, Number(goal.target_sessions_per_week ?? 1));
    return Math.min(1, weeklySessionCount() / target);
  }

  const targetWeight = Number(goal.target_weight_kg ?? 0);
  const targetReps = Number(goal.target_reps ?? 0);
  const hit = state.data.workout_sessions
    .filter((session) => session.ended_at)
    .flatMap((session) => exercisesForSession(session.id))
    .filter((item) => item.exercise_id === goal.exercise_id)
    .flatMap((item) => setsForWorkoutExercise(item.id))
    .some((set) => Number(set.weight_kg) >= targetWeight && Number(set.reps) >= targetReps);

  return hit ? 1 : 0;
}

function goalDescription(goal) {
  if (goal.kind === "weekly_sessions") {
    return `${weeklySessionCount()}/${goal.target_sessions_per_week ?? 1} séance(s) cette semaine`;
  }

  const exercise = exerciseById(goal.exercise_id);
  return `${exercise?.name ?? "Exercice"} · ${formatNumber(goal.target_weight_kg ?? 0, 1)} kg × ${goal.target_reps ?? 0}`;
}

function weeklySessionCount(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay() || 7;
  const start = new Date(current);
  start.setHours(0, 0, 0, 0);
  start.setDate(current.getDate() - day + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return state.data.workout_sessions.filter((session) => {
    if (!session.ended_at) return false;
    const started = new Date(session.started_at);
    return started >= start && started < end;
  }).length;
}

function drawProgressCanvas() {
  const canvas = document.querySelector("#progressChart");
  if (!canvas || !state.selectedProgressExerciseId) return;
  const summary = progressSummary(state.selectedProgressExerciseId);
  drawLineChart(canvas, summary.points);
}

function drawBodyCanvas() {
  const canvas = document.querySelector("#bodyChart");
  if (!canvas) return;
  const points = [...state.data.body_weight_entries]
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
    .map((entry) => ({ date: entry.measured_at, value: Number(entry.weight_kg), label: "kg" }));
  drawLineChart(canvas, points);
}

function isDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function chartColors() {
  if (isDark()) {
    return {
      grid:       "rgba(255,255,255,.07)",
      axis:       "rgba(255,255,255,.07)",
      fillTop:    "rgba(26,255,140,.22)",
      fillMid:    "rgba(26,255,140,.06)",
      fillBot:    "rgba(26,255,140,.00)",
      line:       "#1aff8c",
      lineGlow:   "rgba(26,255,140,.55)",
      dotFill:    "#0b1610",
      dotStroke:  "#1aff8c",
      dotGlow:    "rgba(26,255,140,.7)",
      label:      "rgba(180,220,198,.55)",
      empty:      "rgba(180,220,198,.45)"
    };
  }
  return {
    grid:       "rgba(0,0,0,.07)",
    axis:       "rgba(0,0,0,.07)",
    fillTop:    "rgba(10,140,92,.14)",
    fillMid:    "rgba(10,140,92,.04)",
    fillBot:    "rgba(10,140,92,.00)",
    line:       "#0a8c5c",
    lineGlow:   "rgba(10,140,92,.25)",
    dotFill:    "#ffffff",
    dotStroke:  "#0a8c5c",
    dotGlow:    "rgba(10,140,92,.35)",
    label:      "rgba(14,26,18,.45)",
    empty:      "#5e7a68"
  };
}

function drawLineChart(canvas, points) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width * ratio);
  canvas.height = Math.max(1, rect.height * ratio);

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const padding = { top: 24, right: 20, bottom: 34, left: 44 };
  const width = rect.width - padding.left - padding.right;
  const height = rect.height - padding.top - padding.bottom;

  const c = chartColors();

  // Grid lines
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (i / gridLines) * height;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = c.axis;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + height);
  ctx.stroke();

  if (!points.length) {
    ctx.fillStyle = c.empty;
    ctx.font = "14px Inter, system-ui";
    ctx.fillText("Pas encore de données", padding.left + 12, padding.top + 28);
    return;
  }

  const values = points.map((point) => Number(point.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = max - min || 1;

  const xy = points.map((point, index) => {
    const x = padding.left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
    const y = padding.top + height - ((Number(point.value) - min) / spread) * height;
    return { x, y, point };
  });

  // Gradient fill under line
  const gradFill = ctx.createLinearGradient(0, padding.top, 0, padding.top + height);
  gradFill.addColorStop(0,   c.fillTop);
  gradFill.addColorStop(0.6, c.fillMid);
  gradFill.addColorStop(1,   c.fillBot);
  ctx.fillStyle = gradFill;
  ctx.beginPath();
  xy.forEach((item, index) => {
    if (index === 0) ctx.moveTo(item.x, item.y);
    else ctx.lineTo(item.x, item.y);
  });
  ctx.lineTo(xy[xy.length - 1].x, padding.top + height);
  ctx.lineTo(xy[0].x, padding.top + height);
  ctx.closePath();
  ctx.fill();

  // Line with glow
  ctx.shadowColor = c.lineGlow;
  ctx.shadowBlur  = 10;
  ctx.strokeStyle = c.line;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = "round";
  ctx.beginPath();
  xy.forEach((item, index) => {
    if (index === 0) ctx.moveTo(item.x, item.y);
    else ctx.lineTo(item.x, item.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Dots
  xy.forEach((item) => {
    ctx.beginPath();
    ctx.arc(item.x, item.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = c.dotFill;
    ctx.fill();
    ctx.strokeStyle = c.dotStroke;
    ctx.shadowColor = c.dotGlow;
    ctx.shadowBlur  = 8;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  });

  // Labels
  ctx.fillStyle = c.label;
  ctx.font      = "600 11px Inter, system-ui";
  ctx.fillText(formatNumber(max, 1), 4, padding.top + 8);
  ctx.fillText(formatDate(points[0].date), padding.left + 2, rect.height - 8);
  ctx.textAlign = "right";
  ctx.fillText(formatDate(points[points.length - 1].date), padding.left + width, rect.height - 8);
  ctx.textAlign = "left";
}

function metric(label, value, icon) {
  const iconHtml = icon ? `<div style="font-size:1.1rem;line-height:1;margin-bottom:2px">${icon}</div>` : "";
  return `
    <div class="metric-card">
      ${iconHtml}
      <div class="metric-value">${escapeHTML(String(value))}</div>
      <div class="metric-label">${escapeHTML(label)}</div>
    </div>
  `;
}

function emptyState(icon, title, text) {
  if (text === undefined) {
    return `<div class="empty-state"><p class="muted">${escapeHTML(icon)}</p></div>`;
  }
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${title}</h3>
      <p class="muted">${text}</p>
    </div>
  `;
}

function cardioSummary(cardio) {
  const distance = cardio.distance_km ? ` · ${formatNumber(cardio.distance_km, 2)} km` : "";
  return `${cardio.duration_minutes} min${distance}`;
}

function parseDecimal(value) {
  return Number(String(value).replace(",", "."));
}

function now() {
  return new Date().toISOString();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("fr-BE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat("fr-BE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  }).format(Number(value) || 0);
}

function updateStatus(text) {
  elements.connectionStatus.textContent = text;
}

function notify(message) {
  elements.connectionStatus.textContent = message;
  window.setTimeout(() => {
    updateStatus(state.mode === "supabase" ? "Supabase" : state.mode === "local" ? "Mode local" : "Configuration requise");
  }, 3200);
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
