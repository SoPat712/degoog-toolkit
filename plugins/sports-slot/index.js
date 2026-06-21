import {
  WORLD_CUP_2026,
  WORLD_CUP_GROUPS,
  WORLD_CUP_KNOCKOUT_PATHS,
  WORLD_CUP_TEAM_ENTITIES,
  getWorldCupGroup,
  getWorldCupGroupForTeam,
  isWorldCupQuery,
  resolveWorldCupGroupFromQuery,
} from "./world-cup-2026.js";

const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
const THE_SPORTS_DB_BASE = "https://www.thesportsdb.com/api/v1/json";
const BALLDONTLIE_BASE = {
  nba: "https://api.balldontlie.io/v1",
  nfl: "https://api.balldontlie.io/nfl/v1",
  mlb: "https://api.balldontlie.io/mlb/v1",
};
const PLUGIN_NAME = "Sports";
const PLUGIN_VERSION = "0.3.47";
const ESPN_LIVE_REFRESH_MS = 10_000;

const FALLBACK_STRINGS = {
  sportsResults: "Sports",
  live: "Live",
  upcoming: "Upcoming",
  final: "Final",
  nextMatch: "Next match",
  latestResult: "Latest result",
  standings: "Standings",
  team: "Team",
  league: "League",
  venue: "Venue",
  conference: "Conference",
  division: "Division",
  noStandings: "No standings were returned for that competition.",
  noFixtures: "No recent or upcoming fixtures were found.",
  refresh: "Refresh",
  playedAbbr: "P",
  goalDiffAbbr: "GD",
  pointsAbbr: "Pts",
  abbrGp: "Games played",
  abbrW: "Wins",
  abbrD: "Draws",
  abbrL: "Losses",
  abbrGf: "Goals for",
  abbrGa: "Goals against",
  abbrGd: "Goal difference",
  abbrPts: "Points",
  abbrP: "Played",
  timeline: "Timeline",
  lineup: "Lineup",
  starters: "Starters",
  bench: "Bench",
  matchInfo: "Match info",
  recentForm: "Recent form",
  headToHead: "Head to head",
  recentAndNext: "Recent + next",
  usage: "Usage",
  usageDescription:
    "Run <code>!sports &lt;query&gt;</code> with a team, matchup, schedule, or standings query.",
  example: "Example",
  latestMeeting: "Latest meeting",
  tonight: "Tonight",
  nextGame: "Next game",
  clubNotFound: "That club was not found in the configured competition list.",
  ambiguousTeamHint:
    "Try a league keyword like Premier League or La Liga if the team is ambiguous.",
  noRecentMatches: "No recent or upcoming matches were found in the lookup window.",
  clubNotFoundInSameComp:
    "One of the clubs was not found in the same supported competition.",
  noMeetingFound: "No recent or upcoming meeting was found in the lookup window.",
  teamNotFound: "That team was not found in the provider response.",
  teamNotFoundInResponse: "One of the teams was not found in the provider response.",
  noRecentGames: "No recent or upcoming games were found.",
  noRecentGamesInLookup:
    "No recent or upcoming games were found in the lookup window.",
  noMeetingFoundShort: "No recent or upcoming meeting was found.",
  setupBalldontlie: "results use BALLDONTLIE.",
  addApiKeyBalldontlie: "Add a BALLDONTLIE API key in the plugin settings.",
  setupSoccer: "Soccer results use football-data.org.",
  addApiKeySoccer: "Add a football-data.org API key in the plugin settings.",
  standingsUnsupportedBalldontlie:
    "The free BALLDONTLIE tier does not expose standings for this sport. Scores and schedules still work.",
  queryUnsupported: "That query shape is not supported yet.",
  providerFailed: "The provider request failed.",
  soccerSport: "Soccer",
  competition: "Competition",
  stage: "Stage",
};
const PLUGIN_DESCRIPTION =
  "Shows live sports scores, schedules, and standings for soccer, NFL, NBA, and MLB above search results.";
const BALLDONTLIE_FREE_REFRESH_MS = 12_000;
const PROVIDER_TIMEOUT_MS = 10_000;
const REFRESH_CACHE_MAX_ENTRIES = 100;
const UPCOMING_ONLY_WINDOW_MS = 12 * 60 * 60 * 1000;
const EMBEDDED_TIMESTAMP_PATTERN =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;

const DEFAULT_SOCCER_COMPETITIONS = ["WC", "PL", "PD", "CL", "BL1", "SA", "FL1"];
const MATCHUP_PATTERN = /(?:^|\s)(?:vs\.?|versus|v)(?:\s|$)/i;
const QUERY_CUE_PATTERN =
  /\b(score|scores|scored|result|results|schedule|schedules|fixtures|fixture|game|games|match|matches|table|tables|standings|standing|rankings|ranking|bracket|knockout|groups?|group stage|today|tonight|tomorrow|live|next|latest|last|who won|world cup|fifa)\b/i;
const SETUP_LINKS = {
  soccer: "https://www.football-data.org/client/register",
  balldontlie: "https://app.balldontlie.io",
};
const NATURAL_LANGUAGE_PHRASES = [
  "sports",
  "sports results",
  "score",
  "scores",
  "schedule",
  "standings",
  "baseball scores",
  "basketball scores",
  "football scores",
];

const SOCCER_COMPETITIONS = [
  {
    code: "WC",
    name: WORLD_CUP_2026.name,
    sport: "soccer",
    aliases: [
      "world cup",
      "fifa world cup",
      "fifa world cup 2026",
      "world cup 2026",
      "mens world cup",
      "soccer world cup",
      "football world cup",
      "wc 2026",
    ],
  },
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

const MLB_TEAMS = [
  {
    sport: "mlb",
    abbreviation: "ARI",
    canonicalName: "Arizona Diamondbacks",
    aliases: ["ari", "diamondbacks", "dbacks", "arizona diamondbacks"],
  },
  {
    sport: "mlb",
    abbreviation: "ATL",
    canonicalName: "Atlanta Braves",
    aliases: ["braves", "atlanta braves"],
  },
  {
    sport: "mlb",
    abbreviation: "BAL",
    canonicalName: "Baltimore Orioles",
    aliases: ["orioles", "baltimore orioles"],
  },
  {
    sport: "mlb",
    abbreviation: "BOS",
    canonicalName: "Boston Red Sox",
    aliases: ["bos", "red sox", "boston red sox"],
  },
  {
    sport: "mlb",
    abbreviation: "CHC",
    canonicalName: "Chicago Cubs",
    aliases: ["chc", "cubs", "chicago cubs"],
  },
  {
    sport: "mlb",
    abbreviation: "CWS",
    canonicalName: "Chicago White Sox",
    aliases: ["cws", "white sox", "chicago white sox"],
  },
  {
    sport: "mlb",
    abbreviation: "CIN",
    canonicalName: "Cincinnati Reds",
    aliases: ["reds", "cincinnati reds"],
  },
  {
    sport: "mlb",
    abbreviation: "CLE",
    canonicalName: "Cleveland Guardians",
    aliases: ["cle", "guardians", "cleveland guardians", "indians"],
  },
  {
    sport: "mlb",
    abbreviation: "COL",
    canonicalName: "Colorado Rockies",
    aliases: ["col", "rockies", "colorado rockies"],
  },
  {
    sport: "mlb",
    abbreviation: "DET",
    canonicalName: "Detroit Tigers",
    aliases: ["tigers", "detroit tigers"],
  },
  {
    sport: "mlb",
    abbreviation: "HOU",
    canonicalName: "Houston Astros",
    aliases: ["astros", "houston astros"],
  },
  {
    sport: "mlb",
    abbreviation: "KC",
    canonicalName: "Kansas City Royals",
    aliases: ["kc", "royals", "kansas city royals"],
  },
  {
    sport: "mlb",
    abbreviation: "LAA",
    canonicalName: "Los Angeles Angels",
    aliases: ["laa", "angels", "los angeles angels"],
  },
  {
    sport: "mlb",
    abbreviation: "LAD",
    canonicalName: "Los Angeles Dodgers",
    aliases: ["lad", "dodgers", "la dodgers", "los angeles dodgers"],
  },
  {
    sport: "mlb",
    abbreviation: "MIA",
    canonicalName: "Miami Marlins",
    aliases: ["marlins", "miami marlins"],
  },
  {
    sport: "mlb",
    abbreviation: "MIL",
    canonicalName: "Milwaukee Brewers",
    aliases: ["brewers", "milwaukee brewers"],
  },
  {
    sport: "mlb",
    abbreviation: "MIN",
    canonicalName: "Minnesota Twins",
    aliases: ["twins", "minnesota twins"],
  },
  {
    sport: "mlb",
    abbreviation: "NYM",
    canonicalName: "New York Mets",
    aliases: ["nym", "mets", "new york mets"],
  },
  {
    sport: "mlb",
    abbreviation: "NYY",
    canonicalName: "New York Yankees",
    aliases: ["nyy", "yankees", "new york yankees"],
  },
  {
    sport: "mlb",
    abbreviation: "ATH",
    canonicalName: "Athletics",
    aliases: ["ath", "as", "a's", "athletics", "oakland athletics"],
  },
  {
    sport: "mlb",
    abbreviation: "PHI",
    canonicalName: "Philadelphia Phillies",
    aliases: ["phillies", "philadelphia phillies"],
  },
  {
    sport: "mlb",
    abbreviation: "PIT",
    canonicalName: "Pittsburgh Pirates",
    aliases: ["pirates", "pittsburgh pirates"],
  },
  {
    sport: "mlb",
    abbreviation: "SD",
    canonicalName: "San Diego Padres",
    aliases: ["sd", "padres", "san diego padres"],
  },
  {
    sport: "mlb",
    abbreviation: "SF",
    canonicalName: "San Francisco Giants",
    aliases: ["sf", "giants", "san francisco giants"],
  },
  {
    sport: "mlb",
    abbreviation: "SEA",
    canonicalName: "Seattle Mariners",
    aliases: ["sea", "mariners", "seattle mariners"],
  },
  {
    sport: "mlb",
    abbreviation: "STL",
    canonicalName: "St. Louis Cardinals",
    aliases: ["stl", "cardinals", "st louis cardinals"],
  },
  {
    sport: "mlb",
    abbreviation: "TB",
    canonicalName: "Tampa Bay Rays",
    aliases: ["tb", "rays", "tampa bay rays"],
  },
  {
    sport: "mlb",
    abbreviation: "TEX",
    canonicalName: "Texas Rangers",
    aliases: ["tex", "rangers", "texas rangers"],
  },
  {
    sport: "mlb",
    abbreviation: "TOR",
    canonicalName: "Toronto Blue Jays",
    aliases: ["tor", "blue jays", "toronto blue jays"],
  },
  {
    sport: "mlb",
    abbreviation: "WSH",
    canonicalName: "Washington Nationals",
    aliases: ["wsh", "nationals", "washington nationals", "nats"],
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

const KNOWN_ENTITIES = [
  ...NBA_TEAMS,
  ...NFL_TEAMS,
  ...MLB_TEAMS,
  ...WORLD_CUP_TEAM_ENTITIES,
  ...SOCCER_CLUBS,
];

let useEspnApi = true;
let footballDataApiKey = "";
let apiFootballKey = "";
let apiFootballLeagueId = "1";
let apiFootballSeason = String(WORLD_CUP_2026.season);
let theSportsDbApiKey = "3";
let theSportsDbWorldCupLeagueId = "";
let balldontlieApiKey = "";
let preferredSoccerCompetitions = [...DEFAULT_SOCCER_COMPETITIONS];

let debugMode = false;
let pluginRouteBase = "";
let pluginFetch = (...args) => fetch(...args);

const cache = {
  nbaTeams: null,
  nflTeams: null,
  mlbTeams: null,
  soccerTeamsByCompetition: new Map(),
};
const refreshCache = new Map();
const LOGO_CACHE_NAMESPACE = "ext:sports-slot:logos";
const LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let logoCache = null;

function createExtensionCache(ctx, namespace, ttlMs) {
  if (typeof ctx?.useCache === "function") {
    return ctx.useCache(namespace, ttlMs);
  }
  return typeof ctx?.createCache === "function"
    ? ctx.createCache(ttlMs)
    : null;
}

async function cacheGet(cache, key) {
  return cache ? await cache.get(key) : null;
}

async function cacheSet(cache, key, value, ttlMs) {
  if (cache) await cache.set(key, value, ttlMs);
}

function encodeLogoCacheEntry(bytes, contentType) {
  return {
    contentType,
    data: Buffer.from(bytes).toString("base64"),
  };
}

function decodeLogoCacheEntry(entry) {
  if (!entry?.data) return null;
  return {
    bytes: Uint8Array.from(Buffer.from(entry.data, "base64")),
    contentType: entry.contentType || "image/png",
  };
}

let localeBanks = { en: FALLBACK_STRINGS };
let requestLocale = "en";

function normalizeRequestLocale(value = "en") {
  const requested = String(value || "en").trim() || "en";
  try {
    return Intl.getCanonicalLocales(requested)[0] || "en";
  } catch {
    return "en";
  }
}

function setTranslationLocale(context) {
  requestLocale = normalizeRequestLocale(
    context?.locale || context?.acceptLanguage || context?.i18n || "en",
  );
}

function lookupLocaleString(key) {
  const tag = requestLocale.toLowerCase();
  const base = tag.split("-")[0];
  const bank =
    localeBanks[tag] ||
    localeBanks[base] ||
    localeBanks.en ||
    {};
  return bank[key] || "";
}

function initRuntime(ctx) {
  if (ctx?.apiBase) {
    pluginRouteBase = ctx.apiBase;
  } else if (typeof ctx?.routeUrl === "function") {
    pluginRouteBase = ctx.routeUrl();
  } else {
    const dir = typeof ctx?.dir === "string" ? ctx.dir : "";
    const folder = dir.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop();
    const prefix = ["", "api", "plugin"].join("/");
    pluginRouteBase = folder ? `${prefix}/${encodeURIComponent(folder)}` : `${prefix}/sports-slot`;
  }
  if (typeof ctx?.fetch === "function") {
    pluginFetch = (...args) => ctx.fetch(...args);
  }
  logoCache = createExtensionCache(ctx, LOGO_CACHE_NAMESPACE, LOGO_CACHE_TTL_MS);

  if (typeof ctx?.readFile === "function") {
    return Promise.all(
      ["en", "es", "fr"].map(async (lang) => {
        try {
          const raw = await ctx.readFile(`locales/${lang}.json`);
          const parsed = JSON.parse(raw);
          return [lang, parsed?.["plugin-sports-slot"] || {}];
        } catch {
          return [lang, {}];
        }
      }),
    ).then((loaded) => {
      localeBanks = Object.fromEntries(loaded);
      localeBanks.en = { ...FALLBACK_STRINGS, ...(localeBanks.en || {}) };
    });
  }
}

const TEAM_PRIMARY_COLORS = {
  nba: {
    ATL: "#E03A3E",
    BOS: "#007A33",
    BKN: "#000000",
    CHA: "#1D1160",
    CHI: "#CE1141",
    CLE: "#860038",
    DAL: "#00538C",
    DEN: "#0E2240",
    DET: "#C8102E",
    GSW: "#1D428A",
    HOU: "#CE1141",
    IND: "#002D62",
    LAC: "#C8102E",
    LAL: "#552583",
    MEM: "#5D76A9",
    MIA: "#98002E",
    MIL: "#00471B",
    MIN: "#0C2340",
    NOP: "#0C2340",
    NYK: "#F58426",
    OKC: "#007AC1",
    ORL: "#0077C0",
    PHI: "#006BB6",
    PHX: "#1D1160",
    POR: "#E03A3E",
    SAC: "#5A2D81",
    SAS: "#C4CED4",
    TOR: "#CE1141",
    UTA: "#002B5C",
    WAS: "#002B5C",
  },
  nfl: {
    ARI: "#97233F",
    ATL: "#A71930",
    BAL: "#241773",
    BUF: "#00338D",
    CAR: "#0085CA",
    CHI: "#0B162A",
    CIN: "#FB4F14",
    CLE: "#311D00",
    DAL: "#003594",
    DEN: "#FB4F14",
    DET: "#0076B6",
    GB: "#203731",
    HOU: "#03202F",
    IND: "#002C5F",
    JAX: "#006778",
    KC: "#E31837",
    LV: "#000000",
    LAC: "#0080C6",
    LAR: "#003594",
    MIA: "#008E97",
    MIN: "#4F2683",
    NE: "#002244",
    NO: "#D3BC8D",
    NYG: "#0B2265",
    NYJ: "#125740",
    PHI: "#004C54",
    PIT: "#FFB612",
    SEA: "#002244",
    SF: "#AA0000",
    TB: "#D50A0A",
    TEN: "#0C2340",
    WAS: "#5A1414",
  },
  mlb: {
    ARI: "#A71930",
    ATL: "#CE1141",
    BAL: "#DF4601",
    BOS: "#BD3039",
    CHC: "#0E3386",
    CWS: "#27251F",
    CIN: "#C6011F",
    CLE: "#0C2340",
    COL: "#333366",
    DET: "#0C2340",
    HOU: "#EB6E1F",
    KC: "#004687",
    LAA: "#BA0021",
    LAD: "#005A9C",
    MIA: "#00A3E0",
    MIL: "#12284B",
    MIN: "#002B5C",
    NYM: "#002D72",
    NYY: "#0C2340",
    ATH: "#003831",
    PHI: "#E81828",
    PIT: "#FDB827",
    SD: "#2F241D",
    SF: "#FD5A1E",
    SEA: "#005C5C",
    STL: "#C41E3A",
    TB: "#092C5C",
    TEX: "#003278",
    TOR: "#134A8E",
    WSH: "#AB0003",
  },
};

const NBA_LOGO_KEYS = {
  GSW: "gs",
  NOP: "no",
  NYK: "ny",
  SAS: "sa",
  UTA: "utah",
  WAS: "wsh",
};

const NFL_LOGO_KEYS = {
  WAS: "wsh",
};

const MLB_LOGO_KEYS = {
  ARI: "ari",
  ATH: "oak",
  BAL: "bal",
  BOS: "bos",
  CHC: "chc",
  CWS: "chw",
  CIN: "cin",
  CLE: "cle",
  COL: "col",
  DET: "det",
  HOU: "hou",
  KC: "kc",
  LAA: "laa",
  LAD: "la",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NYM: "nym",
  NYY: "nyy",
  PHI: "phi",
  PIT: "pit",
  SD: "sd",
  SEA: "sea",
  SF: "sf",
  STL: "stl",
  TB: "tb",
  TEX: "tex",
  TOR: "tor",
  WSH: "wsh",
};

function getSportDisplayName(sport) {
  if (sport === "nba") return "NBA";
  if (sport === "nfl") return "NFL";
  if (sport === "mlb") return "MLB";
  if (sport === "soccer") return t("soccerSport");
  return "Sports";
}

function isBalldontlieSport(sport) {
  return sport === "nba" || sport === "nfl" || sport === "mlb";
}

function getEspnLogoKey(sport, abbreviation) {
  const upper = String(abbreviation ?? "").toUpperCase();
  if (!upper) return "";
  if (sport === "nba") return (NBA_LOGO_KEYS[upper] ?? upper).toLowerCase();
  if (sport === "nfl") return (NFL_LOGO_KEYS[upper] ?? upper).toLowerCase();
  if (sport === "mlb") return (MLB_LOGO_KEYS[upper] ?? upper).toLowerCase();
  return "";
}

// ESPN country crest slugs (abbreviation -> countries/500/{slug}.png).
const SOCCER_COUNTRY_LOGO_SLUGS = {
  ALG: "alg",
  ARG: "arg",
  AUS: "aus",
  AUT: "aut",
  BEL: "bel",
  BIH: "bih",
  BRA: "bra",
  CAN: "can",
  COL: "col",
  CPV: "cpv",
  CRO: "cro",
  CZE: "cze",
  COD: "rdc",
  ECU: "ecu",
  EGY: "egy",
  ENG: "eng",
  ESP: "esp",
  FRA: "fra",
  GER: "ger",
  GHA: "gha",
  HAI: "hai",
  IRQ: "irq",
  IRN: "irn",
  JOR: "jor",
  JPN: "jpn",
  KOR: "kors",
  KSA: "ksa",
  MAR: "mar",
  MEX: "mex",
  NED: "ned",
  NOR: "nor",
  NZL: "nzl",
  PAN: "pan",
  PAR: "par",
  POR: "por",
  QAT: "qat",
  RSA: "rsa",
  SCO: "sco",
  SEN: "sen",
  SUI: "sui",
  SWE: "swe",
  TUN: "tun",
  TUR: "tur",
  URU: "uru",
  USA: "usa",
  UZB: "uzb",
  CIV: "civ",
};

function extractEspnCountryLogoSlug(crestUrl = "") {
  const match = String(crestUrl).match(
    /teamlogos\/countries\/500\/([a-z0-9_-]+)\.png/i,
  );
  return match?.[1] || "";
}

function resolveSoccerLogoRemoteUrl(abbreviation, crestUrl = "") {
  if (crestUrl && /^https?:\/\//i.test(crestUrl)) {
    return crestUrl;
  }

  const upper = String(abbreviation ?? "").toUpperCase();
  const slug =
    extractEspnCountryLogoSlug(crestUrl) ||
    SOCCER_COUNTRY_LOGO_SLUGS[upper] ||
    upper.toLowerCase();
  if (!slug) return "";
  return `https://a.espncdn.com/i/teamlogos/countries/500/${slug}.png`;
}

function getRemoteLogoUrlForTeam(sport, abbreviation, crestUrl = "") {
  if (sport === "soccer") {
    return resolveSoccerLogoRemoteUrl(abbreviation, crestUrl);
  }
  if (crestUrl) return crestUrl;
  const key = getEspnLogoKey(sport, abbreviation);
  if (!key) return "";
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${key}.png`;
}

function getJerseyImageUrl(jerseyHref = "") {
  if (!jerseyHref || !pluginRouteBase) return "";
  const params = new URLSearchParams({
    sport: "jersey",
    src: jerseyHref,
  });
  return `${pluginRouteBase}/logo?${params.toString()}`;
}

function getLogoUrlForTeam(sport, abbreviation, crestUrl = "") {
  const abbr = String(abbreviation ?? "").toUpperCase();
  if (sport === "nba" || sport === "nfl" || sport === "mlb" || sport === "soccer") {
    if (!abbr && !crestUrl) return "";
    const params = new URLSearchParams({
      sport,
      abbr: abbr || "TEAM",
    });
    if (crestUrl && sport === "soccer") {
      params.set("crest", crestUrl);
    }
    return `${pluginRouteBase}/logo?${params.toString()}`;
  }

  return getRemoteLogoUrlForTeam(sport, abbreviation, crestUrl);
}

function getBrandColorForTeam(sport, abbreviation) {
  const map = TEAM_PRIMARY_COLORS[sport];
  return map?.[String(abbreviation ?? "").toUpperCase()] ?? "";
}

function getFallbackAbbreviation(teamName) {
  const words = String(teamName ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function buildTeamBrand({ sport, abbreviation, teamName, crestUrl }) {
  const fallback = abbreviation || getFallbackAbbreviation(teamName);
  return {
    abbreviation: fallback,
    color: getBrandColorForTeam(sport, fallback),
    logoUrl: getLogoUrlForTeam(sport, fallback, crestUrl),
  };
}

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
      " ",
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

function formatCompactDateTime(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";

  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${day} • ${time}`;
}

function formatCompactDate(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMaybeTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (isIsoLikeTimestamp(text)) return formatCompactDateTime(text) || text;

  return text.replace(EMBEDDED_TIMESTAMP_PATTERN, (match) => {
    return formatCompactDateTime(match) || match;
  });
}

function isIsoLikeTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
      value.trim(),
    )
  );
}

