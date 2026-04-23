const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
const BALLDONTLIE_BASE = {
  nba: "https://api.balldontlie.io/v1",
  nfl: "https://api.balldontlie.io/nfl/v1",
};

const DEFAULT_SOCCER_COMPETITIONS = ["PL", "PD", "CL", "BL1", "SA", "FL1"];
const MATCHUP_PATTERN = /(?:^|\s)(?:vs\.?|versus|v)(?:\s|$)/i;
const QUERY_CUE_PATTERN =
  /\b(score|scores|scored|result|results|schedule|schedules|fixtures|fixture|game|games|match|matches|table|tables|standings|standing|rankings|ranking|today|tonight|tomorrow|live|next|latest|last|who won)\b/i;
const SETUP_LINKS = {
  soccer: "https://www.football-data.org/client/register",
  balldontlie: "https://app.balldontlie.io",
};

const SOCCER_COMPETITIONS = [
  {
    code: "PL",
    name: "Premier League",
    sport: "soccer",
    aliases: ["premier league", "epl", "english premier league"],
  },
  {
    code: "PD",
    name: "La Liga",
    sport: "soccer",
    aliases: ["la liga", "laliga", "spanish league"],
  },
  {
    code: "BL1",
    name: "Bundesliga",
    sport: "soccer",
    aliases: ["bundesliga", "german league"],
  },
  {
    code: "SA",
    name: "Serie A",
    sport: "soccer",
    aliases: ["serie a", "italian league"],
  },
  {
    code: "FL1",
    name: "Ligue 1",
    sport: "soccer",
    aliases: ["ligue 1", "ligue1", "french league"],
  },
  {
    code: "CL",
    name: "Champions League",
    sport: "soccer",
    aliases: ["champions league", "ucl", "uefa champions league"],
  },
];

const NBA_TEAMS = [
  {
    sport: "nba",
    abbreviation: "ATL",
    canonicalName: "Atlanta Hawks",
    aliases: ["atl", "hawks", "atlanta hawks"],
  },
  {
    sport: "nba",
    abbreviation: "BOS",
    canonicalName: "Boston Celtics",
    aliases: ["bos", "celtics", "boston celtics", "c's"],
  },
  {
    sport: "nba",
    abbreviation: "BKN",
    canonicalName: "Brooklyn Nets",
    aliases: ["bkn", "nets", "brooklyn nets"],
  },
  {
    sport: "nba",
    abbreviation: "CHA",
    canonicalName: "Charlotte Hornets",
    aliases: ["cha", "hornets", "charlotte hornets"],
  },
  {
    sport: "nba",
    abbreviation: "CHI",
    canonicalName: "Chicago Bulls",
    aliases: ["chi", "bulls", "chicago bulls"],
  },
  {
    sport: "nba",
    abbreviation: "CLE",
    canonicalName: "Cleveland Cavaliers",
    aliases: ["cle", "cavs", "cavaliers", "cleveland cavaliers"],
  },
  {
    sport: "nba",
    abbreviation: "DAL",
    canonicalName: "Dallas Mavericks",
    aliases: ["dal", "mavs", "mavericks", "dallas mavericks"],
  },
  {
    sport: "nba",
    abbreviation: "DEN",
    canonicalName: "Denver Nuggets",
    aliases: ["den", "nuggets", "denver nuggets"],
  },
  {
    sport: "nba",
    abbreviation: "DET",
    canonicalName: "Detroit Pistons",
    aliases: ["det", "pistons", "detroit pistons"],
  },
  {
    sport: "nba",
    abbreviation: "GSW",
    canonicalName: "Golden State Warriors",
    aliases: ["gsw", "warriors", "golden state warriors"],
  },
  {
    sport: "nba",
    abbreviation: "HOU",
    canonicalName: "Houston Rockets",
    aliases: ["hou", "rockets", "houston rockets"],
  },
  {
    sport: "nba",
    abbreviation: "IND",
    canonicalName: "Indiana Pacers",
    aliases: ["ind", "pacers", "indiana pacers"],
  },
  {
    sport: "nba",
    abbreviation: "LAC",
    canonicalName: "LA Clippers",
    aliases: ["lac", "clippers", "la clippers", "los angeles clippers"],
  },
  {
    sport: "nba",
    abbreviation: "LAL",
    canonicalName: "Los Angeles Lakers",
    aliases: ["lal", "lakers", "la lakers", "los angeles lakers"],
  },
  {
    sport: "nba",
    abbreviation: "MEM",
    canonicalName: "Memphis Grizzlies",
    aliases: ["mem", "grizzlies", "memphis grizzlies"],
  },
  {
    sport: "nba",
    abbreviation: "MIA",
    canonicalName: "Miami Heat",
    aliases: ["mia", "heat", "miami heat"],
  },
  {
    sport: "nba",
    abbreviation: "MIL",
    canonicalName: "Milwaukee Bucks",
    aliases: ["mil", "bucks", "milwaukee bucks"],
  },
  {
    sport: "nba",
    abbreviation: "MIN",
    canonicalName: "Minnesota Timberwolves",
    aliases: ["min", "timberwolves", "wolves", "minnesota timberwolves"],
  },
  {
    sport: "nba",
    abbreviation: "NOP",
    canonicalName: "New Orleans Pelicans",
    aliases: ["nop", "pelicans", "new orleans pelicans"],
  },
  {
    sport: "nba",
    abbreviation: "NYK",
    canonicalName: "New York Knicks",
    aliases: ["nyk", "knicks", "new york knicks"],
  },
  {
    sport: "nba",
    abbreviation: "OKC",
    canonicalName: "Oklahoma City Thunder",
    aliases: ["okc", "thunder", "oklahoma city thunder"],
  },
  {
    sport: "nba",
    abbreviation: "ORL",
    canonicalName: "Orlando Magic",
    aliases: ["orl", "magic", "orlando magic"],
  },
  {
    sport: "nba",
    abbreviation: "PHI",
    canonicalName: "Philadelphia 76ers",
    aliases: ["phi", "76ers", "sixers", "philadelphia 76ers"],
  },
  {
    sport: "nba",
    abbreviation: "PHX",
    canonicalName: "Phoenix Suns",
    aliases: ["phx", "suns", "phoenix suns"],
  },
  {
    sport: "nba",
    abbreviation: "POR",
    canonicalName: "Portland Trail Blazers",
    aliases: ["por", "blazers", "trail blazers", "portland trail blazers"],
  },
  {
    sport: "nba",
    abbreviation: "SAC",
    canonicalName: "Sacramento Kings",
    aliases: ["sac", "kings", "sacramento kings"],
  },
  {
    sport: "nba",
    abbreviation: "SAS",
    canonicalName: "San Antonio Spurs",
    aliases: ["sas", "spurs", "san antonio spurs"],
  },
  {
    sport: "nba",
    abbreviation: "TOR",
    canonicalName: "Toronto Raptors",
    aliases: ["tor", "raptors", "toronto raptors"],
  },
  {
    sport: "nba",
    abbreviation: "UTA",
    canonicalName: "Utah Jazz",
    aliases: ["uta", "jazz", "utah jazz"],
  },
  {
    sport: "nba",
    abbreviation: "WAS",
    canonicalName: "Washington Wizards",
    aliases: ["was", "wizards", "washington wizards"],
  },
];

