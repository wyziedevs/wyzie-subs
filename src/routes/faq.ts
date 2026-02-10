/** @format */

export default eventHandler(() => {
  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wyzie Subs - FAQ</title>
    <meta name="description" content="A powerful subtitle scraping API for anything. <3" />
    <meta name="keywords" content="subtitles, subtitle scraper, API, movie subtitles, Wyzie Subs, open-subtitles scraper api, subtitles scraper api, free, open-source, open source" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="Wyzie Subs - FAQ" />
    <meta name="twitter:site" content="@sudoflix" />
    <meta name="twitter:creator" content="@sudoflix" />
    <meta name="author" content="BadDeveloper" />
    <meta name="theme-color" content="#1d4ed8" />
    <link rel="icon" href="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <meta property="og:title" content="Wyzie Subs - FAQ" />
    <meta property="og:description" content="A powerful subtitle scraping API for anything. <3" />
    <meta property="og:image" content="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <meta property="og:url" content="https://sub.wyzie.ru" />
    <meta property="og:type" content="website" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://sub.wyzie.ru" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Wyzie Subs - FAQ" />
    <meta name="twitter:description" content="A powerful subtitle scraping API for anything. <3" />
    <meta name="twitter:image" content="https://i.postimg.cc/L5ppKYC5/cclogo.png" alt="Wyzie Subs Logo" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="application/ld+json">
      {
        "@context": "http://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://sub.wyzie.ru"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "FAQ",
            "item": "https://sub.wyzie.ru/faq"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Docs",
            "item": "https://docs.wyzie.ru"
          }
        ]
      }
    </script>
    <script type="application/ld+json">
      {
        "@context": "http://schema.org",
        "@type": "WebSite",
        "name": "Wyzie Subs",
        "url": "https://sub.wyzie.ru",
        "logo": "https://i.postimg.cc/L5ppKYC5/cclogo.png",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://sub.wyzie.ru/search?q={search_term_string}",
          "query-input": "required name=search_term_string"
        },
        "sameAs": ["https://github.com/itzcozi/wyzie-subs", "https://x.com/sudoflix", "https://discord.gg/2mxraHBVtB"],
        "creator": {
          "@type": "Person",
          "name": "BadDeveloper",
          "url": "https://github.com/itzcozi"
        }
      }
    </script>
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
  </head>

  <body class="bg-mono-background min-h-screen flex flex-col items-center justify-center p-4 cursor-default">
    <div class="bg-mono-card rounded-lg shadow-xl py-6 px-8 max-w-xl w-full">
      <header class="flex items-center justify-between mb-5">
        <h1 class="text-4xl font-bold text-primary-700"><a class="hover:underline" href="https://wyzie.ru" alt="Toolset homepage" title="Toolset Homepage">Wyzie</a> <span class="text-type-emphasized">FAQ</span></h1>
        <div class="group w-10 h-auto shadow-md transition-shadow duration-500 hover:shadow-xl">
          <a href="/" title="Home" alt="Home">
            <img src="https://i.postimg.cc/L5ppKYC5/cclogo.png" class="w-full h-auto transition-transform duration-300 group-hover:scale-110" alt="Wyzie Subs logo" />
          </a>
        </div>
      </header>

      <div class="space-y-4 mb-3">
        <div class="bg-mono-accent shadow-xl p-4 rounded-md flex flex-col gap-1">
          <h3 class="font-semibold text-type-subheader">How can I contact the dev?</h3>
          <p class="text-type-dimmed text-sm">
            I can be reached via email at <a href="mailto:dev@wyzie.ru" class="text-primary-500 hover:text-primary-600 transition duration-100 underline font-semibold" alt="Email" title="Email">dev@wyzie.ru</a> or via our community
            <a href="https://discord.gg/2mxraHBVtB" class="text-primary-500 hover:text-primary-600 transition duration-100 underline font-semibold" alt="Discord server" title="Discord server">Discord server</a>.
          </p>
        </div>
        <div class="bg-mono-accent shadow-xl p-4 rounded-md flex flex-col gap-1">
          <h3 class="font-semibold text-type-subheader">Are there any restrictions?</h3>
          <p class="text-type-dimmed text-sm">
            Wyzie Subs has absolutely no restrictions, you can use it for anything you want. However much you want.
          </p>
        </div>
        <div class="bg-mono-accent shadow-xl p-4 rounded-md flex flex-col gap-1">
          <h3 class="font-semibold text-type-subheader">Do you take donations?</h3>
          <p class="text-type-dimmed text-sm">
            I take donations via crypto. If you want to donate, please go to my donation page at <a href="https://donate.cozi.lol" class="text-primary-500 hover:text-primary-600 transition duration-100 underline font-semibold" alt="Donation page" title="Donation page">donate.cozi.lol</a>.
          </p>
        </div>
        <div class="bg-mono-accent shadow-xl p-4 rounded-md flex flex-col gap-1">
          <h3 class="font-semibold text-type-subheader">How reliable is it?</h3>
          <p class="text-type-dimmed text-sm">
            We pride ourselves on our consistent uptime and almost daily updates as well as fast caching. That being said if you are experiencing issues please reach out to us.
          </p>
        </div>
        <div class="bg-mono-accent shadow-xl p-4 rounded-md flex flex-col gap-1">
          <h3 class="font-semibold text-type-subheader">How to implement this into my project?</h3>
          <p class="text-type-dimmed text-sm">
            Use our open-source <a href="https://docs.wyzie.ru/subs/usage/package" class="text-primary-500 hover:text-primary-600 transition duration-100 underline font-semibold" alt="Wyzie Lib" title="Wyzie Lib">NPM Package</a> with zero
            dependencies!
          </p>
        </div>
        <div class="bg-mono-accent shadow-xl p-4 rounded-md flex flex-col gap-1">
          <h3 class="font-semibold text-type-subheader">Can I use this for a streaming site?</h3>
          <p class="text-type-dimmed text-sm">
            Almost all of our users are streaming sites, so yes, you can definitely use it for a streaming site.
          </p>
        </div>
      </div>
      <section>
        <div class="flex justify-between text-s text-type-footer mt-6">
          <a href="/" class="text-primary-500 hover:text-primary-600 transition duration-100" alt="Back" title="Back">← Back</a>
          <a href="/" class="text-primary-500 hover:text-primary-600 transition duration-100" alt="Status Page" title="Status Page">Status Page</a>
          <a href="https://docs.wyzie.ru/subs/intro" class="text-primary-500 hover:text-primary-600 transition duration-100" alt="Back" title="Back">Read the docs</a>
        </div>
      </section>
    </div>
  </body>
</html>
  `;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
});
