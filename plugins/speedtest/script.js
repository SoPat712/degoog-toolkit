(() => {
  const CARD_SELECTOR = ".speedtest-card[data-speedtest-card]";
  const CLIENT_PLUGIN_VERSION = "1.0.3";
  const AUTO_SERVER_ID = "auto";

  const SERVER_SELECTION_PINGS = 2;
  const LATENCY_SAMPLE_COUNT = 5;
  const LATENCY_TIMEOUT_MS = 2500;
  const DOWNLOAD_STREAMS = 6;
  const UPLOAD_STREAMS = 3;
  const DOWNLOAD_STREAM_DELAY_MS = 300;
  const UPLOAD_STREAM_DELAY_MS = 300;
  const DOWNLOAD_GRACE_MS = 1500;
  const UPLOAD_GRACE_MS = 3000;
  const MAX_DOWNLOAD_DURATION_MS = 20000;
  const MAX_UPLOAD_DURATION_MS = 20000;
  const DOWNLOAD_CHUNK_MB = 100;
  const UPLOAD_PAYLOAD_BYTES = 20 * 1024 * 1024;
  const MOBILE_UPLOAD_PAYLOAD_BYTES = 4 * 1024 * 1024;
  const SMALL_CHUNK_UPLOAD_BYTES = 256 * 1024;
  const UPLOAD_WARMUP_TIMEOUT_MS = 4000;
  const UPDATE_INTERVAL_MS = 200;
  const FINAL_RESULT_WINDOW_MS = 5000;
  const THROUGHPUT_WINDOW_MS = 1600;
  const WARMUP_SEED_WINDOW_MS = 700;
  const SUSTAINED_RESULT_WINDOW_MS = 4000;
  const SUSTAINED_MIN_WINDOW_MS = 2500;
  const SUSTAINED_MIN_SAMPLE_COUNT = 6;
  const SUSTAINED_IMPROVEMENT_RATIO = 0.02;
  const SUSTAINED_IMPROVEMENT_MBPS = 2.5;
  const STABILIZE_HOLD_MS = 2400;
  const MIN_PHASE_DURATION_MS = 5000;
  const OVERHEAD_COMPENSATION_FACTOR = 1.06;
  const DEBUG_EVENT_LIMIT = 40;
  const PHASE_LABELS = {
    idle: "",
    preflight: "Selecting server",
    latency: "Latency",
    download: "Download",
    upload: "Upload",
    complete: "Complete",
    error: "Error",
  };
  const FALLBACK_SERVERS = [
    {
      id: "auto",
      label: "Automatic (lowest latency)",
      optionLabel: "Automatic (lowest latency)",
      auto: true,
    },
    {
      id: "51",
      label: "Amsterdam, Netherlands",
      optionLabel: "Amsterdam, Netherlands - Clouvider",
      sponsorName: "Clouvider",
      downloadUrl: "https://ams.speedtest.clouvider.net/backend/garbage.php",
      uploadUrl: "https://ams.speedtest.clouvider.net/backend/empty.php",
      pingUrl: "https://ams.speedtest.clouvider.net/backend/empty.php",
    },
    {
      id: "94",
      label: "Amsterdam, Netherlands",
      optionLabel: "Amsterdam, Netherlands - Sharktech",
      sponsorName: "Sharktech",
      downloadUrl: "https://amsspeed.sharktech.net/backend/garbage.php",
      uploadUrl: "https://amsspeed.sharktech.net/backend/empty.php",
      pingUrl: "https://amsspeed.sharktech.net/backend/empty.php",
    },
    {
      id: "53",
      label: "Atlanta, United States",
      optionLabel: "Atlanta, United States - Clouvider",
      sponsorName: "Clouvider",
      downloadUrl: "https://atl.speedtest.clouvider.net/backend/garbage.php",
      uploadUrl: "https://atl.speedtest.clouvider.net/backend/empty.php",
      pingUrl: "https://atl.speedtest.clouvider.net/backend/empty.php",
    },
    {
      id: "75",
      label: "Bangalore, India",
      optionLabel: "Bangalore, India - DigitalOcean",
      sponsorName: "DigitalOcean",
      downloadUrl: "https://in1.backend.librespeed.org/garbage.php",
      uploadUrl: "https://in1.backend.librespeed.org/empty.php",
      pingUrl: "https://in1.backend.librespeed.org/empty.php",
    },
    {
      id: "33",
      label: "Bari, Italy (GARR)",
      optionLabel: "Bari, Italy (GARR) - Consortium GARR",
      sponsorName: "Consortium GARR",
      downloadUrl: "https://st-be-ba1.infra.garr.it/garbage.php",
      uploadUrl: "https://st-be-ba1.infra.garr.it/empty.php",
      pingUrl: "https://st-be-ba1.infra.garr.it/empty.php",
    },
    {
      id: "34",
      label: "Bologna, Italy (GARR)",
      optionLabel: "Bologna, Italy (GARR) - Consortium GARR",
      sponsorName: "Consortium GARR",
      downloadUrl: "https://st-be-bo1.infra.garr.it/garbage.php",
      uploadUrl: "https://st-be-bo1.infra.garr.it/empty.php",
      pingUrl: "https://st-be-bo1.infra.garr.it/empty.php",
    },
    {
      id: "98",
      label: "Bucharest, Romania (ByteShield)",
      optionLabel: "Bucharest, Romania (ByteShield) - ByteShield Hosting SRL",
      sponsorName: "ByteShield Hosting SRL",
      downloadUrl: "https://speedtest.byteshield.ro:6060/backend/garbage.php",
      uploadUrl: "https://speedtest.byteshield.ro:6060/backend/empty.php",
      pingUrl: "https://speedtest.byteshield.ro:6060/backend/empty.php",
    },
    {
      id: "93",
      label: "Chicago, USA",
      optionLabel: "Chicago, USA - Sharktech",
      sponsorName: "Sharktech",
      downloadUrl: "https://chispeed.sharktech.net/backend/garbage.php",
      uploadUrl: "https://chispeed.sharktech.net/backend/empty.php",
      pingUrl: "https://chispeed.sharktech.net/backend/empty.php",
    },
    {
      id: "92",
      label: "Denver, USA",
      optionLabel: "Denver, USA - Sharktech",
      sponsorName: "Sharktech",
      downloadUrl: "https://denspeed.sharktech.net/backend/garbage.php",
      uploadUrl: "https://denspeed.sharktech.net/backend/empty.php",
      pingUrl: "https://denspeed.sharktech.net/backend/empty.php",
    },
    {
      id: "50",
      label: "Frankfurt, Germany",
      optionLabel: "Frankfurt, Germany - Clouvider",
      sponsorName: "Clouvider",
      downloadUrl: "https://fra.speedtest.clouvider.net/backend/garbage.php",
      uploadUrl: "https://fra.speedtest.clouvider.net/backend/empty.php",
      pingUrl: "https://fra.speedtest.clouvider.net/backend/empty.php",
    },
    {
      id: "86",
      label: "Frankfurt, Germany (FRA01)",
      optionLabel: "Frankfurt, Germany (FRA01) - LumischVPS",
      sponsorName: "LumischVPS",
      downloadUrl: "https://speedtest.lumischvps.cloud/backend/garbage.php",
      uploadUrl: "https://speedtest.lumischvps.cloud/backend/empty.php",
      pingUrl: "https://speedtest.lumischvps.cloud/backend/empty.php",
    },
    {
      id: "77",
      label: "Ghom, Iran (Amin IDC)",
      optionLabel: "Ghom, Iran (Amin IDC) - Bardia Moshiri",
      sponsorName: "Bardia Moshiri",
      downloadUrl: "https://fastme.ir/backend/garbage.php",
      uploadUrl: "https://fastme.ir/backend/empty.php",
      pingUrl: "https://fastme.ir/backend/empty.php",
    },
    {
      id: "100",
      label: "Grand Rapids, Michigan",
      optionLabel: "Grand Rapids, Michigan - RackGenius",
      sponsorName: "RackGenius",
      downloadUrl: "https://mispeed.rackgenius.com/backend/garbage.php",
      uploadUrl: "https://mispeed.rackgenius.com/backend/empty.php",
      pingUrl: "https://mispeed.rackgenius.com/backend/empty.php",
    },
    {
      id: "22",
      label: "Helsinki, Finland (3) (Hetzner)",
      optionLabel: "Helsinki, Finland (3) (Hetzner) - Daily Health Insurance Group",
      sponsorName: "Daily Health Insurance Group",
      downloadUrl: "https://finew.openspeed.org/backend437/garbage.php",
      uploadUrl: "https://finew.openspeed.org/backend437/empty.php",
      pingUrl: "https://finew.openspeed.org/backend437/empty.php",
    },
    {
      id: "24",
      label: "Helsinki, Finland (5) (Hetzner)",
      optionLabel: "Helsinki, Finland (5) (Hetzner) - KABI.tk",
      sponsorName: "KABI.tk",
      downloadUrl: "https://fast.kabi.tk/garbage.php",
      uploadUrl: "https://fast.kabi.tk/empty.php",
      pingUrl: "https://fast.kabi.tk/empty.php",
    },
    {
      id: "101",
      label: "Helsinki, Finland (Hetzner)",
      optionLabel: "Helsinki, Finland (Hetzner) - Pekka Jalonen",
      sponsorName: "Pekka Jalonen",
      downloadUrl: "https://www.librespeed.fi/backend/garbage.php",
      uploadUrl: "https://www.librespeed.fi/backend/empty.php",
      pingUrl: "https://www.librespeed.fi/backend/empty.php",
    },
    {
      id: "70",
      label: "Johannesburg, South Africa (Host Africa)",
      optionLabel: "Johannesburg, South Africa (Host Africa) - HOSTAFRICA",
      sponsorName: "HOSTAFRICA",
      downloadUrl: "https://za1.backend.librespeed.org/garbage.php",
      uploadUrl: "https://za1.backend.librespeed.org/empty.php",
      pingUrl: "https://za1.backend.librespeed.org/empty.php",
    },
    {
      id: "90",
      label: "Las Vegas, USA",
      optionLabel: "Las Vegas, USA - Sharktech",
      sponsorName: "Sharktech",
      downloadUrl: "https://lasspeed.sharktech.net/backend/garbage.php",
      uploadUrl: "https://lasspeed.sharktech.net/backend/empty.php",
      pingUrl: "https://lasspeed.sharktech.net/backend/empty.php",
    },
    {
      id: "49",
      label: "London, England",
      optionLabel: "London, England - Clouvider",
      sponsorName: "Clouvider",
      downloadUrl: "https://lon.speedtest.clouvider.net/backend/garbage.php",
      uploadUrl: "https://lon.speedtest.clouvider.net/backend/empty.php",
      pingUrl: "https://lon.speedtest.clouvider.net/backend/empty.php",
    },
    {
      id: "54",
      label: "Los Angeles, United States (1)",
      optionLabel: "Los Angeles, United States (1) - Clouvider",
      sponsorName: "Clouvider",
      downloadUrl: "https://la.speedtest.clouvider.net/backend/garbage.php",
      uploadUrl: "https://la.speedtest.clouvider.net/backend/empty.php",
      pingUrl: "https://la.speedtest.clouvider.net/backend/empty.php",
    },
    {
      id: "91",
      label: "Los Angeles, USA",
      optionLabel: "Los Angeles, USA - Sharktech",
      sponsorName: "Sharktech",
      downloadUrl: "https://laxspeed.sharktech.net/backend/garbage.php",
      uploadUrl: "https://laxspeed.sharktech.net/backend/empty.php",
      pingUrl: "https://laxspeed.sharktech.net/backend/empty.php",
    },
    {
      id: "52",
      label: "New York, United States (2)",
      optionLabel: "New York, United States (2) - Clouvider",
      sponsorName: "Clouvider",
      downloadUrl: "https://nyc.speedtest.clouvider.net/backend/garbage.php",
      uploadUrl: "https://nyc.speedtest.clouvider.net/backend/empty.php",
      pingUrl: "https://nyc.speedtest.clouvider.net/backend/empty.php",
    },
    {
      id: "43",
      label: "Nottingham, England (LayerIP)",
      optionLabel: "Nottingham, England (LayerIP) - fosshost.org",
      sponsorName: "fosshost.org",
      downloadUrl: "https://uk1.backend.librespeed.org/garbage.php",
      uploadUrl: "https://uk1.backend.librespeed.org/empty.php",
      pingUrl: "https://uk1.backend.librespeed.org/empty.php",
    },
    {
      id: "103",
      label: "Novi Sad, Vojvodina, Serbia",
      optionLabel: "Novi Sad, Vojvodina, Serbia - E-CAPS.net",
      sponsorName: "E-CAPS.net",
      downloadUrl: "https://speed1.e-caps.net/backend/garbage.php",
      uploadUrl: "https://speed1.e-caps.net/backend/empty.php",
      pingUrl: "https://speed1.e-caps.net/backend/empty.php",
    },
    {
      id: "28",
      label: "Nuremberg, Germany (1) (Hetzner)",
      optionLabel: "Nuremberg, Germany (1) (Hetzner) - Snopyta",
      sponsorName: "Snopyta",
      downloadUrl: "https://de1.backend.librespeed.org/garbage.php",
      uploadUrl: "https://de1.backend.librespeed.org/empty.php",
      pingUrl: "https://de1.backend.librespeed.org/empty.php",
    },
    {
      id: "27",
      label: "Nuremberg, Germany (2) (Hetzner)",
      optionLabel: "Nuremberg, Germany (2) (Hetzner) - LibreSpeed",
      sponsorName: "LibreSpeed",
      downloadUrl: "https://de4.backend.librespeed.org/garbage.php",
      uploadUrl: "https://de4.backend.librespeed.org/empty.php",
      pingUrl: "https://de4.backend.librespeed.org/empty.php",
    },
    {
      id: "30",
      label: "Nuremberg, Germany (3) (Hetzner)",
      optionLabel: "Nuremberg, Germany (3) (Hetzner) - LibreSpeed",
      sponsorName: "LibreSpeed",
      downloadUrl: "https://de3.backend.librespeed.org/garbage.php",
      uploadUrl: "https://de3.backend.librespeed.org/empty.php",
      pingUrl: "https://de3.backend.librespeed.org/empty.php",
    },
    {
      id: "31",
      label: "Nuremberg, Germany (4) (Hetzner)",
      optionLabel: "Nuremberg, Germany (4) (Hetzner) - LibreSpeed",
      sponsorName: "LibreSpeed",
      downloadUrl: "https://de5.backend.librespeed.org/garbage.php",
      uploadUrl: "https://de5.backend.librespeed.org/empty.php",
      pingUrl: "https://de5.backend.librespeed.org/empty.php",
    },
    {
      id: "46",
      label: "Nuremberg, Germany (6) (Hetzner)",
      optionLabel: "Nuremberg, Germany (6) (Hetzner) - luki9100",
      sponsorName: "luki9100",
      downloadUrl: "https://librespeed.lukas-heinrich.com/garbage.php",
      uploadUrl: "https://librespeed.lukas-heinrich.com/empty.php",
      pingUrl: "https://librespeed.lukas-heinrich.com/empty.php",
    },
    {
      id: "95",
      label: "Ohio, USA (Rust backend)",
      optionLabel: "Ohio, USA (Rust backend) - Sudo Dios",
      sponsorName: "Sudo Dios",
      downloadUrl: "https://librespeed-rs.ir/backend/garbage",
      uploadUrl: "https://librespeed-rs.ir/backend/empty",
      pingUrl: "https://librespeed-rs.ir/backend/empty",
    },
    {
      id: "74",
      label: "Poznan, Poland (INEA)",
      optionLabel: "Poznan, Poland (INEA) - Kamil Szczepa?ski",
      sponsorName: "Kamil Szczepa?ski",
      downloadUrl: "https://speedtest.kamilszczepanski.com/garbage.php",
      uploadUrl: "https://speedtest.kamilszczepanski.com/empty.php",
      pingUrl: "https://speedtest.kamilszczepanski.com/empty.php",
    },
    {
      id: "79",
      label: "Prague, Czech Republic",
      optionLabel: "Prague, Czech Republic - CESNET",
      sponsorName: "CESNET",
      downloadUrl: "https://speedtest.cesnet.cz/backend/garbage.php",
      uploadUrl: "https://speedtest.cesnet.cz/backend/empty.php",
      pingUrl: "https://speedtest.cesnet.cz/backend/empty.php",
    },
    {
      id: "85",
      label: "Prague, Czech Republic",
      optionLabel: "Prague, Czech Republic - Turris",
      sponsorName: "Turris",
      downloadUrl: "https://librespeed.turris.cz/backend/garbage.php",
      uploadUrl: "https://librespeed.turris.cz/backend/empty.php",
      pingUrl: "https://librespeed.turris.cz/backend/empty.php",
    },
    {
      id: "35",
      label: "Roma, Italy (GARR)",
      optionLabel: "Roma, Italy (GARR) - Consortium GARR",
      sponsorName: "Consortium GARR",
      downloadUrl: "https://st-be-rm2.infra.garr.it/garbage.php",
      uploadUrl: "https://st-be-rm2.infra.garr.it/empty.php",
      pingUrl: "https://st-be-rm2.infra.garr.it/empty.php",
    },
    {
      id: "87",
      label: "Serbia (SOX)",
      optionLabel: "Serbia (SOX) - Serbian Open eXchange (SOX)",
      sponsorName: "Serbian Open eXchange (SOX)",
      downloadUrl: "https://speedtest2.sox.rs/libre/backend/garbage.php",
      uploadUrl: "https://speedtest2.sox.rs/libre/backend/empty.php",
      pingUrl: "https://speedtest2.sox.rs/libre/backend/empty.php",
    },
    {
      id: "68",
      label: "Singapore",
      optionLabel: "Singapore - Salvatore Cahyo",
      sponsorName: "Salvatore Cahyo",
      downloadUrl: "https://speedtest.dsgroupmedia.com/backend/garbage.php",
      uploadUrl: "https://speedtest.dsgroupmedia.com/backend/empty.php",
      pingUrl: "https://speedtest.dsgroupmedia.com/backend/empty.php",
    },
    {
      id: "76",
      label: "Tehran, Iran (Fanava)",
      optionLabel: "Tehran, Iran (Fanava) - Bardia Moshiri",
      sponsorName: "Bardia Moshiri",
      downloadUrl: "https://speedme.ir/backend/garbage.php",
      uploadUrl: "https://speedme.ir/backend/empty.php",
      pingUrl: "https://speedme.ir/backend/empty.php",
    },
    {
      id: "80",
      label: "Tehran, Iran (Faraso)",
      optionLabel: "Tehran, Iran (Faraso) - Bardia Moshiri",
      sponsorName: "Bardia Moshiri",
      downloadUrl: "https://st.bardia.tech/backend/garbage.php",
      uploadUrl: "https://st.bardia.tech/backend/empty.php",
      pingUrl: "https://st.bardia.tech/backend/empty.php",
    },
    {
      id: "82",
      label: "Tokyo, Japan",
      optionLabel: "Tokyo, Japan - A573",
      sponsorName: "A573",
      downloadUrl: "https://librespeed.a573.net/backend/garbage.php",
      uploadUrl: "https://librespeed.a573.net/backend/empty.php",
      pingUrl: "https://librespeed.a573.net/backend/empty.php",
    },
    {
      id: "69",
      label: "Vilnius, Lithuania (RackRay)",
      optionLabel: "Vilnius, Lithuania (RackRay) - Time4VPS",
      sponsorName: "Time4VPS",
      downloadUrl: "https://lt1.backend.librespeed.org/garbage.php",
      uploadUrl: "https://lt1.backend.librespeed.org/empty.php",
      pingUrl: "https://lt1.backend.librespeed.org/empty.php",
    },
    {
      id: "78",
      label: "Virginia, United States, OVH",
      optionLabel: "Virginia, United States, OVH - Riverside Rocks",
      sponsorName: "Riverside Rocks",
      downloadUrl: "https://speed.riverside.rocks/garbage.php",
      uploadUrl: "https://speed.riverside.rocks/empty.php",
      pingUrl: "https://speed.riverside.rocks/empty.php",
    },
    {
      id: "102",
      label: "Volzhsky, Russia",
      optionLabel: "Volzhsky, Russia - PowerNet",
      sponsorName: "PowerNet",
      downloadUrl: "https://speedtest.powernet.com.ru/backend/garbage.php",
      uploadUrl: "https://speedtest.powernet.com.ru/backend/empty.php",
      pingUrl: "https://speedtest.powernet.com.ru/backend/empty.php",
    },
  ];
  const DISABLED_SERVER_IDS = new Set([
    "24",
    "27",
    "28",
    "30",
    "31",
    "43",
    "46",
    "69",
    "70",
    "75",
    "76",
    "77",
    "80",
    "87",
    "90",
    "91",
    "92",
    "93",
    "94",
    "95",
  ]);

  const uploadPayloadCache = new Map();

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function abortError() {
    try {
      return new DOMException("Aborted", "AbortError");
    } catch {
      const error = new Error("Aborted");
      error.name = "AbortError";
      return error;
    }
  }

  function isAbortError(error) {
    return (
      Boolean(error) &&
      (error.name === "AbortError" ||
        /abort/i.test(String(error.message || error)))
    );
  }

  function roundToTenths(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe)) {
      return 0;
    }

    return Math.round(safe * 10) / 10;
  }

  function average(values) {
    const safeValues = values.filter((value) => Number.isFinite(value));
    if (!safeValues.length) {
      return 0;
    }

    return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
  }

  function trimmedMean(values, trimFraction = 0.15) {
    const sorted = values
      .filter((value) => Number.isFinite(value))
      .slice()
      .sort((left, right) => left - right);

    if (!sorted.length) {
      return 0;
    }

    if (sorted.length < 5) {
      return average(sorted);
    }

    const trimCount = Math.min(
      Math.floor(sorted.length * trimFraction),
      Math.floor((sorted.length - 1) / 2)
    );
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
    return average(trimmed.length ? trimmed : sorted);
  }

  function formatDebugMbps(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe) || safe <= 0) {
      return "--";
    }

    return `${safe.toFixed(1)} Mbps`;
  }

  function formatDebugMegabytes(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe) || safe <= 0) {
      return "--";
    }

    return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  }

  function recordMeasurementSample(samples, sample) {
    samples.push({
      time: Number(sample?.time) || 0,
      bytes: Math.max(0, Number(sample?.bytes) || 0),
      rollingMbps: Math.max(0, Number(sample?.rollingMbps) || 0),
      cumulativeMbps: Math.max(0, Number(sample?.cumulativeMbps) || 0),
    });
  }

  function summarizeTrailingWindow(samples, windowMs = FINAL_RESULT_WINDOW_MS) {
    const safeSamples = Array.isArray(samples) ? samples : [];
    if (safeSamples.length < 2) {
      return {
        mbps: 0,
        durationMs: 0,
        sampleCount: safeSamples.length,
      };
    }

    const endSample = safeSamples[safeSamples.length - 1];
    let startIndex = safeSamples.length - 1;
    while (
      startIndex > 0 &&
      endSample.time - safeSamples[startIndex - 1].time <= windowMs
    ) {
      startIndex -= 1;
    }

    const startSample = safeSamples[startIndex];
    const durationMs = Math.max(0, endSample.time - startSample.time);
    return {
      mbps:
        durationMs > 0
          ? speedFromBytes(endSample.bytes - startSample.bytes, durationMs)
          : 0,
      durationMs,
      sampleCount: safeSamples.length - startIndex,
    };
  }

  function findBestSustainedWindow(samples) {
    const safeSamples = Array.isArray(samples) ? samples : [];
    if (safeSamples.length < 2) {
      return {
        mbps: 0,
        durationMs: 0,
        sampleCount: safeSamples.length,
      };
    }

    let bestWindow = {
      mbps: 0,
      durationMs: 0,
      sampleCount: 0,
    };
    let startIndex = 0;

    for (let endIndex = 1; endIndex < safeSamples.length; endIndex += 1) {
      const endSample = safeSamples[endIndex];
      while (
        startIndex < endIndex &&
        endSample.time - safeSamples[startIndex].time > SUSTAINED_RESULT_WINDOW_MS
      ) {
        startIndex += 1;
      }

      const sampleCount = endIndex - startIndex + 1;
      const durationMs = endSample.time - safeSamples[startIndex].time;
      if (
        sampleCount < SUSTAINED_MIN_SAMPLE_COUNT ||
        durationMs < SUSTAINED_MIN_WINDOW_MS
      ) {
        continue;
      }

      const mbps = speedFromBytes(
        endSample.bytes - safeSamples[startIndex].bytes,
        durationMs
      );
      if (mbps > bestWindow.mbps) {
        bestWindow = {
          mbps,
          durationMs,
          sampleCount,
        };
      }
    }

    return bestWindow;
  }

  function sustainedImprovementThreshold(bestMbps) {
    return Math.max(
      SUSTAINED_IMPROVEMENT_MBPS,
      Math.max(0, Number(bestMbps) || 0) * SUSTAINED_IMPROVEMENT_RATIO
    );
  }

  function createEmptyDebugData() {
    return {
      runStartedAt: "",
      runtimeStartedMs: 0,
      pluginVersion: "",
      browser: "",
      device: "",
      platform: "",
      locale: "",
      viewport: "",
      screen: "",
      devicePixelRatio: "",
      userAgent: "",
      availableServerCount: 0,
      serverListSource: "",
      requestedServerLabel: "",
      selectedServerLabel: "",
      selectionLatencyMs: null,
      latencyMs: null,
      latencySamples: [],
      phases: {
        download: null,
        upload: null,
      },
      events: [],
    };
  }

  function ensureDebugData(card) {
    if (!card._speedtestDebugData) {
      card._speedtestDebugData = createEmptyDebugData();
    }

    return card._speedtestDebugData;
  }

  function buildDebugText(card) {
    const debug = ensureDebugData(card);
    if (!debug.runStartedAt) {
      return [
        "Run a speed test to capture debug details.",
        "",
        "This panel will show the selected server, latency samples, and",
        "the sustained-window, trailing-window, and cumulative phase calculations.",
      ].join("\n");
    }

    const lines = [
      `Started: ${debug.runStartedAt}`,
      `Plugin version: ${debug.pluginVersion || "Unknown"}`,
      `Browser: ${debug.browser || "Unknown"}`,
      `Device: ${debug.device || "Unknown"}`,
      `Platform: ${debug.platform || "Unknown"}`,
      `Locale: ${debug.locale || "Unknown"}`,
      `Viewport: ${debug.viewport || "Unknown"}`,
      `Screen: ${debug.screen || "Unknown"}`,
      `Device pixel ratio: ${debug.devicePixelRatio || "Unknown"}`,
      `User agent: ${debug.userAgent || "Unknown"}`,
      `Available servers: ${debug.availableServerCount || 0}`,
      `Server list source: ${debug.serverListSource || "Unknown"}`,
      `Requested server: ${debug.requestedServerLabel || "Automatic (lowest latency)"}`,
      `Selected server: ${debug.selectedServerLabel || "Pending selection"}`,
      `Selection ping: ${formatLatency(debug.selectionLatencyMs)}`,
    ];

    if (debug.latencySamples.length) {
      lines.push(
        `Latency samples: ${debug.latencySamples
          .map((value) => formatLatency(value))
          .join(", ")}`
      );
      lines.push(`Latency median: ${formatLatency(debug.latencyMs)}`);
    }

    ["download", "upload"].forEach((phaseName) => {
      const phase = debug.phases[phaseName];
      if (!phase) {
        return;
      }

      lines.push("");
      lines.push(`${phaseName[0].toUpperCase()}${phaseName.slice(1)}:`);
      if (phase.source) {
        lines.push(`  source: ${phase.source}`);
      }
      lines.push(`  final result: ${formatDebugMbps(phase.finalMbps)}`);
      lines.push(
        `  best sustained window: ${formatDebugMbps(phase.bestSustainedMbps)}`
      );
      lines.push(`  trailing window average: ${formatDebugMbps(phase.tailAverageMbps)}`);
      lines.push(`  cumulative at finish: ${formatDebugMbps(phase.finalCumulativeMbps)}`);
      lines.push(`  rolling at finish: ${formatDebugMbps(phase.finalRollingMbps)}`);
      lines.push(`  peak rolling: ${formatDebugMbps(phase.peakRollingMbps)}`);
      lines.push(`  transferred after grace: ${formatDebugMegabytes(phase.transferredBytes)}`);
      lines.push(`  measured time: ${(Number(phase.measuredSeconds) || 0).toFixed(2)} s`);
      lines.push(
        `  sustained window length: ${(Math.max(0, Number(phase.bestWindowSeconds) || 0)).toFixed(2)} s`
      );
      lines.push(
        `  trailing window length: ${(Math.max(0, Number(phase.tailWindowSeconds) || 0)).toFixed(2)} s`
      );
      lines.push(`  trailing window samples: ${phase.tailSampleCount || 0}`);
    });

    if (debug.events.length) {
      lines.push("");
      lines.push("Events:");
      debug.events.forEach((event) => lines.push(event));
    }

    return lines.join("\n");
  }

  function detectBrowserLabel() {
    const ua = String(navigator.userAgent || "");
    const versionFrom = (pattern) => {
      const match = ua.match(pattern);
      return match?.[1] || "";
    };

    if (/Edg\//.test(ua)) {
      return `Edge ${versionFrom(/Edg\/([\d.]+)/)}`.trim();
    }
    if (/OPR\//.test(ua)) {
      return `Opera ${versionFrom(/OPR\/([\d.]+)/)}`.trim();
    }
    if (/Firefox\//.test(ua)) {
      return `Firefox ${versionFrom(/Firefox\/([\d.]+)/)}`.trim();
    }
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) {
      return `Chrome ${versionFrom(/Chrome\/([\d.]+)/)}`.trim();
    }
    if (/Version\//.test(ua) && /Safari\//.test(ua) && !/Chrome\//.test(ua)) {
      return `Safari ${versionFrom(/Version\/([\d.]+)/)}`.trim();
    }

    return ua || "Unknown";
  }

  function detectDeviceLabel() {
    const ua = String(navigator.userAgent || "");
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints || 0);

    if (/iPhone/i.test(ua)) {
      return "iPhone";
    }
    if (/iPad/i.test(ua) || (platform === "MacIntel" && touchPoints > 1)) {
      return "iPad";
    }
    if (/Android/i.test(ua)) {
      return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
    }
    if (/Windows/i.test(platform)) {
      return "Windows device";
    }
    if (/Mac/i.test(platform)) {
      return "Mac";
    }
    if (/Linux/i.test(platform)) {
      return "Linux device";
    }

    return "Unknown";
  }

  function detectViewportLabel() {
    if (typeof window === "undefined") {
      return "Unknown";
    }

    const width = Number(window.innerWidth || 0);
    const height = Number(window.innerHeight || 0);
    return width > 0 && height > 0 ? `${width} x ${height}` : "Unknown";
  }

  function detectScreenLabel() {
    if (typeof screen === "undefined") {
      return "Unknown";
    }

    const width = Number(screen.width || 0);
    const height = Number(screen.height || 0);
    return width > 0 && height > 0 ? `${width} x ${height}` : "Unknown";
  }

  function renderDebug(card) {
    const output = card.querySelector("[data-speedtest-debug-output]");
    if (!output) {
      return;
    }

    output.textContent = buildDebugText(card);
  }

  function resetDebugData(card, requestedServerLabel) {
    const datasetVersion = String(card.dataset.speedtestVersion || "").trim();
    const pluginVersion =
      datasetVersion && !/^__.+__$/.test(datasetVersion)
        ? datasetVersion
        : CLIENT_PLUGIN_VERSION;

    card._speedtestDebugData = {
      ...createEmptyDebugData(),
      runStartedAt: new Date().toLocaleString(),
      runtimeStartedMs: nowMs(),
      pluginVersion,
      browser: detectBrowserLabel(),
      device: detectDeviceLabel(),
      platform: String(navigator.platform || "").trim(),
      locale: String(navigator.language || "").trim(),
      viewport: detectViewportLabel(),
      screen: detectScreenLabel(),
      devicePixelRatio: String(window.devicePixelRatio || "").trim(),
      userAgent: String(navigator.userAgent || "").trim(),
      availableServerCount: Array.isArray(card._speedtestServers)
        ? card._speedtestServers.length
        : 0,
      serverListSource: String(card._speedtestServerSource || "").trim(),
      requestedServerLabel:
        requestedServerLabel || "Automatic (lowest latency)",
    };
    renderDebug(card);
  }

  function appendDebugEvent(card, message) {
    const debug = ensureDebugData(card);
    const elapsedSeconds = debug.runtimeStartedMs
      ? ((nowMs() - debug.runtimeStartedMs) / 1000).toFixed(1)
      : "0.0";
    debug.events.push(`[+${elapsedSeconds}s] ${String(message).trim()}`);
    if (debug.events.length > DEBUG_EVENT_LIMIT) {
      debug.events.splice(0, debug.events.length - DEBUG_EVENT_LIMIT);
    }
    renderDebug(card);
  }

  function setDebugServerSelection(card, partial) {
    const debug = ensureDebugData(card);
    Object.assign(debug, partial);
    renderDebug(card);
  }

  function setDebugLatency(card, latencyMs, samples) {
    const debug = ensureDebugData(card);
    debug.latencyMs = Number(latencyMs) || 0;
    debug.latencySamples = Array.isArray(samples)
      ? samples.map((value) => roundToTenths(value))
      : [];
    renderDebug(card);
  }

  function setDebugPhase(card, phaseName, phaseData) {
    const debug = ensureDebugData(card);
    debug.phases[phaseName] = phaseData;
    renderDebug(card);
  }

  function median(values) {
    const sorted = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    if (!sorted.length) {
      return 0;
    }

    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[middle];
    }

    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function randomToken() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function appendQuery(url, params) {
    const nextUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }

      nextUrl.searchParams.set(key, String(value));
    });
    return nextUrl.toString();
  }

  function createRunContext() {
    return {
      aborted: false,
      fetchControllers: new Set(),
      uploadXhrs: new Set(),
      downloadXhrs: new Set(),
      intervals: new Set(),
      timeouts: new Set(),

      dispose() {
        this.fetchControllers.forEach((controller) => controller.abort());
        this.uploadXhrs.forEach((xhr) => {
          try {
            xhr.abort();
          } catch {}
        });
        this.downloadXhrs.forEach((xhr) => {
          try {
            xhr.abort();
          } catch {}
        });
        this.intervals.forEach((id) => window.clearInterval(id));
        this.timeouts.forEach((id) => window.clearTimeout(id));
        this.fetchControllers.clear();
        this.uploadXhrs.clear();
        this.downloadXhrs.clear();
        this.intervals.clear();
        this.timeouts.clear();
      },

      abort() {
        this.aborted = true;
        this.dispose();
      },
    };
  }

  function registerInterval(run, callback, delay) {
    const id = window.setInterval(callback, delay);
    run.intervals.add(id);
    return id;
  }

  function clearRegisteredInterval(run, id) {
    window.clearInterval(id);
    run.intervals.delete(id);
  }

  function registerTimeout(run, callback, delay) {
    const id = window.setTimeout(() => {
      run.timeouts.delete(id);
      callback();
    }, delay);
    run.timeouts.add(id);
    return id;
  }

  function unregisterFetchController(run, controller) {
    if (!controller) {
      return;
    }

    run.fetchControllers.delete(controller);
  }

  function unregisterUploadXhr(run, xhr) {
    if (!xhr) {
      return;
    }

    run.uploadXhrs.delete(xhr);
  }

  function unregisterDownloadXhr(run, xhr) {
    if (!xhr) {
      return;
    }

    run.downloadXhrs.delete(xhr);
  }

  function isMobileUserAgent(ua) {
    return /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
  }

  function isSafariUserAgent(ua) {
    return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  }

  function isIosLikeDevice() {
    const ua = String(navigator.userAgent || "");
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    return (
      /iPad|iPhone|iPod/i.test(ua) ||
      (platform === "MacIntel" && touchPoints > 1)
    );
  }

  function canUseUploadProgressEvents() {
    try {
      const xhr = new XMLHttpRequest();
      return Boolean(xhr.upload) && "onprogress" in xhr.upload;
    } catch {
      return false;
    }
  }

  function getUploadStrategy() {
    const ua = String(navigator.userAgent || "");
    const isMobile = isMobileUserAgent(ua);
    const isSafari = isSafariUserAgent(ua);
    const isIosSafari = isIosLikeDevice() && isSafari;
    const hasUploadProgress = canUseUploadProgressEvents();
    const useSmallChunkWorkaround = isIosSafari || !hasUploadProgress;

    if (useSmallChunkWorkaround) {
      return {
        source: isIosSafari
          ? "Best sustained window after grace (Safari small-chunk fallback)"
          : "Best sustained window after grace (small-chunk fallback)",
        debugLabel: isIosSafari
          ? "iOS Safari small-chunk fallback"
          : "Small-chunk upload fallback",
        streamCount: isMobile ? 2 : UPLOAD_STREAMS,
        streamDelayMs: UPLOAD_STREAM_DELAY_MS,
        payloadBytes: SMALL_CHUNK_UPLOAD_BYTES,
        useSmallChunkWorkaround: true,
      };
    }

    return {
      source: isMobile
        ? "Best sustained window after grace (mobile upload mode)"
        : "Best sustained window after grace",
      debugLabel: isMobile
        ? "Mobile upload mode"
        : "Standard upload mode",
      streamCount: isMobile ? 2 : UPLOAD_STREAMS,
      streamDelayMs: UPLOAD_STREAM_DELAY_MS,
      payloadBytes: isMobile
        ? MOBILE_UPLOAD_PAYLOAD_BYTES
        : UPLOAD_PAYLOAD_BYTES,
      useSmallChunkWorkaround: false,
    };
  }

  function getUploadPayload(byteLength = UPLOAD_PAYLOAD_BYTES) {
    const safeByteLength = Math.max(1, Math.floor(Number(byteLength) || 0));
    if (!uploadPayloadCache.has(safeByteLength)) {
      const oneMegabyte = 1024 * 1024;
      const chunkCount = Math.floor(safeByteLength / oneMegabyte);
      const remainderBytes = safeByteLength % oneMegabyte;
      const chunks = [];

      const createChunk = (size) => {
        const buffer = new ArrayBuffer(size);
        try {
          const view = new Uint32Array(buffer);
          const maxInt = 2 ** 32 - 1;
          for (let index = 0; index < view.length; index += 1) {
            view[index] = Math.floor(Math.random() * maxInt);
          }
        } catch {}
        return buffer;
      };

      for (let index = 0; index < chunkCount; index += 1) {
        chunks.push(createChunk(oneMegabyte));
      }

      if (remainderBytes > 0) {
        chunks.push(createChunk(remainderBytes));
      }

      uploadPayloadCache.set(
        safeByteLength,
        new Blob(chunks, {
          type: "application/octet-stream",
        })
      );
    }

    return uploadPayloadCache.get(safeByteLength);
  }

  async function warmUpUploadServer(run, server) {
    return new Promise((resolve) => {
      if (run.aborted) {
        resolve();
        return;
      }

      const xhr = new XMLHttpRequest();
      let settled = false;
      const timeoutId = registerTimeout(run, () => {
        try {
          xhr.abort();
        } catch {}
      }, UPLOAD_WARMUP_TIMEOUT_MS);

      run.uploadXhrs.add(xhr);

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        run.timeouts.delete(timeoutId);
        xhr.onload = null;
        xhr.onerror = null;
        xhr.onabort = null;
        unregisterUploadXhr(run, xhr);
        resolve();
      };

      xhr.onload = finish;
      xhr.onerror = finish;
      xhr.onabort = finish;

      try {
        xhr.open(
          "POST",
          appendQuery(server.uploadUrl, {
            cors: "true",
            r: randomToken(),
          }),
          true
        );
        xhr.setRequestHeader("Content-Encoding", "identity");
        xhr.send();
      } catch {
        finish();
      }
    });
  }

  function filterEnabledServers(servers) {
    const safeServers = Array.isArray(servers) ? servers : [];
    return safeServers.filter((server) => {
      if (server?.auto) {
        return true;
      }

      const id = String(server?.id || "")
        .trim()
        .toLowerCase();
      return Boolean(id) && !DISABLED_SERVER_IDS.has(id);
    });
  }

  function getServers(card) {
    if (Array.isArray(card._speedtestServers)) {
      return card._speedtestServers;
    }

    card._speedtestServers = filterEnabledServers(FALLBACK_SERVERS);
    card._speedtestServerSource = "hardcoded";

    return card._speedtestServers;
  }

  function populateServerSelect(card) {
    const serverSelect = card.querySelector("[data-speedtest-server-select]");
    if (!serverSelect) {
      return;
    }

    const servers = getServers(card);
    const currentValue = serverSelect.value || AUTO_SERVER_ID;
    serverSelect.innerHTML = "";

    servers.forEach((server) => {
      const option = document.createElement("option");
      option.value = server.id;
      option.textContent = server.optionLabel || server.label || server.id;
      serverSelect.appendChild(option);
    });

    if (servers.some((server) => server.id === currentValue)) {
      serverSelect.value = currentValue;
      return;
    }

    serverSelect.value = servers[0]?.id || AUTO_SERVER_ID;
  }

  function formatMbps(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe) || safe <= 0) {
      return "0.0";
    }

    return safe.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function formatLatency(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe) || safe <= 0) {
      return "--";
    }

    return `${Math.round(safe)} ms`;
  }

  function normalizeBackendError(error) {
    if (isAbortError(error)) {
      return error;
    }

    const message = String(error?.message || "").trim();
    if (
      !message ||
      /NetworkError when attempting to fetch resource/i.test(message) ||
      /Failed to fetch/i.test(message) ||
      /Load failed/i.test(message)
    ) {
      return new Error(
        "This speed test server did not respond to browser requests. Try another server."
      );
    }

    return error instanceof Error ? error : new Error(message || "Speed test request failed.");
  }

  const GAUGE_TICKS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

  function gaugeProgress(speedMbps) {
    const safe = Math.max(0, Number(speedMbps) || 0);
    if (safe <= 0) {
      return 0;
    }

    // Piecewise linear: each adjacent pair of ticks spans an equal fraction
    // of the arc (1 / (GAUGE_TICKS.length - 1)).
    const segments = GAUGE_TICKS.length - 1;
    for (let i = 1; i < GAUGE_TICKS.length; i++) {
      if (safe <= GAUGE_TICKS[i]) {
        const lo = GAUGE_TICKS[i - 1];
        const hi = GAUGE_TICKS[i];
        const t = (safe - lo) / (hi - lo);
        return ((i - 1) + t) / segments;
      }
    }

    return 1; // at or above max tick
  }

  function setArc(card, speedMbps) {
    const arc = card.querySelector("[data-speedtest-arc]");
    const tip = card.querySelector("[data-speedtest-tip]");
    if (!arc) {
      return;
    }

    const progress = gaugeProgress(speedMbps);
    const dash = (progress * 100).toFixed(2);
    arc.style.strokeDasharray = `${dash} 100`;

    if (tip) {
      const angle = (progress * 180).toFixed(2);
      tip.style.transform = `rotate(${angle}deg)`;
    }
  }

  function setDisplayValue(card, value, options = {}) {
    const valueNode = card.querySelector("[data-speedtest-value]");
    if (!valueNode) {
      return;
    }

    const immediate = Boolean(options.immediate);
    if (card._speedtestFrame) {
      window.cancelAnimationFrame(card._speedtestFrame);
    }

    const nextValue = Math.max(0, Number(value) || 0);
    if (immediate) {
      card.dataset.displayMbps = String(nextValue);
      valueNode.textContent = formatMbps(nextValue);
      setArc(card, nextValue);
      return;
    }

    const startValue = Number(card.dataset.displayMbps || 0);
    const startedAt = nowMs();
    const duration = 220;

    const update = (frameAt) => {
      const elapsed = frameAt - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (nextValue - startValue) * eased;
      card.dataset.displayMbps = String(current);
      valueNode.textContent = formatMbps(current);
      setArc(card, current);

      if (progress < 1) {
        card._speedtestFrame = window.requestAnimationFrame(update);
      }
    };

    card._speedtestFrame = window.requestAnimationFrame(update);
  }

  function updateButton(card, state) {
    const button = card.querySelector("[data-speedtest-action]");
    const cancelButton = card.querySelector("[data-speedtest-cancel]");
    const serverSelect = card.querySelector("[data-speedtest-server-select]");
    if (!button) {
      return;
    }

    const running = Boolean(state.running);
    button.disabled = running;
    if (serverSelect) {
      serverSelect.disabled = running;
    }
    if (cancelButton) {
      cancelButton.hidden = !running;
      cancelButton.disabled = !running;
    }

    if (running) {
      button.textContent = "Running";
      return;
    }

    if (state.phase === "complete") {
      button.textContent = "Run again";
      return;
    }

    if (state.phase === "error") {
      button.textContent = "Run again";
      return;
    }

    button.textContent = "Run again";
  }

  function renderCard(card, state) {
    const phaseNode = card.querySelector("[data-speedtest-phase]");
    const downloadNode = card.querySelector("[data-speedtest-download]");
    const uploadNode = card.querySelector("[data-speedtest-upload]");
    const latencyNode = card.querySelector("[data-speedtest-latency]");
    const serverNode = card.querySelector("[data-speedtest-server]");
    const assessmentNode = card.querySelector("[data-speedtest-assessment]");
    const statusNode = card.querySelector("[data-speedtest-status]");

    card.classList.toggle(
      "speedtest-card--compact",
      state.phase === "complete" && !state.running
    );

    if (phaseNode) {
      phaseNode.textContent = PHASE_LABELS[state.phase] || "";
    }

    setDisplayValue(card, state.currentMbps || 0, {
      immediate: Boolean(state.running),
    });

    if (downloadNode) {
      downloadNode.textContent = formatMbps(state.downloadMbps);
    }

    if (uploadNode) {
      uploadNode.textContent = formatMbps(state.uploadMbps);
    }

    if (latencyNode) {
      latencyNode.textContent = formatLatency(state.latencyMs);
    }

    if (serverNode) {
      serverNode.textContent =
        state.serverLabel || "Automatic (lowest latency)";
    }

    if (assessmentNode) {
      assessmentNode.textContent =
        state.assessment ||
        "Measures latency first, then download, then upload using the selected server.";
    }

    if (statusNode) {
      const statusText = String(state.status || "").trim();
      statusNode.textContent = statusText;
      statusNode.hidden = !statusText;
    }

    updateButton(card, state);
    renderDebug(card);
  }

  function initialState() {
    return {
      phase: "idle",
      running: false,
      currentMbps: 0,
      uploadMbps: 0,
      downloadMbps: 0,
      latencyMs: null,
      serverLabel: "",
      assessment: "",
      status: "Ready to measure your connection.",
    };
  }

  function applyState(card, partial) {
    const state = {
      ...(card._speedtestState || initialState()),
      ...partial,
    };
    card._speedtestState = state;
    renderCard(card, state);
  }

  function cancelTest(card) {
    const run = card._speedtestRun;
    if (!run) {
      return;
    }

    run.abort();
    card._speedtestRun = null;
    card.dataset.speedtestRunning = "false";
    const currentState = card._speedtestState || initialState();
    applyState(card, {
      ...currentState,
      phase: "idle",
      running: false,
      currentMbps: 0,
      assessment: "",
      status: "Speed test cancelled.",
    });
    appendDebugEvent(card, "Cancelled by user.");
  }

  function buildAssessment(downloadMbps) {
    const speed = Number(downloadMbps) || 0;

    if (speed >= 500) {
      return "Your Internet connection is extremely fast.";
    }

    if (speed >= 200) {
      return "Your Internet connection is very fast.";
    }

    if (speed >= 100) {
      return "Your Internet connection is fast.";
    }

    if (speed >= 50) {
      return "Your Internet connection should handle streaming, calls, and gaming comfortably.";
    }

    if (speed >= 25) {
      return "Your Internet connection should handle HD streaming and everyday work well.";
    }

    if (speed >= 10) {
      return "Your Internet connection is fine for browsing, music, and lighter video calls.";
    }

    return "Your Internet connection may feel slow on heavier downloads or video streams.";
  }

  async function measurePing(url, run, timeoutMs = LATENCY_TIMEOUT_MS) {
    if (run.aborted) {
      throw abortError();
    }

    const controller = new AbortController();
    run.fetchControllers.add(controller);
    const startedAt = nowMs();
    let timeoutId = null;

    try {
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await fetch(
        appendQuery(url, { cors: "true", r: randomToken() }),
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        throw new Error("Ping failed.");
      }

      await response.text();
      return nowMs() - startedAt;
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error("Ping timed out.");
      }

      throw normalizeBackendError(error);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      unregisterFetchController(run, controller);
    }
  }

  function normalizeProbeError(error) {
    const message = String(error?.message || "").trim();
    return message || "No response";
  }

  async function probeServer(server, run, sampleCount = SERVER_SELECTION_PINGS) {
    const samples = [];
    const errors = [];

    for (let index = 0; index < sampleCount; index += 1) {
      try {
        samples.push(await measurePing(server.pingUrl, run));
      } catch (error) {
        if (run.aborted) {
          throw error;
        }
        errors.push(normalizeProbeError(error));
      }
    }

    const latencyMs = samples.length ? Math.min(...samples) : Number.POSITIVE_INFINITY;
    return {
      latencyMs,
      samples: samples.map((value) => roundToTenths(value)),
      error:
        samples.length > 0 ? "" : errors[0] || "No successful ping samples",
    };
  }

  async function selectBestServer(card, run, servers) {
    if (!servers.length) {
      throw new Error("No speed test servers are configured.");
    }

    let completed = 0;
    const results = await Promise.all(
      servers.map(async (server) => {
        const probe = await probeServer(server, run);
        completed += 1;
        applyState(card, {
          phase: "preflight",
          running: true,
          serverLabel: "Selecting server...",
          status: `Checking servers (${completed}/${servers.length})...`,
        });
        const serverLabel = server.optionLabel || server.label || server.id;
        if (Number.isFinite(probe.latencyMs)) {
          appendDebugEvent(
            card,
            `Checked ${serverLabel}: ${formatLatency(probe.latencyMs)} from samples ${
              probe.samples.length
                ? probe.samples.map((value) => formatLatency(value)).join(", ")
                : "none"
            }.`
          );
        } else {
          appendDebugEvent(
            card,
            `Checked ${serverLabel}: unavailable (${probe.error || "No response"}).`
          );
        }
        return {
          server,
          latencyMs: probe.latencyMs,
        };
      })
    );

    const reachable = results
      .filter((result) => Number.isFinite(result.latencyMs))
      .sort((left, right) => left.latencyMs - right.latencyMs);

    if (!reachable.length) {
      throw new Error("No speed test servers responded.");
    }

    return reachable[0];
  }

  async function measureLatency(card, run, server, initialSample) {
    const samples = [];
    if (Number.isFinite(initialSample) && initialSample > 0) {
      samples.push(initialSample);
      applyState(card, {
        phase: "latency",
        running: true,
        latencyMs: roundToTenths(median(samples)),
        serverLabel: server.optionLabel || server.label,
        status: `Measuring latency (${samples.length}/${LATENCY_SAMPLE_COUNT})...`,
      });
    }

    while (samples.length < LATENCY_SAMPLE_COUNT) {
      const latencyMs = await measurePing(server.pingUrl, run);
      samples.push(latencyMs);
      applyState(card, {
        phase: "latency",
        running: true,
        latencyMs: roundToTenths(median(samples)),
        serverLabel: server.optionLabel || server.label,
        status: `Measuring latency (${samples.length}/${LATENCY_SAMPLE_COUNT})...`,
      });
    }

    return {
      latencyMs: roundToTenths(median(samples)),
      samples: samples.map((value) => roundToTenths(value)),
    };
  }

  function formatElapsedSeconds(elapsedMs) {
    return `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}s`;
  }

  function speedFromBytes(totalBytes, elapsedMs) {
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      return 0;
    }

    const safeElapsedMs = Math.max(1, elapsedMs);
    return (
      ((totalBytes * 8) / (safeElapsedMs / 1000)) *
      OVERHEAD_COMPENSATION_FACTOR /
      1_000_000
    );
  }

  function recordThroughputSample(samples, totalBytes, currentNow) {
    return recordThroughputSampleForWindow(
      samples,
      totalBytes,
      currentNow,
      THROUGHPUT_WINDOW_MS
    );
  }

  function recordThroughputSampleForWindow(samples, totalBytes, currentNow, windowMs) {
    samples.push({
      time: currentNow,
      bytes: Math.max(0, Number(totalBytes) || 0),
    });

    while (
      samples.length > 2 &&
      currentNow - samples[0].time > windowMs
    ) {
      samples.shift();
    }
  }

  function rollingMbpsFromSamples(samples) {
    if (!Array.isArray(samples) || samples.length < 2) {
      return 0;
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const deltaBytes = last.bytes - first.bytes;
    const deltaMs = last.time - first.time;
    if (deltaBytes <= 0 || deltaMs <= 0) {
      return 0;
    }

    return speedFromBytes(deltaBytes, deltaMs);
  }

  function createSustainedTracker() {
    return {
      bestWindow: {
        mbps: 0,
        durationMs: 0,
        sampleCount: 0,
      },
      lastImprovementAt: 0,
    };
  }

  function updateSustainedTracker(tracker, candidateWindow, currentNow) {
    const candidateMbps = Math.max(0, Number(candidateWindow?.mbps) || 0);
    if (candidateMbps <= 0) {
      return tracker.bestWindow;
    }

    const threshold = sustainedImprovementThreshold(tracker.bestWindow.mbps);
    if (
      tracker.bestWindow.mbps === 0 ||
      candidateMbps >= tracker.bestWindow.mbps + threshold
    ) {
      tracker.bestWindow = {
        mbps: candidateMbps,
        durationMs: Math.max(0, Number(candidateWindow?.durationMs) || 0),
        sampleCount: Math.max(0, Number(candidateWindow?.sampleCount) || 0),
      };
      tracker.lastImprovementAt = currentNow;
    }

    return tracker.bestWindow;
  }

  function shouldStopPhase(tracker, elapsedMs, currentNow, maxDurationMs) {
    if (elapsedMs >= maxDurationMs) {
      return true;
    }

    if (elapsedMs < MIN_PHASE_DURATION_MS || !tracker.lastImprovementAt) {
      return false;
    }

    return currentNow - tracker.lastImprovementAt >= STABILIZE_HOLD_MS;
  }

  async function runDownloadTest(card, run, server) {
    return new Promise((resolve, reject) => {
      const rawStart = nowMs();
      const graceDeadline = rawStart + DOWNLOAD_GRACE_MS;
      const measurementDeadline = graceDeadline + MAX_DOWNLOAD_DURATION_MS;
      const localXhrs = new Set();
      const throughputSamples = [];
      const measurementSamples = [];
      const warmupSamples = [];
      const sustainedTracker = createSustainedTracker();
      let measurementStart = rawStart;
      let totalLoaded = 0;
      let warmupLoaded = 0;
      let graceDone = false;
      let finished = false;
      let lastMbps = 0;
      let stableMbps = 0;
      let peakRollingMbps = 0;
      let trailingWindow = {
        mbps: 0,
        durationMs: 0,
        sampleCount: 0,
      };

      const stopStreams = () => {
        localXhrs.forEach((xhr) => {
          try {
            xhr.onprogress = null;
            xhr.onload = null;
            xhr.onerror = null;
            xhr.onabort = null;
            xhr.abort();
          } catch {}
          unregisterDownloadXhr(run, xhr);
        });
        localXhrs.clear();
      };

      const buildPhaseResult = (fallbackMbps) => {
        const bestWindow = sustainedTracker.bestWindow || {
          mbps: 0,
          durationMs: 0,
          sampleCount: 0,
        };
        const tailAverageMbps = trailingWindow.mbps || 0;
        const finalMbps =
          bestWindow.mbps || tailAverageMbps || stableMbps || fallbackMbps || 0;
        const measuredSeconds = graceDone
          ? Math.max(0, nowMs() - measurementStart) / 1000
          : 0;

        return {
          mbps: roundToTenths(finalMbps),
          debug: {
            source: "Best sustained window after grace",
            finalMbps: roundToTenths(finalMbps),
            bestSustainedMbps: roundToTenths(bestWindow.mbps),
            tailAverageMbps: roundToTenths(tailAverageMbps),
            finalCumulativeMbps: roundToTenths(stableMbps),
            finalRollingMbps: roundToTenths(lastMbps),
            peakRollingMbps: roundToTenths(peakRollingMbps),
            transferredBytes: totalLoaded,
            measuredSeconds,
            bestWindowSeconds: bestWindow.durationMs / 1000,
            tailWindowSeconds: trailingWindow.durationMs / 1000,
            tailSampleCount: trailingWindow.sampleCount,
          },
        };
      };

      const finish = (value, error) => {
        if (finished) {
          return;
        }

        finished = true;
        clearRegisteredInterval(run, intervalId);
        stopStreams();

        if (error) {
          reject(error);
          return;
        }

        resolve(buildPhaseResult(value));
      };

      const intervalId = registerInterval(run, () => {
        if (run.aborted) {
          finish(lastMbps, abortError());
          return;
        }

        const currentNow = nowMs();
        if (currentNow - rawStart < 200) {
          return;
        }

        if (!graceDone) {
          recordThroughputSampleForWindow(
            warmupSamples,
            warmupLoaded,
            currentNow,
            WARMUP_SEED_WINDOW_MS
          );
          if (currentNow >= graceDeadline) {
            const warmupRollingMbps = rollingMbpsFromSamples(warmupSamples);
            if (warmupRollingMbps > 0) {
              lastMbps = warmupRollingMbps;
              peakRollingMbps = Math.max(peakRollingMbps, lastMbps);
              applyState(card, {
                phase: "download",
                running: true,
                currentMbps: roundToTenths(lastMbps),
                downloadMbps: roundToTenths(lastMbps),
                status: "Testing download speed...",
              });
            }
            graceDone = true;
            if (totalLoaded > 0) {
              totalLoaded = 0;
              measurementStart = nowMs();
            }
            throughputSamples.length = 0;
            measurementSamples.length = 0;
            recordThroughputSample(throughputSamples, 0, measurementStart);
          }
          return;
        }

        const elapsedMs = Math.max(1, currentNow - measurementStart);
        recordThroughputSample(throughputSamples, totalLoaded, currentNow);
        const rollingMbps = rollingMbpsFromSamples(throughputSamples);
        const cumulativeMbps = speedFromBytes(totalLoaded, elapsedMs);
        stableMbps = cumulativeMbps;
        lastMbps = rollingMbps > 0 ? rollingMbps : cumulativeMbps;
        peakRollingMbps = Math.max(peakRollingMbps, lastMbps);
        recordMeasurementSample(measurementSamples, {
          time: currentNow,
          bytes: totalLoaded,
          rollingMbps: lastMbps,
          cumulativeMbps,
        });
        trailingWindow = summarizeTrailingWindow(measurementSamples);
        updateSustainedTracker(
          sustainedTracker,
          findBestSustainedWindow(measurementSamples),
          currentNow
        );
        applyState(card, {
          phase: "download",
          running: true,
          currentMbps: roundToTenths(lastMbps),
          downloadMbps: roundToTenths(lastMbps),
          status: `Testing download speed (${formatElapsedSeconds(elapsedMs)})...`,
        });

        if (shouldStopPhase(sustainedTracker, elapsedMs, currentNow, MAX_DOWNLOAD_DURATION_MS)) {
          finish(
            sustainedTracker.bestWindow.mbps ||
              trailingWindow.mbps ||
              stableMbps ||
              lastMbps
          );
        }
      }, UPDATE_INTERVAL_MS);

      const launchStream = (streamIndex, delayMs) => {
        registerTimeout(
          run,
          () => {
            const sendNext = () => {
              if (finished || run.aborted || nowMs() >= measurementDeadline) {
                return;
              }

              const xhr = new XMLHttpRequest();
              let prevLoaded = 0;
              localXhrs.add(xhr);
              run.downloadXhrs.add(xhr);

              const cleanup = () => {
                xhr.onprogress = null;
                xhr.onload = null;
                xhr.onerror = null;
                xhr.onabort = null;
                localXhrs.delete(xhr);
                unregisterDownloadXhr(run, xhr);
              };

              xhr.onprogress = (event) => {
                const diff = event.loaded - prevLoaded;
                if (diff > 0) {
                  if (graceDone) {
                    totalLoaded += diff;
                  } else {
                    warmupLoaded += diff;
                  }
                }
                prevLoaded = event.loaded;
              };

              xhr.onload = () => {
                try {
                  xhr.abort();
                } catch {}
                cleanup();
                sendNext();
              };

              xhr.onerror = () => {
                cleanup();
                if (!finished && !run.aborted) {
                  sendNext();
                }
              };

              xhr.onabort = cleanup;

              try {
                xhr.responseType = "arraybuffer";
              } catch {}

              try {
                xhr.open(
                  "GET",
                  appendQuery(server.downloadUrl, {
                    cors: "true",
                    r: randomToken(),
                    ckSize: String(DOWNLOAD_CHUNK_MB),
                  }),
                  true
                );
                xhr.send();
              } catch (error) {
                cleanup();
                if (!finished && !run.aborted && !isAbortError(error)) {
                  sendNext();
                }
              }
            };

            sendNext();
          },
          1 + delayMs
        );
      };

      for (let index = 0; index < DOWNLOAD_STREAMS; index += 1) {
        launchStream(index, DOWNLOAD_STREAM_DELAY_MS * index);
      }

      registerTimeout(
        run,
        () =>
          finish(
            sustainedTracker.bestWindow.mbps ||
              trailingWindow.mbps ||
              stableMbps ||
              lastMbps
          ),
        DOWNLOAD_GRACE_MS + MAX_DOWNLOAD_DURATION_MS + 1600
      );
    });
  }

  async function runUploadTest(card, run, server) {
    await warmUpUploadServer(run, server);
    if (run.aborted) {
      throw abortError();
    }

    return new Promise((resolve, reject) => {
      const uploadStrategy = getUploadStrategy();
      const rawStart = nowMs();
      const graceDeadline = rawStart + UPLOAD_GRACE_MS;
      const measurementDeadline = graceDeadline + MAX_UPLOAD_DURATION_MS;
      const localXhrs = new Set();
      const payload = getUploadPayload(uploadStrategy.payloadBytes);
      const throughputSamples = [];
      const measurementSamples = [];
      const warmupSamples = [];
      const sustainedTracker = createSustainedTracker();
      let measurementStart = rawStart;
      let totalLoaded = 0;
      let warmupLoaded = 0;
      let graceDone = false;
      let finished = false;
      let lastMbps = 0;
      let stableMbps = 0;
      let peakRollingMbps = 0;
      let trailingWindow = {
        mbps: 0,
        durationMs: 0,
        sampleCount: 0,
      };

      const stopStreams = () => {
        localXhrs.forEach((xhr) => {
          try {
            xhr.abort();
          } catch {}
          unregisterUploadXhr(run, xhr);
        });
        localXhrs.clear();
      };

      const buildPhaseResult = (fallbackMbps) => {
        const bestWindow = sustainedTracker.bestWindow || {
          mbps: 0,
          durationMs: 0,
          sampleCount: 0,
        };
        const tailAverageMbps = trailingWindow.mbps || 0;
        const finalMbps =
          bestWindow.mbps || tailAverageMbps || stableMbps || fallbackMbps || 0;
        const measuredSeconds = graceDone
          ? Math.max(0, nowMs() - measurementStart) / 1000
          : 0;

        return {
          mbps: roundToTenths(finalMbps),
          debug: {
            source: uploadStrategy.source,
            finalMbps: roundToTenths(finalMbps),
            bestSustainedMbps: roundToTenths(bestWindow.mbps),
            tailAverageMbps: roundToTenths(tailAverageMbps),
            finalCumulativeMbps: roundToTenths(stableMbps),
            finalRollingMbps: roundToTenths(lastMbps),
            peakRollingMbps: roundToTenths(peakRollingMbps),
            transferredBytes: totalLoaded,
            measuredSeconds,
            bestWindowSeconds: bestWindow.durationMs / 1000,
            tailWindowSeconds: trailingWindow.durationMs / 1000,
            tailSampleCount: trailingWindow.sampleCount,
          },
        };
      };

      const finish = (value, error) => {
        if (finished) {
          return;
        }

        finished = true;
        clearRegisteredInterval(run, intervalId);
        stopStreams();

        if (error) {
          reject(error);
          return;
        }

        resolve(buildPhaseResult(value));
      };

      const intervalId = registerInterval(run, () => {
        if (run.aborted) {
          finish(lastMbps, abortError());
          return;
        }

        const currentNow = nowMs();
        if (currentNow - rawStart < 200) {
          return;
        }

        if (!graceDone) {
          recordThroughputSampleForWindow(
            warmupSamples,
            warmupLoaded,
            currentNow,
            WARMUP_SEED_WINDOW_MS
          );
          if (currentNow >= graceDeadline) {
            const warmupRollingMbps = rollingMbpsFromSamples(warmupSamples);
            if (warmupRollingMbps > 0) {
              lastMbps = warmupRollingMbps;
              peakRollingMbps = Math.max(peakRollingMbps, lastMbps);
              applyState(card, {
                phase: "upload",
                running: true,
                currentMbps: roundToTenths(lastMbps),
                uploadMbps: roundToTenths(lastMbps),
                status: "Testing upload speed...",
              });
            }
            graceDone = true;
            if (totalLoaded > 0) {
              totalLoaded = 0;
              measurementStart = nowMs();
            }
            throughputSamples.length = 0;
            measurementSamples.length = 0;
            recordThroughputSample(throughputSamples, 0, measurementStart);
          }
          return;
        }

        const elapsedMs = Math.max(1, currentNow - measurementStart);
        recordThroughputSample(throughputSamples, totalLoaded, currentNow);
        const rollingMbps = rollingMbpsFromSamples(throughputSamples);
        const cumulativeMbps = speedFromBytes(totalLoaded, elapsedMs);
        stableMbps = cumulativeMbps;
        lastMbps = rollingMbps > 0 ? rollingMbps : cumulativeMbps;
        peakRollingMbps = Math.max(peakRollingMbps, lastMbps);
        recordMeasurementSample(measurementSamples, {
          time: currentNow,
          bytes: totalLoaded,
          rollingMbps: lastMbps,
          cumulativeMbps,
        });
        trailingWindow = summarizeTrailingWindow(measurementSamples);
        updateSustainedTracker(
          sustainedTracker,
          findBestSustainedWindow(measurementSamples),
          currentNow
        );
        applyState(card, {
          phase: "upload",
          running: true,
          currentMbps: roundToTenths(lastMbps),
          uploadMbps: roundToTenths(lastMbps),
          status: `Testing upload speed (${formatElapsedSeconds(elapsedMs)})...`,
        });

        if (shouldStopPhase(sustainedTracker, elapsedMs, currentNow, MAX_UPLOAD_DURATION_MS)) {
          finish(
            sustainedTracker.bestWindow.mbps ||
              trailingWindow.mbps ||
              stableMbps ||
              lastMbps
          );
        }
      }, UPDATE_INTERVAL_MS);

      appendDebugEvent(
        card,
        `Upload strategy: ${uploadStrategy.debugLabel} (${uploadStrategy.streamCount} stream${
          uploadStrategy.streamCount === 1 ? "" : "s"
        }, ${Math.round(uploadStrategy.payloadBytes / 1024)} KB payloads).`
      );

      const launchStream = (streamIndex, delayMs) => {
        registerTimeout(
          run,
          () => {
            const sendNext = () => {
              if (finished || run.aborted || nowMs() >= measurementDeadline) {
                return;
              }

              const xhr = new XMLHttpRequest();
              let prevLoaded = 0;
              localXhrs.add(xhr);
              run.uploadXhrs.add(xhr);

              const cleanup = () => {
                try {
                  xhr.upload.onprogress = null;
                  xhr.upload.onload = null;
                  xhr.upload.onerror = null;
                } catch {}
                xhr.onload = null;
                xhr.onerror = null;
                xhr.onabort = null;
                localXhrs.delete(xhr);
                unregisterUploadXhr(run, xhr);
              };

              if (uploadStrategy.useSmallChunkWorkaround) {
                const countChunk = () => {
                  if (graceDone) {
                    totalLoaded += payload.size;
                  } else {
                    warmupLoaded += payload.size;
                  }
                };

                const handleComplete = (countBytes) => {
                  if (countBytes) {
                    countChunk();
                  }
                  cleanup();
                  if (!finished && !run.aborted) {
                    sendNext();
                  }
                };

                xhr.onload = () => {
                  handleComplete(true);
                };

                xhr.onerror = () => {
                  handleComplete(true);
                };
              } else {
                xhr.upload.onprogress = (event) => {
                  const diff = event.loaded - prevLoaded;
                  if (diff > 0) {
                    if (graceDone) {
                      totalLoaded += diff;
                    } else {
                      warmupLoaded += diff;
                    }
                  }
                  prevLoaded = event.loaded;
                };

                xhr.upload.onload = () => {
                  cleanup();
                  sendNext();
                };

                xhr.upload.onerror = () => {
                  cleanup();
                  if (!finished && !run.aborted) {
                    sendNext();
                  }
                };
              }

              xhr.onabort = cleanup;

              try {
                xhr.open(
                  "POST",
                  appendQuery(server.uploadUrl, {
                    cors: "true",
                    r: randomToken(),
                  }),
                  true
                );
                xhr.setRequestHeader("Content-Encoding", "identity");
                xhr.send(payload);
              } catch (error) {
                cleanup();
                if (!finished && !run.aborted && !isAbortError(error)) {
                  sendNext();
                }
              }
            };

            sendNext();
          },
          delayMs + streamIndex
        );
      };

      for (let index = 0; index < uploadStrategy.streamCount; index += 1) {
        launchStream(index, uploadStrategy.streamDelayMs * index);
      }

      registerTimeout(
        run,
        () =>
          finish(
            sustainedTracker.bestWindow.mbps ||
              trailingWindow.mbps ||
              stableMbps ||
              lastMbps
          ),
        UPLOAD_GRACE_MS + MAX_UPLOAD_DURATION_MS + 1600
      );
    });
  }

  async function startTest(card) {
    if (card.dataset.speedtestRunning === "true") {
      return;
    }

    const previousRun = card._speedtestRun;
    if (previousRun) {
      previousRun.abort();
    }

    const run = createRunContext();
    card._speedtestRun = run;
    card.dataset.speedtestRunning = "true";

    const serverSelect = card.querySelector("[data-speedtest-server-select]");
    const selectedServerId = serverSelect?.value || AUTO_SERVER_ID;
    const selectedServerLabel =
      serverSelect?.selectedOptions?.[0]?.textContent?.trim() || "";
    const servers = getServers(card);
    const actualServers = servers.filter((server) => !server.auto);
    const requestedServerLabel =
      selectedServerId === AUTO_SERVER_ID
        ? "Automatic (lowest latency)"
        : selectedServerLabel;

    resetDebugData(card, requestedServerLabel);
    appendDebugEvent(
      card,
      selectedServerId === AUTO_SERVER_ID
        ? "Automatic server selection requested."
        : `Manual server selected: ${requestedServerLabel}.`
    );

    applyState(card, {
      phase: "preflight",
      running: true,
      currentMbps: 0,
      uploadMbps: 0,
      downloadMbps: 0,
      latencyMs: null,
      serverLabel:
        selectedServerId === AUTO_SERVER_ID
          ? "Selecting server..."
          : selectedServerLabel,
      assessment: "",
      status:
        selectedServerId === AUTO_SERVER_ID
          ? "Selecting the lowest-latency server..."
          : `Preparing ${selectedServerLabel}...`,
    });

    try {
      if (!actualServers.length) {
        throw new Error("No speed test servers are configured.");
      }

      let chosenServer = null;
      let selectionLatencyMs = null;

      if (selectedServerId === AUTO_SERVER_ID) {
        const selection = await selectBestServer(card, run, actualServers);
        chosenServer = selection.server;
        selectionLatencyMs = selection.latencyMs;
      } else {
        chosenServer = actualServers.find((server) => server.id === selectedServerId);
        if (!chosenServer) {
          throw new Error("The selected speed test server is unavailable.");
        }
        const manualProbe = await probeServer(chosenServer, run, 1);
        selectionLatencyMs = manualProbe.latencyMs;
        if (!Number.isFinite(selectionLatencyMs)) {
          throw new Error(
            `Selected server did not respond to ping (${manualProbe.error || "No response"}).`
          );
        }
      }

      const serverLabel = chosenServer.optionLabel || chosenServer.label;
      setDebugServerSelection(card, {
        selectedServerLabel: serverLabel,
        selectionLatencyMs,
      });
      appendDebugEvent(
        card,
        `Using ${serverLabel} with selection ping ${formatLatency(
          selectionLatencyMs
        )}.`
      );

      const latencyResult = await measureLatency(
        card,
        run,
        chosenServer,
        selectionLatencyMs
      );
      const latencyMs = latencyResult.latencyMs;
      setDebugLatency(card, latencyMs, latencyResult.samples);
      appendDebugEvent(
        card,
        `Latency median ${formatLatency(latencyMs)} from samples ${latencyResult.samples
          .map((value) => formatLatency(value))
          .join(", ")}.`
      );

      applyState(card, {
        phase: "download",
        running: true,
        currentMbps: 0,
        uploadMbps: 0,
        downloadMbps: 0,
        latencyMs,
        serverLabel,
        status: "Testing download speed...",
      });

      const downloadResult = await runDownloadTest(card, run, chosenServer);
      const downloadMbps = downloadResult.mbps;
      setDebugPhase(card, "download", downloadResult.debug);
      appendDebugEvent(
        card,
        `Download final ${formatDebugMbps(
          downloadResult.debug.finalMbps
        )} from best sustained ${formatDebugMbps(
          downloadResult.debug.bestSustainedMbps
        )}; trailing comparison ${formatDebugMbps(
          downloadResult.debug.tailAverageMbps
        )}; cumulative comparison ${formatDebugMbps(
          downloadResult.debug.finalCumulativeMbps
        )}.`
      );

      applyState(card, {
        phase: "upload",
        running: true,
        currentMbps: 0,
        downloadMbps,
        latencyMs,
        serverLabel,
        status: "Testing upload speed...",
      });

      const uploadResult = await runUploadTest(card, run, chosenServer);
      const uploadMbps = uploadResult.mbps;
      setDebugPhase(card, "upload", uploadResult.debug);
      appendDebugEvent(
        card,
        `Upload final ${formatDebugMbps(
          uploadResult.debug.finalMbps
        )} from best sustained ${formatDebugMbps(
          uploadResult.debug.bestSustainedMbps
        )}; trailing comparison ${formatDebugMbps(
          uploadResult.debug.tailAverageMbps
        )}; cumulative comparison ${formatDebugMbps(
          uploadResult.debug.finalCumulativeMbps
        )}.`
      );

      if (run.aborted) {
        return;
      }

      applyState(card, {
        phase: "complete",
        running: false,
        currentMbps: uploadMbps,
        downloadMbps,
        uploadMbps,
        latencyMs,
        serverLabel,
        assessment: buildAssessment(downloadMbps),
        status: "",
      });
      appendDebugEvent(
        card,
        `Completed with download ${formatDebugMbps(downloadMbps)} and upload ${formatDebugMbps(
          uploadMbps
        )}.`
      );
    } catch (error) {
      if (run.aborted || isAbortError(error)) {
        return;
      }

      appendDebugEvent(
        card,
        `Error: ${
          error instanceof Error
            ? error.message
            : "The speed test could not be started."
        }`
      );

      applyState(card, {
        phase: "error",
        running: false,
        status:
          error instanceof Error
            ? error.message
            : "The speed test could not be started.",
        assessment:
          "The speed test could not finish with the selected server. Try again or pick another server.",
      });
    } finally {
      if (card._speedtestRun === run) {
        run.dispose();
        card.dataset.speedtestRunning = "false";
        const state = card._speedtestState || initialState();
        updateButton(card, state);
      }
    }
  }

  function initCard(card) {
    if (!(card instanceof HTMLElement) || card.dataset.speedtestBound === "true") {
      return;
    }

    card.dataset.speedtestBound = "true";
    populateServerSelect(card);
    card._speedtestState = initialState();
    renderCard(card, card._speedtestState);

    const button = card.querySelector("[data-speedtest-action]");
    const cancelButton = card.querySelector("[data-speedtest-cancel]");
    if (button) {
      button.addEventListener("click", () => startTest(card));
    }
    if (cancelButton) {
      cancelButton.addEventListener("click", () => cancelTest(card));
    }

    window.requestAnimationFrame(() => startTest(card));
  }

  function initAll(root = document) {
    if (root instanceof HTMLElement && root.matches(CARD_SELECTOR)) {
      initCard(root);
    }

    root.querySelectorAll?.(CARD_SELECTOR).forEach(initCard);
  }

  function boot() {
    initAll();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          initAll(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