const NFL_TEAMS = [
  {
    sport: "nfl",
    abbreviation: "ARI",
    canonicalName: "Arizona Cardinals",
    aliases: ["ari", "cardinals", "arizona cardinals"],
  },
  {
    sport: "nfl",
    abbreviation: "ATL",
    canonicalName: "Atlanta Falcons",
    aliases: ["falcons", "atlanta falcons"],
  },
  {
    sport: "nfl",
    abbreviation: "BAL",
    canonicalName: "Baltimore Ravens",
    aliases: ["bal", "ravens", "baltimore ravens"],
  },
  {
    sport: "nfl",
    abbreviation: "BUF",
    canonicalName: "Buffalo Bills",
    aliases: ["buf", "bills", "buffalo bills"],
  },
  {
    sport: "nfl",
    abbreviation: "CAR",
    canonicalName: "Carolina Panthers",
    aliases: ["car", "panthers", "carolina panthers"],
  },
  {
    sport: "nfl",
    abbreviation: "CHI",
    canonicalName: "Chicago Bears",
    aliases: ["bears", "chicago bears"],
  },
  {
    sport: "nfl",
    abbreviation: "CIN",
    canonicalName: "Cincinnati Bengals",
    aliases: ["cin", "bengals", "cincinnati bengals"],
  },
  {
    sport: "nfl",
    abbreviation: "CLE",
    canonicalName: "Cleveland Browns",
    aliases: ["browns", "cleveland browns"],
  },
  {
    sport: "nfl",
    abbreviation: "DAL",
    canonicalName: "Dallas Cowboys",
    aliases: ["cowboys", "dallas cowboys"],
  },
  {
    sport: "nfl",
    abbreviation: "DEN",
    canonicalName: "Denver Broncos",
    aliases: ["broncos", "denver broncos"],
  },
  {
    sport: "nfl",
    abbreviation: "DET",
    canonicalName: "Detroit Lions",
    aliases: ["lions", "detroit lions"],
  },
  {
    sport: "nfl",
    abbreviation: "GB",
    canonicalName: "Green Bay Packers",
    aliases: ["gb", "packers", "green bay packers"],
  },
  {
    sport: "nfl",
    abbreviation: "HOU",
    canonicalName: "Houston Texans",
    aliases: ["texans", "houston texans"],
  },
  {
    sport: "nfl",
    abbreviation: "IND",
    canonicalName: "Indianapolis Colts",
    aliases: ["colts", "indianapolis colts"],
  },
  {
    sport: "nfl",
    abbreviation: "JAX",
    canonicalName: "Jacksonville Jaguars",
    aliases: ["jax", "jaguars", "jacksonville jaguars"],
  },
  {
    sport: "nfl",
    abbreviation: "KC",
    canonicalName: "Kansas City Chiefs",
    aliases: ["kc", "chiefs", "kansas city chiefs"],
  },
  {
    sport: "nfl",
    abbreviation: "LV",
    canonicalName: "Las Vegas Raiders",
    aliases: ["lv", "raiders", "las vegas raiders"],
  },
  {
    sport: "nfl",
    abbreviation: "LAC",
    canonicalName: "Los Angeles Chargers",
    aliases: ["chargers", "los angeles chargers", "la chargers"],
  },
  {
    sport: "nfl",
    abbreviation: "LAR",
    canonicalName: "Los Angeles Rams",
    aliases: ["rams", "los angeles rams", "la rams"],
  },
  {
    sport: "nfl",
    abbreviation: "MIA",
    canonicalName: "Miami Dolphins",
    aliases: ["dolphins", "miami dolphins"],
  },
  {
    sport: "nfl",
    abbreviation: "MIN",
    canonicalName: "Minnesota Vikings",
    aliases: ["vikings", "minnesota vikings"],
  },
  {
    sport: "nfl",
    abbreviation: "NE",
    canonicalName: "New England Patriots",
    aliases: ["ne", "patriots", "pats", "new england patriots"],
  },
  {
    sport: "nfl",
    abbreviation: "NO",
    canonicalName: "New Orleans Saints",
    aliases: ["saints", "new orleans saints"],
  },
  {
    sport: "nfl",
    abbreviation: "NYG",
    canonicalName: "New York Giants",
    aliases: ["nyg", "giants", "new york giants"],
  },
  {
    sport: "nfl",
    abbreviation: "NYJ",
    canonicalName: "New York Jets",
    aliases: ["nyj", "jets", "new york jets"],
  },
  {
    sport: "nfl",
    abbreviation: "PHI",
    canonicalName: "Philadelphia Eagles",
    aliases: ["eagles", "philadelphia eagles"],
  },
  {
    sport: "nfl",
    abbreviation: "PIT",
    canonicalName: "Pittsburgh Steelers",
    aliases: ["pit", "steelers", "pittsburgh steelers"],
  },
  {
    sport: "nfl",
    abbreviation: "SEA",
    canonicalName: "Seattle Seahawks",
    aliases: ["sea", "seahawks", "seattle seahawks"],
  },
  {
    sport: "nfl",
    abbreviation: "SF",
    canonicalName: "San Francisco 49ers",
    aliases: ["sf", "49ers", "niners", "san francisco 49ers"],
  },
  {
    sport: "nfl",
    abbreviation: "TB",
    canonicalName: "Tampa Bay Buccaneers",
    aliases: ["tb", "bucs", "buccaneers", "tampa bay buccaneers"],
  },
  {
    sport: "nfl",
    abbreviation: "TEN",
    canonicalName: "Tennessee Titans",
    aliases: ["titans", "tennessee titans"],
  },
  {
    sport: "nfl",
    abbreviation: "WAS",
    canonicalName: "Washington Commanders",
    aliases: [
      "was",
      "commanders",
      "washington commanders",
      "washington football team",
    ],
  },
];

