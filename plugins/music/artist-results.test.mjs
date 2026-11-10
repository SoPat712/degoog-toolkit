import assert from "node:assert/strict";
import test from "node:test";
import { slot } from "./index.js";
import { resultsNameArtist } from "./result-hints.mjs";

// The top twenty results of live searches, trimmed to what the hints read.
const RECORDED = {
  "taylor swift": [
    ["https://en.wikipedia.org/wiki/Taylor_Swift", "Taylor Swift - Wikipedia"],
    ["https://www.taylorswift.com", "The Official Website of Taylor Swift"],
    ["https://www.instagram.com/taylorswift", "Taylor Swift (@taylorswift) • Instagram photos and videos"],
    ["https://www.youtube.com/@taylorswift", "Taylor Swift - YouTube"],
    ["https://www.taylorswift.com/forafortnight", "The Official Website of Taylor Swift"],
    ["https://www.tmz.com/people/taylor-swift", "Taylor Swift: News and Updates | TMZ"],
    ["https://www.youtube.com/watch?v=mw3kSNIxjqo", "Taylor Swift - Patient Zero (Official Music Video) - YouTube"],
    ["https://people.com/tag/taylor-swift", "Taylor Swift - People.com"],
    ["https://en.wikipedia.org/wiki/Taylor_Swift_(album)", "Taylor Swift (album)"],
    ["https://en.wikipedia.org/wiki/Wedding_of_Taylor_Swift_and_Travis_Kelce", "Wedding of Taylor Swift and Travis Kelce"],
    ["https://store.taylorswift.com", "Taylor Swift Store"],
    ["https://en.wikipedia.org/wiki/Red_(Taylor_Swift_album)", "Red (Taylor Swift album)"],
    ["https://www.facebook.com/TaylorSwift", "Taylor Swift (@ TaylorSwift ) - Facebook"],
    ["https://en.wikipedia.org/wiki/Taylor_Swift_albums_discography", "Taylor Swift albums discography"],
    ["https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02", "Listen to Taylor Swift Songs - Spotify"],
    ["https://en.wikipedia.org/wiki/Taylor_Swift_singles_discography", "Taylor Swift singles discography"],
    ["https://people.com/taylor-swift-shares-personal-footage-of-her-visiting-cleveland-with-husband-travis-kelce-in-new-lyric-video-12141286", "Taylor Swift Shares Personal Footage of Her Visiting Cleveland with ..."],
    ["https://www.youtube.com/channel/UCqECaJ8Gagnn7YCbPEzWH6g", "Taylor Swift - YouTube"],
    ["https://en.wikipedia.org/wiki/Love_Story_(Taylor_Swift_song)", "Love Story (Taylor Swift song)"],
    ["https://www.imdb.com/name/nm2357847", "Taylor Swift - IMDb"],
  ],
  "radiohead": [
    ["https://en.wikipedia.org/wiki/Radiohead", "Radiohead - Wikipedia"],
    ["https://www.radiohead.com", "Australia and Japan 2027 | RADIOHEAD.COM"],
    ["https://en.wikipedia.org/wiki/Radiohead_discography", "Radiohead discography - Wikipedia"],
    ["http://archive.radiohead.com/Site12", "RADIOHEAD.COM"],
    ["https://www.youtube.com/watch?v=XFkzRNyygfk", "Radiohead - Creep - YouTube"],
    ["https://www.britannica.com/topic/Radiohead", "Radiohead | Members, Albums, & Facts | Britannica"],
    ["https://www.radiohead.com/library", "The Radiohead Public Library | RADIOHEAD.COM"],
    ["https://en.wikipedia.org/wiki/Creep_(Radiohead_song)", "Creep (Radiohead song)"],
    ["https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb", "Listen to Radiohead Songs | Spotify"],
    ["https://de.wikipedia.org/wiki/Radiohead", "Radiohead – Wikipedia"],
    ["https://www.youtube.com/Radiohead", "Radiohead - YouTube"],
    ["https://en.wikipedia.org/wiki/The_Bends_(album)", "The Bends (album)"],
    ["https://www.wasteheadquarters.com", "W.A.S.T.E. HQ: Home"],
    ["https://en.wikipedia.org/wiki/In_Rainbows", "In Rainbows"],
    ["https://www.instagram.com/radiohead/?hl=en", "Radiohead (@ radiohead ) • Instagram photos and videos"],
    ["https://en.wikipedia.org/wiki/Kid_A", "Kid A"],
    ["https://www.youtube.com/radiohead/search", "Radiohead - YouTube"],
    ["https://www.youtube.com/channel/UCq19-LqvG35A-30oyAiPiqA", "Radiohead - YouTube"],
    ["https://radiohead.com/deadairspace", "DEAD AIR SPACE | RADIOHEAD .COM"],
    ["https://en.wikipedia.org/wiki/OK_Computer", "OK Computer"],
  ],
  "adele": [
    ["https://en.wikipedia.org/wiki/Adele", "Adele - Wikipedia"],
    ["https://www.youtube.com/channel/UCsRM0YB_dabtEPGPTKo-gcw", "Adele - YouTube"],
    ["https://www.adele.com", "Adele"],
    ["https://www.ladbible.com/entertainment/celebrity/adele-where-is-she-now-music-break-249197-20260504", "Where Adele is now after ‘disappearing from spotlight' - LADbible"],
    ["https://www.britannica.com/biography/Adele", "Adele | Biography, Songs, Albums, Hello, 30, & Facts | Britannica"],
    ["https://www.hellomagazine.com/tags/adele", "Adele: Latest news and photos of the British singer - HELLO!"],
    ["https://en.m.wikipedia.org/wiki/Adele", "Adele - Wikipedia"],
    ["https://www.instagram.com/adele/?hl=en", "Adele (@ adele ) • Instagram photos and videos"],
    ["https://en.wikipedia.org/wiki/Hello_(Adele_song)", "Hello (Adele song)"],
    ["https://www.tmz.com/people/adele", "Adele | Latest News and Updates | TMZ"],
    ["https://en.wikipedia.org/wiki/Adele_discography", "Adele discography - Wikipedia"],
    ["https://en.wikipedia.org/wiki/25_(Adele_album)", "25 (Adele album)"],
    ["https://open.spotify.com/artist/4dpARuHxo51G3z768sgnrY", "Listen to Adele Songs | Spotify"],
    ["https://en.wikipedia.org/wiki/Adele_(disambiguation)", "Adele (disambiguation)"],
    ["https://m.youtube.com/watch?v=e8lFlJe9hdw", "| Best of Adele | Top Adele Songs of All Time - YouTube"],
    ["https://www.youtube.com/watch?v=e8lFlJe9hdw", "| Best of Adele | Top Adele Songs of All Time - YouTube"],
    ["https://en.wikipedia.org/wiki/21_(Adele_album)", "21 (Adele album)"],
    ["https://x.com/Adele?lang=en", "Adele - X"],
    ["https://en.wikipedia.org/wiki/30_(album)", "30 (album)"],
    ["https://www.billboard.com/artist/adele", "Adele | Biography, Music & News | Billboard"],
  ],
  "the beatles": [
    ["https://en.wikipedia.org/wiki/The_Beatles", "The Beatles - Wikipedia"],
    ["https://www.thebeatles.com", "The Beatles"],
    ["https://www.britannica.com/topic/the-Beatles", "The Beatles | Members, Discography, Songs, Let It Be, Albums ..."],
    ["https://en.wikipedia.org/wiki/The_Beatles_albums_discography", "The Beatles albums discography - Wikipedia"],
    ["https://en.wikipedia.org/wiki/The_Beatles_(album)", "The Beatles (album)"],
    ["https://open.spotify.com/artist/3WrFJ7ztbogyGnTHbHJFl2", "Listen to The Beatles Songs | Spotify"],
    ["https://en.wikipedia.org/wiki/With_the_Beatles", "With the Beatles"],
    ["https://www.youtube.com/@thebeatles", "The Beatles - YouTube"],
    ["https://www.instagram.com/thebeatles/?hl=en", "The Beatles (@ thebeatles ) • Instagram photos and videos"],
    ["https://www.thebeatles.com/news", "News - The Beatles"],
    ["https://www.facebook.com/thebeatles", "The Beatles (@ thebeatles ) - Facebook"],
    ["https://en.wikipedia.org/wiki/Paul_McCartney", "Paul McCartney"],
    ["https://www.youtube.com/channel/UCc4K7bAqpdBP8jh1j9XZAww", "The Beatles - YouTube"],
    ["https://en.wikipedia.org/wiki/Revolver_(Beatles_album)", "Revolver (Beatles album)"],
    ["https://www.youtube.com/watch?v=CGj85pVzRJs", "The Beatles - The Beatles - Let It Be (Official Music Video ..."],
    ["https://en.wikipedia.org/wiki/The_Beatles_timeline", "The Beatles timeline"],
    ["https://www.allmusic.com/artist/the-beatles-mn0000754032", "The Beatles — Biography, Discography, Albums & Expert Reviews"],
    ["https://en.wikipedia.org/wiki/Meet_the_Beatles!", "Meet the Beatles!"],
    ["https://www.billboard.com/artist/the-beatles", "The Beatles | Biography, Music & News | Billboard"],
    ["https://en.wikipedia.org/wiki/Beatles_(disambiguation)", "Beatles (disambiguation)"],
  ],
  "queen": [
    ["https://en.wikipedia.org/wiki/Queen_(band)", "Queen (band) - Wikipedia"],
    ["https://www.youtube.com/watch?v=fJ9rUzIMcZQ", "Queen – Bohemian Rhapsody (Official Video Remastered)"],
    ["https://en.wikipedia.org/wiki/Queen_discography", "Queen discography - Wikipedia"],
    ["https://www.imdb.com/name/nm1277102", "Queen - IMDb"],
    ["https://en.wikipedia.org/wiki/Queen", "Queen"],
    ["https://queenonline.com", "QueenOnline.com - The Official Queen Website"],
    ["https://www.britannica.com/topic/Queen-British-rock-group", "Queen | We Will Rock You, Movie, Freddie Mercury, Songs, Band …"],
    ["https://www.youtube.com/user/queenofficial", "Queen Official - YouTube"],
    ["https://en.wikipedia.org/wiki/Queen_(Queen_album)", "Queen (Queen album)"],
    ["https://www.youtube.com/channel/UCiMhD4jzUqG-IgPzUmmytRQ", "Queen Official - YouTube"],
    ["https://open.spotify.com/artist/1dfeR4HaWDbWqFHLkxsg1d", "Listen to Queen Songs | Spotify"],
    ["https://www.facebook.com/Queen", "Queen | London - Facebook"],
    ["https://en.wikipedia.org/wiki/Elizabeth_II", "Elizabeth II"],
    ["https://en.wikipedia.org/wiki/Queen_Victoria", "Queen Victoria"],
    ["https://www.queenonline.com/queen", "QueenOnline.com - About Queen"],
    ["https://en.wikipedia.org/wiki/Queen_Elizabeth_the_Queen_Mother", "Queen Elizabeth the Queen Mother"],
    ["https://music.youtube.com/@Queen", "Queen - YouTube Music"],
    ["https://rockhall.com/inductees/queen", "Queen | Rock & Roll Hall of Fame"],
    ["https://en.wikipedia.org/wiki/Queen_Camilla", "Queen Camilla"],
    ["https://music.apple.com/us/artist/queen/3296287", "Queen - Apple Music"],
  ],
  "yes": [
    ["https://en.wikipedia.org/wiki/Yes_(band)", "Yes (band) - Wikipedia"],
    ["https://www.yesworld.com", "Official website for the progressive rock band YES"],
    ["https://www.youtube.com/channel/UCJ2BSIyIU84ZtJ9MiLh0jZA", "yesofficial - YouTube"],
    ["https://en.wikipedia.org/wiki/Yes_discography", "Yes discography - Wikipedia"],
    ["https://en.wikipedia.org/wiki/Yes", "Yes"],
    ["https://en.wikipedia.org/wiki/Yes_(Yes_album)", "Yes (Yes album)"],
    ["https://www.yesnetwork.com", "YES Network – The video streaming home of the New York Yankees …"],
    ["https://open.spotify.com/artist/7AC976RDJzL2asmZuz7qil", "Listen to Yes Songs | Spotify"],
    ["https://en.wikipedia.org/wiki/Yes%2C_God%2C_Yes", "Yes, God, Yes"],
    ["https://www.facebook.com/yestheband", "YES (official) (@yestheband) - Facebook"],
    ["https://en.wikipedia.org/wiki/Yes%2C_and_...", "Yes, and ..."],
    ["https://www.youtube.com/watch?v=RZq2JYYKzmo", "Yes - Yessongs (Full Album - 1973) Live - Remastered - YouTube"],
    ["https://www.allmusic.com/artist/yes-mn0000685647", "Yes — Biography, Discography, Albums & Expert Reviews - AllMusic"],
    ["https://en.wikipedia.org/wiki/Yes_or_Yes", "Yes or Yes"],
    ["https://middermusic.com/yes-songs", "14 Best Yes Songs Of All Time (Greatest Hits) - MidderMusic"],
    ["https://music.apple.com/us/artist/yes/154011", "Yes - Apple Music"],
    ["https://en.wikipedia.org/wiki/Yes%2C_And%3F", "Yes, And?"],
    ["https://simple.wikipedia.org/wiki/Yes_(band)", "Yes (band) - Simple English Wikipedia, the free encyclopedia"],
    ["https://www.merriam-webster.com/dictionary/yes", "YES Definition & Meaning - Merriam-Webster"],
    ["https://en.wikipedia.org/wiki/Yes_or_No", "Yes or No"],
  ],
  "hello": [
    ["https://en.wikipedia.org/wiki/Hello", "Hello - Wikipedia"],
    ["https://www.youtube.com/watch?v=YQHsXMglC9A", "Adele - Hello (Official Music Video) - YouTube"],
    ["https://www.hellomagazine.com/us", "HELLO! US Edition - Latest news and Photos"],
    ["https://en.wikipedia.org/wiki/Hello_(Adele_song)", "Hello (Adele song) - Wikipedia"],
    ["https://www.hellomagazine.com", "HELLO! - Daily royal, celebrity, fashion, beauty & lifestyle news"],
    ["https://en.wikipedia.org/wiki/Hello_Kitty", "Hello Kitty"],
    ["https://open.spotify.com/track/4sPmO7WMQUAf45kwMOtONw", "Hello - song and lyrics by Adele - Spotify"],
    ["https://en.wikipedia.org/wiki/Hello_Hello", "Hello Hello"],
    ["https://en.wikipedia.org/wiki/Hello%2C_world", "Hello, world"],
    ["https://www.youtube.com/watch?v=be12BC5pQLE", "Adele - Hello (Lyrics) - YouTube"],
    ["https://www.youtube.com/watch?v=mHONNcZbwDY", "Lionel Richie - Hello (Official Music Video) - YouTube"],
    ["https://en.wikipedia.org/wiki/Hello_Twelve%2C_Hello_Thirteen%2C_Hello_Love", "Hello Twelve, Hello Thirteen, Hello Love"],
    ["https://genius.com/Adele-hello-lyrics", "Adele – Hello Lyrics - Genius"],
    ["https://www.hello-products.com", "Hello Products"],
    ["https://en.wikipedia.org/wiki/Hello_World", "Hello World"],
    ["https://www.hello.com", "hello network"],
    ["https://en.wikipedia.org/wiki/Hello_(disambiguation)", "Hello (disambiguation)"],
    ["https://simple.wikipedia.org/wiki/Hello_(Adele_song)", "Hello (Adele song) - Simple English Wikipedia, the free encyclopedia"],
    ["https://www.merriam-webster.com/dictionary/hello", "HELLO Definition & Meaning - Merriam-Webster"],
    ["https://en.wikipedia.org/wiki/Hello_Neighbor", "Hello Neighbor"],
  ],
  "coffee": [
    ["https://en.wikipedia.org/wiki/Coffee", "Coffee - Wikipedia"],
    ["https://www.britannica.com/topic/coffee", "Coffee | Origin, Types, Uses, History, & Facts | Britannica"],
    ["https://www.aboutcoffee.org/origins/what-is-coffee", "What is coffee? - NCA - About Coffee"],
    ["https://www.yelp.com/search?cflt=coffee&find_loc=bronx%2C+ny&msockid=29358aca2f416c523cc092c72ec46dc4", "THE BEST 10 COFFEE & TEA IN BRONX, NY - (2026 GUIDE ... - Yelp"],
    ["https://stonestreetcoffee.com", "Stone Street Coffee : Cold Brew, Single Origin and Blended Coffees"],
    ["https://en.wikipedia.org/wiki/Coffee_(disambiguation)", "Coffee (disambiguation)"],
    ["https://www.starbucks.com/en-us", "Starbucks Coffee Company"],
    ["https://nutritionsource.hsph.harvard.edu/food-features/coffee", "Coffee - The Nutrition Source"],
    ["https://en.wikipedia.org/wiki/History_of_coffee", "History of coffee"],
    ["https://www.eightoclock.com", "Eight O'Clock Coffee : Premium Ground Coffee & Gourmet Arabica ..."],
    ["https://en.wikipedia.org/wiki/Starbucks", "Starbucks"],
    ["https://en.wikipedia.org/wiki/The_Coffee_Table", "The Coffee Table"],
    ["https://www.yelp.com/search?find_desc=coffee+shops&find_loc=Bronx%2C+NY&msockid=29358aca2f416c523cc092c72ec46dc4", "Coffee Shops Bronx, NY - Last Updated November 2026 - Yelp"],
    ["https://en.wikipedia.org/wiki/List_of_coffee_drinks", "List of coffee drinks"],
    ["https://www.amazon.com/coffee/s?k=coffee", "Amazon.com: Coffee"],
    ["https://www.drinktrade.com/collections/all", "Specialty Coffee | Buy Coffee Online - Trade Coffee"],
    ["https://en.wikipedia.org/wiki/Kopi_luwak", "Kopi luwak"],
    ["https://www.healthline.com/nutrition/top-evidence-based-health-benefits-of-coffee", "9 Health Benefits of Coffee : What the Science Says - Healthline"],
    ["https://en.wikipedia.org/wiki/Coffee_preparation", "Coffee preparation"],
    ["https://sca.coffee", "Specialty Coffee Association"],
  ],
  "pizza": [
    ["https://en.wikipedia.org/wiki/Pizza", "Pizza - Wikipedia"],
    ["https://www.yelp.com/search?cflt=pizza&find_loc=Leitchfield%2C+KY+42754&msockid=1a507f7b9a766b18226d67769b856a9e", "The Best 10 Pizza Places near Leitchfield, KY 42754 - Yelp"],
    ["https://www.pizzahut.com", "Pizza Hut | Delivery & Carryout - No One OutPizzas The Hut!"],
    ["https://mrgattispizza.com/homepage/locations/gattis-pizza-leitchfield", "Pizza and Fun Times at Gatti’s Pizza Leitchfield"],
    ["https://en.wikipedia.org/wiki/Pizza_(disambiguation)", "Pizza (disambiguation)"],
    ["https://www.pizzahut.com/c/content/menu?msockid=1a507f7b9a766b18226d67769b856a9e", "Order Online - Pizza Hut Menu"],
    ["http://www.dominos.com", "Domino's: Pizza Delivery & Carryout, Pasta, Wings & More"],
    ["https://en.wikipedia.org/wiki/Pizza_Hut", "Pizza Hut"],
    ["https://pizza.dominos.com/kentucky/leitchfield/1309-elizabeth-town-road", "Domino's Pizza at 1309 Elizabeth Town Road | Domino's in Leitchfield"],
    ["https://www.papajohns.com", "Papa Johns Pizza Delivery & Carryout - Best Deals on Pizza , Sides ..."],
    ["https://en.wikipedia.org/wiki/Pentagon_pizza_theory", "Pentagon pizza theory"],
    ["https://www.pizzahut.com/%22?msockid=1a507f7b9a766b18226d67769b856a9e", "Pizza Hut | Delivery & Carryout - No One OutPizzas The Hut!"],
    ["https://littlecaesars.com/en-us", "Little Caesars® | Best Value Delivery & Carryout"],
    ["https://en.wikipedia.org/wiki/Pizza_Pizza", "Pizza Pizza"],
    ["https://pizza.dominos.com/kentucky/leitchfield", "Pizza Delivery & Carryout in Leitchfield, Kentucky| Domino's Pizza"],
    ["https://www.potomacpizza.com/menuorderonline", "Order Fresh & Delicious Pizza / Meals Online Near Potomac, MD"],
    ["https://en.wikipedia.org/wiki/History_of_pizza", "History of pizza"],
    ["https://littlecaesars.com/en-us/store/11266", "Pizza Near You in LEITCHFIELD, KY | Little Caesars Store #11266"],
    ["https://www.youtube.com/watch?v=4mA54Uy3YGY", "How To Make Perfect New York Pizza - YouTube"],
    ["https://en.wikipedia.org/wiki/Neapolitan_pizza", "Neapolitan pizza"],
  ],
  "minecraft": [
    ["https://www.minecraft.net/en-us/download", "Download Minecraft Java & Bedrock Edition | Minecraft"],
    ["https://www.minecraft.net", "Welcome to the Minecraft Official Site | Minecraft"],
    ["https://classic.minecraft.net", "Minecraft Classic"],
    ["https://en.wikipedia.org/wiki/Minecraft", "Minecraft - Wikipedia"],
    ["https://help.minecraft.net/hc/en-us/articles/23907917790093-How-to-Download-and-Install-the-Minecraft-Launcher", "Download and Install the Minecraft Launcher | Minecraft Help"],
    ["https://minecraft.fandom.com/wiki/Minecraft_Wiki", "Minecraft Wiki"],
    ["https://play.google.com/store/apps/details?id=com.mojang.minecraftpe&hl=en-US", "Minecraft: Dream it, Build it! - Apps on Google Play"],
    ["https://apps.microsoft.com/detail/9pj8266bhfwn", "Minecraft: Java Edition - Free download and play on Windows"],
    ["https://minecraft.wiki", "Minecraft Wiki"],
    ["https://education.minecraft.net", "Get Minecraft for Your Classroom | Minecraft Education"],
    ["https://www.minecraft.net/en-us", "Welcome to the Minecraft Official Site | Minecraft"],
    ["https://en.wikipedia.org/wiki/A_Minecraft_Movie", "A Minecraft Movie"],
    ["https://education.minecraft.net/en-us", "Minecraft Education: Get Minecraft for Your Classroom"],
    ["https://en.wikipedia.org/wiki/Steve_(Minecraft)", "Steve (Minecraft)"],
    ["https://en.wikipedia.org/wiki/A_Minecraft_Movie_Squared", "A Minecraft Movie Squared"],
    ["https://www.minecraft.net/en-us/about-minecraft", "What is Minecraft ? Discover the World of Minecraft"],
    ["https://en.wikipedia.org/wiki/Minecraft%3A_Story_Mode", "Minecraft: Story Mode"],
    ["https://play.google.com/store/apps/details?id=com.mojang.minecraftpe&hl=en_US", "Minecraft : Dream it, Build it! - Apps on Google Play"],
    ["https://en.wikipedia.org/wiki/Markus_Persson", "Markus Persson"],
    ["https://www.youtube.com/channel/UC1sELGmy5jp5fQUugmuYlXQ", "Minecraft - YouTube"],
  ],
  "lyrics": [
    ["https://www.azlyrics.com", "AZLyrics - Song Lyrics from A to Z"],
    ["https://genius.com", "Genius | Song Lyrics & Knowledge"],
    ["https://www.lyrics.com", "Lyrics.com"],
    ["https://www.songlyrics.com", "SONGLYRICS.com | Song Lyrics & Meanings"],
    ["https://www.azlyrics.com/a/az.html", "AZ Lyrics"],
    ["https://en.wikipedia.org/wiki/Lyrics", "Lyrics - Wikipedia"],
    ["https://findmylyrics.com", "Find My Lyrics - Search Song Lyrics by Any Word or Phrase"],
    ["https://lyricfinder.net", "Lyric Finder: Song Finder by Lyrics - Find Song by Lyrics"],
    ["https://www.lyricsfreak.com", "Lyrics, Artists, Albums | LyricsFreak.com"],
    ["https://en.wikipedia.org/wiki/Music_and_Lyrics", "Music and Lyrics"],
    ["https://www.lyricsondemand.com", "Lyrics On Demand"],
    ["https://lyricstraining.com", "Learn Languages with Music Videos, Lyrics and Karaoke!"],
    ["https://en.wikipedia.org/wiki/Dramatic_Lyrics", "Dramatic Lyrics"],
    ["https://www.lyricfind.com", "LyricFind"],
    ["https://en.wikipedia.org/wiki/Lyrics_Born", "Lyrics Born"],
    ["https://apps.apple.com/us/app/genius-song-lyrics-finder/id709482991", "Genius: Song Lyrics Finder - App Store - Apple"],
    ["https://en.wikipedia.org/wiki/Lyrics_(disambiguation)", "Lyrics (disambiguation)"],
    ["https://www.youtube.com/@swlyrics", "Songs With Lyrics - YouTube"],
    ["https://en.wikipedia.org/wiki/MetroLyrics", "MetroLyrics"],
    ["https://play.google.com/store/apps/details?id=brasil.leonardo.letras&hl=en_US", "Lyrics - Apps on Google Play"],
  ],
  "news": [
    ["https://news.google.com", "Google News"],
    ["https://www.cnn.com", "Breaking News, Latest News and Videos | CNN"],
    ["https://www.nbcnews.com", "NBC News – Breaking Headlines and Video Reports on World, U.S. and"],
    ["https://apnews.com", "Associated Press News: Breaking News, Latest Headlines and Videos | AP News"],
    ["https://www.npr.org/sections/news", "News: U.S. and World News Headlines : NPR"],
    ["https://www.foxnews.com", "Fox News - Breaking News Updates | Latest News Headlines | Photos ..."],
    ["https://abcnews.com", "ABC News - Breaking News, Latest News and Videos"],
    ["https://www.cbsnews.com", "CBS News | Breaking News, Top Stories & Exclusive Coverage"],
    ["https://www.bbc.com/news", "BBC News - Breaking news, video and the latest top stories from the U.S ..."],
    ["https://www.yahoo.com/news", "Yahoo News: Latest and Breaking News, Headlines, Live Updates, and More"],
    ["https://en.wikipedia.org/wiki/News", "News"],
    ["https://www.foxnews.com/?msockid=1785165e6d126c1126c70e536c5e6de3", "Fox News - Breaking News Updates | Latest News Headlines | Photos ..."],
    ["https://www.msn.com/en-us/news", "MSN | Personalized News, Top Headlines, Live Updates and more"],
    ["https://en.wikipedia.org/wiki/News_(disambiguation)", "News (disambiguation)"],
    ["https://en.wikipedia.org/wiki/NeWS", "NeWS"],
    ["https://www.bbc.co.uk/news", "Home - BBC News"],
    ["https://en.wikipedia.org/wiki/Fox_News", "Fox News"],
    ["https://en.wikipedia.org/wiki/CBS_News", "CBS News"],
    ["https://en.wikipedia.org/wiki/NBC_News", "NBC News"],
    ["https://en.wikipedia.org/wiki/BBC_News", "BBC News"],
  ],
};
const results = (query) => RECORDED[query].map(([url, title]) => ({ url, title }));
const ARTISTS = ["taylor swift", "radiohead", "adele", "the beatles"];
const NOT_ARTISTS = ["queen", "yes", "hello", "coffee", "pizza", "minecraft", "lyrics", "news"];

