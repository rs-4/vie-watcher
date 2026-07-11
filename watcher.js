"use strict";

const fs = require("node:fs");
const path = require("node:path");

const API = process.env.VIE_API_URL || "https://civiweb-api-prd.azurewebsites.net/api/Offers/search";
const API_KEY = process.env.VIE_API_KEY || "";
const WEBHOOK = process.env.DISCORD_WEBHOOK || "";
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "state.json");
const POLL_MS = Number(process.env.POLL_MS || 10_000);
const DISCORD_DELAY_MS = Number(process.env.DISCORD_DELAY_MS || 1_200);
const LIMIT = Number(process.env.VIE_LIMIT || 30);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const RUN_ONCE = process.env.RUN_ONCE === "1" || process.env.RUN_ONCE === "true";

const SEARCH_BODY = {
  limit: LIMIT,
  skip: 0,
  query: null,
  teletravail: [],
  porteEnv: [],
  activitySectorId: [],
  missionsTypesIds: [],
  missionsDurations: [],
  geographicZones: [],
  countriesIds: [],
  studiesLevelId: [],
  companiesSizes: [],
  specializationsIds: [],
  entreprisesIds: [],
  missionStartDate: null,
};

const IMPORTANT_TECH_KEYWORDS = [
  { label: "Software Engineer", pattern: /\bsoftware\s+(engineer|developer)\b|ing[ée]nieur\s+logiciel|d[ée]veloppeur\s+logiciel/iu },
  { label: "Full-stack", pattern: /\bfull[-\s]?stack\b|\bfullstack\b/iu },
  { label: "Frontend", pattern: /\bfront[-\s]?end\b|\bfrontend\b|int[ée]grateur\s+web/iu },
  { label: "Backend", pattern: /\bback[-\s]?end\b|\bbackend\b|api\s+developer/iu },
  { label: "Mobile", pattern: /\bmobile\b|app\s+mobile|application\s+mobile|(?<![\p{L}\p{N}_])ios(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])android(?![\p{L}\p{N}_])/iu },
  { label: "JavaScript", pattern: /\bjava\s*script\b|\bjavascript\b|\bjs\b|\becmascript\b|\bes\d{4}\b/iu },
  { label: "TypeScript", pattern: /\btype\s*script\b|\btypescript\b|\bts\b/iu },
  { label: "React", pattern: /\breact(?:\.js|js)?\b|\breactjs\b/iu },
  { label: "React Native", pattern: /\breact\s+native\b|\brn\b/iu },
  { label: "Expo", pattern: /\bexpo\b|\beas\b|expo\s+application\s+services/iu },
  { label: "Next.js", pattern: /\bnext(?:\.js|js)?\b|\bnextjs\b/iu },
  { label: "Node.js", pattern: /\bnode(?:\.js|js)?\b|\bnodejs\b|\bnpm\b|\byarn\b|\bpnpm\b|\bbun\b/iu },
  { label: "Web", pattern: /\bweb\b|site\s+web|application\s+web|webapp|pwa|saas/iu },
  { label: "Vue", pattern: /\bvue(?:\.js|js)?\b|\bnuxt(?:\.js|js)?\b/iu },
  { label: "Angular", pattern: /\bangular\b|\brxjs\b/iu },
  { label: "Svelte", pattern: /\bsvelte\b|\bsveltekit\b/iu },
  { label: "CSS/UI", pattern: /\bcss\b|\bhtml\b|tailwind|sass|scss|ui\s*\/\s*ux|design\s+system/iu },
  { label: "Cloud/DevOps", pattern: /\baws\b|\bgcp\b|azure|docker|kubernetes|\bk8s\b|terraform|ci\s*\/\s*cd|devops/iu },
  { label: "Database", pattern: /postgres|postgresql|mysql|mongodb|redis|sqlite|supabase|firebase|graphql|rest\s+api/iu },
  { label: "AI/Data", pattern: /artificial\s+intelligence|intelligence\s+artificielle|machine\s+learning|\bml\b|llm|openai|data\s+engineer|data\s+engineering|python|pandas/iu },
  { label: "Product/Growth Tech", pattern: /growth\s+engineer|marketing\s+automation|hubspot|salesforce|analytics|tracking|crm/iu },
];

function loadState(file = STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { lastMaxId: 0 };
  }
}

