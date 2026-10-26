Engine Quality Dashboard
========================
Requires degoog 0.26.0+ with the native interceptor observe(EngineRunReport) hook.
Official engine and degoog code are not modified.

Open !eq. An optional argument selects the
period: !eq 6h. Periods: 1h, 6h, 24h, 48h, 7d.

Access
------
Sign in to the normal degoog admin panel, then open the dashboard. Both data
and JSON download endpoints validate that session against /api/settings/auth
on loopback for every request, following the official 4play dashboard pattern.
Cookies and the native x-settings-token header are supported. Session secrets
are never read from disk, retained by this extension, or put in URLs.

There is no public/open access option. Cross-site browser requests are rejected.
Missing/expired sessions receive 401; auth service failures receive 503 and no
statistics. An explicitly passwordless instance is also denied: this dashboard
requires an actual admin login. Its public command output is an empty UI shell;
statistics are fetched only through protected routes. No external services,
third-party scripts, browser telemetry uploads, or metrics-ingestion routes exist.

Settings
--------
The dashboard command owns the one Configure form. Record engine statistics
pauses/resumes collection without deleting history. Retention defaults to 48
hours and is capped at 336 hours. Default period controls the opening view.
The companion Engine quality recorder is a passive interceptor with no separate
Configure form. It never rewrites a query, changes settings, or runs searches.

Metrics
-------
One request means one degoog engine execution, not every HTTP request made
inside it. Cache replays are counted separately and never enter live latency,
failure, or empty-response rates. A successful zero-result response is empty,
not failed. Failed includes timeout, network, blocked, CAPTCHA, rate limit,
parse error, interstitial and unknown failure categories reported by core.

Average response time includes all live calls, including failures. p95 is an
estimated histogram upper bound (shown with <=); overflow is shown as >10 min.
Average result count and empty rate use successful live calls only. Periods
use hourly buckets and include the partly overlapping oldest/current hour.
The activity chart groups long periods into up to 48 visual bars. Retention
limits and recording/storage failures are visible in the dashboard.

An aggregate such as SearXNG may report success while some internal providers
failed; those internal failures are not available in the native report. Core
does not report caller-abandoned runs. History starts at installation and is
not reconstructed from search history or historical logs.

Persistence and privacy
-----------------------
File: <DEGOOG_DATA_DIR>/engine-quality-dashboard/history.json
Default: <degoog working directory>/data/engine-quality-dashboard/history.json

Only engine identity/type, hourly counters, latency histograms, generic failure
category/HTTP status and timestamps are stored. Raw error reasons are dropped
because they can contain query strings, URLs or secrets. No queries, result
URLs, request bodies, IPs or admin credentials are recorded.

The directory uses mode 0700; the file uses 0600. Writes are serialized and use
a synced temporary file and atomic rename. One shared writer is reused within
the server process across capability initialization/plugin refreshes. Statistics
are buffered for up to five seconds; an abrupt process kill can lose that last
buffer. A corrupt/unsafe file is preserved and collection pauses visibly rather
than replacing history with an empty file. Storage-write failures remain visible
while counters stay in memory for recovery. Engine/type entries are capped at
256; reports beyond capacity are counted and shown as dropped.

This lightweight file store supports one degoog process per data directory.
Do not share it between independent replicas. Use a shared transactional store
before deploying this extension across replicas.

Disable/uninstall the extension through the Store to stop using it. Its history
directory is separate from installed extension files, so Store updates do not
replace the history. Back up that directory with your server's normal data.
