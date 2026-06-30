const state = {
  plans: [],
  slug: currentSlug(),
};

const listEl = document.querySelector("#planList");
const titleEl = document.querySelector("#planTitle");
const pathEl = document.querySelector("#planPath");
const docEl = document.querySelector("#planDocument");
const sourceEl = document.querySelector("#openSource");

document.querySelector("#refreshPlans").addEventListener("click", loadPlans);
document.querySelector("#refreshPlan").addEventListener("click", () => loadPlan(state.slug));

await loadPlans();
await loadPlan(state.slug || state.plans[0]?.slug || "latest");

function currentSlug() {
  const match = window.location.pathname.match(/^\/plan\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function loadPlans() {
  const response = await fetch("/api/plans", { cache: "no-store" });
  const data = await response.json();
  state.plans = data.plans || [];
  listEl.innerHTML = state.plans.map((plan) => {
    const active = plan.slug === state.slug ? " active" : "";
    return `<a class="plan-row${active}" href="/plan/${encodeURIComponent(plan.slug)}">
      <strong>${escapeHtml(plan.slug)}</strong>
      <span>${escapeHtml(plan.title)}</span>
    </a>`;
  }).join("");
}

async function loadPlan(slug) {
  const target = slug || "latest";
  const response = await fetch(`/api/plan/${encodeURIComponent(target)}`, { cache: "no-store" });
  const plan = await response.json();
  state.slug = plan.slug;
  if (window.location.pathname !== `/plan/${encodeURIComponent(plan.slug)}`) {
    history.replaceState(null, "", `/plan/${encodeURIComponent(plan.slug)}`);
  }
  titleEl.textContent = plan.title || "Local Plan";
  pathEl.textContent = plan.sourcePath || "";
  docEl.innerHTML = plan.html || "<p>No content.</p>";
  sourceEl.href = plan.sourceFilePath ? `file://${plan.sourceFilePath}` : "#";
  sourceEl.setAttribute("aria-disabled", "false");
  await loadPlans();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
