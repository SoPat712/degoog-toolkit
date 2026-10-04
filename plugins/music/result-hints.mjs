export const normalizeMusicText = (value) => String(value || "")
  .normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const SOUNDCLOUD_NON_TRACKS = new Set([
  "albums", "charts", "discover", "feed", "following", "followers", "likes",
  "popular-tracks", "reposts", "search", "sets", "stations", "stream", "tags", "tracks", "you",
]);

/** Infer a recording only from a track URL and a title that agrees with the query. */
export function streamingRecordingHint(result, query) {
  let url;
  try { url = new URL(result?.url); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
  if (typeof result.title !== "string" || result.title.length > 500) return null;
  const host = url.hostname.replace(/^www\./, "");
  const text = result.title.replace(/\p{Cf}/gu, "").trim();
  let match;
  if (host === "open.spotify.com" && /^\/(?:intl-[a-z]{2}\/)?track\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname)) {
    match = text.replace(/\s+[|–—-]\s+Spotify\s*$/i, "")
      .match(/^(.+?)\s+[-–—]\s+(?:song(?:\s+(?:and|with)\s+lyrics)?|track)\s+by\s+(.+)$/i);
  } else if (host === "music.apple.com" && (
    /^\/[a-z]{2}\/song\/(?:[^/]+\/)?\d+\/?$/i.test(url.pathname) ||
    (/^\/[a-z]{2}\/album\/(?:[^/]+\/)?\d+\/?$/i.test(url.pathname) && /^\d+$/.test(url.searchParams.get("i") || ""))
  )) {
    match = text.replace(/\s+[|–—-]\s+Apple\s+Music\s*$/i, "")
      .match(/^(.+?)\s+[-–—]\s+song(?:\s+(?:and|with)\s+lyrics)?\s+by\s+(.+)$/i);
  } else if (host === "soundcloud.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts.some((part) => SOUNDCLOUD_NON_TRACKS.has(part.toLowerCase()))) return null;
    match = text.replace(/\s+\|\s+(?:Listen\b.*|SoundCloud)\s*$/i, "")
      .match(/^Stream\s+(.+)\s+by\s+(.+)$/i);
  }
  if (!match) return null;
  const recordingTitle = match[1].trim();
  const artist = match[2].trim();
  if (recordingTitle.length > 160 || artist.length > 160) return null;
  const q = normalizeMusicText(query);
  if (!q || !normalizeMusicText(artist) || ![recordingTitle, `${recordingTitle} ${artist}`,
    `${recordingTitle} by ${artist}`, `${artist} ${recordingTitle}`]
    .some((candidate) => normalizeMusicText(candidate) === q)) return null;
  return { kind: "recording", term: `${recordingTitle} ${artist}`, recordingTitle, artist, fromStreamingResult: true };
}