const SOCCER_CLUBS = [
  {
    sport: "soccer",
    canonicalName: "Arsenal",
    competitionCode: "PL",
    aliases: ["arsenal", "ars", "arsenal fc"],
  },
  {
    sport: "soccer",
    canonicalName: "Chelsea",
    competitionCode: "PL",
    aliases: ["chelsea", "che", "chelsea fc"],
  },
  {
    sport: "soccer",
    canonicalName: "Liverpool",
    competitionCode: "PL",
    aliases: ["liverpool", "liv", "lfc", "liverpool fc"],
  },
  {
    sport: "soccer",
    canonicalName: "Manchester City",
    competitionCode: "PL",
    aliases: ["manchester city", "man city", "mci", "mcfc"],
  },
  {
    sport: "soccer",
    canonicalName: "Manchester United",
    competitionCode: "PL",
    aliases: ["manchester united", "man united", "man utd", "mun", "mufc"],
  },
  {
    sport: "soccer",
    canonicalName: "Tottenham",
    competitionCode: "PL",
    aliases: ["tottenham", "spurs", "tot", "tottenham hotspur"],
  },
  {
    sport: "soccer",
    canonicalName: "Newcastle",
    competitionCode: "PL",
    aliases: ["newcastle", "newcastle united", "new"],
  },
  {
    sport: "soccer",
    canonicalName: "Aston Villa",
    competitionCode: "PL",
    aliases: ["aston villa", "villa", "avfc"],
  },
  {
    sport: "soccer",
    canonicalName: "Barcelona",
    competitionCode: "PD",
    aliases: ["barcelona", "barca", "fcb", "bar"],
  },
  {
    sport: "soccer",
    canonicalName: "Real Madrid",
    competitionCode: "PD",
    aliases: ["real madrid", "madrid", "rma", "rm"],
  },
  {
    sport: "soccer",
    canonicalName: "Atletico Madrid",
    competitionCode: "PD",
    aliases: ["atletico madrid", "atleti", "atm"],
  },
  {
    sport: "soccer",
    canonicalName: "Sevilla",
    competitionCode: "PD",
    aliases: ["sevilla", "sev"],
  },
  {
    sport: "soccer",
    canonicalName: "Valencia",
    competitionCode: "PD",
    aliases: ["valencia", "val"],
  },
  {
    sport: "soccer",
    canonicalName: "Athletic Club",
    competitionCode: "PD",
    aliases: ["athletic club", "athletic bilbao", "bilbao"],
  },
  {
    sport: "soccer",
    canonicalName: "Bayern Munich",
    competitionCode: "BL1",
    aliases: ["bayern", "bayern munich", "fcbayern", "fcb"],
  },
  {
    sport: "soccer",
    canonicalName: "Borussia Dortmund",
    competitionCode: "BL1",
    aliases: ["dortmund", "borussia dortmund", "bvb"],
  },
  {
    sport: "soccer",
    canonicalName: "Bayer Leverkusen",
    competitionCode: "BL1",
    aliases: ["leverkusen", "bayer leverkusen", "b04"],
  },
  {
    sport: "soccer",
    canonicalName: "RB Leipzig",
    competitionCode: "BL1",
    aliases: ["rb leipzig", "leipzig", "rbl"],
  },
  {
    sport: "soccer",
    canonicalName: "Juventus",
    competitionCode: "SA",
    aliases: ["juventus", "juve", "juv"],
  },
  {
    sport: "soccer",
    canonicalName: "Inter",
    competitionCode: "SA",
    aliases: ["inter", "inter milan", "internazionale"],
  },
  {
    sport: "soccer",
    canonicalName: "AC Milan",
    competitionCode: "SA",
    aliases: ["ac milan", "milan"],
  },
  {
    sport: "soccer",
    canonicalName: "Napoli",
    competitionCode: "SA",
    aliases: ["napoli", "nap"],
  },
  {
    sport: "soccer",
    canonicalName: "Roma",
    competitionCode: "SA",
    aliases: ["roma", "as roma"],
  },
  {
    sport: "soccer",
    canonicalName: "Paris Saint-Germain",
    competitionCode: "FL1",
    aliases: ["psg", "paris saint germain", "paris sg"],
  },
  {
    sport: "soccer",
    canonicalName: "Marseille",
    competitionCode: "FL1",
    aliases: ["marseille", "om", "olympique marseille"],
  },
  {
    sport: "soccer",
    canonicalName: "Monaco",
    competitionCode: "FL1",
    aliases: ["monaco", "asm"],
  },
  {
    sport: "soccer",
    canonicalName: "Lyon",
    competitionCode: "FL1",
    aliases: ["lyon", "ol", "olympique lyonnais"],
  },
];

const KNOWN_ENTITIES = [...NBA_TEAMS, ...NFL_TEAMS, ...SOCCER_CLUBS];

let footballDataApiKey = "";
let balldontlieApiKey = "";
let preferredSoccerCompetitions = [...DEFAULT_SOCCER_COMPETITIONS];

const cache = {
  nbaTeams: null,
  nflTeams: null,
  soccerTeamsByCompetition: new Map(),
};

