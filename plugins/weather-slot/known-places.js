// Well-known places that make a "<place> forecast/sunrise/temperature" query
// unambiguous. Weaker keywords also mean other things ("sales forecast",
// "tequila sunrise"), so without a preposition they need one of these, a
// "City, Region" comma or a postal code. "<place> weather" needs none of this.
const KNOWN_PLACES = new Set([
  // Countries and regions
  "afghanistan", "albania", "algeria", "argentina", "armenia", "australia", "austria",
  "azerbaijan", "bahamas", "bangladesh", "belgium", "bolivia", "bosnia", "brazil",
  "bulgaria", "cambodia", "cameroon", "canada", "chile", "china", "colombia",
  "costa rica", "croatia", "cuba", "cyprus", "czechia", "czech republic", "denmark",
  "ecuador", "egypt", "england", "estonia", "ethiopia", "europe", "fiji", "finland",
  "france", "georgia", "germany", "ghana", "greece", "greenland", "guatemala", "hawaii",
  "honduras", "hong kong", "hungary", "iceland", "india", "indonesia", "iran", "iraq",
  "ireland", "israel", "italy", "jamaica", "japan", "jordan", "kazakhstan", "kenya",
  "korea", "south korea", "kuwait", "latvia", "lebanon", "lithuania", "luxembourg",
  "madagascar", "malaysia", "maldives", "malta", "mexico", "moldova", "mongolia",
  "montenegro", "morocco", "nepal", "netherlands", "new zealand", "nigeria", "norway",
  "oman", "pakistan", "panama", "paraguay", "peru", "philippines", "poland", "portugal",
  "puerto rico", "qatar", "romania", "russia", "saudi arabia", "scotland", "serbia",
  "singapore", "slovakia", "slovenia", "south africa", "spain", "sri lanka", "sweden",
  "switzerland", "taiwan", "tanzania", "thailand", "tunisia", "uae", "uganda",
  "uk", "ukraine", "united kingdom", "united states", "uruguay", "usa", "uzbekistan",
  "venezuela", "vietnam", "wales", "zimbabwe",
  // US states
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire",
  "new jersey", "new mexico", "north carolina", "north dakota", "ohio", "oklahoma",
  "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "west virginia", "wisconsin",
  "wyoming",
  // Cities
  "abu dhabi", "accra", "addis ababa", "albany", "albuquerque", "amsterdam", "anchorage",
  "ankara", "athens", "atlanta", "auckland", "austin", "baghdad", "baltimore", "bangkok",
  "barcelona", "beijing", "beirut", "belfast", "belgrade", "bengaluru", "bangalore",
  "berlin", "birmingham", "bogota", "boise", "bologna", "bordeaux", "boston", "brisbane",
  "bristol", "brooklyn", "brussels", "bucharest", "budapest", "buenos aires", "buffalo",
  "cairo", "calgary", "cancun", "cape town", "caracas", "charlotte", "chennai", "chicago",
  "cincinnati", "cleveland", "cologne", "koln", "köln", "columbus", "copenhagen",
  "dallas", "delhi", "new delhi", "denver", "detroit", "dhaka", "doha", "dubai", "dublin",
  "edinburgh", "edmonton", "florence", "frankfurt", "geneva", "glasgow", "guadalajara",
  "hamburg", "hanoi", "havana", "helsinki", "ho chi minh city", "honolulu", "houston",
  "hyderabad", "indianapolis", "istanbul", "jacksonville", "jakarta", "jerusalem",
  "johannesburg", "kansas city", "karachi", "kathmandu", "kyiv", "kiev", "kolkata",
  "krakow", "kuala lumpur", "lagos", "lahore", "las vegas", "leeds", "lima", "lisbon",
  "lisboa", "liverpool", "london", "los angeles", "lyon", "madrid", "malaga",
  "manchester", "manila", "marrakech", "marseille", "melbourne", "memphis",
  "mexico city", "miami", "milan", "milano", "milwaukee", "minneapolis", "minsk",
  "montreal", "moscow", "mumbai", "munich", "münchen", "munchen", "nairobi", "nantes",
  "naples", "napoli", "nashville", "new orleans", "new york", "new york city", "nyc",
  "oakland", "oklahoma city", "omaha", "orlando", "osaka", "oslo", "ottawa",
  "palermo", "paris", "perth", "philadelphia", "phoenix", "pittsburgh", "portland",
  "porto", "prague", "quebec", "raleigh", "reykjavik", "richmond", "riga", "rio",
  "rio de janeiro", "riyadh", "rome", "roma", "rotterdam", "sacramento", "saint louis",
  "st louis", "salt lake city", "san antonio", "san diego", "san francisco", "sf",
  "san jose", "santiago", "sao paulo", "são paulo", "sapporo", "seattle", "seoul",
  "seville", "sevilla", "shanghai", "shenzhen", "singapore", "sofia", "stockholm",
  "stuttgart", "sydney", "taipei", "tallinn", "tampa", "tbilisi", "tehran", "tel aviv",
  "tokyo", "toronto", "toulouse", "tucson", "tunis", "turin", "torino", "valencia",
  "vancouver", "venice", "venezia", "vienna", "wien", "vilnius", "warsaw", "warszawa",
  "washington", "washington dc", "dc", "wellington", "winnipeg", "wroclaw", "zagreb",
  "zurich", "zürich",
]);

export function isKnownPlace(value) {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[.?!;:]+/g, "")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return KNOWN_PLACES.has(key);
}
