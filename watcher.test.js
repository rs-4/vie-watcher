"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { formatSalary, freshOffers, importantMatches, offerUrl, tick, toEmbed } = require("./watcher");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test("freshOffers keeps only ids greater than lastMaxId and sorts ascending", () => {
  const offers = [{ id: 12 }, { id: 10 }, { id: 13 }, { id: 11 }];
  assert.deepEqual(freshOffers(offers, 10).map((offer) => offer.id), [11, 12, 13]);
});

test("offerUrl builds Mon VIE details URL", () => {
  assert.equal(offerUrl(244326), "https://mon-vie-via.businessfrance.fr/offres/244326");
});

test("formatSalary formats monthly VIE allowance", () => {
  assert.match(formatSalary(3356.05), /3\s?356,05\s?€\/mois/);
  assert.equal(formatSalary(null), "Indemnité indisponible");
});

test("importantMatches detects software engineering offers", () => {
  const matches = importantMatches({
    missionTitle: "React Native / Expo Software Engineer",
    missionDescription: "Build a Next.js dashboard with TypeScript, Node.js and Supabase.",
    missionProfile: "JavaScript/React experience required.",
  });

  assert.ok(matches.includes("Software Engineer"));
  assert.ok(matches.includes("React Native"));
  assert.ok(matches.includes("Expo"));
  assert.ok(matches.includes("Next.js"));
  assert.ok(matches.includes("TypeScript"));
});

test("toEmbed marks software engineering offers as important", () => {
  const embed = toEmbed({
    id: 1,
    missionTitle: "Dev",
    organizationName: "ACME",
    missionDescription: "Hello world — React Native Expo TypeScript",
    missionDuration: 12,
    indemnite: 2692.7,
    cityName: "Paris",
    countryName: "France",
  });
  assert.equal(embed.title, "🚨 IMPORTANT — Dev — ACME");
  assert.equal(embed.color, 0xe74c3c);
  assert.equal(embed.fields[0].name, "🚨 Important");
  assert.match(embed.fields[0].value, /React Native/);
  assert.equal(embed.url, offerUrl(1));
  assert.match(embed.description, /Hello world/);
  assert.equal(embed.fields.find((field) => field.name === "Durée").value, "12 mois");
  assert.match(embed.fields.find((field) => field.name === "Salaire").value, /2\s?692,70\s?€\/mois/);
});

test("first tick initializes state without sending Discord messages", async () => {
  const stateFile = path.join(os.tmpdir(), `vie-watcher-${Date.now()}.json`);
  let calls = 0;
  const result = await tick({
    stateFile,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ result: [{ id: 3 }, { id: 2 }, { id: 1 }] });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.initialized, true);
  assert.equal(result.sent, 0);
  assert.equal(result.lastMaxId, 3);
});