function normalizeText(value) {
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

function normalizeSoccerName(value) {
  return normalizeText(value)
    .replace(
      /\b(fc|cf|ac|afc|sc|club|de|the|sv|fk|as|ss|saint|saint germain)\b/g,
      " "
    )
    .trim()
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDisplayTime(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function parseConfiguredCompetitions(rawValue) {
  const configured = String(rawValue ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const valid = configured.filter((code) =>
    SOCCER_COMPETITIONS.some((competition) => competition.code === code)
  );

  return valid.length ? valid : [...DEFAULT_SOCCER_COMPETITIONS];
}

function hasSportsCue(normalizedQuery) {
  return QUERY_CUE_PATTERN.test(normalizedQuery) || MATCHUP_PATTERN.test(normalizedQuery);
}

function detectIntent(normalizedQuery) {
  if (/\b(standings|standing|table|tables|rankings|ranking)\b/.test(normalizedQuery)) {
    return "standings";
  }
  if (/\b(schedule|schedules|fixtures|fixture|next|tomorrow)\b/.test(normalizedQuery)) {
    return "schedule";
  }
  if (MATCHUP_PATTERN.test(normalizedQuery)) {
    return "matchup";
  }

  return "score";
}

function detectSportHint(normalizedQuery) {
  const competition = resolveCompetition(normalizedQuery);
  if (competition) return "soccer";
  if (/\b(soccer)\b/.test(normalizedQuery)) return "soccer";
  if (/\b(nba|basketball|hoops)\b/.test(normalizedQuery)) return "nba";
  if (/\b(nfl|american football|super bowl|gridiron)\b/.test(normalizedQuery)) {
    return "nfl";
  }

  return null;
}

function cleanupEntityText(rawText) {
  return normalizeText(rawText)
    .replace(
      /\b(whats|what is|what are|show|me|the|a|an|for|today|tonight|tomorrow|latest|last|next|live|score|scores|scored|result|results|schedule|schedules|fixtures|fixture|game|games|match|matches|table|tables|standings|standing|rankings|ranking|nfl|nba|basketball|soccer|football|american|who|won)\b/g,
      " "
    )
    .trim()
    .replace(/\s+/g, " ");
}

function resolveCompetition(queryText) {
  const normalized = normalizeText(queryText);
  let best = null;

  for (const competition of SOCCER_COMPETITIONS) {
    for (const alias of competition.aliases) {
      const normalizedAlias = normalizeText(alias);
      const exact = normalized === normalizedAlias;
      const contains = ` ${normalized} `.includes(` ${normalizedAlias} `);
      if (!exact && !contains) continue;

      const score = (exact ? 200 : 100) + normalizedAlias.length;
      if (!best || score > best.score) {
        best = { ...competition, score };
      }
    }
  }

  return best;
}

function resolveEntity(queryText, preferredSport) {
  const normalized = normalizeText(queryText);
  if (!normalized) return null;

  let best = null;

  for (const entity of KNOWN_ENTITIES) {
    if (preferredSport && entity.sport !== preferredSport) continue;

    for (const alias of entity.aliases) {
      const normalizedAlias = normalizeText(alias);
      const exact = normalized === normalizedAlias;
      const contains = ` ${normalized} `.includes(` ${normalizedAlias} `);
      const reverseContains = ` ${normalizedAlias} `.includes(` ${normalized} `);

      if (!exact && !contains && !reverseContains) continue;

      const base = exact ? 220 : contains ? 140 : 90;
      const score = base + normalizedAlias.length;
      if (!best || score > best.score) {
        best = { ...entity, score };
      }
    }
  }

  return best;
}

function splitMatchup(query) {
  const match = query.match(/^(.*?)\s+(?:vs\.?|versus|v)\s+(.*)$/i);
  if (!match) return null;

  return {
    left: match[1]?.trim() ?? "",
    right: match[2]?.trim() ?? "",
  };
}

function parseQuery(rawQuery) {
  const query = String(rawQuery ?? "").trim();
  if (!query) return null;

  const normalized = normalizeText(query);
  const sportHint = detectSportHint(normalized);
  const fallbackFootballHint = /\bfootball\b/.test(normalized) ? "nfl" : null;
  const intent = detectIntent(normalized);
  const competition = resolveCompetition(normalized);
  const cues = hasSportsCue(normalized);

  const matchup = splitMatchup(query);
  if (matchup) {
    const left = resolveEntity(cleanupEntityText(matchup.left), sportHint);
    const right = resolveEntity(cleanupEntityText(matchup.right), left?.sport ?? sportHint);
    if (left && right && left.sport === right.sport) {
      return {
        kind: "matchup",
        sport: left.sport,
        intent: "matchup",
        left,
        right,
        competition:
          left.sport === "soccer" &&
          left.competitionCode === right.competitionCode &&
          SOCCER_COMPETITIONS.find(
            (item) => item.code === left.competitionCode
          ),
        query,
      };
    }
  }

  const entity = resolveEntity(cleanupEntityText(query), sportHint);
  if (entity && (cues || sportHint)) {
    return {
      kind: "team",
      sport: entity.sport,
      intent,
      team: entity,
      competition:
        entity.sport === "soccer"
          ? SOCCER_COMPETITIONS.find(
              (item) => item.code === entity.competitionCode
            )
          : null,
      query,
    };
  }

  if (competition && (intent === "standings" || cues)) {
    return {
      kind: "competition",
      sport: "soccer",
      intent,
      competition,
      query,
    };
  }

  if ((sportHint || fallbackFootballHint) && cues) {
    const leagueSport = sportHint || fallbackFootballHint;
    return {
      kind: "league",
      sport: leagueSport,
      intent,
      competition:
        leagueSport === "soccer"
          ? competition ||
            SOCCER_COMPETITIONS.find(
              (item) => item.code === preferredSoccerCompetitions[0]
            )
          : null,
      query,
    };
  }

  return null;
}

function toStatusTone(state) {
  if (state === "live") return "live";
  if (state === "final") return "final";
  if (state === "setup") return "setup";
  if (state === "warning") return "warning";
  return "scheduled";
}

function renderSetupCard(provider, message, details, sportOverride) {
  const link =
    provider === "soccer" ? SETUP_LINKS.soccer : SETUP_LINKS.balldontlie;
  const providerName =
    provider === "soccer" ? "football-data.org" : "BALLDONTLIE";

  return renderCard({
    sport: sportOverride || (provider === "soccer" ? "soccer" : "nba"),
    eyebrow: "Sports Results",
    badge: "Setup required",
    badgeTone: "setup",
    title: providerName,
    subtitle: message,
    facts: details
      ? [{ label: "Next step", value: details }]
      : [{ label: "Next step", value: `Add your ${providerName} API key in Settings → Plugins.` }],
    footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
      link
    )}" target="_blank" rel="noreferrer">Get an API key</a>`,
  });
}

function renderUnsupportedCard(sport, title, message) {
  return renderCard({
    sport,
    eyebrow: "Sports Results",
    badge: "Free-tier limit",
    badgeTone: "warning",
    title,
    subtitle: message,
  });
}

function renderEmptyCard(sport, title, message, note) {
  return renderCard({
    sport,
    eyebrow: "Sports Results",
    badge: "No data",
    badgeTone: "scheduled",
    title,
    subtitle: message,
    footer: note
      ? `<div class="sports-slot__footer-note">${escapeHtml(note)}</div>`
      : "",
  });
}

function renderCard(model) {
  const factsHtml = (model.facts ?? [])
    .filter((fact) => fact?.value)
    .map(
      (fact) => `
        <div class="sports-slot__fact">
          <span class="sports-slot__fact-label">${escapeHtml(fact.label)}</span>
          <span class="sports-slot__fact-value">${escapeHtml(fact.value)}</span>
        </div>
      `
    )
    .join("");

  const gamesHtml = (model.games ?? [])
    .map(
      (game) => `
        <div class="sports-slot__mini-game">
          <div class="sports-slot__mini-game-top">
            <span class="sports-slot__mini-game-label">${escapeHtml(
              game.label
            )}</span>
            <span class="sports-slot__mini-game-status sports-slot__mini-game-status--${escapeHtml(
              toStatusTone(game.state)
            )}">${escapeHtml(game.status)}</span>
          </div>
          <div class="sports-slot__mini-game-score">
            <span>${escapeHtml(game.matchup)}</span>
            <strong>${escapeHtml(game.score)}</strong>
          </div>
          ${
            game.meta
              ? `<div class="sports-slot__mini-game-meta">${escapeHtml(
                  game.meta
                )}</div>`
              : ""
          }
        </div>
      `
    )
    .join("");

  const standingsHtml = model.standings
    ? `
      <section class="sports-slot__section sports-slot__section--standings">
        <div class="sports-slot__section-head">
          <h4 class="sports-slot__section-title">${escapeHtml(
            model.standings.title
          )}</h4>
        </div>
        <div class="sports-slot__table">
          <div class="sports-slot__table-row sports-slot__table-row--head">
            <span>#</span>
            <span>Team</span>
            <span>P</span>
            <span>GD</span>
            <span>Pts</span>
          </div>
          ${model.standings.rows
            .map(
              (row) => `
                <div class="sports-slot__table-row ${
                  row.highlight ? "sports-slot__table-row--highlight" : ""
                }">
                  <span>${escapeHtml(row.position)}</span>
                  <span>${escapeHtml(row.team)}</span>
                  <span>${escapeHtml(row.played)}</span>
                  <span>${escapeHtml(row.goalDiff)}</span>
                  <span>${escapeHtml(row.points)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const scoreboardHtml = model.focusGame
    ? `
      <section class="sports-slot__scoreboard sports-slot__scoreboard--${escapeHtml(
        model.focusGame.state
      )}">
        <div class="sports-slot__game-meta">
          <span>${escapeHtml(model.focusGame.competitionLabel)}</span>
          <span>${escapeHtml(model.focusGame.status)}</span>
        </div>
        <div class="sports-slot__teams">
          <div class="sports-slot__team">
            <div class="sports-slot__team-name">${escapeHtml(
              model.focusGame.awayTeam
            )}</div>
            <div class="sports-slot__team-score">${escapeHtml(
              model.focusGame.awayScore
            )}</div>
          </div>
          <div class="sports-slot__vs">vs</div>
          <div class="sports-slot__team">
            <div class="sports-slot__team-name">${escapeHtml(
              model.focusGame.homeTeam
            )}</div>
            <div class="sports-slot__team-score">${escapeHtml(
              model.focusGame.homeScore
            )}</div>
          </div>
        </div>
        ${
          model.focusGame.meta
            ? `<div class="sports-slot__scoreboard-meta">${escapeHtml(
                model.focusGame.meta
              )}</div>`
            : ""
        }
      </section>
    `
    : "";

  return `
    <div class="glance-box sports-slot sports-slot--${escapeHtml(model.sport)}">
      <div class="sports-slot__hero">
        <div class="sports-slot__hero-copy">
          <div class="sports-slot__eyebrow">${escapeHtml(model.eyebrow || "Sports Results")}</div>
          <h3 class="sports-slot__title">${escapeHtml(model.title)}</h3>
          ${
            model.subtitle
              ? `<p class="sports-slot__subtitle">${escapeHtml(model.subtitle)}</p>`
              : ""
          }
        </div>
        ${
          model.badge
            ? `<span class="sports-slot__badge sports-slot__badge--${escapeHtml(
                model.badgeTone || "scheduled"
              )}">${escapeHtml(model.badge)}</span>`
            : ""
        }
      </div>
      ${scoreboardHtml}
      ${factsHtml ? `<section class="sports-slot__facts">${factsHtml}</section>` : ""}
      ${
        gamesHtml
          ? `<section class="sports-slot__section"><div class="sports-slot__section-head"><h4 class="sports-slot__section-title">Recent + next</h4></div><div class="sports-slot__mini-games">${gamesHtml}</div></section>`
          : ""
      }
      ${standingsHtml}
      ${model.footer ? `<div class="sports-slot__footer">${model.footer}</div>` : ""}
    </div>
  `;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function getBalldontlieTeams(sport) {
  if (!balldontlieApiKey) {
    throw new Error("Missing BALLDONTLIE API key");
  }

  const cacheKey = sport === "nba" ? "nbaTeams" : "nflTeams";
  if (cache[cacheKey]) return cache[cacheKey];

  const data = await fetchJson(`${BALLDONTLIE_BASE[sport]}/teams`, {
    headers: {
      Authorization: balldontlieApiKey,
      Accept: "application/json",
    },
  });

  cache[cacheKey] = Array.isArray(data?.data) ? data.data : [];
  return cache[cacheKey];
}

function findBalldontlieTeam(entity, teams) {
  return teams.find(
    (team) =>
      normalizeText(team.abbreviation) === normalizeText(entity.abbreviation) ||
      normalizeText(team.full_name) === normalizeText(entity.canonicalName)
  );
}

async function fetchBalldontlieGames(sport, params) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(`${key}[]`, String(item));
      }
      continue;
    }
    searchParams.set(key, String(value));
  }

  const data = await fetchJson(
    `${BALLDONTLIE_BASE[sport]}/games?${searchParams.toString()}`,
    {
      headers: {
        Authorization: balldontlieApiKey,
        Accept: "application/json",
      },
    }
  );

  return Array.isArray(data?.data) ? data.data : [];
}

async function getSoccerCompetitionTeams(competitionCode) {
  if (!footballDataApiKey) {
    throw new Error("Missing football-data.org API key");
  }

  if (cache.soccerTeamsByCompetition.has(competitionCode)) {
    return cache.soccerTeamsByCompetition.get(competitionCode);
  }

  const data = await fetchJson(
    `${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/teams`,
    {
      headers: {
        "X-Auth-Token": footballDataApiKey,
        Accept: "application/json",
      },
    }
  );

  const teams = Array.isArray(data?.teams) ? data.teams : [];
  cache.soccerTeamsByCompetition.set(competitionCode, teams);
  return teams;
}

function scoreSoccerTeamMatch(entity, apiTeam) {
  const aliases = [
    entity.canonicalName,
    ...(entity.aliases ?? []),
    apiTeam?.name,
    apiTeam?.shortName,
    apiTeam?.tla,
  ].filter(Boolean);

  const apiVariants = [
    normalizeSoccerName(apiTeam?.name ?? ""),
    normalizeSoccerName(apiTeam?.shortName ?? ""),
    normalizeSoccerName(apiTeam?.tla ?? ""),
  ];

  let score = 0;
  for (const alias of aliases) {
    const normalizedAlias = normalizeSoccerName(alias);
    if (!normalizedAlias) continue;
    for (const variant of apiVariants) {
      if (!variant) continue;
      if (variant === normalizedAlias) score = Math.max(score, 200 + normalizedAlias.length);
      else if (` ${variant} `.includes(` ${normalizedAlias} `)) {
        score = Math.max(score, 120 + normalizedAlias.length);
      } else if (` ${normalizedAlias} `.includes(` ${variant} `)) {
        score = Math.max(score, 80 + variant.length);
      }
    }
  }

  return score;
}

function findSoccerTeam(entity, teams) {
  let best = null;

  for (const team of teams) {
    const score = scoreSoccerTeamMatch(entity, team);
    if (!best || score > best.score) {
      best = { team, score };
    }
  }

  return best?.score >= 120 ? best.team : null;
}

async function fetchSoccerTeamMatches(teamId, options = {}) {
  const params = new URLSearchParams();
  if (options.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options.dateTo) params.set("dateTo", options.dateTo);
  if (options.limit) params.set("limit", String(options.limit));

  const data = await fetchJson(
    `${FOOTBALL_DATA_BASE}/teams/${teamId}/matches?${params.toString()}`,
    {
      headers: {
        "X-Auth-Token": footballDataApiKey,
        Accept: "application/json",
      },
    }
  );

  return Array.isArray(data?.matches) ? data.matches : [];
}

async function fetchSoccerCompetitionMatches(competitionCode, options = {}) {
  const params = new URLSearchParams();
  if (options.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options.dateTo) params.set("dateTo", options.dateTo);

  const data = await fetchJson(
    `${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/matches?${params.toString()}`,
    {
      headers: {
        "X-Auth-Token": footballDataApiKey,
        Accept: "application/json",
      },
    }
  );

  return Array.isArray(data?.matches) ? data.matches : [];
}

async function fetchSoccerStandings(competitionCode) {
  const data = await fetchJson(
    `${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/standings`,
    {
      headers: {
        "X-Auth-Token": footballDataApiKey,
        Accept: "application/json",
      },
    }
  );

  const total = Array.isArray(data?.standings)
    ? data.standings.find((standing) => standing.type === "TOTAL") ??
      data.standings[0]
    : null;

  return Array.isArray(total?.table) ? total.table : [];
}

function normalizeSoccerMatch(match) {
  const utcDate = match?.utcDate ? new Date(match.utcDate) : null;
  const status = String(match?.status ?? "");
  const state = /IN_PLAY|LIVE|PAUSED/.test(status)
    ? "live"
    : /FINISHED/.test(status)
    ? "final"
    : /POSTPONED|SUSPENDED|CANCELLED/.test(status)
    ? "warning"
    : "scheduled";

  const score = match?.score?.fullTime ?? {};
  const awayTeam = match?.awayTeam?.shortName || match?.awayTeam?.name || "Away";
  const homeTeam = match?.homeTeam?.shortName || match?.homeTeam?.name || "Home";

  const metaBits = [
    match?.stage,
    match?.group,
    match?.matchday ? `Matchday ${match.matchday}` : "",
    match?.venue,
  ].filter(Boolean);

  return {
    state,
    competitionLabel:
      match?.competition?.name ||
      SOCCER_COMPETITIONS.find((item) => item.code === match?.competition?.code)?.name ||
      "Soccer",
    status:
      state === "scheduled"
        ? formatDisplayTime(utcDate)
        : state === "live"
        ? "Live"
        : state === "final"
        ? "Final"
        : status.replace(/_/g, " "),
    awayTeam,
    homeTeam,
    awayScore: score.away ?? "—",
    homeScore: score.home ?? "—",
    meta: metaBits.join(" • "),
    sortDate: utcDate ? utcDate.getTime() : 0,
  };
}

function normalizeNbaGame(game) {
  const date = new Date(game?.datetime ?? game?.date);
  const status = String(game?.status ?? "");
  const scheduled = /\bET\b/i.test(status) || (game?.period ?? 0) === 0;
  const final = /^Final/i.test(status);
  const state = game?.postponed
    ? "warning"
    : final
    ? "final"
    : scheduled
    ? "scheduled"
    : "live";

  return {
    state,
    competitionLabel: game?.postseason ? "NBA Playoffs" : "NBA",
    status:
      state === "scheduled"
        ? status || formatDisplayTime(date)
        : state === "live"
        ? [status, game?.time].filter(Boolean).join(" • ")
        : state === "final"
        ? "Final"
        : "Postponed",
    awayTeam: game?.visitor_team?.full_name || game?.visitor_team?.name || "Away",
    homeTeam: game?.home_team?.full_name || game?.home_team?.name || "Home",
    awayScore: game?.visitor_team_score ?? "—",
    homeScore: game?.home_team_score ?? "—",
    meta: [formatShortDate(date), game?.postseason ? "Postseason" : "Regular season"]
      .filter(Boolean)
      .join(" • "),
    sortDate: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
  };
}

function normalizeNflGame(game) {
  const date = new Date(game?.date);
  const status = String(game?.status ?? "");
  const warning = /postponed|suspended|cancelled/i.test(status);
  const final = /^Final/i.test(status);
  const scheduled =
    !warning &&
    !final &&
    (/scheduled/i.test(status) || date.getTime() > Date.now());
  const state = warning ? "warning" : final ? "final" : scheduled ? "scheduled" : "live";

  return {
    state,
    competitionLabel: game?.postseason ? "NFL Playoffs" : `NFL • Week ${game?.week ?? "?"}`,
    status:
      state === "warning"
        ? status || "Postponed"
        : state === "scheduled"
        ? formatDisplayTime(date)
        : state === "live"
        ? status || "Live"
        : "Final",
    awayTeam:
      game?.visitor_team?.full_name || game?.visitor_team?.name || "Away",
    homeTeam: game?.home_team?.full_name || game?.home_team?.name || "Home",
    awayScore: game?.visitor_team_score ?? "—",
    homeScore: game?.home_team_score ?? "—",
    meta: [game?.venue, game?.summary].filter(Boolean).join(" • "),
    sortDate: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
  };
}

function pickFocusAndExtras(normalizedGames) {
  const sorted = [...normalizedGames].sort((left, right) => left.sortDate - right.sortDate);
  const live = sorted.filter((game) => game.state === "live");
  const upcoming = sorted.filter((game) => game.state === "scheduled");
  const recent = [...sorted]
    .filter((game) => game.state === "final")
    .sort((left, right) => right.sortDate - left.sortDate);

  const focus = live[0] ?? upcoming[0] ?? recent[0] ?? null;
  const extras = [];

  for (const game of [...live.slice(1), ...upcoming.slice(0, 2), ...recent.slice(0, 2)]) {
    if (focus && game.sortDate === focus.sortDate && game.homeTeam === focus.homeTeam) {
      continue;
    }

    extras.push({
      label: game.state === "live" ? "Live" : game.state === "scheduled" ? "Next" : "Recent",
      matchup: `${game.awayTeam} at ${game.homeTeam}`,
      score:
        game.state === "scheduled"
          ? game.status
          : `${game.awayScore} - ${game.homeScore}`,
      status: game.competitionLabel,
      state: game.state,
      meta: game.meta,
    });
  }

  return { focus, extras: extras.slice(0, 4) };
}

function buildStandingsModel(competitionName, standings, highlightTeamName) {
  const rows = standings.slice(0, 6).map((row) => ({
    position: String(row.position ?? ""),
    team: row.team?.shortName || row.team?.name || "",
    played: String(row.playedGames ?? ""),
    goalDiff: String(row.goalDifference ?? ""),
    points: String(row.points ?? ""),
    highlight:
      normalizeSoccerName(row.team?.name ?? "") ===
        normalizeSoccerName(highlightTeamName ?? "") ||
      normalizeSoccerName(row.team?.shortName ?? "") ===
        normalizeSoccerName(highlightTeamName ?? ""),
  }));

  const highlightedOutsideTop = highlightTeamName
    ? standings.find(
        (row) =>
          normalizeSoccerName(row.team?.name ?? "") ===
            normalizeSoccerName(highlightTeamName) ||
          normalizeSoccerName(row.team?.shortName ?? "") ===
            normalizeSoccerName(highlightTeamName)
      )
    : null;

  if (
    highlightedOutsideTop &&
    !rows.some((row) => row.highlight)
  ) {
    rows.push({
      position: String(highlightedOutsideTop.position ?? ""),
      team:
        highlightedOutsideTop.team?.shortName ||
        highlightedOutsideTop.team?.name ||
        "",
      played: String(highlightedOutsideTop.playedGames ?? ""),
      goalDiff: String(highlightedOutsideTop.goalDifference ?? ""),
      points: String(highlightedOutsideTop.points ?? ""),
      highlight: true,
    });
  }

  return {
    title: `${competitionName} table`,
    rows,
  };
}

async function handleSoccerQuery(parsed) {
  if (!footballDataApiKey) {
    return renderSetupCard(
      "soccer",
      "Soccer results use football-data.org.",
      "Add a football-data.org API key in the plugin settings.",
      "soccer"
    );
  }

  if (parsed.kind === "competition") {
    if (parsed.intent === "standings") {
      const standings = await fetchSoccerStandings(parsed.competition.code);
      if (!standings.length) {
        return renderEmptyCard(
          "soccer",
          parsed.competition.name,
          "No standings were returned for that competition."
        );
      }

      return renderCard({
        sport: "soccer",
        eyebrow: "Sports Results",
        badge: "Standings",
        badgeTone: "scheduled",
        title: parsed.competition.name,
        subtitle: "Current league table",
        standings: buildStandingsModel(parsed.competition.name, standings),
        footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
          "https://www.football-data.org/"
        )}" target="_blank" rel="noreferrer">Data by football-data.org</a>`,
      });
    }

    const now = new Date();
    const matches = await fetchSoccerCompetitionMatches(parsed.competition.code, {
      dateFrom: formatDate(addDays(now, -1)),
      dateTo: formatDate(addDays(now, 5)),
    });
    const normalizedGames = matches.map(normalizeSoccerMatch);
    const { focus, extras } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        "soccer",
        parsed.competition.name,
        "No recent or upcoming fixtures were found."
      );
    }

    return renderCard({
      sport: "soccer",
      eyebrow: "Sports Results",
      badge: focus.state === "live" ? "Live" : focus.state === "scheduled" ? "Upcoming" : "Final",
      badgeTone: toStatusTone(focus.state),
      title: parsed.competition.name,
      subtitle: focus.meta,
      focusGame: focus,
      games: extras,
      footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
        "https://www.football-data.org/"
      )}" target="_blank" rel="noreferrer">Data by football-data.org</a>`,
    });
  }

  if (parsed.kind === "league" && parsed.competition) {
    return handleSoccerQuery({
      ...parsed,
      kind: "competition",
      competition: parsed.competition,
      intent: parsed.intent,
    });
  }

  const competitionCode =
    parsed.kind === "team"
      ? parsed.team.competitionCode
      : parsed.competition?.code ||
        parsed.left?.competitionCode ||
        preferredSoccerCompetitions[0];

  const teams = await getSoccerCompetitionTeams(competitionCode);

  if (parsed.kind === "team") {
    const apiTeam = findSoccerTeam(parsed.team, teams);
    if (!apiTeam) {
      return renderEmptyCard(
        "soccer",
        parsed.team.canonicalName,
        "That club was not found in the configured competition list.",
        "Try a league keyword like Premier League or La Liga if the team is ambiguous."
      );
    }

    const now = new Date();
    const matches = await fetchSoccerTeamMatches(apiTeam.id, {
      dateFrom: formatDate(addDays(now, -14)),
      dateTo: formatDate(addDays(now, 14)),
      limit: 8,
    });
    const normalizedGames = matches.map(normalizeSoccerMatch);
    const { focus, extras } = pickFocusAndExtras(normalizedGames);
    const facts = [
      { label: "Team", value: apiTeam.shortName || apiTeam.name },
      { label: "League", value: parsed.competition?.name || apiTeam.area?.name || "Soccer" },
      { label: "Venue", value: apiTeam.venue || "" },
    ];

    let standingsModel = null;
    if (parsed.intent === "standings" || parsed.intent === "score") {
      const standings = await fetchSoccerStandings(competitionCode);
      if (standings.length) {
        standingsModel = buildStandingsModel(
          parsed.competition?.name || "League",
          standings,
          apiTeam.name
        );
      }
    }

    if (!focus) {
      return renderEmptyCard(
        "soccer",
        apiTeam.shortName || apiTeam.name,
        "No recent or upcoming matches were found in the lookup window."
      );
    }

    return renderCard({
      sport: "soccer",
      eyebrow: "Sports Results",
      badge:
        focus.state === "live"
          ? "Live"
          : focus.state === "scheduled"
          ? "Next match"
          : "Latest result",
      badgeTone: toStatusTone(focus.state),
      title: apiTeam.shortName || apiTeam.name,
      subtitle: parsed.competition?.name || apiTeam.area?.name || "Soccer",
      focusGame: focus,
      facts,
      games: extras,
      standings: standingsModel,
      footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
        "https://www.football-data.org/"
      )}" target="_blank" rel="noreferrer">Data by football-data.org</a>`,
    });
  }

  if (parsed.kind === "matchup") {
    const leftTeam = findSoccerTeam(parsed.left, teams);
    const rightTeam = findSoccerTeam(parsed.right, teams);

    if (!leftTeam || !rightTeam) {
      return renderEmptyCard(
        "soccer",
        `${parsed.left.canonicalName} vs ${parsed.right.canonicalName}`,
        "One of the clubs was not found in the same supported competition."
      );
    }

    const matches = await fetchSoccerTeamMatches(leftTeam.id, {
      dateFrom: formatDate(addDays(new Date(), -60)),
      dateTo: formatDate(addDays(new Date(), 60)),
      limit: 20,
    });

    const headToHead = matches.find((match) => {
      const homeName = normalizeSoccerName(match?.homeTeam?.name ?? "");
      const awayName = normalizeSoccerName(match?.awayTeam?.name ?? "");
      const leftName = normalizeSoccerName(leftTeam.name ?? "");
      const rightName = normalizeSoccerName(rightTeam.name ?? "");
      return (
        (homeName === leftName && awayName === rightName) ||
        (homeName === rightName && awayName === leftName)
      );
    });

    if (!headToHead) {
      return renderEmptyCard(
        "soccer",
        `${leftTeam.shortName || leftTeam.name} vs ${
          rightTeam.shortName || rightTeam.name
        }`,
        "No recent or upcoming meeting was found in the lookup window."
      );
    }

    const normalized = normalizeSoccerMatch(headToHead);
    return renderCard({
      sport: "soccer",
      eyebrow: "Sports Results",
      badge:
        normalized.state === "live"
          ? "Live"
          : normalized.state === "scheduled"
          ? "Upcoming"
          : "Latest meeting",
      badgeTone: toStatusTone(normalized.state),
      title: `${leftTeam.shortName || leftTeam.name} vs ${
        rightTeam.shortName || rightTeam.name
      }`,
      subtitle: parsed.competition?.name || headToHead?.competition?.name || "Soccer",
      focusGame: normalized,
      facts: [
        { label: "Competition", value: headToHead?.competition?.name || parsed.competition?.name || "" },
        { label: "Stage", value: headToHead?.stage || "" },
        { label: "Venue", value: headToHead?.venue || "" },
      ],
      footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
        "https://www.football-data.org/"
      )}" target="_blank" rel="noreferrer">Data by football-data.org</a>`,
    });
  }

  return renderEmptyCard(
    "soccer",
    "Soccer",
    "That soccer query shape is not supported yet."
  );
}

