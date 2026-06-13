export const WORLD_CUP_2026 = {
  code: "WC",
  name: "FIFA World Cup 2026",
  season: 2026,
  startDate: "2026-06-11",
  endDate: "2026-07-19",
  format:
    "48 teams, 12 groups, top two plus the eight best third-place teams reach the Round of 32.",
  hosts: ["Canada", "Mexico", "United States"],
};

export const WORLD_CUP_GROUPS = [
  {
    code: "A",
    teams: [
      team("MEX", "Mexico", ["mexico"]),
      team("RSA", "South Africa", ["south africa", "bafana bafana"]),
      team("KOR", "South Korea", ["south korea", "korea republic", "korea"]),
      team("CZE", "Czech Republic", ["czech republic", "czechia"]),
    ],
  },
  {
    code: "B",
    teams: [
      team("CAN", "Canada", ["canada"]),
      team("BIH", "Bosnia and Herzegovina", [
        "bosnia and herzegovina",
        "bosnia",
        "bosnia-herzegovina",
      ]),
      team("QAT", "Qatar", ["qatar"]),
      team("SUI", "Switzerland", ["switzerland", "swiss"]),
    ],
  },
  {
    code: "C",
    teams: [
      team("BRA", "Brazil", ["brazil", "brasil"]),
      team("MAR", "Morocco", ["morocco"]),
      team("HAI", "Haiti", ["haiti"]),
      team("SCO", "Scotland", ["scotland"]),
    ],
  },
  {
    code: "D",
    teams: [
      team("USA", "United States", [
        "united states",
        "usa",
        "usmnt",
        "america",
      ]),
      team("PAR", "Paraguay", ["paraguay"]),
      team("AUS", "Australia", ["australia", "socceroos"]),
      team("TUR", "Turkey", ["turkey", "turkiye", "turkiye national team"]),
    ],
  },
  {
    code: "E",
    teams: [
      team("GER", "Germany", ["germany", "deutschland"]),
      team("CUW", "Curacao", ["curacao", "curacao national team"]),
      team("CIV", "Ivory Coast", [
        "ivory coast",
        "cote divoire",
        "cote d ivoire",
        "cote d'ivoire",
      ]),
      team("ECU", "Ecuador", ["ecuador"]),
    ],
  },
  {
    code: "F",
    teams: [
      team("NED", "Netherlands", ["netherlands", "holland", "dutch"]),
      team("JPN", "Japan", ["japan"]),
      team("SWE", "Sweden", ["sweden"]),
      team("TUN", "Tunisia", ["tunisia"]),
    ],
  },
  {
    code: "G",
    teams: [
      team("BEL", "Belgium", ["belgium"]),
      team("EGY", "Egypt", ["egypt"]),
      team("IRN", "Iran", ["iran"]),
      team("NZL", "New Zealand", ["new zealand", "all whites"]),
    ],
  },
  {
    code: "H",
    teams: [
      team("ESP", "Spain", ["spain", "espana"]),
      team("CPV", "Cape Verde", ["cape verde", "cabo verde"]),
      team("KSA", "Saudi Arabia", ["saudi arabia", "saudi"]),
      team("URU", "Uruguay", ["uruguay"]),
    ],
  },
  {
    code: "I",
    teams: [
      team("FRA", "France", ["france"]),
      team("SEN", "Senegal", ["senegal"]),
      team("IRQ", "Iraq", ["iraq"]),
      team("NOR", "Norway", ["norway"]),
    ],
  },
  {
    code: "J",
    teams: [
      team("ARG", "Argentina", ["argentina"]),
      team("ALG", "Algeria", ["algeria"]),
      team("AUT", "Austria", ["austria"]),
      team("JOR", "Jordan", ["jordan"]),
    ],
  },
  {
    code: "K",
    teams: [
      team("POR", "Portugal", ["portugal"]),
      team("COD", "DR Congo", [
        "dr congo",
        "democratic republic of congo",
        "congo dr",
        "drc",
      ]),
      team("UZB", "Uzbekistan", ["uzbekistan"]),
      team("COL", "Colombia", ["colombia"]),
    ],
  },
  {
    code: "L",
    teams: [
      team("ENG", "England", ["england"]),
      team("CRO", "Croatia", ["croatia"]),
      team("GHA", "Ghana", ["ghana"]),
      team("PAN", "Panama", ["panama"]),
    ],
  },
];

