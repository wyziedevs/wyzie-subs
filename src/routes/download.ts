/** @format */

import ISO6391 from "iso-639-1";

const escapeHtmlAttr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const languageEntries = ISO6391.getAllCodes()
  .map((code) => ({ code, name: ISO6391.getName(code) || code.toUpperCase() }))
  .sort((a, b) => a.name.localeCompare(b.name));

const languageOptionsHtml = [
  '<option value="all">All</option>',
  ...languageEntries.map(
    ({ code, name }) => `<option value="${escapeHtmlAttr(code)}">${escapeHtmlAttr(name)}</option>`,
  ),
].join("");

const languageLookupMap = languageEntries.reduce<Record<string, string>>((acc, entry) => {
  const codeKey = entry.code.toLowerCase();
  if (!acc[codeKey]) {
    acc[codeKey] = entry.code;
  }
  const nameKey = entry.name.toLowerCase();
  if (!acc[nameKey]) {
    acc[nameKey] = entry.code;
  }
  return acc;
}, {});

export default eventHandler(() => {
  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wyzie Subs - Download Subtitles</title>
    <meta
      name="description"
      content="Search TMDB, filter Wyzie subtitle results, and grab the perfect subtitle in seconds."
    />
    <meta
      name="keywords"
      content="subtitle downloader, subtitles api, tmdb subtitles, wyzie subs, open subtitles alternative"
    />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="Wyzie Subs - Download" />
    <meta name="twitter:site" content="@sudoflix" />
    <meta name="twitter:creator" content="@sudoflix" />
    <meta name="author" content="BadDeveloper" />
    <meta name="theme-color" content="#1d4ed8" />
    <link rel="icon" href="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <meta property="og:title" content="Wyzie Subs - Download Subtitles" />
    <meta
      property="og:description"
      content="Use TMDB search, add filters, and download subtitles directly from the Wyzie Subs API."
    />
    <meta property="og:image" content="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <meta property="og:url" content="https://sub.wyzie.ru/download" />
    <meta property="og:type" content="website" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://sub.wyzie.ru/download" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Wyzie Subs - Download Subtitles" />
    <meta
      name="twitter:description"
      content="Fast, filterable subtitle downloads powered by TMDB + Wyzie Subs."
    />
    <meta name="twitter:image" content="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap"
      rel="stylesheet"
    />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      select,
      #search-suggestions {
        --sb-track-color: transparent;
        --sb-thumb-color: #2563eb;
        --sb-size: 6px;
        cursor: pointer;
      }

      select::-webkit-scrollbar,
      #search-suggestions::-webkit-scrollbar {
        width: var(--sb-size);
      }

      select::-webkit-scrollbar-track,
      #search-suggestions::-webkit-scrollbar-track {
        background: var(--sb-track-color);
      }

      select::-webkit-scrollbar-thumb,
      #search-suggestions::-webkit-scrollbar-thumb {
        background: var(--sb-thumb-color);
        border-radius: 3px;
      }

      details .summary-icon {
        transition: transform 0.2s ease;
      }

      details[open] .summary-icon {
        transform: rotate(180deg);
      }

      .collapsible-wrapper {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.3s ease-out;
      }

      details[open] .collapsible-wrapper {
        grid-template-rows: 1fr;
      }

      details[open].closing .collapsible-wrapper {
        grid-template-rows: 0fr;
      }

      .collapsible-wrapper > div {
        overflow: hidden;
      }

      .search-wrapper {
        transition: box-shadow 0.2s ease;
      }

      .search-wrapper.open {
        box-shadow: 0 24px 50px -15px rgba(8, 8, 8, 0.65);
        border-radius: 0.75rem;
      }

      .search-wrapper.open #media-search {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-bottom-color: transparent;
      }

      .search-wrapper.open #search-suggestions {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border-top-width: 0;
        top: calc(100% - 1px);
      }

      .loading-bar {
        position: relative;
        width: 100%;
        height: 0.4rem;
        border-radius: 9999px;
        overflow: hidden;
        background: rgba(59, 130, 246, 0.15);
      }

      .loading-bar__indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: 35%;
        height: 100%;
        border-radius: inherit;
        background: #3b82f6;
        animation: loading-bar-move 1.1s ease-in-out infinite;
        transform: translateX(-100%);
      }

      @keyframes loading-bar-move {
        0% {
          transform: translateX(-100%);
        }
        50% {
          transform: translateX(60%);
        }
        100% {
          transform: translateX(200%);
        }
      }

      .episode-list {
        display: grid;
        gap: 0.75rem;
        max-height: 16rem;
        overflow-y: auto;
        padding-right: 0.25rem;
      }

      .episode-list::-webkit-scrollbar {
        width: 6px;
      }

      .episode-list::-webkit-scrollbar-track {
        background: transparent;
      }

      .episode-list::-webkit-scrollbar-thumb {
        background: #2563eb;
        border-radius: 3px;
      }

      .episode-card {
        display: flex;
        gap: 1rem;
        padding: 0.75rem;
        border-radius: 0.75rem;
        background: #181818;
        border: 1px solid rgba(29, 78, 216, 0.3);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .episode-card:hover {
        background: #202020;
        border-color: #3b82f6;
      }

      .episode-card.selected {
        background: rgba(59, 130, 246, 0.1);
        border-color: #3b82f6;
      }

      .episode-thumbnail {
        width: 140px;
        height: 80px;
        object-fit: cover;
        border-radius: 0.5rem;
        background: #111;
        flex-shrink: 0;
      }
    </style>
    <script>
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            colors: {
              primary: {
                "50": "#eff6ff",
                "100": "#dbeafe",
                "200": "#bfdbfe",
                "300": "#93c5fd",
                "400": "#60a5fa",
                "500": "#3b82f6",
                "600": "#2563eb",
                "700": "#1d4ed8",
              },
              mono: { background: "#0b0b0b", card: "#111", accent: "#181818" },
              type: { emphasized: "#e0e0e0", subheader: "#d0d0d0", dimmed: "#c0c0c0", footer: "#6b7280" },
            },
          },
        },
      };
    </script>
  </head>

  <body class="bg-mono-background min-h-screen flex flex-col items-center justify-center p-4 cursor-default">
    <div class="bg-mono-card rounded-lg shadow-xl py-6 px-8 max-w-xl w-full">
      <header class="flex items-center justify-between mb-6">
        <h1 class="text-4xl font-bold text-primary-700"><a class="hover:underline" href="https://wyzie.ru" alt="Toolset homepage" title="Wyzie Toolset Homepage">Wyzie</a> <span class="text-type-emphasized">Download</span></h1>
        <div class="group w-10 h-auto shadow-md transition-shadow duration-500 hover:shadow-xl">
          <a href="/" title="Wyzie Subs Home" alt="Wyzie Subs Home">
            <img src="https://i.postimg.cc/L5ppKYC5/cclogo.png" class="w-full h-auto transition-transform duration-300 group-hover:scale-110" alt="Wyzie Subs API logo" />
          </a>
        </div>
      </header>

      <main class="space-y-6">
        <section class="space-y-4">
          <form id="subtitle-form" class="space-y-5" autocomplete="off">
            <div>
              <div class="relative mt-2 search-wrapper">
                <input
                  id="media-search"
                  type="text"
                  placeholder="Search titles (Dune, One Piece, The Office)"
                  class="w-full rounded-xl bg-mono-accent border border-primary-700/30 px-4 py-3 text-type-emphasized focus:outline-none"
                />
                <div
                  id="search-suggestions"
                  class="absolute left-0 right-0 top-full bg-mono-accent rounded-xl border border-primary-700/30 overflow-hidden hidden max-h-72 overflow-y-auto z-20 transition-all"
                >
                  <div class="text-center text-type-footer text-xs py-3">
                    Start typing to search.
                  </div>
                </div>
              </div>
            </div>

            <input type="hidden" id="selected-id" />
            <input type="hidden" id="selected-media-type" />

            <div class="bg-mono-accent rounded-xl p-4 hidden" id="selection-wrapper">
              <div id="selected-media-card" class="flex gap-4">
                <img
                  id="selected-poster"
                  src=""
                  alt="Selected poster"
                  class="w-20 h-28 rounded-lg object-cover shadow-md hidden cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
                <div class="flex-1 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      id="selected-type"
                      class="text-xs uppercase tracking-wide bg-primary-700/20 text-primary-400 px-2 py-1 rounded-full"
                    ></span>
                    <span id="selected-meta" class="text-xs text-type-footer"></span>
                  </div>
                  <p id="selected-title" class="text-lg font-semibold text-type-emphasized"></p>
                  <p
                    id="selected-overview"
                    class="text-sm text-type-dimmed leading-relaxed max-h-[3rem] overflow-hidden transition-all duration-500 ease-in-out hover:max-h-96"
                  ></p>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="grid gap-4 md:grid-cols-2">
                <label class="flex flex-col gap-2 text-sm text-type-dimmed">
                  Language
                  <select
                    id="language-input"
                    multiple
                    size="6"
                    class="rounded-xl bg-mono-accent border border-primary-700/30 px-3 py-2 text-type-emphasized focus:outline-none min-h-[10rem]"
                  >
                    ${languageOptionsHtml}
                  </select>
                  <input
                    id="language-search"
                    type="text"
                    autocomplete="off"
                    placeholder="Search languages"
                    class="rounded-xl bg-mono-accent border border-primary-700/30 px-3 py-2 text-type-emphasized focus:outline-none"
                  />
                </label>

                <label class="flex flex-col gap-2 text-sm text-type-dimmed">
                  Source
                  <select
                    id="source-input"
                    multiple
                    size="6"
                    class="rounded-xl bg-mono-accent border border-primary-700/30 px-3 py-2 text-type-emphasized focus:outline-none min-h-[10rem]"
                  >
                    <option value="all">All</option>
                    <option value="subdl">SubDL</option>
                    <option value="subf2m">Subf2m</option>
                    <option value="opensubtitles">OpenSubtitles</option>
                    <option value="podnapisi">Podnapisi</option>
                    <option value="gestdown">Gestdown</option>
                    <option value="animetosho">AnimeTosho</option>
                  </select>
                  <input
                    id="source-search"
                    type="text"
                    autocomplete="off"
                    placeholder="Search providers"
                    class="rounded-xl bg-mono-accent border border-primary-700/30 px-3 py-2 text-type-emphasized focus:outline-none"
                  />
                </label>
              </div>

              <details id="tv-selector-details" class="bg-mono-accent rounded-xl p-4 hidden">
                <summary class="flex items-center justify-between text-sm font-semibold text-type-dimmed cursor-pointer select-none">
                  <span>Select Episode</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="summary-icon text-type-footer"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m6 9 6 6 6-6"></path>
                  </svg>
                </summary>
                <div class="collapsible-wrapper">
                  <div id="tv-selector-container" class="space-y-4 mt-4">
                    <div class="flex items-center justify-between">
                      <div class="relative">
                        <select id="season-select" class="appearance-none pl-4 pr-10 py-2 rounded-xl bg-mono-card border border-primary-700/30 text-type-emphasized focus:outline-none cursor-pointer hover:border-primary-500 transition-colors">
                          <!-- Options populated via JS -->
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-type-dimmed">
                          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                      </div>
                      <span id="episode-count-label" class="text-sm text-type-dimmed"></span>
                    </div>

                    <div id="episode-list" class="episode-list">
                      <!-- Episodes populated via JS -->
                      <div class="text-center py-8 text-type-dimmed">Select a season to view episodes</div>
                    </div>
                  </div>
                </div>
              </details>              <!-- Hidden inputs for form submission -->
              <input type="hidden" id="season-input" value="1" />
              <input type="hidden" id="episode-input" value="1" />

              <details class="bg-mono-accent rounded-xl p-4">
                <summary class="flex items-center justify-between text-sm font-semibold text-type-dimmed cursor-pointer select-none">
                  <span>Advanced Filters</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="summary-icon text-type-footer"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m6 9 6 6 6-6"></path>
                  </svg>
                </summary>
                <div class="collapsible-wrapper">
                  <div class="mt-4">
                    <div class="grid gap-4 md:grid-cols-2">
                      <label class="flex flex-col gap-2 text-sm text-type-dimmed">
                        Format
                        <input
                          id="format-input"
                          type="text"
                          autocomplete="off"
                          placeholder="e.g. srt, ass"
                          class="rounded-xl bg-mono-card border border-primary-700/30 px-3 py-2 text-type-emphasized focus:outline-none"
                        />
                        <span class="text-xs text-type-footer">Separate multiple values with commas.</span>
                      </label>

                      <label class="flex flex-col gap-2 text-sm text-type-dimmed">
                        Encoding
                        <input
                          id="encoding-input"
                          type="text"
                          autocomplete="off"
                          placeholder="e.g. utf-8, utf-16"
                            class="rounded-xl bg-mono-card border border-primary-700/30 px-3 py-2 text-type-emphasized focus:outline-none"
                        />
                      </label>
                    </div>
                    <label class="mt-4 flex items-center gap-3 text-sm text-type-dimmed">
                      <input
                        id="hi-toggle"
                        type="checkbox"
                          class="h-5 w-5 rounded border-primary-700/50 bg-mono-card text-primary-600 focus:outline-none"
                      />
                      Only show hearing-impaired friendly subtitles
                    </label>
                  </div>
                </div>
              </details>
            </div>

            <div class="flex flex-col gap-2">
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-xl bg-primary-700 text-type-emphasized font-semibold px-6 py-3 hover:bg-primary-600 transition-colors"
              >
                Search
              </button>
            </div>
          </form>
        </section>

        <section id="results-section" class="space-y-3 hidden">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-type-emphasized">Results</h2>
            <a href="/faq" class="text-sm text-primary-500 hover:text-primary-400 transition">Need help?</a>
          </div>
          <div
            id="subtitle-results"
            class="space-y-4"
            aria-live="polite"
            aria-busy="false"
            role="region"
          >
            <div class="text-type-footer text-sm">Run a search to see subtitle matches.</div>
          </div>
          <div
            id="pagination-controls"
            class="mt-4 flex items-center justify-between gap-4 text-sm text-type-dimmed hidden"
            aria-label="Subtitle pagination"
          ></div>
        </section>
      </main>
    </div>

    <div id="image-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 opacity-0">
      <div class="relative max-w-4xl w-full max-h-[90vh] p-4 flex items-center justify-center" id="modal-content">
        <button id="modal-close" class="absolute -top-2 -right-2 md:top-4 md:right-4 text-white hover:text-primary-600 transition-colors z-10 bg-black/50 rounded-full p-2 backdrop-blur-md border border-white/10">
          <i data-lucide="x" class="w-6 h-6"></i>
        </button>
        <img id="modal-image" src="" alt="Enlarged poster" class="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
      </div>
    </div>

    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
      lucide.createIcons();
    </script>
    <script>
      (function () {
        const searchInput = document.getElementById("media-search");
        const suggestionsPanel = document.getElementById("search-suggestions");
        const selectedIdInput = document.getElementById("selected-id");
        const selectedTypeInput = document.getElementById("selected-media-type");
        const selectionWrapper = document.getElementById("selection-wrapper");
        const selectionCard = document.getElementById("selected-media-card");
        const selectionPoster = document.getElementById("selected-poster");
        const selectionTitle = document.getElementById("selected-title");
        const selectionMeta = document.getElementById("selected-meta");
        const selectionOverview = document.getElementById("selected-overview");
        const selectionType = document.getElementById("selected-type");
        const statusMessage = document.getElementById("status-message");
        const resultsContainer = document.getElementById("subtitle-results");
        const resultsSection = document.getElementById("results-section");
        const paginationControls = document.getElementById("pagination-controls");
        const form = document.getElementById("subtitle-form");
        const seasonInput = document.getElementById("season-input");
        const episodeInput = document.getElementById("episode-input");
        const tvSelectorContainer = document.getElementById("tv-selector-container");
        const tvSelectorDetails = document.getElementById("tv-selector-details");
        const seasonSelect = document.getElementById("season-select");
        const episodeList = document.getElementById("episode-list");
        const episodeCountLabel = document.getElementById("episode-count-label");
        const languageInput = document.getElementById("language-input");
        const formatInput = document.getElementById("format-input");
        const encodingInput = document.getElementById("encoding-input");
        const sourceInput = document.getElementById("source-input");
        const languageSearchInput = document.getElementById("language-search");
        const sourceSearchInput = document.getElementById("source-search");
        const hiToggle = document.getElementById("hi-toggle");
        const searchWrapper = searchInput ? searchInput.closest(".search-wrapper") : null;

        // Modal elements
        const modal = document.getElementById("image-modal");
        const modalImage = document.getElementById("modal-image");
        const modalClose = document.getElementById("modal-close");
        const modalContent = document.getElementById("modal-content");

        const languageLookup = ${JSON.stringify(languageLookupMap)};

        const isoLangPattern = /^[a-z]{2}$/;

        const sourceLabelMap = {
          subdl: "SubDL",
          subf2m: "Subf2m",
          opensubtitles: "OpenSubtitles",
          podnapisi: "Podnapisi",
          animetosho: "AnimeTosho",
        };

        const normalizeSourceValue = function (value) {
          if (!value) return "";
          const normalized = String(value).trim();
          if (!normalized) return "";
          const mapped = sourceLabelMap[normalized.toLowerCase()];
          return mapped || normalized;
        };

        const formatSourceLabel = function (value) {
          if (Array.isArray(value)) {
            const normalized = value
              .map(function (entry) {
                return normalizeSourceValue(entry);
              })
              .filter(function (entry) {
                return entry.length > 0;
              });
            return normalized.length ? normalized.join(", ") : "Automatic";
          }
          const normalized = normalizeSourceValue(value);
          return normalized.length ? normalized : "Automatic";
        };

        const openSuggestionsPanel = function () {
          if (!suggestionsPanel) return;
          suggestionsPanel.classList.remove("hidden");
          if (searchWrapper) {
            searchWrapper.classList.add("open");
          }
        };

        const closeSuggestionsPanel = function () {
          if (!suggestionsPanel) return;
          suggestionsPanel.classList.add("hidden");
          if (searchWrapper) {
            searchWrapper.classList.remove("open");
          }
        };

        // Modal Logic
        const closeModal = function() {
          if (!modal) return;
          modal.classList.remove("opacity-100");
          modal.classList.add("opacity-0");
          setTimeout(() => {
            modal.classList.add("hidden");
            if (modalImage) modalImage.src = "";
          }, 300);
        };

        const openModal = function(src) {
          if (!modal || !modalImage) return;
          modalImage.src = src;
          modal.classList.remove("hidden");
          // Force reflow
          void modal.offsetWidth;
          modal.classList.remove("opacity-0");
          modal.classList.add("opacity-100");
        };

        if (selectionPoster) {
          selectionPoster.addEventListener("click", function() {
            if (selectionPoster.src && !selectionPoster.classList.contains("hidden")) {
              // Use high res image if possible, but for now just use the src
              // TMDB images are usually w185, we might want w500 or original for modal
              // The current src is w185. Let's try to upgrade it to w500 or w780
              let highResSrc = selectionPoster.src;
              if (highResSrc.includes("/w185/")) {
                highResSrc = highResSrc.replace("/w185/", "/w780/");
              }
              openModal(highResSrc);
            }
          });
        }

        if (modalClose) {
          modalClose.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
          });
        }

        if (modal) {
          modal.addEventListener("click", function(e) {
            if (e.target === modal) {
              closeModal();
            }
          });
        }

        document.addEventListener("keydown", function(e) {
          if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
            closeModal();
          }
        });

        let debounceId = null;
        let currentSuggestions = [];
        let selectedMedia = null;
        const DEFAULT_PAGE_SIZE = 5;
        const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
        let pageSize = DEFAULT_PAGE_SIZE;
        let currentResults = [];
        let currentLanguageGroups = [];
        let currentPage = 1;

        const escapeHtml = function (value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        };

        const resetSelection = function () {
          selectedMedia = null;
          selectedIdInput.value = "";
          selectedTypeInput.value = "";
          selectionCard.classList.add("hidden");
          if (selectionWrapper) {
            selectionWrapper.classList.add("hidden");
          }
          selectionPoster.classList.add("hidden");
          if (tvSelectorContainer) {
            tvSelectorContainer.classList.add("hidden");
          }
          if (tvSelectorDetails) {
            tvSelectorDetails.classList.add("hidden");
            tvSelectorDetails.open = false;
          }
          seasonInput.value = "1";
          episodeInput.value = "1";
          if (seasonSelect) seasonSelect.innerHTML = "";
          if (episodeList) episodeList.innerHTML = "";
        };

        const renderSelection = async function (item) {
          selectedMedia = item;
          selectedIdInput.value = String(item.id);
          selectedTypeInput.value = item.mediaType;
          if (selectionWrapper) {
            selectionWrapper.classList.remove("hidden");
          }
          selectionCard.classList.remove("hidden");

          if (item.poster) {
            selectionPoster.src = item.poster;
            selectionPoster.alt = item.title + " poster";
            selectionPoster.classList.remove("hidden");
          } else {
            selectionPoster.classList.add("hidden");
          }

          selectionTitle.textContent = item.title;
          const releaseLabel = item.releaseYear ? String(item.releaseYear) : "";
          selectionMeta.textContent = releaseLabel || "Year unavailable";
          const overviewText = item.overview || "Synopsis unavailable for this title.";
          selectionOverview.textContent = overviewText;
          selectionType.textContent = item.mediaType === "tv" ? "TV Series" : "Movie";

          if (item.mediaType === "tv") {
            if (tvSelectorContainer) {
              tvSelectorContainer.classList.remove("hidden");
            }
            if (tvSelectorDetails) {
              tvSelectorDetails.classList.remove("hidden");
              tvSelectorDetails.open = true;
            }

              // Reset inputs
              seasonInput.value = "1";
              episodeInput.value = "1";

              // Fetch seasons
              if (seasonSelect) {
                seasonSelect.innerHTML = '<option>Loading...</option>';
                const seasons = await fetchSeasons(item.id);

                const validSeasons = seasons.filter(function(s) { return s.season_number > 0; });

                if (validSeasons.length === 0) {
                   seasonSelect.innerHTML = '<option value="1">Season 1</option>';
                } else {
                   seasonSelect.innerHTML = validSeasons
                    .map(function(s) { return '<option value="' + s.season_number + '">Season ' + s.season_number + '</option>'; })
                    .join('');
                }

                // Trigger episode load for season 1 (or first available)
                const initialSeason = validSeasons.length > 0 ? validSeasons[0].season_number : 1;
                seasonSelect.value = initialSeason;
                seasonInput.value = initialSeason;

                const episodes = await fetchEpisodes(item.id, initialSeason);
                renderEpisodes(episodes);
              }
          } else {
            if (tvSelectorContainer) {
              tvSelectorContainer.classList.add("hidden");
            }
            if (tvSelectorDetails) {
              tvSelectorDetails.classList.add("hidden");
            }
            seasonInput.value = "";
            episodeInput.value = "";
          }
        };

        const renderSuggestions = function (items) {
          if (!items.length) {
            suggestionsPanel.innerHTML = '<div class="text-center text-type-footer text-xs py-3">No TMDB matches. Try another title.</div>';
            return;
          }

          const rows = items
            .map(function (item, index) {
              const release = item.releaseYear ? " / " + item.releaseYear : "";
              const typeLabel = item.mediaType === "tv" ? "TV" : "Movie";
              const poster = item.poster
                ? '<img src="' + item.poster + '" alt="' + escapeHtml(item.title) + ' poster" class="w-10 h-14 rounded-lg object-cover" loading="lazy" />'
                : '<div class="w-10 h-14 rounded-lg bg-mono-card border border-primary-700/30 flex items-center justify-center text-xs text-type-footer">N/A</div>';
              return (
                '<button type="button" data-index="' +
                index +
                '" class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary-700/10 focus:bg-primary-700/10">' +
                poster +
                '<div class="flex-1 ml-3">' +
                '<p class="text-type-emphasized font-semibold text-sm">' +
                escapeHtml(item.title) +
                '</p>' +
                '<p class="text-type-footer text-xs">' +
                typeLabel +
                release +
                '</p>' +
                '<p class="text-type-dimmed text-xs line-clamp-2">' +
                escapeHtml(item.overview || "") +
                '</p>' +
                '</div>' +
                '</button>'
              );
            })
            .join("");

          suggestionsPanel.innerHTML = rows;
        };

        const dedupeValues = function (list) {
          return list.filter(function (value, index, array) {
            return array.indexOf(value) === index;
          });
        };

        const getSelectValues = function (element) {
          if (!element || element.tagName !== "SELECT") return [];
          return Array.from(element.selectedOptions || [])
            .map(function (option) {
              return option.value.trim();
            })
            .filter(function (entry) {
              return entry.length > 0;
            });
        };

        const getSearchValues = function (element) {
          if (!element) return [];
          return String(element.value || "")
            .split(",")
            .map(function (entry) {
              return entry.trim();
            })
            .filter(function (entry) {
              return entry.length > 0;
            });
        };

        const attachSelectSearch = function (selectElement, searchElement) {
          if (!selectElement || !searchElement) return;

          const optionCache = Array.from(selectElement.options || []).map(function (option) {
            return {
              node: option,
              text: (option.textContent || "").toLowerCase(),
              value: (option.value || "").toLowerCase(),
            };
          });

          searchElement.addEventListener("input", function (event) {
            const term = event.target.value.trim().toLowerCase();
            optionCache.forEach(function (entry) {
              const matches = !term || entry.text.includes(term) || entry.value.includes(term);
              entry.node.hidden = !matches;
            });
          });
        };

        const resolveGeneralFilter = function (primaryElement, secondaryElement, allowAllValue) {
          const normalize = function (values) {
            const normalized = dedupeValues(
              values.map(function (entry) {
                return entry.toLowerCase();
              }),
            );

            if (
              normalized.some(function (entry) {
                return entry === "all";
              })
            ) {
              return allowAllValue ? ["all"] : [];
            }

            return normalized;
          };

          if (primaryElement) {
            if (primaryElement.tagName === "SELECT") {
              const selected = getSelectValues(primaryElement);
              if (selected.length) {
                return normalize(selected);
              }
            }

            if (primaryElement.tagName === "INPUT") {
              const entries = getSearchValues(primaryElement);
              if (entries.length) {
                return normalize(entries);
              }
            }
          }

          if (secondaryElement) {
            const fallback = getSearchValues(secondaryElement);
            if (fallback.length) {
              return normalize(fallback);
            }
          }

          return [];
        };

        const resolveLanguageFilter = function () {
          const selected = getSelectValues(languageInput).map(function (entry) {
            return entry.toLowerCase();
          });

          if (selected.length) {
            if (
              selected.some(function (entry) {
                return entry === "all";
              })
            ) {
              return [];
            }

            return dedupeValues(
              selected
                .map(function (entry) {
                  const iso = languageLookup[entry] || entry;
                  return isoLangPattern.test(iso) ? iso : null;
                })
                .filter(Boolean),
            );
          }

          const fallback = getSearchValues(languageSearchInput);
          if (!fallback.length) return [];

          const resolved = dedupeValues(
            fallback
              .map(function (entry) {
                const trimmed = entry.trim();
                const key = trimmed.toLowerCase();
                if (key === "all") {
                  return "all";
                }
                const lookupValue = languageLookup[key];
                if (lookupValue && isoLangPattern.test(lookupValue)) {
                  return lookupValue;
                }
                if (isoLangPattern.test(key)) {
                  return key;
                }
                return trimmed;
              })
              .filter(Boolean),
          );

          if (
            resolved.some(function (entry) {
              return String(entry).toLowerCase() === "all";
            })
          ) {
            return [];
          }

          return resolved;
        };

        attachSelectSearch(languageInput, languageSearchInput);
        attachSelectSearch(sourceInput, sourceSearchInput);

        const buildSubtitleCard = function (item) {
          const languageRow = item.display
            ? escapeHtml(item.display) + " (" + escapeHtml(item.language || "-") + ")"
            : escapeHtml(item.language || "-");
          const sourceLabel = formatSourceLabel(item.source);
          const hiLabel = item.isHearingImpaired ? "HI" : "Standard";

          const flagBlock = item.flagUrl
            ? '<img src="' +
              item.flagUrl +
              '" alt="' +
              escapeHtml(item.display || "Language flag") +
              '" class="w-6 h-4 rounded-sm object-cover border border-primary-700/40" loading="lazy" />'
            : "";

          return (
            '<article class="bg-mono-accent rounded-2xl p-4 space-y-3">' +
            '<div class="flex flex-wrap items-center gap-3">' +
            flagBlock +
            '<div class="flex-1 min-w-[12rem]">' +
            '<p class="text-type-emphasized font-semibold">' +
            escapeHtml(item.media || "Unknown title") +
            '</p>' +
            '<p class="text-type-footer text-xs">' +
            languageRow +
            '</p>' +
            '</div>' +
            '<span class="text-xs px-2 py-1 rounded-full bg-primary-700/20 text-primary-400">' +
            escapeHtml(sourceLabel) +
            '</span>' +
            '</div>' +
            '<div class="grid sm:grid-cols-3 gap-2 text-xs text-type-footer">' +
            '<div class="bg-mono-card rounded-xl px-3 py-2">' +
            '<p class="uppercase tracking-wide text-primary-400">Format</p>' +
            '<p class="text-type-emphasized text-sm">' +
            escapeHtml(item.format || "-") +
            '</p>' +
            '</div>' +
            '<div class="bg-mono-card rounded-xl px-3 py-2">' +
            '<p class="uppercase tracking-wide text-primary-400">Encoding</p>' +
            '<p class="text-type-emphasized text-sm">' +
            escapeHtml(item.encoding || "Unknown") +
            '</p>' +
            '</div>' +
            '<div class="bg-mono-card rounded-xl px-3 py-2">' +
            '<p class="uppercase tracking-wide text-primary-400">Style</p>' +
            '<p class="text-type-emphasized text-sm">' +
            hiLabel +
            '</p>' +
            '</div>' +
            '</div>' +
            '<div class="flex flex-wrap gap-3">' +
            '<a href="' +
            item.url +
            '" download class="flex-1 min-w-[9rem] text-center rounded-xl bg-primary-700 text-type-emphasized font-semibold py-2 hover:bg-primary-600 transition" rel="noopener">Download</a>' +
            '<a href="' +
            item.url +
            '" target="_blank" rel="noopener noreferrer" class="flex-1 min-w-[9rem] text-center rounded-xl border border-primary-700/40 text-type-emphasized py-2 hover:border-primary-500 transition">Open in browser</a>' +
            '</div>' +
            '</article>'
          );
        };

        const groupResultsByLanguage = function (items) {
          if (!Array.isArray(items) || !items.length) return [];

          const buckets = new Map();
          items.forEach(function (item) {
            const displayName = typeof item.display === "string" ? item.display.trim() : "";
            const languageCode = typeof item.language === "string" ? item.language.trim() : "";
            const title = displayName || (languageCode ? languageCode.toUpperCase() : "Unknown language");
            const key = title.toLowerCase() || "unknown-language";
            if (!buckets.has(key)) {
              buckets.set(key, { title, items: [] });
            }
            buckets.get(key).items.push(item);
          });

          return Array.from(buckets.values());
        };

        const renderLanguageGroups = function (groups) {
          if (!Array.isArray(groups) || !groups.length) {
            return '<div class="text-type-footer text-sm">No subtitles matched those filters. Try broadening your search.</div>';
          }

          return groups
            .map(function (group) {
              const cardsMarkup = group.items
                .map(function (entry) {
                  return buildSubtitleCard(entry);
                })
                .join("");
              return (
                '<details class="language-group overflow-hidden rounded-2xl border border-primary-700/40 bg-mono-accent"' +
                '>' +
                '<summary class="flex items-center justify-between gap-3 px-4 py-3 text-type-emphasized cursor-pointer select-none">' +
                '<span class="font-semibold">' +
                escapeHtml(group.title) +
                '</span>' +
                '<div class="flex items-center gap-3 text-xs text-type-footer">' +
                '<span class="rounded-full bg-primary-700/20 px-2 py-1 text-primary-400">' +
                group.items.length +
                " result" +
                (group.items.length === 1 ? "" : "s") +
                '</span>' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="summary-icon text-type-footer" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"></path></svg>' +
                '</div>' +
                '</summary>' +
                '<div class="collapsible-wrapper">' +
                '<div class="space-y-3 border-t border-primary-700/20 px-4 py-4">' +
                cardsMarkup +
                '</div>' +
                '</div>' +
                '</details>'
              );
            })
            .join("");
        };

        const renderPagination = function (totalPages) {
          if (!paginationControls) return;

          if (totalPages <= 0) {
            paginationControls.classList.add("hidden");
            paginationControls.innerHTML = "";
            return;
          }

          const prevDisabled = currentPage === 1;
          const nextDisabled = currentPage === totalPages;

          const optionsMarkup = PAGE_SIZE_OPTIONS.map(function (value) {
            return (
              '<option value="' +
              value +
              '"' +
              (value === pageSize ? " selected" : "") +
              ">" +
              value +
              "</option>"
            );
          }).join("");

          paginationControls.classList.remove("hidden");
          paginationControls.innerHTML =
            '<div class="flex w-full flex-wrap items-center justify-between gap-4">' +
            '<div class="flex items-center gap-4">' +
            '<button type="button" aria-label="Previous page" class="rounded-lg bg-mono-accent border border-primary-700/40 px-3 py-2 text-type-emphasized hover:border-primary-500 transition' +
            (prevDisabled ? ' opacity-50 cursor-not-allowed' : '') +
            '" data-action="prev"' +
            (prevDisabled ? ' disabled' : '') +
            '><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button>' +
            '<span class="text-type-emphasized px-1">Page ' +
            currentPage +
            " of " +
            totalPages +
            '</span>' +
            '<button type="button" aria-label="Next page" class="rounded-lg bg-mono-accent border border-primary-700/40 px-3 py-2 text-type-emphasized hover:border-primary-500 transition' +
            (nextDisabled ? ' opacity-50 cursor-not-allowed' : '') +
            '" data-action="next"' +
            (nextDisabled ? ' disabled' : '') +
            '><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button>' +
            '</div>' +
            '<label class="flex items-center gap-2 text-xs sm:text-sm">' +
            '<span>Languages per page</span>' +
            '<select data-action="page-size" class="rounded-lg bg-mono-accent border border-primary-700/40 px-3 py-2 text-type-emphasized focus:outline-none">' +
            optionsMarkup +
            '</select>' +
            '</label>' +
            '</div>';
        };

        const renderCurrentPage = function () {
          if (!Array.isArray(currentLanguageGroups) || !currentLanguageGroups.length) {
            resultsContainer.innerHTML = '<div class="text-type-footer text-sm">No subtitles matched those filters. Try broadening your search.</div>';
            resultsContainer.setAttribute("aria-busy", "false");
            if (paginationControls) {
              paginationControls.classList.add("hidden");
              paginationControls.innerHTML = "";
            }
            return;
          }

          const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
          const totalPages = Math.ceil(currentLanguageGroups.length / size);
          if (currentPage > totalPages) {
            currentPage = totalPages;
          }

          const startIndex = (currentPage - 1) * size;
          const pageGroups = currentLanguageGroups.slice(startIndex, startIndex + size);
          const markup = renderLanguageGroups(pageGroups);
          resultsContainer.innerHTML = markup;

          const detailsElements = resultsContainer.querySelectorAll("details.language-group");
          detailsElements.forEach(function (details) {
            details.addEventListener("toggle", function () {
              if (details.open) {
                detailsElements.forEach(function (otherDetails) {
                  if (otherDetails !== details && otherDetails.open) {
                    otherDetails.open = false;
                  }
                });
              }
            });
          });

          resultsContainer.setAttribute("aria-busy", "false");
          renderPagination(totalPages);
        };

        if (paginationControls) {
          paginationControls.addEventListener("click", function (event) {
            const control = event.target.closest("button[data-action]");
            if (!control || control.disabled) return;

            const totalPages = Math.max(1, Math.ceil(currentLanguageGroups.length / (pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE)));
            const action = control.dataset.action;
            if (action === "prev" && currentPage > 1) {
              currentPage -= 1;
              renderCurrentPage();
            } else if (action === "next" && currentPage < totalPages) {
              currentPage += 1;
              renderCurrentPage();
            }
          });

          paginationControls.addEventListener("change", function (event) {
            const select = event.target.closest('select[data-action="page-size"]');
            if (!select) return;
            const selectedValue = Number(select.value);
            if (!Number.isFinite(selectedValue) || selectedValue <= 0) {
              pageSize = DEFAULT_PAGE_SIZE;
            } else {
              pageSize = selectedValue;
            }
            currentPage = 1;
            renderCurrentPage();
          });
        }

        const renderResults = function (items) {
          currentResults = Array.isArray(items) ? items : [];
          currentLanguageGroups = groupResultsByLanguage(currentResults);
          currentPage = 1;
          renderCurrentPage();
        };

        const fetchSeasons = async function (id) {
          try {
            const response = await fetch(\`/api/tmdb/tv/\${id}\`);
            if (!response.ok) throw new Error("Failed to fetch seasons");
            const data = await response.json();
            return data.seasons || [];
          } catch (error) {
            console.error(error);
            return [];
          }
        };

        const fetchEpisodes = async function (id, seasonNumber) {
          try {
            if (episodeList) {
              episodeList.innerHTML = '<div class="text-center py-8 text-type-dimmed"><div class="loading-bar w-1/2 mx-auto"><div class="loading-bar__indicator"></div></div></div>';
            }
            const response = await fetch(\`/api/tmdb/tv/\${id}/\${seasonNumber}\`);
            if (!response.ok) throw new Error("Failed to fetch episodes");
            const data = await response.json();
            return data.episodes || [];
          } catch (error) {
            console.error(error);
            if (episodeList) {
              episodeList.innerHTML = '<div class="text-center py-8 text-red-400">Failed to load episodes</div>';
            }
            return [];
          }
        };

        const renderEpisodes = function (episodes) {
          if (!episodeList) return;

          if (!episodes.length) {
            episodeList.innerHTML = '<div class="text-center py-8 text-type-dimmed">No episodes found for this season</div>';
            return;
          }

          const currentEpisode = Number(episodeInput.value) || 1;

          episodeList.innerHTML = episodes.map(function(ep) {
            const isSelected = ep.episode_number === currentEpisode;
            const stillPath = ep.still_path
              ? \`https://image.tmdb.org/t/p/w300\${ep.still_path}\`
              : 'https://placehold.co/300x170/111/333?text=No+Image';

            return \`
              <div class="episode-card \${isSelected ? 'selected' : ''}" data-episode="\${ep.episode_number}">
                <img src="\${stillPath}" alt="Episode \${ep.episode_number}" class="episode-thumbnail" loading="lazy" />
                <div class="flex-1 min-w-0 py-1">
                  <div class="flex items-center justify-between mb-1">
                    <h4 class="text-type-emphasized font-semibold truncate pr-2">\${ep.episode_number}. \${escapeHtml(ep.name)}</h4>
                    <span class="text-xs text-type-footer whitespace-nowrap">\${ep.air_date ? ep.air_date.split('-')[0] : ''}</span>
                  </div>
                  <p class="text-xs text-type-dimmed leading-relaxed max-h-[2.5rem] overflow-hidden transition-all duration-500 ease-in-out hover:max-h-96">\${escapeHtml(ep.overview || 'No overview available.')}</p>
                </div>
              </div>
            \`;
          }).join('');

          if (episodeCountLabel) {
            episodeCountLabel.textContent = \`\${episodes.length} Episodes\`;
          }
        };

        if (seasonSelect) {
          seasonSelect.addEventListener('change', async function() {
            const season = this.value;
            seasonInput.value = season;
            // Reset episode to 1 when changing season
            episodeInput.value = "1";

            if (selectedMedia && selectedMedia.id) {
              const episodes = await fetchEpisodes(selectedMedia.id, season);
              renderEpisodes(episodes);
            }
          });
        }

        if (episodeList) {
          episodeList.addEventListener('click', function(e) {
            const card = e.target.closest('.episode-card');
            if (!card) return;

            const episodeNum = card.dataset.episode;
            episodeInput.value = episodeNum;

            // Update UI selection
            const cards = episodeList.querySelectorAll('.episode-card');
            cards.forEach(function(c) { c.classList.remove('selected'); });
            card.classList.add('selected');

            // Collapse details
            if (tvSelectorDetails) {
              tvSelectorDetails.open = false;
            }
          });
        }

        searchInput.addEventListener("input", function (event) {
          const value = event.target.value.trim();
          resetSelection();

          if (value.length < 2) {
            closeSuggestionsPanel();
            return;
          }

          if (debounceId) window.clearTimeout(debounceId);
          openSuggestionsPanel();
          if (suggestionsPanel) {
            suggestionsPanel.innerHTML = '<div class="text-center text-type-footer text-xs py-3">Searching TMDB...</div>';
          }

          debounceId = window.setTimeout(async function () {
            try {
              const tmdbUrl = "/api/tmdb/search?q=" + encodeURIComponent(value);
              const response = await fetch(tmdbUrl);
              if (!response.ok) {
                if (suggestionsPanel) {
                  suggestionsPanel.innerHTML = '<div class="text-center text-red-400 text-xs py-3">TMDB lookup failed.</div>';
                }
                return;
              }
              const payload = await response.json();
              currentSuggestions = Array.isArray(payload.results) ? payload.results : [];
              renderSuggestions(currentSuggestions);
            } catch (error) {
              console.error(error);
              if (suggestionsPanel) {
                suggestionsPanel.innerHTML = '<div class="text-center text-red-400 text-xs py-3">Unable to reach TMDB.</div>';
              }
            }
          }, 250);
        });

        suggestionsPanel.addEventListener("click", function (event) {
          const target = event.target.closest("button[data-index]");
          if (!target) return;
          const index = Number(target.dataset.index);
          const item = currentSuggestions[index];
          if (!item) return;
          closeSuggestionsPanel();
          searchInput.value = item.title;
          renderSelection(item);
        });

        document.addEventListener("click", function (event) {
          const summary = event.target.closest("summary");
          if (summary) {
            const details = summary.closest("details");
            const wrapper = details ? details.querySelector(".collapsible-wrapper") : null;
            if (details && wrapper) {
              event.preventDefault();
              if (details.open) {
                if (details.classList.contains("closing")) return;
                details.classList.add("closing");
                const onEnd = function () {
                  details.classList.remove("closing");
                  details.open = false;
                  wrapper.removeEventListener("transitionend", onEnd);
                };
                wrapper.addEventListener("transitionend", onEnd);
                setTimeout(onEnd, 350);
              } else {
                details.open = true;
              }
              return;
            }
          }

          if (!suggestionsPanel) return;
          if (!suggestionsPanel.contains(event.target) && event.target !== searchInput) {
            closeSuggestionsPanel();
          }
        });

        form.addEventListener("submit", async function (event) {
          event.preventDefault();

          if (!selectedIdInput.value) {
            return;
          }

          const isTvSelected = selectedTypeInput.value === "tv";

          if (
            isTvSelected &&
            ((seasonInput.value && !episodeInput.value) || (!seasonInput.value && episodeInput.value))
          ) {
            return;
          }

          const params = new URLSearchParams();
          params.set("id", selectedIdInput.value.trim());

          if (isTvSelected && seasonInput.value && episodeInput.value) {
            params.set("season", seasonInput.value.trim());
            params.set("episode", episodeInput.value.trim());
          }

          const languages = resolveLanguageFilter();
          if (languages.length) params.set("language", languages.join(","));

          const formats = resolveGeneralFilter(formatInput);
          if (formats.length) params.set("format", formats.join(","));

          const encodings = resolveGeneralFilter(encodingInput);
          if (encodings.length) params.set("encoding", encodings.join(","));

          const sources = resolveGeneralFilter(sourceInput, sourceSearchInput, true);
          if (sources.length) params.set("source", sources.join(","));

          if (hiToggle.checked) params.set("hi", "true");

          if (resultsSection) {
            resultsSection.classList.remove("hidden");
          }
          resultsContainer.setAttribute("aria-busy", "true");
          resultsContainer.innerHTML =
            '<div class="py-6 text-center">' +
            '<div class="loading-bar" role="progressbar" aria-label="Loading subtitles">' +
            '<div class="loading-bar__indicator"></div>' +
            '</div>' +
            '<p class="mt-3 text-type-footer text-sm">Loading subtitle data...</p>' +
            '</div>';
          if (paginationControls) {
            paginationControls.classList.add("hidden");
            paginationControls.innerHTML = "";
          }

          try {
            const searchUrl = "/search?" + params.toString();
            console.log("Fetching subtitle search URL:", searchUrl);
            const response = await fetch(searchUrl, {
              headers: { Accept: "application/json" },
            });

            if (!response.ok) {
              const error = await response.json().catch(function () {
                return { message: "Unknown error" };
              });
              resultsContainer.setAttribute("aria-busy", "false");
              return;
            }

            const data = await response.json();
            renderResults(data);
          } catch (error) {
            console.error(error);
            resultsContainer.setAttribute("aria-busy", "false");
          }
        });
      })();
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