async function handleBalldontlieTeamOrLeagueQuery(parsed, sport) {
  if (!balldontlieApiKey) {
    return renderSetupCard(
      "balldontlie",
      `${sport === "nba" ? "Basketball" : "Football"} results use BALLDONTLIE.`,
      "Add a BALLDONTLIE API key in the plugin settings.",
      sport
    );
  }

  if (parsed.intent === "standings") {
    return renderUnsupportedCard(
      sport,
      sport === "nba" ? "NBA standings" : "NFL standings",
      "The free BALLDONTLIE tier does not expose standings for this sport. Scores and schedules still work."
    );
  }

  const teams = await getBalldontlieTeams(sport);
  const now = new Date();

  if (parsed.kind === "league") {
    const params =
      sport === "nba"
        ? {
            start_date: formatDate(addDays(now, -1)),
            end_date: formatDate(addDays(now, 3)),
            per_page: 25,
          }
        : {
            dates: [0, 1, 2, 3].map((offset) => formatDate(addDays(now, offset))),
            per_page: 50,
          };

    const games = await fetchBalldontlieGames(sport, params);
    const normalizedGames = games.map(sport === "nba" ? normalizeNbaGame : normalizeNflGame);
    const { focus, extras } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        sport,
        sport === "nba" ? "NBA" : "NFL",
        "No recent or upcoming games were found."
      );
    }

    return renderCard({
      sport,
      eyebrow: "Sports Results",
      badge:
        focus.state === "live"
          ? "Live"
          : focus.state === "scheduled"
          ? "Tonight"
          : "Final",
      badgeTone: toStatusTone(focus.state),
      title: sport === "nba" ? "NBA scoreboard" : "NFL scoreboard",
      subtitle: focus.meta,
      focusGame: focus,
      games: extras,
      footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
        "https://www.balldontlie.io/docs"
      )}" target="_blank" rel="noreferrer">Data by BALLDONTLIE</a>`,
    });
  }

  if (parsed.kind === "team") {
    const apiTeam = findBalldontlieTeam(parsed.team, teams);
    if (!apiTeam) {
      return renderEmptyCard(
        sport,
        parsed.team.canonicalName,
        "That team was not found in the provider response."
      );
    }

    const params =
      sport === "nba"
        ? {
            team_ids: [apiTeam.id],
            start_date: formatDate(addDays(now, -7)),
            end_date: formatDate(addDays(now, 10)),
            per_page: 25,
          }
        : {
            team_ids: [apiTeam.id],
            dates: Array.from({ length: 21 }, (_, index) =>
              formatDate(addDays(now, index - 7))
            ),
            per_page: 50,
          };

    let games = await fetchBalldontlieGames(sport, params);

    if (!games.length && sport === "nfl" && parsed.intent === "schedule") {
      games = await fetchBalldontlieGames(sport, {
        team_ids: [apiTeam.id],
        seasons: [now.getFullYear()],
        weeks: Array.from({ length: 18 }, (_, index) => index + 1),
        per_page: 100,
      });
    }

    const normalizedGames = games.map(sport === "nba" ? normalizeNbaGame : normalizeNflGame);
    const { focus, extras } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        sport,
        apiTeam.full_name || apiTeam.name,
        "No recent or upcoming games were found in the lookup window."
      );
    }

    return renderCard({
      sport,
      eyebrow: "Sports Results",
      badge:
        focus.state === "live"
          ? "Live"
          : focus.state === "scheduled"
          ? "Next game"
          : "Latest result",
      badgeTone: toStatusTone(focus.state),
      title: apiTeam.full_name || apiTeam.name,
      subtitle: sport === "nba" ? "NBA team" : "NFL team",
      focusGame: focus,
      facts: [
        {
          label: sport === "nba" ? "Conference" : "Conference",
          value: apiTeam.conference || "",
        },
        {
          label: "Division",
          value: apiTeam.division || "",
        },
      ],
      games: extras,
      footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
        "https://www.balldontlie.io/docs"
      )}" target="_blank" rel="noreferrer">Data by BALLDONTLIE</a>`,
    });
  }

  if (parsed.kind === "matchup") {
    const leftTeam = findBalldontlieTeam(parsed.left, teams);
    const rightTeam = findBalldontlieTeam(parsed.right, teams);

    if (!leftTeam || !rightTeam) {
      return renderEmptyCard(
        sport,
        `${parsed.left.canonicalName} vs ${parsed.right.canonicalName}`,
        "One of the teams was not found in the provider response."
      );
    }

    const params =
      sport === "nba"
        ? {
            team_ids: [leftTeam.id, rightTeam.id],
            start_date: formatDate(addDays(now, -30)),
            end_date: formatDate(addDays(now, 45)),
            per_page: 50,
          }
        : {
            team_ids: [leftTeam.id, rightTeam.id],
            seasons: [now.getFullYear(), now.getFullYear() - 1],
            per_page: 100,
          };

    const games = await fetchBalldontlieGames(sport, params);
    const directGames = games.filter((game) => {
      const ids = [game?.home_team?.id, game?.visitor_team?.id];
      return ids.includes(leftTeam.id) && ids.includes(rightTeam.id);
    });

    const normalizedGames = directGames.map(
      sport === "nba" ? normalizeNbaGame : normalizeNflGame
    );
    const { focus, extras } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        sport,
        `${leftTeam.full_name || leftTeam.name} vs ${
          rightTeam.full_name || rightTeam.name
        }`,
        "No recent or upcoming meeting was found."
      );
    }

    return renderCard({
      sport,
      eyebrow: "Sports Results",
      badge:
        focus.state === "live"
          ? "Live"
          : focus.state === "scheduled"
          ? "Upcoming"
          : "Latest meeting",
      badgeTone: toStatusTone(focus.state),
      title: `${leftTeam.full_name || leftTeam.name} vs ${
        rightTeam.full_name || rightTeam.name
      }`,
      subtitle: sport === "nba" ? "NBA matchup" : "NFL matchup",
      focusGame: focus,
      games: extras,
      footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
        "https://www.balldontlie.io/docs"
      )}" target="_blank" rel="noreferrer">Data by BALLDONTLIE</a>`,
    });
  }

  return renderEmptyCard(
    sport,
    sport === "nba" ? "Basketball" : "Football",
    "That query shape is not supported yet."
  );
}

