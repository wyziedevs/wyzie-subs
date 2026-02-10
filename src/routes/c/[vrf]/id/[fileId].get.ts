/** @format */

import { XZDecoder } from "xz-decoder-js";
import { proxyFetch } from "~/utils/proxy";
import { createErrorResponse } from "~/utils/utils";
import { unzipAndExtractSubtitle, processSubtitle } from "~/utils/unzip";
import { injectAd } from "~/utils/subtitleAd";

const ADS_ENABLED = false;
const ANIMETOSHO_STORAGE_URL = "https://animetosho.org/storage/attach";
const GESTDOWN_BASE_URL = "https://api.gestdown.info";
const GESTDOWN_HEADERS = {
  Accept: "text/srt, text/plain;q=0.9, */*;q=0.8",
  "User-Agent": "WyzieAPI/1.0 (+https://github.com/itzCozi/wyzie-api)",
};

const formatToMimeType: Record<string, string> = {
  srt: "text/plain",
  ass: "text/plain",
  ssa: "text/plain",
  vtt: "text/vtt",
  sub: "text/plain",
  txt: "text/plain",
  zip: "application/zip", // Add support for ZIP files from SubDL
  ttml: "application/ttml+xml",
  dfxp: "application/ttaf+xml",
};

function encodeBase64(buffer: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const chunk = buffer.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
}

function inferSubtitleFormat(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "txt";
  }

  if (/^webvtt/i.test(trimmed)) {
    return "vtt";
  }

  if (/\[script info\]/i.test(trimmed) || /\bDialogue:/i.test(trimmed)) {
    return "ass";
  }

  if (/^\{\\rtf/.test(trimmed)) {
    return "rtf";
  }

  return "srt";
}

// Animetosho stores attachments as single-file XZ archives; this converts them into raw bytes.
async function decompressAnimetoshoArchive(buffer: ArrayBuffer): Promise<Uint8Array> {
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  try {
    const decoder = new XZDecoder();
    return decoder.decodeBytes(input);
  } catch (error: any) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`XZ decompression failed: ${reason}`);
  }
}