function saveState(state, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOffers(fetchImpl = fetch) {
  const headers = {
    "content-type": "application/json",
    referer: "https://mon-vie-via.businessfrance.fr/",
    "user-agent": "vie-watcher/1.0 (+https://github.com/rs-4/vie-watcher)",
  };
  if (API_KEY) headers["X-API-KEY"] = API_KEY;

  const res = await fetchImpl(API, {
    method: "POST",
    headers,
    body: JSON.stringify(SEARCH_BODY),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Business France API ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.result)) return [];
  return data.result;
}

function offerUrl(id) {
  return `https://mon-vie-via.businessfrance.fr/offres/${id}`;
}

function clean(value, fallback = "—") {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text || fallback;
}

function formatSalary(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Indemnité indisponible";
  return `${new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}/mois`;
}

function offerSearchText(offer) {
  const specializationLabels = (offer.specializations || [])
    .map((specialization) => `${specialization.specializationLabel || ""} ${specialization.specializationLabelEn || ""}`)
    .join(" ");

  return [
    offer.missionTitle,
    offer.missionDescription,
    offer.missionProfile,
    offer.organizationName,
    offer.activitySectorN1,
    offer.activitySectorN2,
    offer.activitySectorN3,
    specializationLabels,
  ]
    .map((value) => (value === undefined || value === null ? "" : String(value)))
    .join("\n");
}

function importantMatches(offer) {
  const haystack = offerSearchText(offer);
  return IMPORTANT_TECH_KEYWORDS
    .filter(({ pattern }) => pattern.test(haystack))
    .map(({ label }) => label);
}

function importantSummary(matches) {
  return matches.slice(0, 12).join(", ") + (matches.length > 12 ? ` +${matches.length - 12}` : "");
}

function toEmbed(offer) {
  const description = clean(offer.missionDescription, "")
    .replace(/\s+/g, " ")
    .slice(0, 300);

  const duration = offer.missionDuration ? `${offer.missionDuration} mois` : "—";
  const country = clean(offer.countryName || offer.country);
  const city = clean(offer.cityName);
  const location = [city, country].filter((v) => v && v !== "—").join(", ") || "—";
  const matches = importantMatches(offer);
  const important = matches.length > 0;
  const fields = [
    { name: "Type", value: clean(offer.missionType), inline: true },
    { name: "Durée", value: duration, inline: true },
    { name: "Salaire", value: formatSalary(offer.indemnite), inline: true },
    { name: "Lieu", value: location, inline: true },
    { name: "Entreprise", value: clean(offer.organizationName), inline: true },
    { name: "ID", value: String(offer.id), inline: true },
  ];

  if (important) {
    fields.unshift({ name: "🚨 Important", value: importantSummary(matches), inline: false });
  }

  return {
    title: `${important ? "🚨 IMPORTANT — " : ""}${clean(offer.missionTitle, `Offre VIE #${offer.id}`)} — ${clean(offer.organizationName)}`.slice(0, 256),
    url: offerUrl(offer.id),
    color: important ? 0xe74c3c : 0x2e86de,
    description: description ? `${description}${description.length === 300 ? "…" : ""}` : "",
    fields,
    timestamp: new Date().toISOString(),
  };
}

async function sendToDiscord(offer, fetchImpl = fetch) {
  const matches = importantMatches(offer);
  const payload = {
    username: "VIE Watcher",
    content: matches.length ? `🚨 **IMPORTANT — match software engineer**: ${importantSummary(matches)}` : undefined,
    embeds: [toEmbed(offer)],
  };

  if (DRY_RUN) {
    const importantLog = matches.length ? ` [IMPORTANT: ${importantSummary(matches)}]` : "";
    console.log(`[dry-run] Nouvelle offre${importantLog}: [${offer.id}] ${clean(offer.missionTitle)}`);
    return;
  }

  if (!WEBHOOK) {
    throw new Error("DISCORD_WEBHOOK manquant (ou mets DRY_RUN=1 pour tester sans envoi)");
  }

  while (true) {
    const res = await fetchImpl(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const retryAfterMs = Math.ceil(Number(body.retry_after || 1) * 1000);
      console.warn(`Rate limited Discord, attente ${retryAfterMs}ms`);
      await sleep(retryAfterMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Discord webhook ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    return;
  }
}

function freshOffers(offers, lastMaxId) {
  return offers
    .filter((offer) => Number(offer.id) > Number(lastMaxId || 0))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

async function tick(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const stateFile = options.stateFile || STATE_FILE;
  const state = loadState(stateFile);
  const offers = await fetchOffers(fetchImpl);

  if (!offers.length) {
    console.log("Aucune offre retournée par l'API.");
    return { sent: 0, initialized: false, lastMaxId: state.lastMaxId || 0 };
  }

  const maxSeen = Math.max(...offers.map((offer) => Number(offer.id)).filter(Number.isFinite));

  if (!state.lastMaxId) {
    state.lastMaxId = maxSeen;
    saveState(state, stateFile);
    console.log(`Init lastMaxId=${state.lastMaxId} (aucun envoi)`);
    return { sent: 0, initialized: true, lastMaxId: state.lastMaxId };
  }

  const fresh = freshOffers(offers, state.lastMaxId);

  for (const offer of fresh) {
    await sendToDiscord(offer, fetchImpl);
    await sleep(DISCORD_DELAY_MS);
    console.log(`Envoyé: [${offer.id}] ${clean(offer.missionTitle)}`);
  }

  if (fresh.length) {
    state.lastMaxId = Math.max(Number(state.lastMaxId), ...fresh.map((offer) => Number(offer.id)));
    saveState(state, stateFile);
  }

  return { sent: fresh.length, initialized: false, lastMaxId: state.lastMaxId };
}

async function main() {
  console.log(`VIE Watcher démarré. poll=${POLL_MS}ms dryRun=${DRY_RUN}`);
  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error("Erreur tick:", error.message);
    }

    if (RUN_ONCE) break;
    await sleep(POLL_MS);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  clean,
  fetchOffers,
  formatSalary,
  freshOffers,
  importantMatches,
  loadState,
  offerUrl,
  saveState,
  tick,
  toEmbed,
};