export const slot = {
  id: "sports-results",
  name: "Sports Results",
  position: "at-a-glance",
  slotPositions: ["at-a-glance", "above-results", "knowledge-panel"],
  settingsSchema: [
    {
      key: "footballDataApiKey",
      label: "football-data.org API key",
      type: "password",
      secret: true,
      description:
        "Used for soccer clubs, fixtures, and standings. Free keys are available at football-data.org.",
    },
    {
      key: "balldontlieApiKey",
      label: "BALLDONTLIE API key",
      type: "password",
      secret: true,
      description:
        "Used for NFL and NBA results. Free accounts are available at app.balldontlie.io.",
    },
    {
      key: "soccerCompetitions",
      label: "Preferred soccer competitions",
      type: "text",
      default: DEFAULT_SOCCER_COMPETITIONS.join(","),
      description:
        "Comma-separated football-data.org competition codes to search first for generic soccer queries (defaults: PL,PD,CL,BL1,SA,FL1).",
    },
  ],
  configure(settings) {
    footballDataApiKey = String(settings.footballDataApiKey ?? "").trim();
    balldontlieApiKey = String(settings.balldontlieApiKey ?? "").trim();
    preferredSoccerCompetitions = parseConfiguredCompetitions(
      settings.soccerCompetitions
    );
  },
  trigger(query) {
    return Boolean(parseQuery(query));
  },
  async execute(query) {
    const parsed = parseQuery(query);
    if (!parsed) return { html: "" };

    try {
      if (parsed.sport === "soccer") {
        return {
          title: "Sports Results",
          html: await handleSoccerQuery(parsed),
        };
      }

      if (parsed.sport === "nba" || parsed.sport === "nfl") {
        return {
          title: "Sports Results",
          html: await handleBalldontlieTeamOrLeagueQuery(parsed, parsed.sport),
        };
      }

      return { html: "" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown provider error";
      return {
        title: "Sports Results",
        html: renderEmptyCard(
          parsed.sport || "soccer",
          "Sports Results",
          "The provider request failed.",
          message
        ),
      };
    }
  },
};

export const slotPlugin = slot;
export default slot;