function parseClockToSeconds(rawClock) {
  const match = String(rawClock ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClockSeconds(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const mod10 = number % 10;
  if (mod10 === 1) return `${number}st`;
  if (mod10 === 2) return `${number}nd`;
  if (mod10 === 3) return `${number}rd`;
  return `${number}th`;
}

function formatNbaPeriodLabel(game) {
  const period = Number(game?.period ?? 0);
  if (!period) return "Live";
  if (period <= 4) return `${ordinal(period)} Qtr`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

function formatNflPeriodLabel(game) {
  const period = Number(game?.period ?? 0);
  if (!period) return "Live";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

function parseConfiguredCompetitions(rawValue) {
  const configured = String(rawValue ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const valid = configured.filter((code) =>
    SOCCER_COMPETITIONS.some((competition) => competition.code === code),
  );

  return valid.length ? valid : [...DEFAULT_SOCCER_COMPETITIONS];
}

function hasSportsCue(normalizedQuery) {
  return (
    QUERY_CUE_PATTERN.test(normalizedQuery) ||
    MATCHUP_PATTERN.test(normalizedQuery)
  );
}

function detectIntent(normalizedQuery) {
  if (/\b(bracket|knockout|round of 32|round 32|path)\b/.test(normalizedQuery)) {
    return "bracket";
  }
  if (
    /\b(standings|standing|table|tables|rankings|ranking|groups?|group stage)\b/.test(
      normalizedQuery,
    )
  ) {
    return "standings";
  }
  if (
    /\b(schedule|schedules|fixtures|fixture|next|tomorrow)\b/.test(
      normalizedQuery,
    )
  ) {
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
  if (
    isWorldCupQuery(normalizedQuery) ||
    /\b(soccer|fifa)\b/.test(normalizedQuery)
  ) {
    return "soccer";
  }
  if (/\b(nba|basketball|hoops)\b/.test(normalizedQuery)) return "nba";
  if (/\b(nfl|american football|super bowl|gridiron)\b/.test(normalizedQuery)) {
    return "nfl";
  }
  if (/\b(mlb|baseball|world series)\b/.test(normalizedQuery)) return "mlb";

  return null;
}

function cleanupEntityText(rawText) {
  return normalizeText(rawText)
    .replace(
      /\b(whats|what is|what are|show|me|the|a|an|for|today|tonight|tomorrow|latest|last|next|live|score|scores|scored|result|results|schedule|schedules|fixtures|fixture|game|games|match|matches|table|tables|standings|standing|rankings|ranking|bracket|knockout|group|groups|stage|world|cup|fifa|nfl|nba|mlb|basketball|baseball|soccer|football|american|who|won)\b/g,
      " ",
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
      const reverseContains = ` ${normalizedAlias} `.includes(
        ` ${normalized} `,
      );

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

function getWorldCupCompetition() {
  return SOCCER_COMPETITIONS.find((item) => item.code === WORLD_CUP_2026.code);
}

function isWorldCupEntity(entity) {
  return entity?.sport === "soccer" && entity?.competitionCode === WORLD_CUP_2026.code;
}

function resolveWorldCupTeamFromQuery(queryText) {
  const entity = resolveEntity(cleanupEntityText(queryText), "soccer");
  return isWorldCupEntity(entity) ? entity : null;
}

function parseQuery(rawQuery) {
  const query = String(rawQuery ?? "").trim();
  if (!query) return null;

  const normalized = normalizeText(query);
  const worldCupMentioned = isWorldCupQuery(normalized);
  const worldCupGroup = resolveWorldCupGroupFromQuery(normalized);
  const worldCupTeam = resolveWorldCupTeamFromQuery(query);
  const sportHint = detectSportHint(normalized);
  const fallbackFootballHint =
    /\bfootball\b/.test(normalized) && !worldCupMentioned ? "nfl" : null;
  const intent = detectIntent(normalized);
  const competition = resolveCompetition(normalized);
  const isBareSport = /^(soccer|football|nba|nfl|mlb|basketball|baseball)$/i.test(normalized);
  const cues = hasSportsCue(normalized) || isBareSport;

  const matchup = splitMatchup(query);
  if (matchup) {
    const left = resolveEntity(cleanupEntityText(matchup.left), sportHint);
    const right = resolveEntity(
      cleanupEntityText(matchup.right),
      left?.sport ?? sportHint,
    );
    if (left && right && left.sport === right.sport) {
      if (isWorldCupEntity(left) || isWorldCupEntity(right)) {
        return {
          kind: "worldCupMatchup",
          sport: "soccer",
          intent: "matchup",
          left,
          right,
          group:
            left.groupCode && left.groupCode === right.groupCode
              ? getWorldCupGroup(left.groupCode)
              : null,
          competition: getWorldCupCompetition(),
          query,
        };
      }

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
            (item) => item.code === left.competitionCode,
          ),
        query,
      };
    }
  }

  if (worldCupMentioned || competition?.code === WORLD_CUP_2026.code) {
    return {
      kind: worldCupTeam ? "worldCupTeam" : "worldCup",
      sport: "soccer",
      intent,
      team: worldCupTeam,
      group:
        worldCupGroup ||
        (worldCupTeam?.groupCode ? getWorldCupGroup(worldCupTeam.groupCode) : null),
      competition: getWorldCupCompetition(),
      query,
    };
  }

  const entity = resolveEntity(cleanupEntityText(query), sportHint);
  if (entity && (cues || sportHint)) {
    if (isWorldCupEntity(entity)) {
      return {
        kind: "worldCupTeam",
        sport: "soccer",
        intent,
        team: entity,
        group: entity.groupCode ? getWorldCupGroup(entity.groupCode) : null,
        competition: getWorldCupCompetition(),
        query,
      };
    }

    return {
      kind: "team",
      sport: entity.sport,
      intent,
      team: entity,
      competition:
        entity.sport === "soccer"
          ? SOCCER_COMPETITIONS.find(
              (item) => item.code === entity.competitionCode,
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
              (item) => item.code === preferredSoccerCompetitions[0],
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
    eyebrow: "Sports",
    badge: "Setup required",
    badgeTone: "setup",
    title: providerName,
    subtitle: message,
    facts: details
      ? [{ label: "Next step", value: details }]
      : [
          {
            label: "Next step",
            value: `Add your ${providerName} API key in Settings → Plugins.`,
          },
        ],
    footer: `<a class="glance-link sports-slot__link" href="${escapeHtml(
      link,
    )}" target="_blank" rel="noreferrer">Get an API key</a>`,
  });
}

function renderUnsupportedCard(sport, title, message) {
  return renderCard({
    sport,
    eyebrow: "Sports",
    badge: "Free-tier limit",
    badgeTone: "warning",
    title,
    subtitle: message,
  });
}

function renderEmptyCard(sport, title, message, note) {
  return renderCard({
    sport,
    eyebrow: "Sports",
    badge: "No data",
    badgeTone: "scheduled",
    title,
    subtitle: message,
    footer: note
      ? `<div class="sports-slot__footer-note">${escapeHtml(note)}</div>`
      : "",
  });
}

function renderTeamMark(brand, teamName, fallbackAbbreviation) {
  const abbreviation =
    brand?.abbreviation ||
    fallbackAbbreviation ||
    getFallbackAbbreviation(teamName);
  const colorStyle = brand?.color
    ? ` style="--team-color:${escapeHtml(brand.color)}"`
    : "";
  const imageHtml = brand?.logoUrl
    ? `<img class="sports-slot__team-mark-image" src="${escapeHtml(
        brand.logoUrl,
      )}" alt="" loading="lazy" decoding="async" width="56" height="56" referrerpolicy="no-referrer" />`
    : "";

  return `
    <span class="sports-slot__team-mark"${colorStyle}>
      ${imageHtml}
      <span class="sports-slot__team-mark-fallback">${escapeHtml(
        abbreviation,
      )}</span>
    </span>
  `;
}

function getLiveBadgeLabel(game) {
  if (!game || game.state !== "live") return "";
  const status = formatMaybeTimestamp(game.status || "");
  return status && !/^live$/i.test(status) ? status : game.status || "Live";
}

function renderLiveIndicator(text, { clock = false, game = null, refreshable = false } = {}) {
  const liveClockAttr =
    clock && game?.liveClockSeconds != null
      ? `data-live-status data-live-prefix="${escapeHtml(
          game.liveStatusPrefix || "",
        )}" data-live-seconds="${escapeHtml(
          game.liveClockSeconds,
        )}" data-live-direction="down"`
      : "";
  const refreshAttrs = refreshable
    ? ` data-sports-refresh-trigger role="button" tabindex="0" aria-label="${escapeHtml(
        t("refresh"),
      )}"`
    : "";

  return `
    <span class="sports-slot__live-status${
      refreshable ? " sports-slot__live-status--refresh" : ""
    }"${liveClockAttr ? ` ${liveClockAttr}` : ""}${refreshAttrs}>
      <span class="sports-slot__live-status-text">${escapeHtml(text)}</span>
      <span class="sports-slot__live-track" aria-hidden="true">
        <span class="sports-slot__live-bar"></span>
      </span>
    </span>`;
}

function renderLiveBadge(label, game = null, refreshable = false) {
  return `
    <span class="sports-slot__badge sports-slot__badge--live">
      ${renderLiveIndicator(label, { clock: true, game, refreshable })}
    </span>
  `;
}

function renderProviderFooter(providerLabel, providerUrl, extraText = "") {
  const debugSuffix = ` <span class="sports-slot__footer-debug">• v${escapeHtml(
    PLUGIN_VERSION,
  )}${debugMode ? " debug" : ""}</span>`;

  return `
    <div class="sports-slot__footer-meta">
      <a class="glance-link sports-slot__link" href="${escapeHtml(
        providerUrl,
      )}" target="_blank" rel="noreferrer">Data by ${escapeHtml(providerLabel)}</a>${debugSuffix}${
        extraText
          ? ` <span class="sports-slot__footer-debug">• ${escapeHtml(extraText)}</span>`
          : ""
      }
    </div>
  `;
}

function normalizeStatKey(label = "") {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function renderFocusStatRow(stat) {
  const awayVal = parseFloat(stat.away) || 0;
  const homeVal = parseFloat(stat.home) || 0;
  const total = awayVal + homeVal;
  let awayPct = 50;
  let homePct = 50;
  if (total > 0) {
    awayPct = (awayVal / total) * 100;
    homePct = (homeVal / total) * 100;
  }
  const isPossession = stat.label.toLowerCase() === "possession";
  const awayDisp = isPossession ? `${stat.away}%` : stat.away;
  const homeDisp = isPossession ? `${stat.home}%` : stat.home;

  return `
    <div class="sports-slot__stat-row" data-stat-key="${escapeHtml(
      normalizeStatKey(stat.label),
    )}">
      <span class="sports-slot__stat-val sports-slot__stat-val--home">${escapeHtml(
        homeDisp,
      )}</span>
      <div class="sports-slot__stat-bar-track">
        <div
          class="sports-slot__stat-bar sports-slot__stat-bar--home"
          style="width: ${homePct}%"
          data-stat-home-pct="${homePct}"
        ></div>
        <div
          class="sports-slot__stat-bar sports-slot__stat-bar--away"
          style="width: ${awayPct}%"
          data-stat-away-pct="${awayPct}"
        ></div>
      </div>
      <span class="sports-slot__stat-val sports-slot__stat-val--away">${escapeHtml(
        awayDisp,
      )}</span>
      <span class="sports-slot__stat-label">${escapeHtml(stat.label)}</span>
    </div>
  `;
}

function renderToolbar(model) {
  const badgeHtml = model.badge
    ? model.badgeTone === "live"
      ? renderLiveBadge(model.badge, model.focusGame, model.refreshable)
      : `<span class="sports-slot__badge sports-slot__badge--${escapeHtml(
          model.badgeTone || "scheduled",
        )}">${escapeHtml(model.badge)}</span>`
    : "";

  return `
    <header class="sports-slot__toolbar">
      <div class="sports-slot__toolbar-copy">
        ${
          model.eyebrow
            ? `<span class="sports-slot__kicker">${escapeHtml(model.eyebrow)}</span>`
            : ""
        }
        ${
          model.title
            ? `<span class="sports-slot__headline">${escapeHtml(model.title)}</span>`
            : ""
        }
        ${
          model.subtitle
            ? `<span class="sports-slot__meta">${escapeHtml(model.subtitle)}</span>`
            : ""
        }
      </div>
      <div class="sports-slot__toolbar-actions">
        ${badgeHtml}
      </div>
    </header>
  `;
}

function renderSlotRootAttrs(model) {
  const awayColor = model.focusGame?.awayBrand?.color || "var(--primary)";
  const homeColor = model.focusGame?.homeBrand?.color || "var(--primary)";
  const styleAttr = ` style="--sports-away-color:${escapeHtml(
    awayColor,
  )};--sports-home-color:${escapeHtml(homeColor)};"`;

  return `
      class="sports-slot sports-slot--${escapeHtml(model.sport)} slot-full-width sports-slot--full-width"
      data-sports-query="${escapeHtml(model.query || "")}"
      data-sports-provider="${escapeHtml(model.provider || "")}"
      data-sports-sport="${escapeHtml(model.sport || "")}"
      data-sports-version="${escapeHtml(PLUGIN_VERSION)}"
      data-refresh-ms="${escapeHtml(model.refreshMinIntervalMs || "")}"
      data-sports-default-event-id="${escapeHtml(model.defaultFocusGameId || model.focusGame?.id || "")}"
      data-sports-focus-event-id="${escapeHtml(model.focusGame?.id || "")}"
      ${model.refreshable ? 'data-refreshable="true"' : ""}
      ${model.focusGame?.state === "live" ? 'data-sports-live="true"' : ""}
      ${debugMode ? 'data-sports-debug="true"' : ""}
      ${styleAttr}
  `;
}

function renderFocusScoreboard(game, sport, scorersHtml = "") {
  if (!game) return "";

  let statusText = game.status || "";
  if (sport === "soccer" && game.state === "final" && statusText === "Final") {
    statusText = "Full-time";
  }

  const isToday =
    game.sortDate &&
    new Date(game.sortDate).toDateString() === new Date().toDateString();
  const metaLeft = `${game.competitionLabel || ""}${isToday ? " • Today" : ""}`;
  const metaRight = formatMaybeTimestamp(statusText);
  const statusHtml =
    game.state === "live"
      ? renderLiveIndicator(metaRight, { clock: true, game })
      : escapeHtml(metaRight);

  const subLabelHtml = game.subLabel
    ? `<div class="sports-slot__scoreboard-sublabel">${escapeHtml(game.subLabel)}</div>`
    : "";
  const venueHtml = game.meta
    ? `<div class="sports-slot__scoreboard-meta">${escapeHtml(game.meta)}</div>`
    : "";

  return `
    <section class="sports-slot__scoreboard sports-slot__scoreboard--horizontal sports-slot__scoreboard--${escapeHtml(
      game.state,
    )}">
      <div class="sports-slot__scoreboard-header">
        <span class="sports-slot__scoreboard-header-meta">${escapeHtml(metaLeft)}</span>
        <span class="sports-slot__scoreboard-header-status${
          game.state === "live" ? " sports-slot__scoreboard-header-status--live" : ""
        }">${statusHtml}</span>
      </div>
      <div class="sports-slot__scoreboard-body">
        <div class="sports-slot__scoreboard-team sports-slot__scoreboard-team--home">
          ${renderTeamMark(game.homeBrand, game.homeTeam, game.homeAbbr)}
          <div class="sports-slot__scoreboard-team-name">${escapeHtml(game.homeTeam)}</div>
        </div>
        <div class="sports-slot__scoreboard-score">
          <span class="sports-slot__score-val">${escapeHtml(game.homeScore)}</span>
          <span class="sports-slot__score-divider">-</span>
          <span class="sports-slot__score-val">${escapeHtml(game.awayScore)}</span>
        </div>
        <div class="sports-slot__scoreboard-team sports-slot__scoreboard-team--away">
          ${renderTeamMark(game.awayBrand, game.awayTeam, game.awayAbbr)}
          <div class="sports-slot__scoreboard-team-name">${escapeHtml(game.awayTeam)}</div>
        </div>
      </div>
      ${subLabelHtml}
      ${scorersHtml}
      ${venueHtml}
    </section>
  `;
}

function renderMiniGameCard(game, options = {}) {
  const { focusGameId = "", selectable = false } = options;
  const isFocus =
    focusGameId && game.id && String(game.id) === String(focusGameId);
  const selectableClass =
    selectable && game.id ? " sports-slot__mini-game--selectable" : "";
  const focusClass = isFocus ? " sports-slot__mini-game--focus" : "";
  const browseAttrs =
    selectable && game.id
      ? ` data-sports-match-id="${escapeHtml(String(game.id))}" role="button" tabindex="0" aria-pressed="${isFocus ? "true" : "false"}"`
      : "";

  const scoreHtml =
    game.state === "scheduled"
      ? ""
      : `<strong>${escapeHtml(formatMaybeTimestamp(game.score))}</strong>`;

  return `
    <article class="sports-slot__mini-game sports-slot__mini-game--card${
      game.state === "scheduled" ? " sports-slot__mini-game--scheduled" : ""
    }${selectableClass}${focusClass}"${browseAttrs}>
      <div class="sports-slot__mini-game-top">
        <span class="sports-slot__mini-game-label">${escapeHtml(game.label || "Game")}</span>
        <span class="sports-slot__mini-game-status sports-slot__mini-game-status--${escapeHtml(
          toStatusTone(game.state),
        )}">${escapeHtml(formatMaybeTimestamp(game.status))}</span>
      </div>
      <div class="sports-slot__mini-game-score">
        <span class="sports-slot__mini-game-matchup">
          ${renderTeamMark(game.homeBrand, game.homeTeam, game.homeAbbr)}
          <span>${escapeHtml(game.homeAbbr || game.homeTeam)}</span>
          <span class="sports-slot__mini-game-separator">vs</span>
          ${renderTeamMark(game.awayBrand, game.awayTeam, game.awayAbbr)}
          <span>${escapeHtml(game.awayAbbr || game.awayTeam)}</span>
        </span>
        ${scoreHtml}
      </div>
      ${
        game.meta
          ? `<div class="sports-slot__mini-game-meta">${escapeHtml(game.meta)}</div>`
          : ""
      }
    </article>
  `;
}

function renderGamesSectionHead(title, model) {
  const showLatest =
    model.defaultFocusGameId &&
    model.focusGame?.id &&
    String(model.focusGame.id) !== String(model.defaultFocusGameId);

  return `
    <div class="sports-slot__games-head">
      <h4 class="sports-slot__section-label">${escapeHtml(title)}</h4>
      ${
        showLatest
          ? `<button type="button" class="sports-slot__latest-btn" data-sports-latest>Latest</button>`
          : ""
      }
    </div>
  `;
}

function renderAbbr(shortLabel, titleText) {
  return `<abbr class="sports-slot__abbr" title="${escapeHtml(titleText)}">${escapeHtml(shortLabel)}</abbr>`;
}

function renderSoccerGroupTableHead() {
  return `
    <div class="sports-slot__group-row sports-slot__group-row--head sports-slot__group-row--soccer">
      <span>${t("team")}</span>
      <span>${renderAbbr("GP", t("abbrGp"))}</span>
      <span>${renderAbbr("W", t("abbrW"))}</span>
      <span>${renderAbbr("D", t("abbrD"))}</span>
      <span>${renderAbbr("L", t("abbrL"))}</span>
      <span>${renderAbbr("GF", t("abbrGf"))}</span>
      <span>${renderAbbr("GA", t("abbrGa"))}</span>
      <span>${renderAbbr("GD", t("abbrGd"))}</span>
      <span>${renderAbbr("Pts", t("abbrPts"))}</span>
    </div>
  `;
}

function renderSoccerGroupTableRow(row) {
  return `
    <div class="sports-slot__group-row sports-slot__group-row--soccer ${
      row.highlight ? "sports-slot__group-row--highlight" : ""
    }">
      <span class="sports-slot__group-team">
        ${
          row.logoUrl
            ? `<img class="sports-slot__group-team-logo" src="${escapeHtml(row.logoUrl)}" alt="" />`
            : ""
        }
        <span title="${escapeHtml(row.abbreviation || "")}">${escapeHtml(row.team)}</span>
      </span>
      <span>${escapeHtml(row.played || "—")}</span>
      <span>${escapeHtml(row.wins || "—")}</span>
      <span>${escapeHtml(row.ties || "—")}</span>
      <span>${escapeHtml(row.losses || "—")}</span>
      <span>${escapeHtml(row.pointsFor || "—")}</span>
      <span>${escapeHtml(row.pointsAgainst || "—")}</span>
      <span>${escapeHtml(row.goalDiff || "—")}</span>
      <strong>${escapeHtml(row.points || "—")}</strong>
    </div>
  `;
}

function renderSoccerGroupCard(group) {
  return `
    <article class="sports-slot__group-card">
      <div class="sports-slot__group-card-head">
        <strong>${escapeHtml(group.title)}</strong>
      </div>
      <div class="sports-slot__group-table-scroll">
        <div class="sports-slot__group-table sports-slot__group-table--soccer">
          ${renderSoccerGroupTableHead()}
          ${(group.rows ?? []).map((row) => renderSoccerGroupTableRow(row)).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderMatchFactsStrip(facts) {
  if (!facts?.length) return "";
  return `
    <section class="sports-slot__match-facts" aria-label="${t("matchInfo")}">
      ${facts
        .map(
          (fact) => `
            <div class="sports-slot__match-fact">
              <span class="sports-slot__match-fact-label">${escapeHtml(fact.label)}</span>
              <span class="sports-slot__match-fact-value">${escapeHtml(fact.value)}</span>
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function timelineEventTone(event) {
  if (event.isPeriod) return "period";
  if (event.scoring) return "goal";
  if (event.redCard) return "red";
  if (event.yellowCard) return "yellow";
  if (event.substitution) return "sub";
  if (event.isPlay) return "play";
  return "default";
}

function timelineEventIcon(event) {
  if (event.isPeriod) return "◆";
  if (event.scoring) return "⚽";
  if (event.redCard) return "🟥";
  if (event.yellowCard) return "🟨";
  if (event.substitution) return "↔";
  if (event.isPlay) return "·";
  return "•";
}

function expandTimelineMatchNeedles(...labels) {
  const needles = new Set();

  for (const label of labels) {
    if (!label) continue;

    needles.add(normalizeText(label));
    needles.add(normalizeSoccerName(label));

    const entity = resolveEntity(label, "soccer");
    if (!entity) continue;

    needles.add(normalizeText(entity.canonicalName));
    needles.add(normalizeSoccerName(entity.canonicalName));

    if (entity.abbreviation) {
      needles.add(normalizeText(entity.abbreviation));
    }

    for (const alias of entity.aliases || []) {
      needles.add(normalizeText(alias));
      needles.add(normalizeSoccerName(alias));
    }
  }

  return [...needles].filter(Boolean);
}

function timelineTeamLabelMatches(label, needles) {
  const normalized = normalizeSoccerName(label);
  const plain = normalizeText(label);
  if (!normalized && !plain) return false;

  return needles.some((needle) => {
    if (!needle) return false;
    if (needle === normalized || needle === plain) return true;
    if (normalized && (needle.includes(normalized) || normalized.includes(needle))) {
      return true;
    }
    if (plain && (needle.includes(plain) || plain.includes(needle))) {
      return true;
    }
    return false;
  });
}

const COMMENTARY_NON_TEAM_PARENS =
  /^(very close range|left footed|right footed|penalty area|six yard box|centre of the box|center of the box|outside the box)/i;

function stripCommentaryLeadIn(value = "") {
  const trimmed = String(value || "").trim();
  const parts = trimmed.split(/\.\s+/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : trimmed;
}

function parseCommentaryAthleteTeam(text = "") {
  const source = String(text || "").trim();
  if (!source) return { athlete: "", team: "" };

  const leadingMatch = source.match(/^([^.(\n]+)\(([^)]+)\)/);
  if (leadingMatch) {
    return {
      athlete: leadingMatch[1].trim(),
      team: leadingMatch[2].trim(),
    };
  }

  const footedMatch = source.match(
    /\.\s*([A-ZÀ-ÖØ-öø-ÿ][\w\s.'-]+?)\s*\(([^)]+)\)\s+(?:left|right)\s+footed/i,
  );
  if (footedMatch && !COMMENTARY_NON_TEAM_PARENS.test(footedMatch[2])) {
    return {
      athlete: footedMatch[1].trim(),
      team: footedMatch[2].trim(),
    };
  }

  for (const match of source.matchAll(/([A-ZÀ-ÖØ-öø-ÿ][\w\s.'-]{1,48}?)\s*\(([^)]+)\)/g)) {
    const team = match[2].trim();
    if (!team || COMMENTARY_NON_TEAM_PARENS.test(team)) continue;

    const athlete = stripCommentaryLeadIn(match[1]);
    if (!athlete || athlete.length < 2) continue;

    return { athlete, team };
  }

  return { athlete: "", team: "" };
}

const COMMENTARY_EVENT_KINDS =
  "Corner|Offside(?: call|ruling)?|Free kick|Goal kick|Throw[- ]in|Foul|VAR|Penalty(?: awarded)?|Hand ball|Handball|Save|Miss|Attempt blocked|Shot blocked|Goal ruled out";

const COMMENTARY_EVENT_TEAM_PREFIX = new RegExp(
  `^(?:${COMMENTARY_EVENT_KINDS})\\s*[,\\-–—.]?\\s*([^.]+)\\.`,
  "i",
);

const COMMENTARY_EVENT_TEAM_INLINE = new RegExp(
  `(?:${COMMENTARY_EVENT_KINDS})\\s*[,\\-–—.]?\\s*([^.]+)\\.`,
  "ig",
);

const COMMENTARY_OFFSIDE_TEAM =
  /\bOffside(?: call|ruling)?\s*[,.\-–—]?\s*([^.]+)\./i;

function sanitizeCommentaryTeamLabel(label = "") {
  return String(label || "")
    .trim()
    .replace(/^[-–—]\s*/, "")
    .trim();
}

function parseCommentaryEventTeam(text = "") {
  const source = String(text || "").trim();
  if (!source) return "";

  const { team: athleteTeam } = parseCommentaryAthleteTeam(source);
  if (athleteTeam) return sanitizeCommentaryTeamLabel(athleteTeam);

  const offsideMatch = source.match(COMMENTARY_OFFSIDE_TEAM);
  if (offsideMatch?.[1]) return sanitizeCommentaryTeamLabel(offsideMatch[1]);

  const eventTeamMatch =
    source.match(COMMENTARY_EVENT_TEAM_PREFIX) ||
    [...source.matchAll(COMMENTARY_EVENT_TEAM_INLINE)].find(
      (match) => !/^var\b/i.test(match[0]),
    );
  if (eventTeamMatch?.[1]) return sanitizeCommentaryTeamLabel(eventTeamMatch[1]);

  return "";
}

function parseCommentaryEventType(text = "") {
  const source = String(text || "").trim();
  if (/\bOffside(?: call|ruling)?\b/i.test(source)) return "Offside";
  if (/^VAR\b/i.test(source)) return "VAR";

  const match = source.match(
    new RegExp(`^(${COMMENTARY_EVENT_KINDS})`, "i"),
  );
  if (!match?.[1]) return "Play";

  const raw = match[1].trim();
  if (/^offside/i.test(raw)) return "Offside";

  return raw
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/Handball/i, "Hand ball");
}

function findFocusTeamSideInCommentary(text = "", focusGame = null) {
  const haystack = normalizeText(text);
  if (!haystack || !focusGame) return "neutral";

  const awayNeedles = expandTimelineMatchNeedles(
    focusGame.awayAbbr,
    focusGame.awayTeam,
    focusGame.awayBrand?.abbreviation,
  ).filter((needle) => needle.length >= 4);
  const homeNeedles = expandTimelineMatchNeedles(
    focusGame.homeAbbr,
    focusGame.homeTeam,
    focusGame.homeBrand?.abbreviation,
  ).filter((needle) => needle.length >= 4);

  const awayHit = awayNeedles.some((needle) => haystack.includes(needle));
  const homeHit = homeNeedles.some((needle) => haystack.includes(needle));

  if (awayHit && !homeHit) return "away";
  if (homeHit && !awayHit) return "home";
  return "neutral";
}

function resolveTimelineTeamSide(eventTeam = "", focusGame = null, event = null) {
  if (!focusGame) return "neutral";

  const teamCandidates = [];
  if (eventTeam) teamCandidates.push(eventTeam);

  if (event) {
    const teamFromText = parseCommentaryEventTeam(
      event.text || event.detail || eventTeam || "",
    );
    if (teamFromText) teamCandidates.push(teamFromText);
  }

  if (!teamCandidates.length) return "neutral";

  const awayNeedles = expandTimelineMatchNeedles(
    focusGame.awayAbbr,
    focusGame.awayTeam,
    focusGame.awayBrand?.abbreviation,
  );
  const homeNeedles = expandTimelineMatchNeedles(
    focusGame.homeAbbr,
    focusGame.homeTeam,
    focusGame.homeBrand?.abbreviation,
  );

  if (teamCandidates.some((label) => timelineTeamLabelMatches(label, awayNeedles))) {
    return "away";
  }
  if (teamCandidates.some((label) => timelineTeamLabelMatches(label, homeNeedles))) {
    return "home";
  }

  if (event) {
    const sideFromText = findFocusTeamSideInCommentary(
      `${event.text || ""} ${event.detail || ""}`,
      focusGame,
    );
    if (sideFromText !== "neutral") return sideFromText;
  }

  return "neutral";
}

function getTimelineTeamColor(side, focusGame) {
  if (!focusGame) return "var(--primary)";
  if (side === "away") {
    return focusGame.awayBrand?.color || "var(--sports-away-color, var(--primary))";
  }
  if (side === "home") {
    return focusGame.homeBrand?.color || "var(--sports-home-color, var(--primary))";
  }
  return "var(--primary)";
}

function annotateTimelineScores(timeline, focusGame) {
  if (!timeline?.length || !focusGame) return timeline ?? [];

  let away = 0;
  let home = 0;

  return timeline.map((event) => {
    if (!event.scoring) return event;

    const side = resolveTimelineTeamSide(event.team, focusGame, event);
    if (side === "away") away += 1;
    else if (side === "home") home += 1;

    return {
      ...event,
      scoreAfter: { away, home, label: `${home}-${away}` },
    };
  });
}

function renderTimelineScoreBar(focusGame, sport = "soccer") {
  if (!focusGame) return "";

  const awayScore = escapeHtml(focusGame.awayScore ?? "—");
  const homeScore = escapeHtml(focusGame.homeScore ?? "—");
  const showScores = focusGame.state !== "scheduled";

  return `
    <div class="sports-slot__timeline-scorebar" aria-label="Match score">
      <div class="sports-slot__timeline-scorebar-team sports-slot__timeline-scorebar-team--home">
        ${renderTeamMark(focusGame.homeBrand, focusGame.homeTeam, focusGame.homeAbbr)}
        <span class="sports-slot__timeline-scorebar-abbr">${escapeHtml(
          focusGame.homeAbbr || focusGame.homeTeam,
        )}</span>
      </div>
      <div class="sports-slot__timeline-scorebar-center">
        ${
          showScores
            ? `<div class="sports-slot__timeline-scorebar-score">
                <span class="sports-slot__timeline-scorebar-val">${homeScore}</span>
                <span class="sports-slot__timeline-scorebar-divider">-</span>
                <span class="sports-slot__timeline-scorebar-val">${awayScore}</span>
              </div>`
            : `<span class="sports-slot__timeline-scorebar-vs">vs</span>`
        }
      </div>
      <div class="sports-slot__timeline-scorebar-team sports-slot__timeline-scorebar-team--away">
        ${renderTeamMark(focusGame.awayBrand, focusGame.awayTeam, focusGame.awayAbbr)}
        <span class="sports-slot__timeline-scorebar-abbr">${escapeHtml(
          focusGame.awayAbbr || focusGame.awayTeam,
        )}</span>
      </div>
    </div>
  `;
}

function renderTimelineEventCard(event, tone) {
  const assistHtml = event.assist
    ? `<span class="sports-slot__timeline-assist">${
        event.substitution ? "↳ replaces " : "↳ "
      }${escapeHtml(event.assist)}</span>`
    : "";
  const detailHtml =
    event.detail && event.detail !== event.text
      ? `<p class="sports-slot__timeline-detail">${escapeHtml(event.detail)}</p>`
      : "";
  const scoreHtml = event.scoreAfter
    ? `<span class="sports-slot__timeline-score-pill" title="Score after this event">${escapeHtml(
        event.scoreAfter.label,
      )}</span>`
    : "";

  return `
    <div class="sports-slot__timeline-card sports-slot__timeline-card--${tone}">
      <div class="sports-slot__timeline-card-head">
        <span class="sports-slot__timeline-minute">${escapeHtml(event.minute || "—")}</span>
        <span class="sports-slot__timeline-icon" aria-hidden="true">${timelineEventIcon(event)}</span>
        ${scoreHtml}
      </div>
      <div class="sports-slot__timeline-card-body">
        <div class="sports-slot__timeline-top">
          <strong>${escapeHtml(event.athlete || event.type)}</strong>
          ${
            event.team
              ? `<span class="sports-slot__timeline-team">${escapeHtml(event.team)}</span>`
              : ""
          }
        </div>
        <span class="sports-slot__timeline-text">${escapeHtml(
          event.isPlay && !event.athlete ? event.text : event.text,
        )}</span>
        ${assistHtml}
        ${detailHtml}
      </div>
    </div>
  `;
}

function getTimelineEventKey(event) {
  if (event.id) return String(event.id);
  const athlete = normalizeText(event.athlete || "");
  const text = normalizeText(event.text || event.type || "");
  return `${event.minute || ""}|${text}|${athlete}`;
}

function renderTimelinePanel(timeline, focusGame = null, sport = "soccer") {
  if (!timeline?.length) return "";
  const scoredTimeline = annotateTimelineScores(timeline, focusGame);
  const orderedTimeline = [...scoredTimeline].reverse();
  const scoreBarHtml = renderTimelineScoreBar(focusGame, sport);
  return `
    <div class="sports-slot__tab-panel" data-panel="timeline" style="display: none;">
      <div class="sports-slot__timeline">
        ${scoreBarHtml}
        <div class="sports-slot__timeline-body">
        <div class="sports-slot__timeline-events">
          <div class="sports-slot__timeline-spine" aria-hidden="true"></div>
          ${orderedTimeline
            .map((event) => {
              const tone = timelineEventTone(event);
              const eventKey = escapeHtml(getTimelineEventKey(event));

              if (event.isPeriod) {
                return `
                  <article
                    class="sports-slot__timeline-event sports-slot__timeline-event--period"
                    data-timeline-key="${eventKey}"
                  >
                    <div class="sports-slot__timeline-period-pill">${escapeHtml(event.text || event.type)}</div>
                  </article>
                `;
              }

              const side = resolveTimelineTeamSide(event.team, focusGame, event);
              const layoutSide =
                side === "home" ? "left" : side === "away" ? "right" : "center";
              const teamColor = getTimelineTeamColor(side, focusGame);
              const cardHtml = renderTimelineEventCard(event, tone);

              if (layoutSide === "center") {
                return `
                  <article
                    class="sports-slot__timeline-event sports-slot__timeline-event--neutral sports-slot__timeline-event--${tone}"
                    data-timeline-key="${eventKey}"
                    style="--sports-timeline-color:${escapeHtml(teamColor)}"
                  >
                    ${cardHtml}
                  </article>
                `;
              }

              if (layoutSide === "left") {
                return `
                  <article
                    class="sports-slot__timeline-event sports-slot__timeline-event--left sports-slot__timeline-event--${tone}"
                    data-timeline-key="${eventKey}"
                    style="--sports-timeline-color:${escapeHtml(teamColor)}"
                  >
                    ${cardHtml}
                    <span class="sports-slot__timeline-node" aria-hidden="true"></span>
                    <span class="sports-slot__timeline-spacer" aria-hidden="true"></span>
                  </article>
                `;
              }

              return `
                <article
                  class="sports-slot__timeline-event sports-slot__timeline-event--right sports-slot__timeline-event--${tone}"
                  data-timeline-key="${eventKey}"
                  style="--sports-timeline-color:${escapeHtml(teamColor)}"
                >
                  <span class="sports-slot__timeline-spacer" aria-hidden="true"></span>
                  <span class="sports-slot__timeline-node" aria-hidden="true"></span>
                  ${cardHtml}
                </article>
              `;
            })
            .join("")}
        </div>
        </div>
      </div>
    </div>
  `;
}

function renderLineupPlayer(player, team, coordsMap, pitchSide = "home") {
  const coords =
    coordsMap?.get(String(player.formationPlace)) ||
    getPitchCoords(player.formationPlace, pitchSide);
  const statusClass = player.subbedOut
    ? "sports-slot__pitch-player--out"
    : player.subbedIn
      ? "sports-slot__pitch-player--in"
      : "";
  const imageHtml = player.imageUrl
    ? `<img class="sports-slot__pitch-player-image" src="${escapeHtml(
        player.imageUrl,
      )}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
    : "";
  const teamColorStyle = team.color
    ? ` style="--sports-player-team-color:${escapeHtml(team.color)}"`
    : "";

  return `
    <div
      class="sports-slot__pitch-player ${statusClass}"
      style="left:${coords.x}%;top:${coords.y}%"
      title="${escapeHtml(player.fullName || player.name)}"
    >
      <span class="sports-slot__pitch-player-avatar"${teamColorStyle}>
        <span class="sports-slot__pitch-player-fallback">${escapeHtml(
          player.jersey || player.position || "?",
        )}</span>
        ${imageHtml}
      </span>
      <span class="sports-slot__pitch-player-name">${escapeHtml(player.name)}</span>
    </div>
  `;
}

function renderPitchTeamBar(team, placement) {
  if (!team) return "";
  return `
    <div class="sports-slot__pitch-team-bar sports-slot__pitch-team-bar--${placement}">
      <span class="sports-slot__pitch-team-name">${escapeHtml(team.team)}</span>
      ${
        team.formation
          ? `<span class="sports-slot__pitch-formation-pill">${escapeHtml(team.formation)}</span>`
          : ""
      }
    </div>
  `;
}

function renderLineupBench(team) {
  if (!team.subs?.length) return "";
  return `
    <div class="sports-slot__lineup-bench">
      <h5 class="sports-slot__lineup-bench-label">${escapeHtml(team.team)} · ${escapeHtml(t("bench"))}</h5>
      <ul class="sports-slot__lineup-bench-list">
        ${team.subs
          .map(
            (player) => `
              <li class="sports-slot__lineup-bench-item${
                player.subbedIn ? " sports-slot__lineup-bench-item--in" : ""
              }">
                ${
                  player.imageUrl
                    ? `<span class="sports-slot__lineup-bench-avatar"><span class="sports-slot__lineup-bench-fallback">${escapeHtml(player.jersey || "?")}</span><img class="sports-slot__lineup-bench-image" src="${escapeHtml(player.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span>`
                    : `<span class="sports-slot__lineup-bench-fallback">${escapeHtml(player.jersey || "?")}</span>`
                }
                <span class="sports-slot__lineup-bench-num">${escapeHtml(player.jersey)}</span>
                <span class="sports-slot__lineup-bench-name">${escapeHtml(player.name)}</span>
                <span class="sports-slot__lineup-bench-pos">${escapeHtml(player.position)}</span>
              </li>
            `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderLineupPanel(lineups) {
  if (!lineups?.length) return "";

  const awayTeam = lineups.find((team) => team.homeAway === "away") || lineups[0];
  const homeTeam =
    lineups.find((team) => team.homeAway === "home") ||
    lineups.find((team) => team !== awayTeam) ||
    lineups[0];

  const renderTeamPitchPlayers = (team, pitchSide) => {
    if (!team) return "";
    const coordsMap = layoutPitchPlayers(
      team.starters ?? [],
      team.formation,
      pitchSide,
      {
        rows: team.formationRows,
        layoutKey: team.formationLayoutKey,
      },
    );
    return (team.starters ?? [])
      .map((player) => renderLineupPlayer(player, team, coordsMap, pitchSide))
      .join("");
  };

  const pitchPlayers = [
    renderTeamPitchPlayers(awayTeam, "away"),
    renderTeamPitchPlayers(homeTeam, "home"),
  ].join("");

  const benchHtml = lineups.map((team) => renderLineupBench(team)).join("");

  return `
    <div class="sports-slot__tab-panel" data-panel="lineup" style="display: none;">
      <section class="sports-slot__lineup">
        <div class="sports-slot__pitch-wrap">
          <div class="sports-slot__pitch" aria-label="Match lineup">
            ${renderPitchTeamBar(homeTeam, "home")}
            <div class="sports-slot__pitch-surface"></div>
            <div class="sports-slot__pitch-center-circle"></div>
            <div class="sports-slot__pitch-halfway"></div>
            <div class="sports-slot__pitch-box sports-slot__pitch-box--top"></div>
            <div class="sports-slot__pitch-box sports-slot__pitch-box--bottom"></div>
            <div class="sports-slot__pitch-players">${pitchPlayers}</div>
            ${renderPitchTeamBar(awayTeam, "away")}
          </div>
        </div>
        <div class="sports-slot__lineup-bench-grid">${benchHtml}</div>
      </section>
    </div>
  `;
}

function renderFormPanels(teamForm) {
  if (!teamForm?.length) return "";
  return `
    <section class="sports-slot__form-grid">
      ${teamForm
        .map(
          (block) => `
            <article class="sports-slot__form-block">
              <h4 class="sports-slot__section-label">${escapeHtml(block.team)} ${t("recentForm")}</h4>
              <ul class="sports-slot__form-list">
                ${(block.events ?? [])
                  .map(
                    (event) => `
                      <li class="sports-slot__form-item sports-slot__form-item--${escapeHtml(
                        event.result || "draw",
                      ).toLowerCase()}">
                        <span class="sports-slot__form-result">${escapeHtml(event.result || "—")}</span>
                        <span class="sports-slot__form-opponent">${escapeHtml(event.opponent || "")}</span>
                        <span class="sports-slot__form-score">${escapeHtml(event.score || "")}</span>
                        <span class="sports-slot__form-comp">${escapeHtml(event.competition || "")}</span>
                      </li>
                    `,
                  )
                  .join("")}
              </ul>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderHeadToHeadPanel(headToHead) {
  if (!headToHead?.length) return "";
  return `
    <section class="sports-slot__h2h">
      <h4 class="sports-slot__section-label">${t("headToHead")}</h4>
      <ul class="sports-slot__h2h-list">
        ${headToHead
          .map(
            (match) => `
              <li class="sports-slot__h2h-item">
                <span class="sports-slot__h2h-date">${escapeHtml(match.dateLabel || "")}</span>
                <span class="sports-slot__h2h-matchup">${escapeHtml(match.label || "")}</span>
                <strong class="sports-slot__h2h-score">${escapeHtml(match.score || "")}</strong>
                ${
                  match.competition
                    ? `<span class="sports-slot__h2h-comp">${escapeHtml(match.competition)}</span>`
                    : ""
                }
              </li>
            `,
          )
          .join("")}
      </ul>
    </section>
  `;
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
      `,
    )
    .join("");

  const gamesHtml = (model.games ?? []).map((game) => renderMiniGameCard(game)).join("");

  const standingsHtml = model.standings
    ? `
      <section class="sports-slot__pane sports-slot__pane--standings">
        <h4 class="sports-slot__section-label">${escapeHtml(model.standings.title)}</h4>
        <div class="sports-slot__table">
          <div class="sports-slot__table-row sports-slot__table-row--head">
            <span>#</span>
            <span>${t("team")}</span>
            <span>${t("playedAbbr")}</span>
            <span>${t("goalDiffAbbr")}</span>
            <span>${t("pointsAbbr")}</span>
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
              `,
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const groupTablesHtml = (model.groupTables ?? []).length
    ? `
      <section class="sports-slot__pane sports-slot__pane--groups">
        <h4 class="sports-slot__section-label">${escapeHtml(
          model.groupTablesTitle || "Group stage",
        )}</h4>
        <div class="sports-slot__group-grid ${
          model.sport === "soccer" ? "sports-slot__group-grid--wide" : ""
        }">
          ${model.groupTables
            .map((group) =>
              model.sport === "soccer"
                ? renderSoccerGroupCard(group)
                : `
                <article class="sports-slot__group-card">
                  <div class="sports-slot__group-card-head">
                    <strong>${escapeHtml(group.title)}</strong>
                    ${
                      group.subtitle
                        ? `<span>${escapeHtml(group.subtitle)}</span>`
                        : ""
                    }
                  </div>
                  <div class="sports-slot__group-table">
                    <div class="sports-slot__group-row sports-slot__group-row--head">
                      <span>${t("team")}</span>
                      <span>${renderAbbr(t("playedAbbr"), t("abbrGp"))}</span>
                      <span>${renderAbbr(t("goalDiffAbbr"), t("abbrGd"))}</span>
                      <span>${renderAbbr(t("pointsAbbr"), t("abbrPts"))}</span>
                    </div>
                    ${group.rows
                      .map(
                        (row) => `
                          <div class="sports-slot__group-row ${
                            row.highlight
                              ? "sports-slot__group-row--highlight"
                              : ""
                          }">
                            <span>${escapeHtml(row.team)}</span>
                            <span>${escapeHtml(row.played)}</span>
                            <span>${escapeHtml(row.goalDiff)}</span>
                            <span>${escapeHtml(row.points)}</span>
                          </div>
                        `,
                      )
                      .join("")}
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const teamStatsHtml = (model.teamStats ?? []).length
    ? `
      <section class="sports-slot__pane sports-slot__pane--stats">
        <h4 class="sports-slot__section-label">${escapeHtml(
          model.teamStatsTitle || "Match stats",
        )}</h4>
        <div class="sports-slot__stats-list">
          ${model.teamStats
            .map(
              (stat) => `
                <div class="sports-slot__stat-row">
                  <strong>${escapeHtml(stat.home ?? "")}</strong>
                  <span>${escapeHtml(stat.label)}</span>
                  <strong>${escapeHtml(stat.away ?? "")}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const bracketHtml = (model.bracket ?? []).length
    ? `
      <section class="sports-slot__pane sports-slot__pane--bracket">
        <h4 class="sports-slot__section-label">${escapeHtml(
          model.bracketTitle || "Round of 32 path",
        )}</h4>
        <div class="sports-slot__bracket-grid">
          ${model.bracket
            .map(
              (match) => `
                <article class="sports-slot__bracket-match">
                  <span>${escapeHtml(match.id)}</span>
                  <strong>${escapeHtml(match.home)}</strong>
                  <em>vs</em>
                  <strong>${escapeHtml(match.away)}</strong>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const scoreboardHtml = renderFocusScoreboard(model.focusGame, model.sport);
  const gamesSectionHtml = gamesHtml
    ? `
      <section class="sports-slot__pane sports-slot__pane--games">
        <h4 class="sports-slot__section-label">${escapeHtml(
          model.gamesTitle || t("recentAndNext"),
        )}</h4>
        <div class="sports-slot__mini-games sports-slot__mini-games--grid">${gamesHtml}</div>
      </section>
    `
    : "";
  const secondaryHtml =
    gamesSectionHtml + standingsHtml + teamStatsHtml + groupTablesHtml + bracketHtml;
  const splitClass =
    scoreboardHtml && secondaryHtml
      ? "sports-slot__split sports-slot__split--active"
      : "sports-slot__split";

  return `
    <div
      ${renderSlotRootAttrs(model)}
    >
      ${renderToolbar(model)}
      <div class="sports-slot__body">
        <div class="${splitClass}">
          ${
            scoreboardHtml || factsHtml
              ? `<div class="sports-slot__split-pane sports-slot__split-pane--primary">
                  ${scoreboardHtml}
                  ${factsHtml ? `<section class="sports-slot__facts">${factsHtml}</section>` : ""}
                </div>`
              : ""
          }
          ${
            secondaryHtml
              ? `<div class="sports-slot__split-pane sports-slot__split-pane--secondary">${secondaryHtml}</div>`
              : ""
          }
        </div>
      </div>
      ${model.footer ? `<div class="sports-slot__footer">${model.footer}</div>` : ""}
    </div>
  `;
}

function renderCommandWrapper(innerHtml) {
  return `<div class="command-result sports-slot-command">${innerHtml}</div>`;
}

function renderCommandUsage() {
  return renderCommandWrapper(`
    <div class="sports-slot sports-slot--nba">
      <div class="sports-slot__hero">
        <div class="sports-slot__hero-copy">
          <div class="sports-slot__eyebrow">${t("sportsResults")}</div>
          <h3 class="sports-slot__title">${t("usage")}</h3>
          <p class="sports-slot__subtitle">${t("usageDescription")}</p>
        </div>
      </div>
      <section class="sports-slot__section">
        <div class="sports-slot__mini-games">
          <div class="sports-slot__mini-game">
            <div class="sports-slot__mini-game-score"><span>${t("example")}</span><strong>!sports arsenal vs chelsea</strong></div>
          </div>
          <div class="sports-slot__mini-game">
            <div class="sports-slot__mini-game-score"><span>${t("example")}</span><strong>!sports chiefs schedule</strong></div>
          </div>
          <div class="sports-slot__mini-game">
            <div class="sports-slot__mini-game-score"><span>${t("example")}</span><strong>!sports premier league standings</strong></div>
          </div>
        </div>
      </section>
    </div>
  `);
}

function _footballDataHeaders() {
  return { "X-Auth-Token": footballDataApiKey, Accept: "application/json" };
}

function _apiFootballHeaders() {
  return { "x-apisports-key": apiFootballKey, Accept: "application/json" };
}

function _balldontlieHeaders() {
  return { Authorization: balldontlieApiKey, Accept: "application/json" };
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    return await pluginFetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function setRefreshCache(key, value) {
  refreshCache.delete(key);
  refreshCache.set(key, value);
  while (refreshCache.size > REFRESH_CACHE_MAX_ENTRIES) {
    refreshCache.delete(refreshCache.keys().next().value);
  }
}

async function getBalldontlieTeams(sport) {
  if (!balldontlieApiKey) {
    throw new Error("Missing BALLDONTLIE API key");
  }

  const cacheKey =
    sport === "nba" ? "nbaTeams" : sport === "nfl" ? "nflTeams" : "mlbTeams";
  if (cache[cacheKey]) return cache[cacheKey];

  const data = await fetchJson(`${BALLDONTLIE_BASE[sport]}/teams`, {
    headers: _balldontlieHeaders(),
  });

  cache[cacheKey] = Array.isArray(data?.data) ? data.data : [];
  return cache[cacheKey];
}

function findBalldontlieTeam(entity, teams) {
  return teams.find(
    (team) =>
      normalizeText(team.abbreviation) === normalizeText(entity.abbreviation) ||
      normalizeText(team.full_name || team.display_name || team.name) ===
        normalizeText(entity.canonicalName),
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
      headers: _balldontlieHeaders(),
    },
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
      headers: _footballDataHeaders(),
    },
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
      if (variant === normalizedAlias)
        score = Math.max(score, 200 + normalizedAlias.length);
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
      headers: _footballDataHeaders(),
    },
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
      headers: _footballDataHeaders(),
    },
  );

  return Array.isArray(data?.matches) ? data.matches : [];
}

async function fetchSoccerStandings(competitionCode) {
  const data = await fetchJson(
    `${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/standings`,
    {
      headers: _footballDataHeaders(),
    },
  );

  const total = Array.isArray(data?.standings)
    ? (data.standings.find((standing) => standing.type === "TOTAL") ??
      data.standings[0])
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
  const awayTeam =
    match?.awayTeam?.shortName || match?.awayTeam?.name || "Away";
  const homeTeam =
    match?.homeTeam?.shortName || match?.homeTeam?.name || "Home";
  const awayAbbr = match?.awayTeam?.tla || getFallbackAbbreviation(awayTeam);
  const homeAbbr = match?.homeTeam?.tla || getFallbackAbbreviation(homeTeam);

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
      SOCCER_COMPETITIONS.find((item) => item.code === match?.competition?.code)
        ?.name ||
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
    awayAbbr,
    homeAbbr,
    awayBrand: buildTeamBrand({
      sport: "soccer",
      abbreviation: awayAbbr,
      teamName: awayTeam,
      crestUrl: match?.awayTeam?.crest,
    }),
    homeBrand: buildTeamBrand({
      sport: "soccer",
      abbreviation: homeAbbr,
      teamName: homeTeam,
      crestUrl: match?.homeTeam?.crest,
    }),
    awayScore: score.away ?? "—",
    homeScore: score.home ?? "—",
    meta: metaBits.join(" • "),
    sortDate: utcDate ? utcDate.getTime() : 0,
    providerFixtureId: match?.id ? String(match.id) : "",
  };
}


function normalizeNbaGame(game) {
  const date = new Date(game?.datetime ?? game?.date);
  const status = String(game?.status ?? "");
  const scheduledStatus =
    formatCompactDateTime(date) ||
    formatMaybeTimestamp(game?.datetime) ||
    formatMaybeTimestamp(game?.date) ||
    formatMaybeTimestamp(status) ||
    "Scheduled";
  const scheduled =
    /\bET\b/i.test(status) ||
    status.toLowerCase() === "scheduled" ||
    isIsoLikeTimestamp(status) ||
    (game?.period ?? 0) === 0;
  const final = /^Final/i.test(status);
  const awayTeam =
    game?.visitor_team?.full_name || game?.visitor_team?.name || "Away";
  const homeTeam =
    game?.home_team?.full_name || game?.home_team?.name || "Home";
  const awayAbbr =
    game?.visitor_team?.abbreviation || getFallbackAbbreviation(awayTeam);
  const homeAbbr =
    game?.home_team?.abbreviation || getFallbackAbbreviation(homeTeam);
  const clockText =
    String(game?.time ?? "")
      .replace(/^Q\d+\s*/i, "")
      .trim() || "";
  const livePrefix =
    status && !/^live$/i.test(status) ? status : formatNbaPeriodLabel(game);
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
        ? scheduledStatus
        : state === "live"
          ? [livePrefix, clockText || "Live"].filter(Boolean).join(" • ")
          : state === "final"
            ? "Final"
            : "Postponed",
    liveStatusPrefix: livePrefix,
    liveClockSeconds: parseClockToSeconds(clockText),
    awayTeam,
    homeTeam,
    awayAbbr,
    homeAbbr,
    awayBrand: buildTeamBrand({
      sport: "nba",
      abbreviation: awayAbbr,
      teamName: awayTeam,
    }),
    homeBrand: buildTeamBrand({
      sport: "nba",
      abbreviation: homeAbbr,
      teamName: homeTeam,
    }),
    awayScore: game?.visitor_team_score ?? "—",
    homeScore: game?.home_team_score ?? "—",
    meta: [
      formatShortDate(date),
      game?.postseason ? "Postseason" : "Regular season",
    ]
      .filter(Boolean)
      .join(" • "),
    sortDate: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
  };
}

function normalizeNflGame(game) {
  const date = new Date(game?.date);
  const status = String(game?.status ?? "");
  const scheduledStatus =
    formatCompactDateTime(date) ||
    formatMaybeTimestamp(game?.date) ||
    formatMaybeTimestamp(status) ||
    "Scheduled";
  const warning = /postponed|suspended|cancelled/i.test(status);
  const final = /^Final/i.test(status);
  const scheduled =
    !warning &&
    !final &&
    (/scheduled/i.test(status) || date.getTime() > Date.now());
  const state = warning
    ? "warning"
    : final
      ? "final"
      : scheduled
        ? "scheduled"
        : "live";

  const awayTeam =
    game?.visitor_team?.full_name || game?.visitor_team?.name || "Away";
  const homeTeam =
    game?.home_team?.full_name || game?.home_team?.name || "Home";
  const awayAbbr =
    game?.visitor_team?.abbreviation || getFallbackAbbreviation(awayTeam);
  const homeAbbr =
    game?.home_team?.abbreviation || getFallbackAbbreviation(homeTeam);
  const clockText = String(game?.time ?? "").trim();
  const livePrefix = formatNflPeriodLabel(game);

  return {
    state,
    competitionLabel: game?.postseason
      ? "NFL Playoffs"
      : `NFL • Week ${game?.week ?? "?"}`,
    status:
      state === "warning"
        ? status || "Postponed"
        : state === "scheduled"
          ? scheduledStatus
          : state === "live"
            ? [livePrefix, clockText || status || "Live"]
                .filter(Boolean)
                .join(" • ")
            : "Final",
    liveStatusPrefix: livePrefix,
    liveClockSeconds: parseClockToSeconds(clockText),
    awayTeam,
    homeTeam,
    awayAbbr,
    homeAbbr,
    awayBrand: buildTeamBrand({
      sport: "nfl",
      abbreviation: awayAbbr,
      teamName: awayTeam,
    }),
    homeBrand: buildTeamBrand({
      sport: "nfl",
      abbreviation: homeAbbr,
      teamName: homeTeam,
    }),
    awayScore: game?.visitor_team_score ?? "—",
    homeScore: game?.home_team_score ?? "—",
    meta: [game?.venue, game?.summary].filter(Boolean).join(" • "),
    sortDate: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
  };
}

function normalizeMlbGame(game) {
  const date = new Date(game?.date ?? game?.datetime);
  const status = String(game?.status ?? "");
  const scheduledStatus =
    formatCompactDateTime(date) ||
    formatMaybeTimestamp(game?.datetime) ||
    formatMaybeTimestamp(game?.date) ||
    formatMaybeTimestamp(status) ||
    "Scheduled";
  const warning = /postponed|suspended|cancelled/i.test(status);
  const final = /^Final/i.test(status);
  const scheduled =
    !warning &&
    !final &&
    (status.toLowerCase() === "scheduled" ||
      isIsoLikeTimestamp(status) ||
      date.getTime() > Date.now());
  const awayTeam =
    game?.visitor_team?.full_name ||
    game?.visitor_team?.display_name ||
    game?.visitor_team?.name ||
    "Away";
  const homeTeam =
    game?.home_team?.full_name ||
    game?.home_team?.display_name ||
    game?.home_team?.name ||
    "Home";
  const awayAbbr =
    game?.visitor_team?.abbreviation || getFallbackAbbreviation(awayTeam);
  const homeAbbr =
    game?.home_team?.abbreviation || getFallbackAbbreviation(homeTeam);
  const inningText =
    String(
      game?.time ?? game?.inning_state ?? game?.inning_half ?? "",
    ).trim() || status;

  return {
    state: warning
      ? "warning"
      : final
        ? "final"
        : scheduled
          ? "scheduled"
          : "live",
    competitionLabel: game?.postseason ? "MLB Playoffs" : "MLB",
    status: warning
      ? status || "Postponed"
      : final
        ? "Final"
        : scheduled
          ? scheduledStatus
          : inningText || "Live",
    awayTeam,
    homeTeam,
    awayAbbr,
    homeAbbr,
    awayBrand: buildTeamBrand({
      sport: "mlb",
      abbreviation: awayAbbr,
      teamName: awayTeam,
    }),
    homeBrand: buildTeamBrand({
      sport: "mlb",
      abbreviation: homeAbbr,
      teamName: homeTeam,
    }),
    awayScore: game?.visitor_team_score ?? "—",
    homeScore: game?.home_team_score ?? "—",
    meta: [
      formatShortDate(date),
      game?.postseason ? "Postseason" : "Regular season",
    ]
      .filter(Boolean)
      .join(" • "),
    sortDate: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
  };
}

function pickFocusAndExtras(normalizedGames) {
  const sorted = [...normalizedGames].sort(
    (left, right) => left.sortDate - right.sortDate,
  );
  const live = sorted.filter((game) => game.state === "live");
  const upcoming = sorted.filter((game) => game.state === "scheduled");
  const recent = [...sorted]
    .filter((game) => game.state === "final")
    .sort((left, right) => right.sortDate - left.sortDate);
  const nextUpcoming = upcoming[0] ?? null;
  const showRecent =
    !nextUpcoming ||
    nextUpcoming.sortDate - Date.now() > UPCOMING_ONLY_WINDOW_MS;

  const focus = live[0] ?? upcoming[0] ?? recent[0] ?? null;
  const extras = [];
  const extraCandidates = [
    ...live.slice(1),
    ...upcoming.slice(0, 2),
    ...(showRecent ? recent.slice(0, 2) : []),
  ];

  for (const game of extraCandidates) {
    if (
      focus &&
      game.sortDate === focus.sortDate &&
      game.homeTeam === focus.homeTeam
    ) {
      continue;
    }

    extras.push({
      label:
        game.state === "live"
          ? "Live"
          : game.state === "scheduled"
            ? "Next"
            : "Recent",
      matchup: `${game.homeTeam} vs ${game.awayTeam}`,
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      awayAbbr: game.awayAbbr,
      homeAbbr: game.homeAbbr,
      awayBrand: game.awayBrand,
      homeBrand: game.homeBrand,
      score:
        game.state === "scheduled"
          ? ""
          : `${game.homeScore} - ${game.awayScore}`,
      status:
        game.state === "scheduled" ? game.status : game.competitionLabel,
      state: game.state,
      meta: game.meta,
    });
  }

  const hasLiveExtras = extras.some((game) => game.state === "live");
  const gamesTitle = showRecent
    ? "Recent + next"
    : hasLiveExtras
      ? "Live + upcoming"
      : "Upcoming";

  return { focus, extras: extras.slice(0, 4), gamesTitle };
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
            normalizeSoccerName(highlightTeamName),
      )
    : null;

  if (highlightedOutsideTop && !rows.some((row) => row.highlight)) {
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

function t(key) {
  const resolved = lookupLocaleString(key);
  if (resolved) return resolved;
  return FALLBACK_STRINGS[key] || key;
}

async function handleSoccerQuery(parsedQuery, context) {
  let parsed = { ...parsedQuery };
  if (parsed.kind === "worldCup") {
    parsed.kind = "competition";
    parsed.competition = parsed.competition || getWorldCupCompetition();
  } else if (parsed.kind === "worldCupTeam") {
    parsed.kind = "team";
  } else if (parsed.kind === "worldCupMatchup") {
    parsed.kind = "matchup";
  }

  if (!footballDataApiKey) {
    return renderSetupCard(
      "soccer",
      t("setupSoccer"),
      t("addApiKeySoccer"),
      "soccer",
    );
  }

  if (parsed.kind === "competition") {
    if (parsed.intent === "standings") {
      const standings = await fetchSoccerStandings(parsed.competition.code);
      if (!standings.length) {
        return renderEmptyCard(
          "soccer",
          parsed.competition.name,
          t("noStandings"),
        );
      }

      return renderCard({
        sport: "soccer",
        provider: "football-data",
        query: parsed.query,
        eyebrow: t("sportsResults"),
        badge: t("standings"),
        badgeTone: "scheduled",
        title: parsed.competition.name,
        subtitle: t("standings"),
        standings: buildStandingsModel(parsed.competition.name, standings),
        footer: renderProviderFooter(
          "football-data.org",
          "https://www.football-data.org/",
        ),
      });
    }

    const now = new Date();
    const matches = await fetchSoccerCompetitionMatches(
      parsed.competition.code,
      {
        dateFrom: formatDate(addDays(now, -1)),
        dateTo: formatDate(addDays(now, 5)),
      },
    );
    const normalizedGames = matches.map(normalizeSoccerMatch);
    const { focus, extras, gamesTitle } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        "soccer",
        parsed.competition.name,
        t("noFixtures"),
      );
    }

    return renderCard({
      sport: "soccer",
      provider: "football-data",
      query: parsed.query,
      eyebrow: t("sportsResults"),
      badge:
        focus.state === "live"
          ? t("live")
          : focus.state === "scheduled"
            ? t("upcoming")
            : t("final"),
      badgeTone: toStatusTone(focus.state),
      title: parsed.competition.name,
      subtitle: focus.meta,
      focusGame: focus,
      games: extras,
      gamesTitle,
      footer: renderProviderFooter(
        "football-data.org",
        "https://www.football-data.org/",
      ),
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
        t("clubNotFound"),
        t("ambiguousTeamHint"),
      );
    }

    const now = new Date();
    const matches = await fetchSoccerTeamMatches(apiTeam.id, {
      dateFrom: formatDate(addDays(now, -14)),
      dateTo: formatDate(addDays(now, 14)),
      limit: 8,
    });
    const normalizedGames = matches.map(normalizeSoccerMatch);
    const { focus, extras, gamesTitle } = pickFocusAndExtras(normalizedGames);
    const facts = [
      { label: t("team"), value: apiTeam.shortName || apiTeam.name },
      {
        label: t("league"),
        value: parsed.competition?.name || apiTeam.area?.name || t("soccerSport"),
      },
      { label: t("venue"), value: apiTeam.venue || "" },
    ];

    let standingsModel = null;
    if (parsed.intent === "standings" || parsed.intent === "score") {
      const standings = await fetchSoccerStandings(competitionCode);
      if (standings.length) {
        standingsModel = buildStandingsModel(
          parsed.competition?.name || "League",
          standings,
          apiTeam.name,
        );
      }
    }

    if (!focus) {
      return renderEmptyCard(
        "soccer",
        apiTeam.shortName || apiTeam.name,
        t("noRecentMatches"),
      );
    }

    return renderCard({
      sport: "soccer",
      provider: "football-data",
      query: parsed.query,
      eyebrow: t("sportsResults"),
      badge:
        focus.state === "live"
          ? t("live")
          : focus.state === "scheduled"
            ? t("nextMatch")
            : t("latestResult"),
      badgeTone: toStatusTone(focus.state),
      title: apiTeam.shortName || apiTeam.name,
      subtitle: parsed.competition?.name || apiTeam.area?.name || t("soccerSport"),
      focusGame: focus,
      facts,
      games: extras,
      gamesTitle,
      standings: standingsModel,
      footer: renderProviderFooter(
        "football-data.org",
        "https://www.football-data.org/",
      ),
    });
  }

  if (parsed.kind === "matchup") {
    const leftTeam = findSoccerTeam(parsed.left, teams);
    const rightTeam = findSoccerTeam(parsed.right, teams);

    if (!leftTeam || !rightTeam) {
      return renderEmptyCard(
        "soccer",
        `${parsed.left.canonicalName} vs ${parsed.right.canonicalName}`,
        t("clubNotFoundInSameComp"),
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
        t("noMeetingFound"),
      );
    }

    const normalized = normalizeSoccerMatch(headToHead);
    return renderCard({
      sport: "soccer",
      provider: "football-data",
      query: parsed.query,
      eyebrow: t("sportsResults"),
      badge:
        normalized.state === "live"
          ? t("live")
          : normalized.state === "scheduled"
            ? t("upcoming")
            : t("latestMeeting"),
      badgeTone: toStatusTone(normalized.state),
      title: `${leftTeam.shortName || leftTeam.name} vs ${
        rightTeam.shortName || rightTeam.name
      }`,
      subtitle:
        parsed.competition?.name || headToHead?.competition?.name || t("soccerSport"),
      focusGame: normalized,
      facts: [
        {
          label: t("competition"),
          value:
            headToHead?.competition?.name || parsed.competition?.name || "",
        },
        { label: t("stage"), value: headToHead?.stage || "" },
        { label: t("venue"), value: headToHead?.venue || "" },
      ],
      footer: renderProviderFooter(
        "football-data.org",
        "https://www.football-data.org/",
      ),
    });
  }

  return renderEmptyCard(
    "soccer",
    "Soccer",
    t("queryUnsupported"),
  );
}