const MBID = "a74b1b7f-71a5-4011-9441-d0b5e4122711";
const musicBrainz = (artists, requests = []) => async (input) => {
  const url = new URL(input);
  requests.push(url);
  return url.pathname.endsWith("/artist")
    ? Response.json({ artists })
    : Response.json({ "release-groups": [{ id: MBID, title: "Debut", "primary-type": "Album", "first-release-date": "2006-01-01" }] });
};
const titleCase = (query) => query.replace(/\b\w/g, (letter) => letter.toUpperCase());

test("recorded results name a musician only for bare artist names", () => {
  for (const query of ARTISTS) assert.equal(resultsNameArtist(query, results(query)), true, query);
  for (const query of NOT_ARTISTS) assert.equal(resultsNameArtist(query, results(query)), false, query);
});

test("a bare artist name shows the exact MusicBrainz person or group", async () => {
  for (const query of ARTISTS) {
    slot.init({});
    const requests = [];
    const name = titleCase(query);
    const rendered = await slot.execute(query, { results: results(query), fetch: musicBrainz([
      { id: MBID, name, type: query === "the beatles" || query === "radiohead" ? "Group" : "Person", score: 100 },
    ], requests) });
    assert.match(rendered.html, new RegExp(`music-title-link[^>]*>${name}<`), query);
    assert.equal(requests[0].searchParams.get("query"), `artist:"${query}"`);
  }
});