export default defineEventHandler(async (event) => {
  console.log("typeof global caches:", typeof caches);
  console.log("event.context.cloudflare object:", event.context.cloudflare);
  let response: Response | undefined; // resp

  // glboal cache api https://developers.cloudflare.com/workers/runtime-apis/cache/
  // @ts-ignore - caches.default is available in CF Workers runtime
  const isCacheAvailable = typeof caches !== "undefined" && caches.default;
  // @ts-ignore - caches.default is available in CF Workers runtime
  const cache = isCacheAvailable ? caches.default : null;
  const cacheKey = getRequestURL(event).toString();

  if (isCacheAvailable && cache) {
    try {
      response = await cache.match(cacheKey);
      if (response) {
        console.log(`Cache HIT for: ${cacheKey}`);
        return response;
      }
      console.log(`Cache MISS for: ${cacheKey}`);
    } catch (cacheError) {
      console.error(`Cache match error: ${cacheError}`);
    }
  } else {
    console.log(
      "Cache API not available (via event.context.cloudflare.caches), skipping cache check.",
    );
  }

  // get params
  const vrf = event.context.params?.vrf;
  const fileId = event.context.params?.fileId;
  const query = getQuery(event);
  const format = query.format as string | undefined;
  const encoding = query.encoding as string | undefined;
  const autoUnzip = query.autoUnzip !== "false"; // Default to true

  console.log(`Handling request for /c/${vrf}/id/${fileId}?format=${format}&encoding=${encoding}`);

  if (!vrf || !fileId) {
    return createErrorResponse(400, "Bad Request", "Missing vrf or fileId parameter.");
  }

  const lowerFileId = fileId.toLowerCase();
  const isSubDL = lowerFileId.endsWith(".subdl");
  const isSubf2m = lowerFileId.endsWith(".subf2m");
  const isPodnapisi = lowerFileId.endsWith(".podnapisi");
  const isAnimetosho = lowerFileId.endsWith(".animetosho");
  const isGestdown = lowerFileId.endsWith(".gestdown");
  let targetUrl: string;
  let podnapisiHeaders: Record<string, string> | undefined;
  let animetoshoAttachmentId: number | null = null;
  let animetoshoRawId = "";

  if (isSubDL) {
    const realFileId = fileId.slice(0, -6); // remove ".subdl"
    const subdlFilename = realFileId.endsWith(".zip") ? realFileId : `${realFileId}.zip`;
    targetUrl = `https://dl.subdl.com/subtitle/${subdlFilename}`;

    if (isSubDL && autoUnzip) {
      try {
        const extractResult = await unzipAndExtractSubtitle(targetUrl, false, {}, encoding);

        if (!extractResult.success) {
          console.error(
            `[SubDL] Failed to extract subtitle: ${extractResult.error || "Unknown error"}`,
          );

          return createErrorResponse(
            500,
            "Subtitle Extraction Failed",
            `Could not extract subtitle from ZIP: ${extractResult.error || "Unknown error"}`,
          );
        } else {
          if (extractResult.binary && extractResult.buffer) {
            const fileExt = extractResult.filename?.split(".").pop()?.toLowerCase() || "sub";
            const mimeType =
              fileExt === "idx" ? "application/x-mplayer2" : "application/octet-stream";

            const finalResponse = new Response(extractResult.buffer, {
              headers: {
                "Content-Type": mimeType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Disposition": `attachment; filename="${extractResult.filename}"`,
              },
            });

            if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
              if (typeof event.waitUntil === "function") {
                event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
              } else {
                await cache.put(cacheKey, finalResponse.clone());
              }
            }

            return finalResponse;
          } else if (extractResult.content) {
            const extractedFormat =
              extractResult.filename?.split(".").pop()?.toLowerCase() || "srt";
            const mimeType = formatToMimeType[extractedFormat] || "text/plain";
            // We always serve UTF-8 when we have extracted text content
            const contentType = `${mimeType}; charset=utf-8`;

            let subtitleContent = extractResult.content;
            if (ADS_ENABLED) {
              subtitleContent = injectAd(subtitleContent, extractedFormat);
            }

            const finalResponse = new Response(subtitleContent, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Disposition": `inline; filename="${extractResult.filename}"`,
              },
            });

            if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
              if (typeof event.waitUntil === "function") {
                event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
              } else {
                await cache.put(cacheKey, finalResponse.clone());
              }
            }

            return finalResponse;
          } else {
            return createErrorResponse(
              500,
              "Subtitle Processing Error",
              "Subtitle was successfully extracted but no content was found",
            );
          }
        }
      } catch (extractError) {
        console.error(`[SubDL] Error during subtitle extraction: ${extractError}`);
      }
    }
  } else if (isSubf2m) {
    // handle subf2m url
    // For subf2m, we need to decode the encoded path structure from the vrf parameter
    // Expected vrf format: {movieSlug}~{languageSlug}~{subtitleId}

    const realFileId = fileId.slice(0, -7); // remove ".subf2m"
    const pathParts = vrf.split("~");
    if (pathParts.length === 3) {
      const [movieSlug, languageSlug, subtitleId] = pathParts;

      targetUrl = `https://subf2m.co/subtitles/${movieSlug}/${languageSlug}/${subtitleId}/download`;
    } else {
      console.error(
        `[Subf2m Download] ❌ Invalid vrf format: ${vrf}. Expected format: movieSlug~languageSlug~subtitleId`,
      );

      targetUrl = `https://subf2m.co/subtitles/download/${vrf}`;
    }

    if (autoUnzip) {
      try {
        const extractResult = await unzipAndExtractSubtitle(targetUrl, true, {}, encoding);

        if (!extractResult.success) {
          console.error(
            `[Subf2m] Failed to extract subtitle: ${extractResult.error || "Unknown error"}`,
          );

          return createErrorResponse(
            500,
            "Subtitle Extraction Failed",
            `Could not extract subtitle from ZIP: ${extractResult.error || "Unknown error"}`,
          );
        } else {
          if (extractResult.binary && extractResult.buffer) {
            const fileExt = extractResult.filename?.split(".").pop()?.toLowerCase() || "sub";
            const mimeType =
              fileExt === "idx" ? "application/x-mplayer2" : "application/octet-stream";

            const finalResponse = new Response(extractResult.buffer, {
              headers: {
                "Content-Type": mimeType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Disposition": `attachment; filename="${extractResult.filename}"`,
              },
            });

            if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
              if (typeof event.waitUntil === "function") {
                event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
              } else {
                await cache.put(cacheKey, finalResponse.clone());
              }
            }

            return finalResponse;
          } else if (extractResult.content) {
            const extractedFormat =
              extractResult.filename?.split(".").pop()?.toLowerCase() || "srt";
            const mimeType = formatToMimeType[extractedFormat] || "text/plain";
            // We always serve UTF-8 when we have extracted text content
            const contentType = `${mimeType}; charset=utf-8`;

            // Add advertisement to the subtitle if it's not a VTT format
            let subtitleContent = extractResult.content;
            if (ADS_ENABLED) {
              subtitleContent = injectAd(subtitleContent, extractedFormat);
            }

            const finalResponse = new Response(subtitleContent, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Disposition": `inline; filename="${extractResult.filename}"`,
              },
            });

            if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
              if (typeof event.waitUntil === "function") {
                event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
              } else {
                await cache.put(cacheKey, finalResponse.clone());
              }
            }

            return finalResponse;
          } else {
            return createErrorResponse(
              500,
              "Subtitle Processing Error",
              "Subtitle was successfully extracted but no content was found",
            );
          }
        }
      } catch (extractError) {
        console.error(`[Subf2m] Error during subtitle extraction: ${extractError}`);
        // if extraction fails, fall through to direct download below
      }
    }

    // Note: subf2m serves ZIP files that typically contain SRT files
  } else if (isAnimetosho) {
    animetoshoRawId = fileId.slice(0, -11);
    if (!/^\d+$/.test(animetoshoRawId)) {
      return createErrorResponse(400, "Bad Request", "Invalid Animetosho attachment identifier.");
    }

    animetoshoAttachmentId = Number.parseInt(animetoshoRawId, 10);
    const hexId = animetoshoAttachmentId.toString(16).padStart(8, "0");
    targetUrl = `${ANIMETOSHO_STORAGE_URL}/${hexId}/${animetoshoAttachmentId}.xz`;
  } else if (isPodnapisi) {
    podnapisiHeaders = {
      Accept: "application/zip,application/octet-stream;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.podnapisi.net/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    targetUrl = `https://www.podnapisi.net/subtitles/${vrf}/download`;

    if (autoUnzip) {
      try {
        const extractResult = await unzipAndExtractSubtitle(
          targetUrl,
          true,
          podnapisiHeaders,
          encoding,
        );

        if (!extractResult.success) {
          console.error(
            `[Podnapisi] Failed to extract subtitle: ${extractResult.error || "Unknown error"}`,
          );

          return createErrorResponse(
            500,
            "Subtitle Extraction Failed",
            `Could not extract subtitle from ZIP: ${extractResult.error || "Unknown error"}`,
          );
        }

        if (extractResult.binary && extractResult.buffer) {
          const fileExt = extractResult.filename?.split(".").pop()?.toLowerCase() || "sub";
          const mimeType =
            fileExt === "idx" ? "application/x-mplayer2" : "application/octet-stream";

          const finalResponse = new Response(extractResult.buffer, {
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": "public, max-age=31536000, immutable",
              "Content-Disposition": `attachment; filename="${extractResult.filename}"`,
            },
          });

          if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
            if (typeof event.waitUntil === "function") {
              event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
            } else {
              await cache.put(cacheKey, finalResponse.clone());
            }
          }

          return finalResponse;
        }

        if (extractResult.content) {
          const extractedFormat = extractResult.filename?.split(".").pop()?.toLowerCase() || "srt";
          const mimeType = formatToMimeType[extractedFormat] || "text/plain";
          // We always serve UTF-8 when we have extracted text content
          const contentType = `${mimeType}; charset=utf-8`;

          let subtitleContent = extractResult.content;
          if (ADS_ENABLED) {
            subtitleContent = injectAd(subtitleContent, extractedFormat);
          }

          const finalResponse = new Response(subtitleContent, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
              "Content-Disposition": `inline; filename="${extractResult.filename}"`,
            },
          });

          if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
            if (typeof event.waitUntil === "function") {
              event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
            } else {
              await cache.put(cacheKey, finalResponse.clone());
            }
          }

          return finalResponse;
        }

        return createErrorResponse(
          500,
          "Subtitle Processing Error",
          "Subtitle was successfully extracted but no content was found",
        );
      } catch (extractError) {
        console.error(`[Podnapisi] Error during subtitle extraction: ${extractError}`);
      }
    }
  } else if (isGestdown) {
    const gestdownId = fileId.slice(0, -9);
    if (!gestdownId) {
      return createErrorResponse(400, "Bad Request", "Invalid Gestdown subtitle identifier.");
    }

    targetUrl = `${GESTDOWN_BASE_URL}/subtitles/download/${gestdownId}`;
  } else {
    targetUrl = `https://dl.opensubtitles.org/en/download/subencoding-utf8/src-api/vrf-${vrf}/file/${fileId}`;
  }

  try {
    const headers =
      isSubDL ?
        {} // subdl doesn't need special headers
      : isSubf2m ?
        {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://subf2m.co/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        }
      : isGestdown ? GESTDOWN_HEADERS
      : isAnimetosho ? {}
      : isPodnapisi && podnapisiHeaders ? podnapisiHeaders
      : { "X-User-Agent": "VLSub 0.10.3" }; // opensub needs this header

    // Use appropriate fetch method for each source
    if (isSubf2m) {
      response = await fetch(targetUrl, { headers });
    } else {
      // always use proxyFetch to avoid ratelimit for subdl and opensubtitles
      response = await proxyFetch(targetUrl, { headers });
    }

    if (!response || !response.ok) {
      const status = response?.status || "unknown";
      const statusText = response?.statusText || "unknown";
      console.error(`Failed to fetch subtitle: ${status} ${statusText}`);
      return createErrorResponse(
        502,
        "Failed to fetch subtitle",
        `Upstream server responded with status: ${status}`,
      );
    }

    // raw data
    const subtitleContent = await response.arrayBuffer();

    if (isAnimetosho) {
      try {
        const decompressed = await decompressAnimetoshoArchive(subtitleContent);
        let textContent: string | null = null;
        let binaryContent: Uint8Array | null = null;

        const charset = encoding && encoding.toLowerCase() !== "unknown" ? encoding : "utf-8";
        const candidateEncodings =
          charset.toLowerCase() === "utf-8" ? [charset] : [charset, "utf-8"];

        for (const candidate of candidateEncodings) {
          if (textContent !== null) {
            break;
          }

          try {
            const decoder = new TextDecoder(candidate, { fatal: true });
            textContent = decoder.decode(decompressed);
          } catch (decodeError) {
            console.warn(
              `[Animetosho] Unable to decode subtitle ${animetoshoAttachmentId} using ${candidate}.`,
              decodeError,
            );
          }
        }

        if (textContent === null) {
          binaryContent = decompressed;
        }

        let finalFormat =
          format && format.toLowerCase() !== "unknown" ? format.toLowerCase() : undefined;
        const downloadBaseName = animetoshoRawId || `${animetoshoAttachmentId ?? "subtitle"}`;

        if (textContent !== null) {
          finalFormat = finalFormat ?? inferSubtitleFormat(textContent);
          const mime = formatToMimeType[finalFormat] || "text/plain";
          const processedText = ADS_ENABLED ? injectAd(textContent, finalFormat) : textContent;

          const finalResponse = new Response(processedText, {
            headers: {
              "Content-Type": `${mime}; charset=utf-8`,
              "Cache-Control": "public, max-age=31536000, immutable",
              "Content-Disposition": `inline; filename="${downloadBaseName}.${finalFormat}"`,
            },
          });

          if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
            if (typeof event.waitUntil === "function") {
              event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
            } else {
              await cache.put(cacheKey, finalResponse.clone());
            }
          }

          return finalResponse;
        }

        const binaryBuffer = binaryContent ?? new Uint8Array(0);
        finalFormat = finalFormat ?? "bin";
        const mime = formatToMimeType[finalFormat] || "application/octet-stream";
        const base64Payload = encodeBase64(binaryBuffer);
        const serialized = `data:${mime};base64,${base64Payload}`;

        const finalResponse = new Response(serialized, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": `inline; filename="${downloadBaseName}.${finalFormat}.txt"`,
          },
        });

        if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
          if (typeof event.waitUntil === "function") {
            event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
          } else {
            await cache.put(cacheKey, finalResponse.clone());
          }
        }

        return finalResponse;
      } catch (decompressError) {
        console.error(
          `[Animetosho] Failed to decompress attachment ${animetoshoAttachmentId}:`,
          decompressError,
        );
        return createErrorResponse(
          502,
          "Animetosho Download Failed",
          "Unable to decompress subtitle archive retrieved from Animetosho.",
        );
      }
    }

    let actualFormat =
      format && format.toLowerCase() !== "unknown" ? format.toLowerCase() : undefined;
    if (!actualFormat && fileId) {
      // extract format from filename if not specified in query
      const filenameParts =
        isSubDL ?
          fileId.slice(0, -6).split(".") // remove .subdl and get extension
        : isSubf2m ?
          ["srt"] // subf2m typically serves SRT files
        : fileId.split(".");

      if (filenameParts.length > 1) {
        actualFormat = filenameParts.pop()?.toLowerCase();
      }
    }

    if (isSubDL) {
      actualFormat = "zip";
    } else if (isPodnapisi) {
      actualFormat = "zip";
    } else if (isGestdown) {
      actualFormat = "srt";
    }

    if (isSubf2m && !actualFormat) {
      actualFormat = "srt";
    }

    const mimeType = actualFormat ? formatToMimeType[actualFormat] || "text/plain" : "text/plain";
    const charset = encoding && encoding.toLowerCase() !== "unknown" ? encoding : "utf-8";
    let contentType = `${mimeType}; charset=${charset}`;

    // Add advertisement to subtitle formats
    let processedContent = subtitleContent;

    // Use processSubtitle to handle encoding and cleaning
    const dummyFilename = `subtitle.${actualFormat || "srt"}`;
    const extractResult = processSubtitle(subtitleContent, dummyFilename, encoding);

    if (extractResult.success && extractResult.content) {
      let subtitleText = extractResult.content;
      if (ADS_ENABLED) {
        subtitleText = injectAd(subtitleText, actualFormat || "srt");
      }
      const textEncoder = new TextEncoder();
      processedContent = textEncoder.encode(subtitleText).buffer;
      contentType = `${mimeType}; charset=utf-8`;
    } else {
      // Fallback to raw if decoding failed
      processedContent = subtitleContent;
    }

    const finalResponse = new Response(processedContent, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });

    if (isCacheAvailable && cache && finalResponse && finalResponse.ok) {
      if (typeof event.waitUntil === "function") {
        event.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      } else {
        console.warn(
          "event.waitUntil is not available globally. Caching might not be performed asynchronously.",
        );
        await cache.put(cacheKey, finalResponse.clone());
      }
    }

    return finalResponse;
  } catch (error) {
    console.error(`Error fetching subtitle: ${error}`);
    return createErrorResponse(
      500,
      "Internal Server Error",
      "An error occurred while fetching the subtitle.",
    );
  }
});