async function handleBalldontlieTeamOrLeagueQuery(parsed, sport, context) {
  if (!balldontlieApiKey) {
    return renderSetupCard(
      "balldontlie",
      `${getSportDisplayName(sport)} ${t("setupBalldontlie")}`,
      t("addApiKeyBalldontlie"),
      sport,
    );
  }

  if (parsed.intent === "standings") {
    return renderUnsupportedCard(
      sport,
      `${getSportDisplayName(sport)} ${t("standings")}`,
      t("standingsUnsupportedBalldontlie"),
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
        : sport === "mlb"
          ? {
              dates: [0, 1, 2, 3].map((offset) =>
                formatDate(addDays(now, offset)),
              ),
              per_page: 50,
            }
          : {
              dates: [0, 1, 2, 3].map((offset) =>
                formatDate(addDays(now, offset)),
              ),
              per_page: 50,
            };

    const games = await fetchBalldontlieGames(sport, params);
    const normalizeGame =
      sport === "nba"
        ? normalizeNbaGame
        : sport === "nfl"
          ? normalizeNflGame
          : normalizeMlbGame;
    const normalizedGames = games.map(normalizeGame);
    const { focus, extras, gamesTitle } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        sport,
        getSportDisplayName(sport),
        t("noRecentGames"),
      );
    }

    return renderCard({
      sport,
      provider: "balldontlie",
      query: parsed.query,
      refreshable: true,
      refreshMinIntervalMs: BALLDONTLIE_FREE_REFRESH_MS,
      eyebrow: t("sportsResults"),
      badge:
        focus.state === "live"
          ? t("live")
          : focus.state === "scheduled"
            ? t("tonight")
            : t("final"),
      badgeTone: toStatusTone(focus.state),
      title: `${getSportDisplayName(sport)} scoreboard`,
      subtitle: focus.meta,
      focusGame: focus,
      games: extras,
      gamesTitle,
      footer: renderProviderFooter(
        "BALLDONTLIE",
        "https://www.balldontlie.io/docs",
      ),
    });
  }

  if (parsed.kind === "team") {
    const apiTeam = findBalldontlieTeam(parsed.team, teams);
      if (!apiTeam) {
        return renderEmptyCard(
          sport,
          parsed.team.canonicalName,
          t("teamNotFound"),
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
        : sport === "mlb"
          ? {
              team_ids: [apiTeam.id],
              dates: Array.from({ length: 21 }, (_, index) =>
                formatDate(addDays(now, index - 7)),
              ),
              per_page: 50,
            }
          : {
              team_ids: [apiTeam.id],
              dates: Array.from({ length: 21 }, (_, index) =>
                formatDate(addDays(now, index - 7)),
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

    const normalizeGame =
      sport === "nba"
        ? normalizeNbaGame
        : sport === "nfl"
          ? normalizeNflGame
          : normalizeMlbGame;
    const normalizedGames = games.map(normalizeGame);
    const { focus, extras, gamesTitle } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        sport,
        apiTeam.full_name || apiTeam.display_name || apiTeam.name,
        t("noRecentGamesInLookup"),
      );
    }

    return renderCard({
      sport,
      provider: "balldontlie",
      query: parsed.query,
      refreshable: true,
      refreshMinIntervalMs: BALLDONTLIE_FREE_REFRESH_MS,
      eyebrow: t("sportsResults"),
      badge:
        focus.state === "live"
          ? t("live")
          : focus.state === "scheduled"
            ? t("nextGame")
            : t("latestResult"),
      badgeTone: toStatusTone(focus.state),
      title: apiTeam.full_name || apiTeam.display_name || apiTeam.name,
      subtitle: `${getSportDisplayName(sport)} team`,
      focusGame: focus,
      facts: [
        {
          label: t("conference"),
          value: apiTeam.conference || apiTeam.league || "",
        },
        {
          label: t("division"),
          value: apiTeam.division || apiTeam.league_abbreviation || "",
        },
      ],
      games: extras,
      gamesTitle,
      footer: renderProviderFooter(
        "BALLDONTLIE",
        "https://www.balldontlie.io/docs",
      ),
    });
  }

  if (parsed.kind === "matchup") {
    const leftTeam = findBalldontlieTeam(parsed.left, teams);
    const rightTeam = findBalldontlieTeam(parsed.right, teams);

    if (!leftTeam || !rightTeam) {
      return renderEmptyCard(
        sport,
        `${parsed.left.canonicalName} vs ${parsed.right.canonicalName}`,
        t("teamNotFoundInResponse"),
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
        : sport === "mlb"
          ? {
              team_ids: [leftTeam.id, rightTeam.id],
              dates: Array.from({ length: 120 }, (_, index) =>
                formatDate(addDays(now, index - 60)),
              ),
              per_page: 100,
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

    const normalizeGame =
      sport === "nba"
        ? normalizeNbaGame
        : sport === "nfl"
          ? normalizeNflGame
          : normalizeMlbGame;
    const normalizedGames = directGames.map(normalizeGame);
    const { focus, extras, gamesTitle } = pickFocusAndExtras(normalizedGames);

    if (!focus) {
      return renderEmptyCard(
        sport,
        `${leftTeam.full_name || leftTeam.display_name || leftTeam.name} vs ${
          rightTeam.full_name || rightTeam.display_name || rightTeam.name
        }`,
        t("noMeetingFoundShort"),
      );
    }

    return renderCard({
      sport,
      provider: "balldontlie",
      query: parsed.query,
      refreshable: true,
      refreshMinIntervalMs: BALLDONTLIE_FREE_REFRESH_MS,
      eyebrow: t("sportsResults"),
      badge:
        focus.state === "live"
          ? t("live")
          : focus.state === "scheduled"
            ? t("upcoming")
            : t("latestMeeting"),
      badgeTone: toStatusTone(focus.state),
      title: `${leftTeam.full_name || leftTeam.display_name || leftTeam.name} vs ${
        rightTeam.full_name || rightTeam.display_name || rightTeam.name
      }`,
      subtitle: `${getSportDisplayName(sport)} matchup`,
      focusGame: focus,
      games: extras,
      gamesTitle,
      footer: renderProviderFooter(
        "BALLDONTLIE",
        "https://www.balldontlie.io/docs",
      ),
    });
  }

  return renderEmptyCard(
    sport,
    sport === "nba" ? "Basketball" : sport === "nfl" ? "Football" : "Baseball",
    t("queryUnsupported"),
  );
}

const sharedSettingsSchema = [
  {
    key: "useEspnApi",
    label: "Use ESPN API (Recommended)",
    type: "toggle",
    default: true,
    description: "Use ESPN's zero-setup API for scores, standings, schedules, and brackets. No API keys required.",
  },
  {
    key: "footballDataApiKey",
    label: "football-data.org API key",
    type: "password",
    secret: true,
    description:
      "Used as backup for soccer clubs, fixtures, and standings. Free keys are available at football-data.org.",
  },
  {
    key: "balldontlieApiKey",
    label: "BALLDONTLIE API key",
    type: "password",
    secret: true,
    description:
      "Used as backup for NFL, NBA, and MLB results. Free accounts are available at app.balldontlie.io.",
  },
  {
    key: "apiFootballKey",
    label: "API-Football key",
    type: "password",
    secret: true,
    description:
      "Used as backup for soccer fixtures and standings. API keys are available at api-sports.io.",
  },
  {
    key: "theSportsDbApiKey",
    label: "TheSportsDB API key",
    type: "password",
    secret: true,
    default: "3",
    description:
      "Used as backup for general sports scores. Defaults to the public free key (3).",
  },
  {
    key: "soccerCompetitions",
    label: "Preferred soccer competitions",
    type: "text",
    default: DEFAULT_SOCCER_COMPETITIONS.join(","),
    description:
      "Comma-separated football-data.org competition codes to search first for generic soccer queries (defaults: PL,PD,CL,BL1,SA,FL1).",
  },
  {
    key: "debugMode",
    label: "Debug mode",
    type: "toggle",
    default: false,
    description:
      "Show the sports plugin version next to the data source footer for troubleshooting updates.",
  },
];

function configureSharedSettings(settings = {}) {
  useEspnApi = settings.useEspnApi !== false;
  footballDataApiKey = String(settings.footballDataApiKey ?? "").trim();
  balldontlieApiKey = String(settings.balldontlieApiKey ?? "").trim();
  apiFootballKey = String(settings.apiFootballKey ?? "").trim();
  theSportsDbApiKey = String(settings.theSportsDbApiKey ?? "3").trim();
  preferredSoccerCompetitions = parseConfiguredCompetitions(
    settings.soccerCompetitions,
  );
  debugMode = Boolean(settings.debugMode);
}

const ESPN_SOCCER_LEAGUES = {
  WC: "fifa.world",
  PL: "eng.1",
  PD: "esp.1",
  BL1: "ger.1",
  SA: "ita.1",
  FL1: "fra.1",
  CL: "uefa.champions",
};

function getEspnSportAndLeague(parsed) {
  if (parsed.sport === "soccer") {
    const code = parsed.competition?.code || parsed.team?.competitionCode || parsed.left?.competitionCode || "WC";
    const league = ESPN_SOCCER_LEAGUES[code] || "fifa.world";
    return { sport: "soccer", league };
  }
  if (parsed.sport === "nba") return { sport: "basketball", league: "nba" };
  if (parsed.sport === "nfl") return { sport: "football", league: "nfl" };
  if (parsed.sport === "mlb") return { sport: "baseball", league: "mlb" };
  return null;
}

async function fetchEspnScoreboard(sport, league, dates = null) {
  let url = `${API_FOOTBALL_BASE.replace("v3.football.api-sports.io", "site.api.espn.com/apis/site/v2")}/sports/${sport}/${league}/scoreboard`;
  // Wait, API_FOOTBALL_BASE has api-sports.io, let's just use the direct URL:
  url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
  if (dates) {
    url += `?dates=${encodeURIComponent(dates)}&limit=200`;
  }
  return fetchJson(url);
}

async function fetchEspnStandings(sport, league) {
  const url = `https://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings`;
  return fetchJson(url);
}

async function fetchEspnTeamSchedule(sport, league, teamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/schedule`;
  return fetchJson(url);
}

async function fetchEspnSummary(sport, league, eventId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${eventId}`;
  return fetchJson(url);
}

function extractSoccerGoals(summaryData, awayTeamId, homeTeamId) {
  const goals = { away: [], home: [] };
  if (!summaryData?.keyEvents) return goals;

  const scoringEvents = summaryData.keyEvents.filter(
    (e) => e.scoringPlay || e.type?.type?.toLowerCase().includes("goal")
  );

  for (const e of scoringEvents) {
    const time = e.clock?.displayValue || "";
    const athleteName = e.participants?.[0]?.athlete?.displayName;
    if (!athleteName) continue;

    const typeText = e.type?.text || "";
    let suffix = "";
    if (typeText.toLowerCase().includes("penalty")) {
      suffix = " (pen)";
    } else if (typeText.toLowerCase().includes("own goal") || typeText.toLowerCase().includes("og")) {
      suffix = " (OG)";
    }

    const goalStr = `${athleteName} ${time}${suffix}`;
    const scoringTeamId = String(e.team?.id || "");
    if (scoringTeamId === String(awayTeamId)) {
      goals.away.push(goalStr);
    } else if (scoringTeamId === String(homeTeamId)) {
      goals.home.push(goalStr);
    }
  }

  return goals;
}

const ESPN_SOCCER_BOX_SCORE_STATS = [
  { name: "possessionPct", label: "Possession" },
  { name: "totalShots", label: "Shots" },
  { name: "shotsOnTarget", label: "Shots on goal" },
  { name: "wonCorners", label: "Corner kicks" },
  { name: "totalPasses", label: "Total passes" },
  { name: "passPct", label: "Passing accuracy" },
  { name: "offsides", label: "Offsides" },
  { name: "foulsCommitted", label: "Fouls" },
  { name: "yellowCards", label: "Yellow cards" },
  { name: "redCards", label: "Red cards" },
  { name: "shotPct", label: "Shot accuracy" },
  { name: "saves", label: "Saves" },
  { name: "accuratePasses", label: "Accurate passes" },
  { name: "blockedShots", label: "Blocked shots" },
  { name: "totalCrosses", label: "Crosses" },
  { name: "accurateCrosses", label: "Accurate crosses" },
  { name: "totalLongBalls", label: "Long balls" },
  { name: "accurateLongBalls", label: "Accurate long balls" },
  { name: "effectiveTackles", label: "Tackles won" },
  { name: "totalTackles", label: "Total tackles" },
  { name: "interceptions", label: "Interceptions" },
  { name: "effectiveClearance", label: "Clearances" },
  { name: "penaltyKickGoals", label: "Penalty goals" },
];

const ESPN_DEFAULT_BOX_SCORE_STATS = [
  { name: "possessionPct", label: "Possession" },
  { name: "totalShots", label: "Shots" },
  { name: "shotsOnTarget", label: "Shots on goal" },
  { name: "wonCorners", label: "Corner kicks" },
  { name: "totalPasses", label: "Total passes" },
  { name: "passPct", label: "Passing accuracy" },
  { name: "offsides", label: "Offsides" },
  { name: "foulsCommitted", label: "Fouls" },
  { name: "yellowCards", label: "Yellow cards" },
  { name: "redCards", label: "Red cards" },
];

function extractMatchTimeline(summaryData, sport = "soccer") {
  if (sport === "soccer" && summaryData?.commentary?.length) {
    return parseSoccerCommentaryTimeline(
      summaryData.commentary,
      summaryData.keyEvents,
    );
  }

  const skipTypes = new Set(["Kickoff", "Start Delay", "End Delay"]);
  const periodTypes = new Set([
    "Halftime",
    "Start 2nd Half",
    "End Regular Time",
    "End Extra Time",
    "Penalty Shootout",
  ]);

  return (summaryData?.keyEvents || [])
    .filter((event) => !skipTypes.has(event.type?.text || ""))
    .map((event) => {
      const type = event.type?.text || "Event";
      const isPeriod = periodTypes.has(type);
      return {
        id: event.id,
        minute: event.clock?.displayValue || "",
        type,
        team:
          event.team?.abbreviation ||
          event.team?.displayName ||
          parseCommentaryEventTeam(event.text || event.shortText || "") ||
          "",
        athlete: event.participants?.[0]?.athlete?.displayName || "",
        assist: event.participants?.[1]?.athlete?.displayName || "",
        text: event.shortText || event.text || type,
        detail: event.text || "",
        scoring: Boolean(event.scoringPlay),
        redCard: Boolean(event.redCard) || /red card/i.test(type),
        yellowCard: /yellow card/i.test(type),
        substitution: /substitution/i.test(type),
        isPeriod,
        isPlay: false,
      };
    });
}

const PITCH_ROW_Y = {
  home: { defensive: 95, attacking: 52 },
  away: { defensive: 5, attacking: 48 },
};

function normalizeHomeAway(value = "") {
  return String(value).trim().toLowerCase() === "away" ? "away" : "home";
}

function isDefenderPosition(position = "") {
  const pos = String(position).toUpperCase();
  return /^(LB|RB|LWB|RWB|CB|CD)/.test(pos) || /CD-[LR]|LCB|RCB/.test(pos);
}

function isMidfieldPosition(position = "") {
  const pos = String(position).toUpperCase();
  return /^(CM|CDM|DM|AM|RM|LM|CAM)/.test(pos) || /CM-[LR]|DM-[LR]|AM-[LR]/.test(pos);
}

function isForwardPosition(position = "") {
  const pos = String(position).toUpperCase();
  return /^(CF|ST|FW|LF|RF|SS)/.test(pos) || /CF-[LR]|LF|RF/.test(pos);
}

function getHorizontalBias(position = "") {
  const pos = String(position || "").toUpperCase();
  if (/(^|[^A-Z])(LWB|LB|LCB|CD-L|LM|LW|LF)([^A-Z]|$)/.test(pos) || pos.endsWith("-L")) {
    return 0;
  }
  if (/(^|[^A-Z])(RWB|RB|RCB|CD-R|RM|RW|RF)([^A-Z]|$)/.test(pos) || pos.endsWith("-R")) {
    return 1;
  }
  return 0.5;
}

function layoutRowX(rowPlayers = [], margin = 12) {
  if (!rowPlayers.length) return [];

  const sorted = [...rowPlayers].sort(
    (left, right) =>
      getHorizontalBias(left.position) - getHorizontalBias(right.position) ||
      Number(left.place) - Number(right.place),
  );

  return sorted.map((player, index) => ({
    place: player.place,
    x: getEvenRowX(index, sorted.length, margin),
  }));
}

function parseFormationLines(formation = "") {
  return String(formation)
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((count) => Number.isFinite(count) && count > 0);
}

function classifyPlayerBand(position = "") {
  const pos = String(position || "").toUpperCase();
  if (/^G/.test(pos) || pos === "GK") return "gk";
  if (isDefenderPosition(pos)) return "def";
  if (isForwardPosition(pos)) return "fwd";
  if (/^(RW|LW|RM|LM)\b/.test(pos)) return "mid";
  if (isMidfieldPosition(pos)) return "mid";
  return "mid";
}

function getEvenRowX(index = 0, count = 1, margin = 12) {
  if (count <= 1) return 50;
  return margin + (index / (count - 1)) * (100 - margin * 2);
}

function getFormationRowY(rowIndex = 0, rowCount = 1, homeAway = "home") {
  const side = normalizeHomeAway(homeAway);
  const bounds = PITCH_ROW_Y[side];

  if (rowCount <= 1) return bounds.defensive;

  const depth = rowIndex / (rowCount - 1);
  return bounds.defensive + depth * (bounds.attacking - bounds.defensive);
}

function assignPlayersToFormationRows(starters = [], formation = "") {
  const lines = parseFormationLines(formation);
  if (!lines.length) return [[1]];

  const outfield = starters
    .filter((player) => Number(player.formationPlace) !== 1)
    .map((player) => ({
      place: Number(player.formationPlace),
      position: String(player.position || ""),
      band: classifyPlayerBand(player.position),
      bias: getHorizontalBias(player.position),
    }))
    .sort((left, right) => left.place - right.place);

  const lineRows = lines.map(() => []);
  let remaining = [...outfield];

  const takeMatching = (rowIndex, predicate) => {
    const capacity = lines[rowIndex];
    while (lineRows[rowIndex].length < capacity && remaining.length) {
      const matchIndex = remaining.findIndex(predicate);
      if (matchIndex === -1) break;
      lineRows[rowIndex].push(remaining.splice(matchIndex, 1)[0]);
    }
  };

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex += 1) {
    if (rowIndex === 0) {
      if (lines[0] === 3) {
        takeMatching(
          rowIndex,
          (player) =>
            player.band === "def" && !/^(RB|RWB)\b/i.test(player.position),
        );
      }
      takeMatching(rowIndex, (player) => player.band === "def");
    } else if (rowIndex === lines.length - 1) {
      takeMatching(rowIndex, (player) => player.band === "fwd");
    } else if (lines[0] === 3 && lines[1] === 4 && lines[2] === 3 && rowIndex === 1) {
      takeMatching(
        rowIndex,
        (player) => /^(RB|LB|RWB|LWB)\b/i.test(player.position),
      );
      takeMatching(rowIndex, (player) => player.band === "mid");
      takeMatching(
        rowIndex,
        (player) => /^(RB|LB|RWB|LWB)\b/i.test(player.position),
      );
    } else if (lines[rowIndex] === 1) {
      takeMatching(rowIndex, (player) => /^(CDM|DM)\b/i.test(player.position));
      takeMatching(rowIndex, (player) => player.band === "mid");
    } else {
      takeMatching(rowIndex, (player) => player.band === "mid");
    }
  }

  remaining.sort((left, right) => left.place - right.place);
  for (let rowIndex = 0; rowIndex < lines.length; rowIndex += 1) {
    while (lineRows[rowIndex].length < lines[rowIndex] && remaining.length) {
      lineRows[rowIndex].push(remaining.shift());
    }
  }

  const rows = [[1]];
  for (const row of lineRows) {
    row.sort((left, right) => left.bias - right.bias || left.place - right.place);
    rows.push(row.map((player) => player.place));
  }

  return rows;
}

function scorePlayerRowFit(position = "", rowBand = "") {
  const pos = String(position || "");
  if (rowBand === "gk") return 10;
  if (rowBand === "def") {
    if (isDefenderPosition(pos)) return 10;
    if (isMidfieldPosition(pos)) return 5;
    return 0;
  }
  if (rowBand === "mid") {
    if (isMidfieldPosition(pos)) return 10;
    if (isDefenderPosition(pos)) return 4;
    if (isForwardPosition(pos)) return 5;
    return 0;
  }
  if (rowBand === "fwd") {
    if (isForwardPosition(pos)) return 10;
    if (/^(RM|LM|RW|LW)$/.test(pos)) return 10;
    if (isMidfieldPosition(pos)) return 7;
    return 0;
  }
  return 0;
}

function scoreFormationLayout(starters = [], rows = []) {
  if (!rows?.length) return -Infinity;

  const byPlace = new Map(
    starters.map((player) => [Number(player.formationPlace), player]),
  );
  let total = 0;
  const lastRow = rows.length - 1;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const band =
      rowIndex === 0
        ? "gk"
        : rowIndex === 1
          ? "def"
          : rowIndex === lastRow
            ? "fwd"
            : "mid";

    for (const place of rows[rowIndex]) {
      const player = byPlace.get(Number(place));
      if (!player) continue;
      total += scorePlayerRowFit(player.position, band);
    }
  }

  const place4 = byPlace.get(4);
  if (
    place4 &&
    isMidfieldPosition(place4.position) &&
    !isDefenderPosition(place4.position) &&
    rows[1]?.includes(4)
  ) {
    total -= 25;
  }

  return total;
}

function isMidfieldAtPlace4(starters = []) {
  const place4 = starters.find((player) => Number(player.formationPlace) === 4);
  if (!place4) return false;
  return (
    isMidfieldPosition(place4.position) && !isDefenderPosition(place4.position)
  );
}

function resolveEffectiveFormation(starters = [], espnFormation = "", homeAway = "") {
  const key = String(espnFormation).replace(/\s/g, "") || "4-4-2";
  const candidateFormations = [key];

  if (key === "4-4-2" && isMidfieldAtPlace4(starters)) {
    candidateFormations.push("3-4-3");
  }

  const scored = candidateFormations
    .map((formation) => {
      const rows = assignPlayersToFormationRows(starters, formation);
      return {
        formation,
        layoutKey: formation,
        rows,
        score: scoreFormationLayout(starters, rows),
      };
    })
    .filter((candidate) => candidate.rows?.length);

  if (
    key === "4-4-2" &&
    isMidfieldAtPlace4(starters) &&
    normalizeHomeAway(homeAway) === "away"
  ) {
    const mislabeled = scored.find((candidate) => candidate.formation === "3-4-3");
    if (mislabeled) return mislabeled;
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;

    if (isMidfieldAtPlace4(starters)) {
      if (left.formation === "3-4-3" && right.formation === "4-4-2") return -1;
      if (right.formation === "3-4-3" && left.formation === "4-4-2") return 1;
    }

    if (left.formation === "3-4-3" && homeAway === "away" && right.formation === "4-4-2") {
      return -1;
    }
    if (right.formation === "3-4-3" && homeAway === "away" && left.formation === "4-4-2") {
      return 1;
    }
    if (left.formation === "4-4-2" && homeAway === "home" && right.formation === "3-4-3") {
      return -1;
    }
    if (right.formation === "4-4-2" && homeAway === "home" && left.formation === "3-4-3") {
      return 1;
    }

    return 0;
  });

  return (
    scored[0] || {
      formation: key,
      layoutKey: key,
      rows: assignPlayersToFormationRows(starters, key),
    }
  );
}

function getFormationRows(formation = "", starters = null) {
  const lines = parseFormationLines(formation);
  if (!lines.length) return null;

  if (starters?.length) {
    return assignPlayersToFormationRows(starters, formation);
  }

  return [[1], ...lines.map((count) => Array.from({ length: count }, () => null))];
}

function layoutPitchPlayers(
  starters = [],
  formation = "",
  homeAway = "home",
  options = {},
) {
  const side = normalizeHomeAway(homeAway);
  const rows =
    options.rows?.length && options.rows.some((row) => row?.length)
      ? options.rows
      : assignPlayersToFormationRows(starters, formation);
  if (!rows?.length) return new Map();

  const rowCount = rows.length;
  const starterByPlace = new Map(
    starters.map((player) => [Number(player.formationPlace), player]),
  );
  const coords = new Map();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const rowPlayers = rows[rowIndex]
      .map((place) => starterByPlace.get(Number(place)))
      .filter(Boolean)
      .map((player) => ({
        place: String(player.formationPlace),
        position: String(player.position || ""),
      }));

    const y = getFormationRowY(rowIndex, rowCount, side);
    const placed =
      rowIndex === 0 && rowPlayers.some((player) => player.place === "1")
        ? rowPlayers.map((player) => ({
            place: player.place,
            x: 50,
          }))
        : layoutRowX(rowPlayers);

    for (const entry of placed) {
      coords.set(entry.place, { x: entry.x, y });
    }
  }

  for (const player of starters) {
    const place = String(player.formationPlace);
    if (!coords.has(place)) {
      coords.set(place, {
        x: 50,
        y: getFormationRowY(Math.min(1, rowCount - 1), rowCount, side),
      });
    }
  }

  return coords;
}