test("common words and band-named words never contact MusicBrainz", async () => {
  slot.init({});
  for (const query of [...NOT_ARTISTS, "2+2"]) {
    const rendered = await slot.execute(query, { results: RECORDED[query] ? results(query) : [], fetch: () => { throw new Error("must not fetch"); } });
    assert.equal(rendered.html, "", query);
  }
});

test("the results must agree with a close, exact MusicBrainz person or group", async () => {
  for (const artists of [
    [],
    [{ id: MBID, name: "Adele Tribute Band", type: "Group", score: 100 }],
    [{ id: MBID, name: "Adele", type: "Person", score: 73 }],
    [{ id: MBID, name: "Adele", type: "Character", score: 100 }],
    [{ id: MBID, name: "Adele", score: 100 }],
  ]) {
    slot.init({});
    const requests = [];
    const rendered = await slot.execute("adele", { results: results("adele"), fetch: musicBrainz(artists, requests) });
    assert.equal(rendered.html, "", JSON.stringify(artists));
    assert.equal(requests.length, 1, "no discography browse without an artist");
  }
  slot.init({});
  const rendered = await slot.execute("adele", { results: results("adele"), fetch: musicBrainz([
    { id: MBID, name: "Adele Tribute Band", type: "Group", score: 100 },
    { id: MBID, name: "Adele", type: "Person", score: 100 },
  ]) });
  assert.match(rendered.html, /music-title-link[^>]*>Adele</, "a homonym ranked first is skipped");
  slot.init({});
  assert.equal((await slot.execute("adele", { results: results("adele"), fetch: async () => new Response("", { status: 503 }) })).html, "");
});