export const WORLD_CUP_KNOCKOUT_PATHS = [
  bracket("R32-1", "Winner Group A", "3rd Group C/E/F/H/I"),
  bracket("R32-2", "Winner Group B", "3rd Group E/F/G/I/J"),
  bracket("R32-3", "Winner Group C", "Runner-up Group F"),
  bracket("R32-4", "Winner Group D", "3rd Group B/E/F/I/J"),
  bracket("R32-5", "Winner Group E", "3rd Group A/B/C/D/F"),
  bracket("R32-6", "Winner Group F", "Runner-up Group C"),
  bracket("R32-7", "Winner Group G", "3rd Group A/E/H/I/J"),
  bracket("R32-8", "Winner Group H", "Runner-up Group J"),
  bracket("R32-9", "Winner Group I", "3rd Group C/D/F/G/H"),
  bracket("R32-10", "Winner Group J", "Runner-up Group H"),
  bracket("R32-11", "Winner Group K", "3rd Group D/E/I/J/L"),
  bracket("R32-12", "Winner Group L", "3rd Group E/H/I/J/K"),
  bracket("R32-13", "Runner-up Group A", "Runner-up Group B"),
  bracket("R32-14", "Runner-up Group D", "Runner-up Group G"),
  bracket("R32-15", "Runner-up Group E", "Runner-up Group I"),
  bracket("R32-16", "Runner-up Group K", "Runner-up Group L"),
];

export const WORLD_CUP_TEAM_ENTITIES = WORLD_CUP_GROUPS.flatMap((group) =>
  group.teams.map((entry) => ({
    sport: "soccer",
    canonicalName: entry.name,
    abbreviation: entry.code,
    competitionCode: WORLD_CUP_2026.code,
    groupCode: group.code,
    aliases: entry.aliases,
  })),
);

export function getWorldCupGroup(groupCode) {
  const normalized = String(groupCode ?? "").trim().toUpperCase();
  return WORLD_CUP_GROUPS.find((group) => group.code === normalized) ?? null;
}

export function getWorldCupGroupForTeam(teamNameOrCode) {
  const needle = normalizeWorldCupText(teamNameOrCode);
  if (!needle) return null;

  for (const group of WORLD_CUP_GROUPS) {
    const found = group.teams.some((entry) =>
      [entry.code, entry.name, ...entry.aliases].some(
        (alias) => normalizeWorldCupText(alias) === needle,
      ),
    );
    if (found) return group;
  }

  return null;
}

export function resolveWorldCupGroupFromQuery(queryText) {
  const normalized = normalizeWorldCupText(queryText);
  const match = normalized.match(/\bgroup ([a-l])\b/);
  return match ? getWorldCupGroup(match[1]) : null;
}

export function isWorldCupQuery(queryText) {
  const normalized = normalizeWorldCupText(queryText);
  if (!normalized) return false;
  if (/\b(world cup|fifa world cup|fifa wc|wc 2026)\b/.test(normalized)) {
    return !/\b(cricket|rugby|darts|hockey|baseball|basketball)\b/.test(
      normalized,
    );
  }

  return /\bfifa\b/.test(normalized) && /\b(standings|bracket|groups?)\b/.test(normalized);
}

function team(code, name, aliases) {
  return {
    code,
    name,
    aliases: [...new Set([code, name, ...aliases])],
  };
}

function bracket(id, home, away) {
  return { id, home, away };
}

function normalizeWorldCupText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
