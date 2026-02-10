/** @format */

export default eventHandler(() => {
  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wyzie Subs - Status</title>
    <meta name="description" content="A powerful subtitle scraping API for anything. <3" />
    <meta name="keywords" content="subtitles, subtitle scraper, API, movie subtitles, Wyzie Subs, open-subtitles scraper api, subtitles scraper api, free, open-source, open source" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="Wyzie Subs - Status" />
    <meta name="twitter:site" content="@sudoflix" />
    <meta name="twitter:creator" content="@sudoflix" />
    <meta name="author" content="BadDeveloper" />
    <meta name="theme-color" content="#1d4ed8" />
    <link rel="icon" href="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <meta property="og:title" content="Wyzie Subs - Status" />
    <meta property="og:description" content="A powerful subtitle scraping API for anything. <3" />
    <meta property="og:image" content="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <meta property="og:url" content="" />
    <meta property="og:type" content="website" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Wyzie Subs - Status" />
    <meta name="twitter:description" content="A powerful subtitle scraping API for anything. <3" />
    <meta name="twitter:image" content="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            colors: {
              primary: { "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe", "300": "#93c5fd", "400": "#60a5fa", "500": "#3b82f6", "600": "#2563eb", "700": "#1d4ed8" },
              mono: { background: "#0b0b0b", card: "#111", accent: "#181818" },
              type: { emphasized: "#e0e0e0", subheader: "#d0d0d0", dimmed: "#c0c0c0", footer: "#6b7280" },
            },
          },
        },
      };
    </script>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .spinner {
        animation: spin 1s linear infinite;
      }
    </style>
  </head>

  <body class="bg-mono-background min-h-screen flex flex-col items-center justify-center p-4 cursor-default">
    <div class="bg-mono-card rounded-lg shadow-xl py-6 px-8 max-w-xl w-full">
      <header class="flex items-center justify-between mb-5">
        <h1 class="text-4xl font-bold text-primary-700"><a class="hover:underline" href="https://wyzie.ru" alt="Toolset homepage" title="Toolset Homepage">Wyzie</a> <span class="text-type-emphasized">Status</span></h1>
        <div class="group w-10 h-auto shadow-md transition-shadow duration-500 hover:shadow-xl">
          <a href="/" title="Home" alt="Home">
            <img src="https://i.postimg.cc/L5ppKYC5/cclogo.png" class="w-full h-auto transition-transform duration-300 group-hover:scale-110" alt="Wyzie Subs logo" />
          </a>
        </div>
      </header>

      <div class="bg-mono-accent p-4 rounded-md mb-4">
        <h2 class="text-type-emphasized text-xl font-semibold mb-2">Subtitle Source Status</h2>
        <p class="text-type-dimmed text-sm mb-2">
          Current operational status of all subtitle sources used by Wyzie Subs.
        </p>
        <div class="flex justify-between items-center">
          <span class="text-xs text-type-footer">Auto-refreshes every 60s</span>
          <span class="text-xs text-type-footer" id="last-updated">Last updated: Loading...</span>
        </div>
      </div>

      <div id="status-container" class="space-y-4 mb-6"></div>

      <section>
        <div class="flex justify-between text-s text-type-footer mt-6">
          <a href="/" class="text-primary-500 hover:text-primary-600 transition duration-100" alt="Back" title="Back">← Back</a>
          <a href="/faq" class="text-primary-500 hover:text-primary-600 transition duration-100" alt="FAQ" title="FAQ">FAQ</a>
          <a href="https://docs.wyzie.ru/subs/intro" class="text-primary-500 hover:text-primary-600 transition duration-100" alt="Docs" title="Docs">Read the docs</a>
        </div>
      </section>
    </div>

    <script>
      // Test URLs
      const OpenSubsTestUrlsTv = [
        "/search?id=tt2861424&season=1&episode=1&source=opensubtitles",
        "/search?id=tt0306414&season=1&episode=1&source=opensubtitles",
        "/search?id=tt14044212&season=1&episode=1&source=opensubtitles",
        "/search?id=46511&season=1&episode=1&source=opensubtitles",
      ];

      const OpenSubsTestUrlsMovies = [
        "/search?id=tt36856278&source=opensubtitles",
        "/search?id=tt1490017&source=opensubtitles",
        "/search?id=508943&source=opensubtitles",
      ];

      const SubDlTestUrlsTv = [
        "/search?id=tt2861424&season=1&episode=1&source=subdl",
        "/search?id=tt0306414&season=1&episode=1&source=subdl",
        "/search?id=tt14044212&season=1&episode=1&source=subdl",
        "/search?id=46511&season=1&episode=1&source=subdl",
      ];

      const SubDlTestUrlsMovies = [
        "/search?id=tt1599348&source=subdl",
        "/search?id=tt36856278&source=subdl",
        "/search?id=tt1490017&source=subdl",
        "/search?id=508943&source=subdl",
      ];

      const Subf2mTestUrlsTv = [
        "/search?id=tt2861424&season=1&episode=1&source=subf2m",
        "/search?id=tt0306414&season=1&episode=1&source=subf2m",
        "/search?id=46511&season=1&episode=1&source=subf2m",
      ];

      const Subf2mTestUrlsMovies = [
        "/search?id=tt36856278&source=subf2m",
        "/search?id=tt1490017&source=subf2m",
        "/search?id=508943&source=subf2m",
      ];

      const PodnapisiTestUrlsTv = [
        "/search?id=tt2861424&season=1&episode=1&source=podnapisi",
        "/search?id=tt0306414&season=1&episode=1&source=podnapisi",
        "/search?id=tt14044212&season=1&episode=1&source=podnapisi",
        "/search?id=46511&season=1&episode=1&source=podnapisi",
      ];

      const PodnapisiTestUrlsMovies = [
        "/search?id=tt36856278&source=podnapisi",
        "/search?id=tt1490017&source=podnapisi",
        "/search?id=508943&source=podnapisi",
      ];

      const AnimetoshoTestUrlsTv = [
        "/search?id=tt2560140&season=1&episode=1&source=animetosho",
        "/search?id=tt2560140&season=1&episode=2&source=animetosho",
        "/search?id=tt2560140&season=2&episode=1&source=animetosho",
      ];

      const AnimetoshoTestUrlsMovies = [
        "/search?id=tt5311514&source=animetosho",
        "/search?id=tt9426210&source=animetosho",
        "/search?id=tt1951264&source=animetosho",
      ];

      const GestdownTestUrlsTv = [
        "/search?id=tt2861424&season=1&episode=1&source=gestdown",
        "/search?id=tt0306414&season=1&episode=1&source=gestdown",
        "/search?id=tt0944947&season=1&episode=1&source=gestdown",
      ];

      const sourcesConfig = [
        { name: "OpenSubtitles", movieUrls: OpenSubsTestUrlsMovies, tvUrls: OpenSubsTestUrlsTv },
        { name: "SubDL", movieUrls: SubDlTestUrlsMovies, tvUrls: SubDlTestUrlsTv },
        { name: "Subf2m", movieUrls: Subf2mTestUrlsMovies, tvUrls: Subf2mTestUrlsTv },
        { name: "Podnapisi", movieUrls: PodnapisiTestUrlsMovies, tvUrls: PodnapisiTestUrlsTv },
        { name: "Animetosho", movieUrls: AnimetoshoTestUrlsMovies, tvUrls: AnimetoshoTestUrlsTv },
        { name: "Gestdown", tvUrls: GestdownTestUrlsTv },
      ];

      function getRandomElement(array) {
        if (!Array.isArray(array) || array.length === 0) {
          return null;
        }
        return array[Math.floor(Math.random() * array.length)];
      }

      async function checkEndpoint(url) {
        const startTime = Date.now();

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 50000);

          const response = await fetch(url, {
            method: "GET",
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const latency = Date.now() - startTime;

          const json = await response.json();

          if (response.ok && Array.isArray(json) && json.length > 0) {
            return {
              status: "operational",
               latency: latency + "ms",
              statusCode: response.status,
            };
          } else if (response.ok) {
            return {
              status: "degraded",
               latency: latency + "ms",
              statusCode: response.status,
            };
          } else {
            return {
              status: "down",
               latency: latency + "ms",
              statusCode: response.status,
            };
          }
        } catch (error) {
          const latency = Date.now() - startTime;
           console.error("Error checking endpoint " + url + ":", error);
          return {
            status: "down",
             latency: latency + "ms",
          };
        }
      }

      function getStatusClass(status) {
        switch (status) {
          case "operational":
            return "bg-green-500";
          case "degraded":
            return "bg-yellow-500";
          case "down":
            return "bg-red-500";
          case "unsupported":
            return "bg-gray-500";
          default:
            return "bg-gray-500";
        }
      }

      const getOverallStatus = (movieStatus, tvStatus) => {
        const statuses = [movieStatus, tvStatus]
          .filter((status) => Boolean(status) && status !== "unsupported");
        if (statuses.includes("operational")) {
          return "operational";
        }
        if (statuses.includes("degraded")) {
          return "degraded";
        }
        if (statuses.includes("down")) {
          return "down";
        }
        return statuses[0] || "unsupported";
      };

      const calculateAvgLatency = (movieLatency, tvLatency) => {
        const parseLatency = (latency) => {
          if (!latency || typeof latency !== "string") return null;
          const numeric = parseInt(latency.replace(/[^0-9]/g, ""), 10);
          return Number.isFinite(numeric) ? numeric : null;
        };

        const movieMs = parseLatency(movieLatency);
        const tvMs = parseLatency(tvLatency);
        const valid = [movieMs, tvMs].filter((value) => value !== null);
        if (!valid.length) return "N/A";
        const sum = valid.reduce((total, value) => total + value, 0);
        return Math.round(sum / valid.length) + "ms";
      };

      function buildSourceCard(name, data) {
        const sourceElement = document.createElement("div");
        sourceElement.className = "bg-mono-accent shadow-xl p-4 rounded-md transition-all duration-300 transform opacity-0 -translate-y-2";
        const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);
        const movieLinkHtml = data.movieTestUrl && data.movieStatus !== "unsupported"
          ? '<span>Test URL: <a href="' + data.movieTestUrl + '" class="text-primary-500 hover:text-primary-600 transition duration-100" target="_blank" title="View test URL">View</a></span>'
          : '<span class="text-type-footer">' + (data.movieStatus === "unsupported" ? "Movies not supported" : "Test unavailable") + '</span>';
        const tvLinkHtml = data.tvTestUrl && data.tvStatus !== "unsupported"
          ? '<span>Test URL: <a href="' + data.tvTestUrl + '" class="text-primary-500 hover:text-primary-600 transition duration-100" target="_blank" title="View test URL">View</a></span>'
          : '<span class="text-type-footer">' + (data.tvStatus === "unsupported" ? "TV not supported" : "Test unavailable") + '</span>';
        const cardHtml = [
          '<div class="flex items-center justify-between">',
          '  <h3 class="font-semibold text-type-subheader text-lg">' + name + '</h3>',
          '  <div class="flex items-center">',
          '    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ' + getStatusClass(data.status) + ' text-white">' + statusLabel + '</span>',
          '  </div>',
          '</div>',
          '<div class="text-type-footer text-[14px]">',
          '  <span>Avg. Latency: ' + data.latency + '</span>,',
          '  <span>Checked: ' + new Date(data.lastChecked).toLocaleTimeString() + '</span>',
          '</div>',
          '<div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">',
          '  <div class="bg-mono-transparent rounded-md">',
          '    <div class="flex items-center justify-between">',
          '      <span class="text-type-subheader">Movies</span>',
          '      <span class="inline-flex items-center w-3 h-3 rounded-full ' + getStatusClass(data.movieStatus) + '"></span>',
          '    </div>',
          '    <div class="mt-1 text-xs text-type-footer">',
          '      ' + movieLinkHtml,
          '    </div>',
          '  </div>',
          '  <div class="bg-mono-transparent rounded-md">',
          '    <div class="flex items-center justify-between">',
          '      <span class="text-type-subheader">TV Shows</span>',
          '      <span class="inline-flex items-center w-3 h-3 rounded-full ' + getStatusClass(data.tvStatus) + '"></span>',
          '    </div>',
          '    <div class="mt-1 text-xs text-type-footer">',
          '      ' + tvLinkHtml,
          '    </div>',
          '  </div>',
          '</div>'
        ].join("");
        sourceElement.innerHTML = cardHtml;

        requestAnimationFrame(() => {
          sourceElement.classList.remove("opacity-0", "-translate-y-2");
        });

        return sourceElement;
      }

      function renderLoadingState(container) {
        const loadingElement = document.createElement("div");
        loadingElement.className = "flex flex-col items-center justify-center py-8";
        loadingElement.innerHTML = [
          '<svg class="spinner w-12 h-12 text-primary-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">',
          '  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>',
          '  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>',
          '</svg>',
          '<p class="mt-3 text-type-dimmed">Checking service status...</p>'
        ].join("");
        container.replaceChildren(loadingElement);
        return loadingElement;
      }

      async function evaluateSource(config) {
        const movieTestUrl = getRandomElement(config.movieUrls);
        const tvTestUrl = getRandomElement(config.tvUrls);

        const movieCheckPromise = movieTestUrl ? checkEndpoint(movieTestUrl) : Promise.resolve(null);
        const tvCheckPromise = tvTestUrl ? checkEndpoint(tvTestUrl) : Promise.resolve(null);

        const [movieCheck, tvCheck] = await Promise.all([movieCheckPromise, tvCheckPromise]);

        const movieStatus = movieCheck?.status ?? (movieTestUrl ? "down" : "unsupported");
        const tvStatus = tvCheck?.status ?? (tvTestUrl ? "down" : "unsupported");

        return {
          status: getOverallStatus(movieStatus, tvStatus),
          latency: calculateAvgLatency(movieCheck?.latency, tvCheck?.latency),
          lastChecked: new Date().toISOString(),
          movieStatus,
          tvStatus,
          movieTestUrl,
          tvTestUrl,
        };
      }

      async function performStatusChecks() {
        const container = document.getElementById("status-container");
        const loadingElement = renderLoadingState(container);

        const evaluations = sourcesConfig.map(async (config) => {
          const data = await evaluateSource(config);
          const card = buildSourceCard(config.name, data);

          if (loadingElement.isConnected) {
            container.innerHTML = "";
          }

          container.appendChild(card);
        });

        await Promise.all(evaluations);
        document.getElementById("last-updated").textContent = "Last updated: " + new Date().toLocaleTimeString();
      }

      document.addEventListener("DOMContentLoaded", function () {
        performStatusChecks();

        const REFRESH_INTERVAL_MS = 60000;
        setInterval(performStatusChecks, REFRESH_INTERVAL_MS);
      });
    </script>
  </body>
</html>
  `;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
});