test("evidence needs three distinct music results, one in the top ten", () => {
  const wiki = (title) => ({ url: `https://en.wikipedia.org/wiki/${title}`, title });
  const filler = { url: "https://example.com", title: "Elsewhere" };
  const spotifyArtist = { url: "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb", title: "Listen to Radiohead Songs | Spotify" };
  const three = [wiki("Radiohead_discography"), wiki("Creep_(Radiohead_song)"), spotifyArtist];
  assert.equal(resultsNameArtist("radiohead", three), true);
  assert.equal(resultsNameArtist("radiohead", three.slice(0, 2)), false, "two are not enough");
  assert.equal(resultsNameArtist("radiohead", [...Array(10).fill(filler), ...three]), false, "none in the top ten");
  assert.equal(resultsNameArtist("radiohead", [...three, ...Array(20).fill(filler)].slice(1).concat(three[0])), false, "past the top twenty");
  const mobile = { url: "https://en.m.wikipedia.org/wiki/Radiohead_discography", title: "Radiohead discography" };
  const otherSpotify = { ...spotifyArtist, url: "https://open.spotify.com/artist/0000000000000000000000" };
  assert.equal(resultsNameArtist("radiohead", [three[0], mobile, spotifyArtist, otherSpotify]), false, "one article or service counts once");
  for (const url of ["https://open.spotify.com.evil.test/artist/4Z8W4fKeB5YxbusRsdQVPb", "http://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb", "https://open.spotify.com/track/4Z8W4fKeB5YxbusRsdQVPb"]) {
    assert.equal(resultsNameArtist("radiohead", [...three.slice(0, 2), { ...spotifyArtist, url }]), false, url);
  }
  assert.equal(resultsNameArtist("radiohead", [...three.slice(0, 2), { ...spotifyArtist, title: "Listen to Thom Yorke Songs | Spotify" }]), false);
  assert.equal(resultsNameArtist("hello", [wiki("Hello_(Adele_song)"), wiki("Adele_discography"), wiki("25_(Adele_album)")]), false, "another artist's songs");
  assert.equal(resultsNameArtist("beatles", [wiki("Revolver_(Beatles_album)"), wiki("The_Beatles_albums_discography"), wiki("The_Beatles_(album)")]), true);
});

test("a name Wikipedia files under a qualifier abstains", () => {
  const wiki = (title) => ({ url: `https://en.wikipedia.org/wiki/${title}`, title });
  const evidence = [wiki("Queen_discography"), wiki("Queen_(Queen_album)"), { url: "https://open.spotify.com/artist/1dfeR4HaWDbWqFHLkxsg1d", title: "Listen to Queen Songs | Spotify" }];
  assert.equal(resultsNameArtist("queen", evidence), true);
  assert.equal(resultsNameArtist("queen", [wiki("Queen_(band)"), ...evidence]), false);
  assert.equal(resultsNameArtist("queen", [wiki("Queen"), ...evidence, wiki("Queen_(band)")]), false, "wherever it ranks");
  assert.equal(resultsNameArtist("queen", [wiki("Queen_(disambiguation)"), ...evidence]), true);
});