function buildKeyEventLookup(keyEvents) {
  const lookup = new Map();
  for (const event of keyEvents || []) {
    const minute = event.clock?.displayValue || "";
    const athlete = event.participants?.[0]?.athlete?.displayName || "";
    const key = `${minute}|${normalizeText(athlete)}`;
    lookup.set(key, {
      assist: event.participants?.[1]?.athlete?.displayName || "",
      text: event.shortText || event.text || "",
      detail: event.text || "",
      team: event.team?.abbreviation || event.team?.displayName || "",
      type: event.type?.text || "",
      scoring: Boolean(event.scoringPlay),
      redCard: Boolean(event.redCard) || /red card/i.test(event.type?.text || ""),
      yellowCard: /yellow card/i.test(event.type?.text || ""),
      substitution: /substitution/i.test(event.type?.text || ""),
    });
  }
  return lookup;
}

function parseSoccerCommentaryTimeline(commentary, keyEvents) {
  const lookup = buildKeyEventLookup(keyEvents);
  const events = [];
  const seenPeriodLabels = new Set();

  for (const entry of commentary || []) {
    const text = String(entry.text || "").trim();
    if (!text || /^Delay over|^They are ready to continue/i.test(text)) {
      continue;
    }

    const minute = entry.time?.displayValue || "";
    let parsed = null;

    if (/^First Half begins/i.test(text)) {
      parsed = {
        type: "Kick-off",
        isPeriod: true,
        minute: "",
        text: "First half",
        detail: text,
      };
    } else if (/^First Half ends/i.test(text)) {
      parsed = {
        type: "Halftime",
        isPeriod: true,
        minute,
        text: "Halftime",
        detail: text,
      };
    } else if (/^Second Half begins/i.test(text)) {
      parsed = {
        type: "Second half",
        isPeriod: true,
        minute,
        text: "Second half",
        detail: text,
      };
    } else if (/^Second Half ends|^Match ends/i.test(text)) {
      parsed = {
        type: "Full time",
        isPeriod: true,
        minute,
        text: "Full time",
        detail: text,
      };
    } else if (/^Lineups are announced/i.test(text)) {
      parsed = {
        type: "Lineups",
        isPeriod: true,
        minute: "",
        text: "Lineups announced",
        detail: text,
      };
    } else if (/^Goal!/i.test(text)) {
      const playerMatch = text.match(/Goal!\s*(?:[^.]+\.\s*)?([^(]+)\(([^)]+)\)/i);
      const athlete = playerMatch?.[1]?.trim() || "";
      const team = playerMatch?.[2]?.trim() || "";
      const enriched = lookup.get(`${minute}|${normalizeText(athlete)}`);
      const assistMatch = text.match(/Assisted by\s+([^.]+)/i);
      parsed = {
        type: enriched?.type || "Goal",
        minute,
        athlete,
        team: enriched?.team || team,
        text: enriched?.text || `${text.split(".")[0]}.`,
        detail: enriched?.detail || text,
        assist: enriched?.assist || assistMatch?.[1]?.trim() || "",
        scoring: true,
        yellowCard: false,
        redCard: false,
        substitution: false,
        isPeriod: false,
        isPlay: false,
      };
    } else if (/is shown the yellow card/i.test(text)) {
      const playerMatch = text.match(/^([^(]+)\(([^)]+)\)/);
      parsed = {
        type: "Yellow Card",
        minute,
        athlete: playerMatch?.[1]?.trim() || "",
        team: playerMatch?.[2]?.trim() || "",
        text: `${text.split(".")[0]}.`,
        detail: text,
        assist: "",
        scoring: false,
        yellowCard: true,
        redCard: false,
        substitution: false,
        isPeriod: false,
        isPlay: false,
      };
    } else if (/is shown the red card/i.test(text)) {
      const playerMatch = text.match(/^([^(]+)\(([^)]+)\)/);
      parsed = {
        type: "Red Card",
        minute,
        athlete: playerMatch?.[1]?.trim() || "",
        team: playerMatch?.[2]?.trim() || "",
        text: `${text.split(".")[0]}.`,
        detail: text,
        assist: "",
        scoring: false,
        yellowCard: false,
        redCard: true,
        substitution: false,
        isPeriod: false,
        isPlay: false,
      };
    } else if (/^Substitution,/i.test(text)) {
      const match = text.match(
        /^Substitution,\s*([^.]+)\.\s*(.+?)\s+replaces\s+(.+?)\.?$/i,
      );
      parsed = {
        type: "Substitution",
        minute,
        athlete: match?.[2]?.trim() || "",
        team: match?.[1]?.trim() || "",
        text: `${text.split(".")[0]}.`,
        detail: text,
        assist: match?.[3]?.trim() || "",
        scoring: false,
        yellowCard: false,
        redCard: false,
        substitution: true,
        isPeriod: false,
        isPlay: false,
      };
    } else if (
      /^Offside(?: call|ruling)?\b/i.test(text) ||
      /\bis caught offside\b/i.test(text)
    ) {
      const { athlete: athleteFromParens, team: teamFromParens } =
        parseCommentaryAthleteTeam(text);
      const team = teamFromParens || parseCommentaryEventTeam(text);
      let athlete = athleteFromParens;
      if (!athlete) {
        const caughtMatch = text.match(
          /(?:^|\.\s+)([A-ZÀ-ÖØ-öø-ÿ][\w\s.'-]+?)\s+is caught offside/i,
        );
        athlete = caughtMatch?.[1]?.trim() || "";
      }
      parsed = {
        type: "Offside",
        minute,
        athlete,
        team,
        text: `${text.split(".")[0]}.`,
        detail: text,
        assist: "",
        scoring: false,
        yellowCard: false,
        redCard: false,
        substitution: false,
        isPeriod: false,
        isPlay: !team && !athlete,
      };
    } else if (minute) {
      const { athlete } = parseCommentaryAthleteTeam(text);
      const team = parseCommentaryEventTeam(text);
      const eventType = parseCommentaryEventType(text);
      const enriched =
        athlete && lookup.get(`${minute}|${normalizeText(athlete)}`);
      parsed = {
        type: enriched?.type || eventType,
        minute,
        athlete,
        team: enriched?.team || team,
        text: enriched?.text || `${text.split(".")[0]}.`,
        detail: enriched?.detail || text,
        assist: enriched?.assist || "",
        scoring: Boolean(enriched?.scoring),
        yellowCard: Boolean(enriched?.yellowCard),
        redCard: Boolean(enriched?.redCard),
        substitution: Boolean(enriched?.substitution),
        isPeriod: false,
        isPlay: !team && !athlete,
      };
    }

    if (parsed) {
      if (parsed.isPeriod) {
        const periodLabel = normalizeText(parsed.text || parsed.type);
        if (seenPeriodLabels.has(periodLabel)) {
          continue;
        }
        seenPeriodLabels.add(periodLabel);
      }

      events.push({
        id: `commentary-${entry.sequence}`,
        ...parsed,
      });
    }
  }

  return events;
}

function normalizeLineupPlayer(player) {
  return {
    name: player.athlete?.shortName || player.athlete?.displayName || "",
    fullName: player.athlete?.displayName || "",
    jersey: String(player.jersey || ""),
    position: player.position?.abbreviation || player.position?.displayName || "",
    formationPlace: String(player.formationPlace || ""),
    imageUrl: getJerseyImageUrl(player.athlete?.jerseyImages?.[0]?.href || ""),
    subbedOut: Boolean(player.subbedOut),
    subbedIn: Boolean(player.subbedIn),
  };
}

function inferLineupHomeAway(block, summaryData, rosterIndex = 0, rosterCount = 1) {
  const declared = String(block?.homeAway || "")
    .trim()
    .toLowerCase();
  if (declared === "home" || declared === "away") return declared;

  const competitors = summaryData?.header?.competitions?.[0]?.competitors || [];
  const abbr = String(block?.team?.abbreviation || "")
    .trim()
    .toUpperCase();
  if (abbr) {
    const match = competitors.find(
      (competitor) =>
        String(competitor.team?.abbreviation || "")
          .trim()
          .toUpperCase() === abbr,
    );
    const inferred = String(match?.homeAway || "")
      .trim()
      .toLowerCase();
    if (inferred === "home" || inferred === "away") return inferred;
  }

  if (rosterCount === 2) {
    return rosterIndex === 0 ? "away" : "home";
  }

  return "home";
}

function extractLineups(summaryData) {
  const rosters = summaryData?.rosters || [];
  if (!rosters.length) return [];

  return rosters
    .map((block, rosterIndex) => {
      const players = block.roster || [];
      const starters = players.filter((player) => player.starter);
      if (!starters.length) return null;

      const homeAway = inferLineupHomeAway(
        block,
        summaryData,
        rosterIndex,
        rosters.length,
      );
      const espnFormation =
        typeof block.formation === "string"
          ? block.formation
          : block.formation?.text || "";
      const normalizedStarters = starters.map(normalizeLineupPlayer);
      const resolved = resolveEffectiveFormation(
        normalizedStarters,
        espnFormation,
        homeAway,
      );

      return {
        team: block.team?.displayName || block.team?.name || "Team",
        abbreviation: block.team?.abbreviation || "",
        color: getBrandColorForTeam("soccer", block.team?.abbreviation || ""),
        homeAway,
        formation: resolved.formation || espnFormation,
        formationLayoutKey: resolved.layoutKey || "",
        formationRows: resolved.rows || null,
        starters: normalizedStarters,
        subs: players
          .filter((player) => !player.starter && player.active !== false)
          .map(normalizeLineupPlayer),
      };
    })
    .filter(Boolean);
}

function getPitchCoords(formationPlace, homeAway) {
  const place = Number(formationPlace);
  const side = normalizeHomeAway(homeAway);

  if (place === 1) {
    return { x: 50, y: PITCH_ROW_Y[side].defensive };
  }

  return { x: 50, y: PITCH_ROW_Y[side].attacking };
}

function extractMatchFacts(summaryData) {
  const gameInfo = summaryData?.gameInfo || {};
  const headerComp = summaryData?.header?.competitions?.[0] || {};
  const broadcasts = [
    ...(summaryData?.broadcasts || []),
    ...(headerComp.broadcasts || []),
  ]
    .map((item) => item.media?.shortName || item.media?.name || item.names?.[0])
    .filter(Boolean);
  const uniqueBroadcasts = [...new Set(broadcasts)];
  const officials = (gameInfo.officials || [])
    .map((official) => official.displayName || official.fullName)
    .filter(Boolean);
  const venueBits = [
    gameInfo.venue?.fullName,
    gameInfo.venue?.address?.city,
    gameInfo.venue?.address?.country,
  ].filter(Boolean);

  const facts = [];
  if (venueBits.length) {
    facts.push({ label: t("venue"), value: venueBits.join(", ") });
  }
  if (gameInfo.attendance) {
    facts.push({
      label: "Attendance",
      value: Number(gameInfo.attendance).toLocaleString(),
    });
  }
  if (officials[0]) {
    facts.push({ label: "Referee", value: officials[0] });
  }
  if (uniqueBroadcasts.length) {
    facts.push({ label: "Broadcast", value: uniqueBroadcasts.join(" • ") });
  }
  const weather = headerComp.weather?.displayValue || headerComp.weather?.conditionId;
  if (weather) {
    facts.push({ label: "Weather", value: String(weather) });
  }
  return facts;
}

function teamFormBlockMatchesFocus(block, needles) {
  const blockNeedles = [block.abbreviation, block.team]
    .map(normalizeText)
    .filter(Boolean);
  return blockNeedles.some((candidate) =>
    needles.some(
      (needle) =>
        candidate === needle ||
        candidate.includes(needle) ||
        needle.includes(candidate),
    ),
  );
}

function orderTeamFormForMatch(teamForm, focusGame) {
  if (!teamForm?.length || !focusGame) return teamForm ?? [];

  const awayNeedles = [focusGame.awayAbbr, focusGame.awayTeam]
    .map(normalizeText)
    .filter(Boolean);
  const homeNeedles = [focusGame.homeAbbr, focusGame.homeTeam]
    .map(normalizeText)
    .filter(Boolean);

  const awayBlock = teamForm.find((block) =>
    teamFormBlockMatchesFocus(block, awayNeedles),
  );
  const homeBlock = teamForm.find((block) =>
    teamFormBlockMatchesFocus(block, homeNeedles),
  );

  const ordered = [];
  if (homeBlock) ordered.push(homeBlock);
  if (awayBlock) ordered.push(awayBlock);
  for (const block of teamForm) {
    if (block !== awayBlock && block !== homeBlock) ordered.push(block);
  }

  return ordered.length ? ordered : teamForm;
}

function extractTeamForm(summaryData) {
  return (summaryData?.lastFiveGames || []).map((block) => ({
    team: block.team?.displayName || block.team?.abbreviation || "Team",
    abbreviation: block.team?.abbreviation || "",
    events: (block.events || []).slice(0, 5).map((event) => ({
      result: event.gameResult || "—",
      opponent: event.opponent?.displayName || event.opponent?.abbreviation || "",
      score: event.score || `${event.homeTeamScore || "0"}-${event.awayTeamScore || "0"}`,
      competition: event.competitionName || event.leagueAbbreviation || "",
      dateLabel: event.gameDate ? formatDisplayTime(new Date(event.gameDate)) : "",
    })),
  }));
}

function extractHeadToHead(summaryData) {
  return (summaryData?.headToHeadGames || []).flatMap((block) =>
    (block.events || []).map((event) => ({
      dateLabel: event.gameDate ? formatDisplayTime(new Date(event.gameDate)) : "",
      label: [
        block.team?.abbreviation || block.team?.displayName,
        event.atVs,
        event.opponent?.abbreviation || event.opponent?.displayName,
      ]
        .filter(Boolean)
        .join(" "),
      score: event.score || "",
      competition: event.competitionName || event.roundName || "",
    })),
  );
}

function buildEspnSummaryEnrichment(summaryData, focusGame, sport) {
  if (!summaryData || !focusGame) {
    return {
      teamStats: [],
      timeline: [],
      matchFacts: [],
      teamForm: [],
      headToHead: [],
      lineups: [],
    };
  }

  if (sport === "soccer") {
    focusGame.goals = extractSoccerGoals(
      summaryData,
      focusGame.awayTeamId,
      focusGame.homeTeamId,
    );
  }

  return {
    teamStats: parseEspnStats(
      summaryData.boxscore,
      focusGame.awayAbbr,
      focusGame.homeAbbr,
      sport,
    ),
    timeline: extractMatchTimeline(summaryData, sport),
    matchFacts: extractMatchFacts(summaryData),
    teamForm: orderTeamFormForMatch(extractTeamForm(summaryData), focusGame),
    headToHead: extractHeadToHead(summaryData),
    lineups: sport === "soccer" ? extractLineups(summaryData) : [],
  };
}

function buildEspnExtrasList(events, focusGameId, limitOrOptions = 24) {
  if (typeof limitOrOptions === "number") {
    const extras = events.filter((event) => event.id !== focusGameId);
    const live = extras.filter((event) => event.state === "live");
    const upcoming = extras
      .filter((event) => event.state === "scheduled")
      .sort((a, b) => a.sortDate - b.sortDate);
    const completed = extras
      .filter((event) => event.state === "final")
      .sort((a, b) => b.sortDate - a.sortDate);
    return [...live, ...upcoming, ...completed]
      .slice(0, limitOrOptions)
      .map((event) => mapEspnExtraGame(event));
  }

  const pastLimit = limitOrOptions.pastLimit ?? 4;
  const futureLimit = limitOrOptions.futureLimit ?? 4;
  const extras = events.filter((event) => event.id !== focusGameId);
  const seen = new Set();
  const picked = [];

  const addEvent = (event) => {
    if (!event || seen.has(event.id)) return;
    seen.add(event.id);
    picked.push(event);
  };

  for (const event of extras
    .filter((item) => item.state === "live")
    .sort((a, b) => b.sortDate - a.sortDate)) {
    if (picked.length >= pastLimit) break;
    addEvent(event);
  }

  for (const event of extras
    .filter((item) => item.state === "final")
    .sort((a, b) => b.sortDate - a.sortDate)) {
    if (picked.length >= pastLimit) break;
    addEvent(event);
  }

  const futureStart = picked.length;
  for (const event of extras
    .filter((item) => item.state === "scheduled")
    .sort((a, b) => a.sortDate - b.sortDate)) {
    if (picked.length - futureStart >= futureLimit) break;
    addEvent(event);
  }

  return picked.map((event) => mapEspnExtraGame(event));
}

function pickEspnAutoFocusGame(events = []) {
  const liveGames = events.filter((event) => event.state === "live");
  const upcomingGames = events
    .filter((event) => event.state === "scheduled")
    .sort((a, b) => a.sortDate - b.sortDate);
  const completedGames = events
    .filter((event) => event.state === "final")
    .sort((a, b) => b.sortDate - a.sortDate);

  return liveGames[0] || upcomingGames[0] || completedGames[0] || null;
}

function getSportsBrowseOptions(context = {}) {
  const focusEventId = String(context?.sportsFocusEventId ?? "").trim();
  const defaultEventId = String(context?.sportsDefaultEventId ?? "").trim();
  return { focusEventId, defaultEventId };
}

function resolveEspnFocusSelection(events = [], options = {}) {
  const autoFocusGame = pickEspnAutoFocusGame(events);
  const defaultFocusGameId = options.defaultEventId || autoFocusGame?.id || "";

  if (!options.focusEventId) {
    const focusGame = options.defaultEventId
      ? events.find((event) => String(event.id) === String(options.defaultEventId)) ||
        autoFocusGame
      : autoFocusGame;
    return { focusGame, defaultFocusGameId, autoFocusGame };
  }

  const focusGame =
    events.find((event) => String(event.id) === String(options.focusEventId)) ||
    autoFocusGame;

  return { focusGame, defaultFocusGameId, autoFocusGame };
}

function getRefreshCacheKey(query, focusEventId = "", defaultEventId = "") {
  const base = normalizeText(query);
  if (focusEventId) return `${base}|event:${focusEventId}`;
  if (defaultEventId) return `${base}|default:${defaultEventId}`;
  return base;
}

function mapEspnExtraGame(event) {
  return {
    id: event.id ? String(event.id) : "",
    label:
      event.state === "live"
        ? "Live"
        : event.state === "scheduled"
          ? "Next"
          : "Recent",
    state: event.state,
    status: event.status,
    awayTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    awayAbbr: event.awayAbbr,
    homeAbbr: event.homeAbbr,
    awayBrand: event.awayBrand,
    homeBrand: event.homeBrand,
    score:
      event.state === "scheduled"
        ? ""
        : `${event.homeScore} - ${event.awayScore}`,
    meta: [event.subLabel, event.meta, event.competitionLabel]
      .filter(Boolean)
      .join(" • "),
  };
}

function normalizeEspnEvent(event, sport) {
  const comp = event?.competitions?.[0];
  const date = new Date(event?.date || comp?.date || "");
  const statusType = comp?.status?.type || {};
  const state = statusType.state === "in"
    ? "live"
    : statusType.state === "post"
      ? "final"
      : /postponed|cancelled|suspended/i.test(statusType.description || "")
        ? "warning"
        : "scheduled";

  const homeCompetitor = comp?.competitors?.find(c => c.homeAway === "home");
  const awayCompetitor = comp?.competitors?.find(c => c.homeAway === "away");

  const homeTeam = homeCompetitor?.team?.displayName || homeCompetitor?.team?.name || "Home";
  const awayTeam = awayCompetitor?.team?.displayName || awayCompetitor?.team?.name || "Away";
  const homeAbbr = homeCompetitor?.team?.abbreviation || getFallbackAbbreviation(homeTeam);
  const awayAbbr = awayCompetitor?.team?.abbreviation || getFallbackAbbreviation(awayTeam);

  const homeLogo = homeCompetitor?.team?.logos?.[0]?.href || "";
  const awayLogo = awayCompetitor?.team?.logos?.[0]?.href || "";

  const homeColor = homeCompetitor?.team?.color ? `#${homeCompetitor.team.color}` : "";
  const awayColor = awayCompetitor?.team?.color ? `#${awayCompetitor.team.color}` : "";

  const homeScore = homeCompetitor?.score == null || homeCompetitor?.score === "" ? "—" : String(homeCompetitor.score);
  const awayScore = awayCompetitor?.score == null || awayCompetitor?.score === "" ? "—" : String(awayCompetitor.score);

  const detail = statusType.detail || statusType.shortDetail || "Scheduled";

  // Build brands
  const homeBrand = {
    abbreviation: homeAbbr,
    color: homeColor || getBrandColorForTeam(sport, homeAbbr),
    logoUrl: getLogoUrlForTeam(sport, homeAbbr, homeLogo),
  };
  const awayBrand = {
    abbreviation: awayAbbr,
    color: awayColor || getBrandColorForTeam(sport, awayAbbr),
    logoUrl: getLogoUrlForTeam(sport, awayAbbr, awayLogo),
  };

  let subLabel = comp?.notes?.[0]?.text || "";
  if (!subLabel && sport === "soccer") {
    const awayGroup = getWorldCupGroupForTeam(awayAbbr);
    const homeGroup = getWorldCupGroupForTeam(homeAbbr);
    if (awayGroup && homeGroup && awayGroup.code === homeGroup.code) {
      subLabel = `Group Stage • Group ${awayGroup.code}`;
    }
  }

  const broadcasts = (comp?.broadcasts || comp?.geoBroadcasts || [])
    .flatMap((item) => item.names || [item.media?.shortName, item.media?.name])
    .filter(Boolean);
  const broadcastLabel = [...new Set(broadcasts)].join(" • ");

  return {
    id: event.id,
    state,
    competitionLabel: comp?.type?.text || (sport === "soccer" ? "Soccer" : sport.toUpperCase()),
    status: state === "scheduled"
      ? formatDisplayTime(date)
      : state === "live"
        ? comp?.status?.displayClock || detail || "Live"
        : state === "final"
          ? "Final"
          : detail || "Postponed",
    awayTeam,
    homeTeam,
    awayAbbr,
    homeAbbr,
    awayBrand,
    homeBrand,
    awayScore,
    homeScore,
    awayTeamId: awayCompetitor?.team?.id || "",
    homeTeamId: homeCompetitor?.team?.id || "",
    subLabel,
    meta: [
      comp?.venue?.fullName,
      comp?.venue?.address?.city,
      broadcastLabel,
    ].filter(Boolean).join(" • "),
    sortDate: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
    providerFixtureId: event.id ? String(event.id) : "",
  };
}

function normalizeEspnStandings(standingsData) {
  const children = standingsData?.children || [];
  return children.map(child => {
    const title = child.name || child.abbreviation || "Table";
    const entries = child.standings?.entries || [];
    const rows = entries.map(entry => {
      const stats = entry.stats || [];
      return {
        teamId: entry.team?.id || "",
        team: entry.team?.displayName || entry.team?.name || "",
        abbreviation: entry.team?.abbreviation || "",
        logoUrl: getLogoUrlForTeam(
          "soccer",
          entry.team?.abbreviation || "",
          entry.team?.logos?.[0]?.href || "",
        ),
        position: String(stats.find(s => s.name === "rank")?.value || stats.find(s => s.type === "rank")?.value || ""),
        played: String(stats.find(s => s.name === "gamesPlayed")?.value || ""),
        wins: String(stats.find(s => s.name === "wins")?.value || ""),
        losses: String(stats.find(s => s.name === "losses")?.value || ""),
        ties: String(stats.find(s => s.name === "ties")?.value || ""),
        goalDiff: String(stats.find(s => s.name === "pointDifferential")?.displayValue || stats.find(s => s.name === "pointDifferential")?.value || ""),
        points: String(stats.find(s => s.name === "points")?.value || ""),
        pointsFor: String(
          stats.find(s => s.name === "pointsFor")?.displayValue ||
            stats.find(s => s.name === "pointsFor")?.value ||
            "",
        ),
        pointsAgainst: String(
          stats.find(s => s.name === "pointsAgainst")?.displayValue ||
            stats.find(s => s.name === "pointsAgainst")?.value ||
            "",
        ),
        pct: String(stats.find(s => s.name === "winPercent")?.displayValue || ""),
        gb: String(stats.find(s => s.name === "gamesBehind")?.displayValue || ""),
        record: stats.find(s => s.name === "overall")?.displayValue || stats.find(s => s.type === "total")?.displayValue || "",
      };
    });
    return { title, rows };
  });
}

function findEspnTeamId(parsed, standings) {
  const targetName = parsed.team.canonicalName.toLowerCase();
  const targetAbbr = parsed.team.abbreviation?.toLowerCase();
  const targetAliases = (parsed.team.aliases || []).map(a => a.toLowerCase());

  for (const child of standings) {
    for (const row of child.rows) {
      const teamName = row.team.toLowerCase();
      const teamAbbr = row.abbreviation.toLowerCase();
      if (
        (targetAbbr && teamAbbr === targetAbbr) ||
        teamName === targetName ||
        targetAliases.includes(teamName) ||
        targetAliases.includes(teamAbbr)
      ) {
        return row.teamId;
      }
    }
  }
  return null;
}

function findMatchInEvents(events, leftName, rightName) {
  const leftClean = normalizeSoccerName(leftName);
  const rightClean = normalizeSoccerName(rightName);

  return events.find(e => {
    const comp = e.competitions?.[0];
    if (!comp?.competitors) return false;
    const team1 = normalizeSoccerName(comp.competitors[0]?.team?.displayName || comp.competitors[0]?.team?.name || "");
    const team2 = normalizeSoccerName(comp.competitors[1]?.team?.displayName || comp.competitors[1]?.team?.name || "");
    return (
      (team1 === leftClean && team2 === rightClean) ||
      (team1 === rightClean && team2 === leftClean)
    );
  });
}

function parseEspnStats(boxscore, awayAbbr, homeAbbr, sport = "soccer") {
  if (!boxscore || !boxscore.teams) return [];
  const teams = boxscore.teams;
  const awayTeam = teams.find(t => t.team?.abbreviation === awayAbbr) || teams[0];
  const homeTeam = teams.find(t => t.team?.abbreviation === homeAbbr) || teams[1];
  if (!awayTeam || !homeTeam) return [];

  const getStatVal = (teamObj, statName) => {
    const stat = (teamObj.statistics || []).find(s => s.name === statName);
    return stat ? stat.displayValue : "";
  };

  const statsKeys =
    sport === "soccer" ? ESPN_SOCCER_BOX_SCORE_STATS : ESPN_DEFAULT_BOX_SCORE_STATS;

  return statsKeys.map(k => {
    const awayVal = getStatVal(awayTeam, k.name);
    const homeVal = getStatVal(homeTeam, k.name);
    if (!awayVal && !homeVal) return null;
    return {
      label: k.label,
      away: awayVal,
      home: homeVal,
    };
  }).filter(Boolean);
}

function buildEspnWorldCupBracket(events) {
  const rounds = {
    "round-of-32": [],
    "round-of-16": [],
    "quarterfinals": [],
    "semifinals": [],
    "final": [],
  };

  events.forEach(e => {
    const comp = e.competitions?.[0];
    const stageSlug = comp?.type?.slug || "";
    if (rounds[stageSlug]) {
      const match = normalizeEspnEvent(e, "soccer");
      rounds[stageSlug].push({
        id: match.id,
        home: match.homeTeam,
        away: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: match.status,
        state: match.state,
      });
    }
  });

  return rounds;
}

function buildEspnTabs({
  hasStats = false,
  hasStandings = false,
  hasTimeline = false,
  hasLineup = false,
  hasGroups = false,
  hasBracket = false,
  isMatchup = false,
} = {}) {
  const tabs = [{ id: "matches", label: isMatchup ? "Game" : "Matches" }];
  if (hasTimeline) tabs.push({ id: "timeline", label: t("timeline") });
  if (hasStats) tabs.push({ id: "stats", label: "Stats" });
  if (hasLineup) tabs.push({ id: "lineup", label: t("lineup") });
  if (hasStandings) tabs.push({ id: "standings", label: "Standings" });
  if (hasGroups) tabs.push({ id: "groups", label: "Groups" });
  if (hasBracket) tabs.push({ id: "bracket", label: "Bracket" });
  return tabs;
}

async function loadEspnFocusEnrichment(sport, league, focusGame) {
  if (!focusGame?.id) {
    return {
      teamStats: [],
      timeline: [],
      matchFacts: [],
      teamForm: [],
      headToHead: [],
      lineups: [],
    };
  }

  try {
    const summaryData = await fetchEspnSummary(sport, league, focusGame.id);
    return buildEspnSummaryEnrichment(summaryData, focusGame, sport);
  } catch {
    return {
      teamStats: [],
      timeline: [],
      matchFacts: [],
      teamForm: [],
      headToHead: [],
      lineups: [],
    };
  }
}

function renderEspnCard(model) {
  const cardModel =
    model.focusGame?.state === "live"
      ? {
          ...model,
          provider: model.provider || "espn",
          refreshable: true,
          refreshMinIntervalMs:
            model.refreshMinIntervalMs || ESPN_LIVE_REFRESH_MS,
        }
      : model;

  const tabsList = cardModel.tabs || [];
  const tabsHeaders = tabsList
    .map((tab, idx) => {
      const activeClass = idx === 0 ? "sports-slot__tab--active" : "";
      return `<button class="sports-slot__tab ${activeClass}" data-tab="${tab.id}">${tab.label}</button>`;
    })
    .join("");

  const tabsNavHtml = tabsHeaders
    ? `<nav class="sports-slot__tabs">${tabsHeaders}</nav>`
    : "";

  const gamesHtml = (model.games ?? [])
    .map((game) =>
      renderMiniGameCard(
        {
          ...game,
          status: game.status || "—",
          score: game.score || "—",
        },
        {
          focusGameId: model.focusGame?.id,
          selectable: model.gamesSelectable && Boolean(game.id),
        },
      ),
    )
    .join("");

  let scorersHtml = "";
  if (model.focusGame?.goals) {
    const awayGoals = model.focusGame.goals.away || [];
    const homeGoals = model.focusGame.goals.home || [];
    if (awayGoals.length > 0 || homeGoals.length > 0) {
      const awayHtml = awayGoals
        .map((g) => `<div class="sports-slot__scorer-item">${escapeHtml(g)}</div>`)
        .join("");
      const homeHtml = homeGoals
        .map((g) => `<div class="sports-slot__scorer-item">${escapeHtml(g)}</div>`)
        .join("");
      scorersHtml = `
        <div class="sports-slot__scorers-row">
          <div class="sports-slot__scorers-col sports-slot__scorers-col--home">${homeHtml}</div>
          <div class="sports-slot__scorers-icon">⚽</div>
          <div class="sports-slot__scorers-col sports-slot__scorers-col--away">${awayHtml}</div>
        </div>
      `;
    }
  }

  const focusGameHtml = renderFocusScoreboard(
    model.focusGame,
    model.sport,
    scorersHtml,
  );
  const matchFactsHtml = renderMatchFactsStrip(model.matchFacts);
  const formHtml = renderFormPanels(model.teamForm);
  const headToHeadHtml = renderHeadToHeadPanel(model.headToHead);

  const hasNoGames = !focusGameHtml && !gamesHtml;
  const matchesSplitClass =
    focusGameHtml && gamesHtml
      ? "sports-slot__split sports-slot__split--active"
      : "sports-slot__split";
  const matchesTabPanel = `
    <div class="sports-slot__tab-panel sports-slot__tab-panel--active" data-panel="matches">
      <div class="${matchesSplitClass}">
        ${
          focusGameHtml || matchFactsHtml || formHtml || headToHeadHtml
            ? `<div class="sports-slot__split-pane sports-slot__split-pane--primary">
                ${focusGameHtml}
                ${matchFactsHtml}
                ${formHtml}
                ${headToHeadHtml}
              </div>`
            : ""
        }
        ${
          gamesHtml
            ? `<div class="sports-slot__split-pane sports-slot__split-pane--games">
                ${renderGamesSectionHead(model.gamesTitle || "Matches", model)}
                <div class="sports-slot__mini-games sports-slot__mini-games--grid">${gamesHtml}</div>
              </div>`
            : ""
        }
      </div>
      ${
        hasNoGames
          ? `<div class="sports-slot__empty-stage">No recent or upcoming games were found.</div>`
          : ""
      }
    </div>
  `;

  const timelineTabPanel = renderTimelinePanel(
    model.timeline,
    model.focusGame,
    model.sport,
  );
  const lineupTabPanel = renderLineupPanel(model.lineups);

  let standingsTabPanel = "";
  if (model.standings) {
    standingsTabPanel = `
      <div class="sports-slot__tab-panel" data-panel="standings" style="display: none;">
        <div class="sports-slot__standings-grid">
          ${model.standings
            .map(
              (table) => `
                <section class="sports-slot__pane sports-slot__pane--standings">
                  <h4 class="sports-slot__section-label">${escapeHtml(table.title)}</h4>
                  <div class="sports-slot__table">
                    <div class="sports-slot__table-row sports-slot__table-row--head">
                      <span>#</span>
                      <span>Team</span>
                      <span>Record</span>
                      <span>PCT</span>
                      <span>GB</span>
                    </div>
                    ${table.rows
                      .map(
                        (row) => `
                          <div class="sports-slot__table-row ${
                            row.highlight ? "sports-slot__table-row--highlight" : ""
                          }">
                            <span>${escapeHtml(row.position)}</span>
                            <span class="sports-slot__table-team">
                              <img src="${escapeHtml(row.logoUrl)}" alt="" />
                              <span>${escapeHtml(row.team)}</span>
                            </span>
                            <span>${escapeHtml(
                              row.record || `${row.wins}-${row.losses}-${row.ties}`,
                            )}</span>
                            <span>${escapeHtml(row.pct || "—")}</span>
                            <span>${escapeHtml(row.gb || "—")}</span>
                          </div>
                        `,
                      )
                      .join("")}
                  </div>
                </section>
              `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  let statsTabPanel = "";
  if (model.teamStats) {
    const statsHtml = (model.teamStats ?? []).map(renderFocusStatRow).join("");

    statsTabPanel = `
      <div class="sports-slot__tab-panel" data-panel="stats" style="display: none;">
        <section class="sports-slot__pane sports-slot__pane--stats">
          <div class="sports-slot__stats-list sports-slot__stats-list--wide sports-slot__stats-list--dense">${statsHtml}</div>
        </section>
      </div>
    `;
  }

  let groupsTabPanel = "";
  if (model.groupTables) {
    const groupTablesHtml = (model.groupTables ?? [])
      .map((group) =>
        model.sport === "soccer"
          ? renderSoccerGroupCard(group)
          : `
          <article class="sports-slot__group-card">
            <div class="sports-slot__group-card-head">
              <strong>${escapeHtml(group.title)}</strong>
            </div>
            <div class="sports-slot__group-table">
              <div class="sports-slot__group-row sports-slot__group-row--head">
                <span>Team</span>
                <span>${renderAbbr("GP", t("abbrGp"))}</span>
                <span>${renderAbbr("GD", t("abbrGd"))}</span>
                <span>${renderAbbr("Pts", t("abbrPts"))}</span>
              </div>
              ${group.rows
                .map(
                  (row) => `
                    <div class="sports-slot__group-row ${
                      row.highlight ? "sports-slot__group-row--highlight" : ""
                    }">
                      <span class="sports-slot__group-team">
                        <img class="sports-slot__group-team-logo" src="${escapeHtml(
                          row.logoUrl,
                        )}" alt="" />
                        <span>${escapeHtml(row.team)}</span>
                      </span>
                      <span>${escapeHtml(row.played)}</span>
                      <span>${escapeHtml(row.goalDiff)}</span>
                      <strong>${escapeHtml(row.points)}</strong>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </article>
        `,
      )
      .join("");

    groupsTabPanel = `
      <div class="sports-slot__tab-panel" data-panel="groups" style="display: none;">
        <div class="sports-slot__group-grid sports-slot__group-grid--wide">${groupTablesHtml}</div>
      </div>
    `;
  }

  let bracketTabPanel = "";
  if (model.bracket) {
    const roundsList = [
      { id: "round-of-32", label: "R32" },
      { id: "round-of-16", label: "R16" },
      { id: "quarterfinals", label: "Quarter" },
      { id: "semifinals", label: "Semi" },
      { id: "final", label: "Final" },
    ];

    const subTabs = roundsList
      .map((r, idx) => {
        const activeClass = idx === 0 ? "sports-slot__sub-tab--active" : "";
        return `<button class="sports-slot__sub-tab ${activeClass}" data-sub-tab="${r.id}">${r.label}</button>`;
      })
      .join("");

    const roundPanels = roundsList
      .map((r, idx) => {
        const displayStyle = idx === 0 ? "display: grid;" : "display: none;";
        const roundMatches = model.bracket[r.id] || [];

        let matchesHtml = roundMatches
          .map(
            (m) => `
              <div class="sports-slot__bracket-match sports-slot__bracket-match--${m.state}">
                <div class="sports-slot__bracket-team">
                  <span>${escapeHtml(m.home)}</span>
                  <strong>${escapeHtml(m.homeScore)}</strong>
                </div>
                <div class="sports-slot__bracket-team">
                  <span>${escapeHtml(m.away)}</span>
                  <strong>${escapeHtml(m.awayScore)}</strong>
                </div>
                <div class="sports-slot__bracket-match-status">${escapeHtml(m.status)}</div>
              </div>
            `,
          )
          .join("");

        if (!matchesHtml) {
          matchesHtml = `<div class="sports-slot__empty-stage">No matches scheduled yet</div>`;
        }

        return `
          <div class="sports-slot__sub-tab-panel" data-sub-panel="${r.id}" style="${displayStyle}">
            <div class="sports-slot__bracket-matches-grid">${matchesHtml}</div>
          </div>
        `;
      })
      .join("");

    bracketTabPanel = `
      <div class="sports-slot__tab-panel" data-panel="bracket" style="display: none;">
        <div class="sports-slot__bracket-container">
          <div class="sports-slot__sub-tabs-wrapper">
            <div class="sports-slot__sub-tabs">${subTabs}</div>
          </div>
          <div class="sports-slot__round-panels">${roundPanels}</div>
        </div>
      </div>
    `;
  }

  return `
    <div
      ${renderSlotRootAttrs(cardModel)}
    >
      ${renderToolbar(cardModel)}
      ${tabsNavHtml}
      <div class="sports-slot__body sports-slot__tab-panels">
        ${matchesTabPanel}
        ${timelineTabPanel}
        ${statsTabPanel}
        ${lineupTabPanel}
        ${standingsTabPanel}
        ${groupsTabPanel}
        ${bracketTabPanel}
      </div>
      ${model.footer ? `<div class="sports-slot__footer">${model.footer}</div>` : ""}
    </div>
  `;
}

async function handleEspnQuery(parsed, context) {
  const espnInfo = getEspnSportAndLeague(parsed);
  if (!espnInfo) return null;
  const { sport, league } = espnInfo;

  const title = parsed.competition?.name || (parsed.sport === "soccer" ? "Soccer" : parsed.sport.toUpperCase());

  // 1. MATCHUP INTENT
  if (parsed.intent === "matchup") {
    // Fetch scoreboard
    let scoreboardData = null;
    try {
      const isWC = league === "fifa.world";
      // World Cup: fetch all games
      const dates = isWC ? "20260611-20260719" : null;
      scoreboardData = await fetchEspnScoreboard(sport, league, dates);
    } catch {
      scoreboardData = { events: [] };
    }

    const events = scoreboardData?.events || [];
    let matchEvent = findMatchInEvents(events, parsed.left.canonicalName, parsed.right.canonicalName);

    // If not found in scoreboard, try to fetch schedule of left team
    if (!matchEvent) {
      try {
        const standingsData = await fetchEspnStandings(sport, league);
        const standings = normalizeEspnStandings(standingsData);
        const leftId = findEspnTeamId(parsed.left ? parsed : { team: parsed.left }, standings);
        if (leftId) {
          const scheduleData = await fetchEspnTeamSchedule(sport, league, leftId);
          matchEvent = findMatchInEvents(scheduleData?.events || [], parsed.left.canonicalName, parsed.right.canonicalName);
        }
      } catch {
        // Fallback silently
      }
    }

    if (!matchEvent) {
      return renderEmptyCard(
        parsed.sport,
        `${parsed.left.canonicalName} vs ${parsed.right.canonicalName}`,
        "No recent or upcoming match was found."
      );
    }

    // Normalize event
    const focusGame = normalizeEspnEvent(matchEvent, parsed.sport);
    const enrichment = await loadEspnFocusEnrichment(sport, league, focusGame);

    // Fetch standings
    let standings = null;
    try {
      const standingsData = await fetchEspnStandings(sport, league);
      const allStandings = normalizeEspnStandings(standingsData);
      standings = allStandings.filter(child => {
        return child.rows.some(r => r.team.toLowerCase() === focusGame.awayTeam.toLowerCase() || r.team.toLowerCase() === focusGame.homeTeam.toLowerCase());
      });
      standings.forEach(child => {
        child.rows.forEach(r => {
          if (r.team.toLowerCase() === focusGame.awayTeam.toLowerCase() || r.team.toLowerCase() === focusGame.homeTeam.toLowerCase()) {
            r.highlight = true;
          }
        });
      });
    } catch {
      // Fallback silently
    }

    const tabs = buildEspnTabs({
      hasLineup: enrichment.lineups.length > 0,
      hasTimeline: enrichment.timeline.length > 0,
      hasStats: enrichment.teamStats.length > 0,
      hasStandings: Boolean(standings?.length),
      isMatchup: true,
    });

    return renderEspnCard({
      sport: parsed.sport,
      query: parsed.query,
      provider: "espn",
      eyebrow: "Matchup Results",
      title: `${focusGame.homeTeam} vs ${focusGame.awayTeam}`,
      subtitle: focusGame.competitionLabel,
      badge:
        focusGame.state === "live"
          ? getLiveBadgeLabel(focusGame) || t("live")
          : focusGame.state === "final"
            ? "Final"
            : "Scheduled",
      badgeTone: toStatusTone(focusGame.state),
      tabs,
      focusGame,
      teamStats: enrichment.teamStats,
      timeline: enrichment.timeline,
      lineups: enrichment.lineups,
      matchFacts: enrichment.matchFacts,
      teamForm: enrichment.teamForm,
      headToHead: enrichment.headToHead,
      standings,
      footer: renderProviderFooter("ESPN", `https://www.espn.com/${parsed.sport}/${league === "fifa.world" ? "world-cup" : league === "eng.1" ? "premier-league" : league}`),
    });
  }

  // 2. TEAM INTENT
  if (parsed.kind === "team" || parsed.kind === "worldCupTeam") {
    let standingsData = null;
    try {
      standingsData = await fetchEspnStandings(sport, league);
    } catch {
      // Fallback silently
    }

    const allStandings = standingsData ? normalizeEspnStandings(standingsData) : [];
    const teamId = standingsData ? findEspnTeamId(parsed, allStandings) : null;

    if (!teamId) {
      return renderEmptyCard(parsed.sport, parsed.team.canonicalName, "Team not found in current competition.");
    }

    // Fetch team schedule
    let scheduleData = null;
    try {
      scheduleData = await fetchEspnTeamSchedule(sport, league, teamId);
    } catch {
      scheduleData = { events: [] };
    }

    const events = (scheduleData?.events || []).map((event) =>
      normalizeEspnEvent(event, parsed.sport),
    );
    const browse = getSportsBrowseOptions(context);
    const { focusGame, defaultFocusGameId } = resolveEspnFocusSelection(
      events,
      browse,
    );
    const enrichment = focusGame
      ? await loadEspnFocusEnrichment(sport, league, focusGame)
      : {
          teamStats: [],
          timeline: [],
          matchFacts: [],
          teamForm: [],
          headToHead: [],
          lineups: [],
        };

    const extras = buildEspnExtrasList(events, focusGame?.id, 20);

    // Standings for team's conference/group
    const standings = allStandings.filter(child => {
      return child.rows.some(r => r.teamId === teamId);
    });
    standings.forEach(child => {
      child.rows.forEach(r => {
        if (r.teamId === teamId) r.highlight = true;
      });
    });

    const tabs = buildEspnTabs({
      hasLineup: enrichment.lineups.length > 0,
      hasTimeline: enrichment.timeline.length > 0,
      hasStats: enrichment.teamStats.length > 0,
      hasStandings: Boolean(standings?.length),
    });

    return renderEspnCard({
      sport: parsed.sport,
      query: parsed.query,
      provider: "espn",
      eyebrow: "Team Summary",
      title: parsed.team.canonicalName,
      subtitle: focusGame ? focusGame.competitionLabel : "",
      badge:
        focusGame?.state === "live"
          ? getLiveBadgeLabel(focusGame) || t("live")
          : focusGame?.state === "final"
            ? "Final"
            : "Scheduled",
      badgeTone: toStatusTone(focusGame?.state || "scheduled"),
      tabs,
      focusGame,
      defaultFocusGameId,
      games: extras,
      gamesSelectable: true,
      gamesTitle: "Schedule & Results",
      teamStats: enrichment.teamStats,
      timeline: enrichment.timeline,
      lineups: enrichment.lineups,
      matchFacts: enrichment.matchFacts,
      teamForm: enrichment.teamForm,
      headToHead: enrichment.headToHead,
      standings,
      footer: renderProviderFooter("ESPN", `https://www.espn.com/${parsed.sport}/${league === "fifa.world" ? "world-cup" : league === "eng.1" ? "premier-league" : league}`),
    });
  }

  // 3. TOURNAMENT / LEAGUE INTENT
  const isWC = league === "fifa.world";
  let scoreboardData = null;
  try {
    const dates = isWC ? "20260611-20260719" : null;
    scoreboardData = await fetchEspnScoreboard(sport, league, dates);
  } catch {
    scoreboardData = { events: [] };
  }

  const events = (scoreboardData?.events || []).map((event) =>
    normalizeEspnEvent(event, parsed.sport),
  );
  const browse = getSportsBrowseOptions(context);
  const { focusGame, defaultFocusGameId } = resolveEspnFocusSelection(
    events,
    browse,
  );
  const enrichment = focusGame
    ? await loadEspnFocusEnrichment(sport, league, focusGame)
    : {
        teamStats: [],
        timeline: [],
        matchFacts: [],
        teamForm: [],
        headToHead: [],
        lineups: [],
      };

  const extras = buildEspnExtrasList(events, focusGame?.id, {
    pastLimit: 4,
    futureLimit: 4,
  });

  // Fetch standings
  let standingsData = null;
  try {
    standingsData = await fetchEspnStandings(sport, league);
  } catch {
    // Fallback silently
  }
  const allStandings = standingsData ? normalizeEspnStandings(standingsData) : [];
  const bracket = isWC ? buildEspnWorldCupBracket(scoreboardData?.events || []) : null;

  const tabs = buildEspnTabs({
    hasLineup: enrichment.lineups.length > 0,
    hasTimeline: enrichment.timeline.length > 0,
    hasStats: enrichment.teamStats.length > 0,
    hasStandings: !isWC && allStandings.length > 0,
    hasGroups: isWC,
    hasBracket: isWC,
  });

  return renderEspnCard({
    sport: parsed.sport,
    query: parsed.query,
    provider: "espn",
    eyebrow: "League Summary",
    title: isWC ? "FIFA World Cup 2026" : title,
    subtitle: isWC ? "USA • Canada • Mexico" : "Scoreboard & Standings",
    badge:
      focusGame?.state === "live"
        ? getLiveBadgeLabel(focusGame) || t("live")
        : focusGame?.state === "final"
          ? "Final"
          : "Scheduled",
    badgeTone: toStatusTone(focusGame?.state || "scheduled"),
    tabs,
    focusGame,
    defaultFocusGameId,
    games: extras,
    gamesSelectable: true,
    gamesTitle: isWC ? "Tournament Matches" : "Recent & Upcoming",
    teamStats: enrichment.teamStats,
    timeline: enrichment.timeline,
    lineups: enrichment.lineups,
    matchFacts: enrichment.matchFacts,
    teamForm: enrichment.teamForm,
    headToHead: enrichment.headToHead,
    groupTables: isWC ? allStandings : null,
    standings: !isWC ? allStandings : null,
    bracket,
    footer: renderProviderFooter("ESPN", `https://www.espn.com/${parsed.sport}/${league === "fifa.world" ? "world-cup" : league === "eng.1" ? "premier-league" : league}`),
  });
}

async function executeSportsQuery(query, context) {
  setTranslationLocale(context);
  const parsed = parseQuery(query);
  if (!parsed) return { html: "" };

  if (useEspnApi) {
    try {
      const html = await handleEspnQuery(parsed, context);
      if (html) {
        return {
          title: "",
          html,
        };
      }
    } catch (err) {
      if (debugMode) {
        console.warn("ESPN API request failed, trying fallback APIs:", err);
      }
    }
  }

  if (parsed.sport === "soccer") {
    return {
      title: "",
      html: await handleSoccerQuery(parsed, context),
    };
  }

  if (isBalldontlieSport(parsed.sport)) {
    return {
      title: "",
      html: await handleBalldontlieTeamOrLeagueQuery(parsed, parsed.sport, context),
    };
  }

  return { html: "" };
}


function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handleRefreshRoute(request) {
  const url = new URL(request.url);
  const query = String(url.searchParams.get("query") ?? "").trim();
  if (!query) {
    return jsonResponse({ error: "Missing query" }, 400);
  }

  const focusEventId = String(url.searchParams.get("eventId") ?? "").trim();
  const defaultEventId = String(url.searchParams.get("defaultEventId") ?? "").trim();
  const refreshContext = {
    ...(request.context || {}),
    sportsFocusEventId: focusEventId || undefined,
    sportsDefaultEventId: defaultEventId || undefined,
  };

  const parsed = parseQuery(query);
  const key = getRefreshCacheKey(query, focusEventId, defaultEventId);
  const now = Date.now();
  const minIntervalMs =
    useEspnApi || (parsed && isBalldontlieSport(parsed.sport))
      ? useEspnApi
        ? ESPN_LIVE_REFRESH_MS
        : BALLDONTLIE_FREE_REFRESH_MS
      : 0;
  const cached = refreshCache.get(key);

  if (cached && minIntervalMs && now - cached.fetchedAt < minIntervalMs) {
    return jsonResponse({
      html: cached.html,
      cached: true,
      retryAfterMs: minIntervalMs - (now - cached.fetchedAt),
      fetchedAt: cached.fetchedAt,
    });
  }

  try {
    const result = await executeSportsQuery(query, refreshContext);
    const html = result.html || "";
    const fetchedAt = Date.now();
    setRefreshCache(key, {
      html,
      fetchedAt,
    });

    return jsonResponse({
      html,
      cached: false,
      retryAfterMs: minIntervalMs,
      fetchedAt,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Unknown provider error",
      },
      500,
    );
  }
}

async function handleLogoRoute(request) {
  const url = new URL(request.url);
  const sport = String(url.searchParams.get("sport") ?? "")
    .trim()
    .toLowerCase();
  const abbreviation = String(url.searchParams.get("abbr") ?? "")
    .trim()
    .toUpperCase();
  const crest = String(url.searchParams.get("crest") ?? "").trim();
  const jerseySrc = String(url.searchParams.get("src") ?? "").trim();

  if (sport === "jersey") {
    if (!jerseySrc || !/^https:\/\/stitcher\.espn\.com\//i.test(jerseySrc)) {
      return new Response("Not found", { status: 404 });
    }

    const cacheKey = `jersey:${jerseySrc}`;
    const cached = decodeLogoCacheEntry(await cacheGet(logoCache, cacheKey));
    if (cached) {
      return new Response(cached.bytes.slice(), {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    try {
      const response = await fetchWithTimeout(jerseySrc, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        return new Response("Not found", { status: 404 });
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/png";
      await cacheSet(
        logoCache,
        cacheKey,
        encodeLogoCacheEntry(bytes, contentType),
        LOGO_CACHE_TTL_MS,
      );

      return new Response(bytes.slice(), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  if (!["nba", "nfl", "mlb", "soccer"].includes(sport) || (!abbreviation && !crest)) {
    return new Response("Not found", { status: 404 });
  }

  const crestSlug = extractEspnCountryLogoSlug(crest);
  const cacheKey =
    sport === "soccer"
      ? `soccer:${abbreviation}:${crestSlug || crest || "none"}`
      : `${sport}:${abbreviation}`;
  const cached = decodeLogoCacheEntry(await cacheGet(logoCache, cacheKey));
  if (cached) {
    return new Response(cached.bytes.slice(), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const remoteUrl =
    sport === "soccer"
      ? resolveSoccerLogoRemoteUrl(abbreviation, crest)
      : getRemoteLogoUrlForTeam(sport, abbreviation);
  if (!remoteUrl) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const response = await fetchWithTimeout(
      remoteUrl,
      {
        headers: {
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      },
    );

    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    await cacheSet(
      logoCache,
      cacheKey,
      encodeLogoCacheEntry(bytes, contentType),
      LOGO_CACHE_TTL_MS,
    );

    return new Response(bytes.slice(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export const routes = [
  {
    path: "logo",
    method: "get",
    handler: handleLogoRoute,
  },
  {
    path: "refresh",
    method: "get",
    handler: handleRefreshRoute,
  },
];

export const slot = {
  id: "sports-results",
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  isClientExposed: true,
  position: "above-results",
  settingsSchema: sharedSettingsSchema,
  init: initRuntime,
  configure: configureSharedSettings,
  trigger(query) {
    // Slot-only plugin: natural-language triggering IS the plugin
    // (there's no bang-command capability). A user-facing "Natural
    // language" toggle would only ever mean "disable the plugin
    // entirely", which duplicates the plugin-enable toggle degoog
    // already ships — so no toggle is declared in settingsSchema and
    // no gating runs here.
    return Boolean(parseQuery(query));
  },
  async execute(query, context) {
    try {
      return await executeSportsQuery(query, context);
    } catch (error) {
      const parsed = parseQuery(query);
      const message =
        error instanceof Error ? error.message : "Unknown provider error";
      return {
        title: "",
        html: renderEmptyCard(
          parsed?.sport || "soccer",
          PLUGIN_NAME,
          t("providerFailed"),
          message,
        ),
      };
    }
  },
};

// ── Exports ───────────────────────────────────────────────────
// Slot-only shape: a previous version of this file also exported a
// bang `command` (trigger "sports", alias "scoreboard"), but degoog's
// Settings → Plugins page renders one row per exported capability,
// which produced a duplicate "Sports Results" entry with its own
// (redundant) Configure panel. Keeping only the slot collapses that
// to a single row.
//
// The slot renders above search results for natural sports queries.
export const slotPlugin = slot;

export const lineupLayoutTestHelpers = {
  layoutPitchPlayers,
  getFormationRows,
  assignPlayersToFormationRows,
  getFormationRowY,
  resolveEffectiveFormation,
};

export const timelineTestHelpers = {
  parseSoccerCommentaryTimeline,
  parseCommentaryAthleteTeam,
  parseCommentaryEventTeam,
  resolveTimelineTeamSide,
};

export default slot;
