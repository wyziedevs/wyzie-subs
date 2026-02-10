/**
 * format direct
 * @format
 */

// Mostly made by Flutch, he is the real hero here.

import unzipjs from "~/lib/unzipjs.min.js";
import { proxyFetch } from "~/utils/proxy";
import type { UnzipItem, SubtitleExtractResult } from "~/utils/types";

function isBinarySubtitleFormat(filename: string, buffer: ArrayBuffer): boolean {
  const lowerName = filename.toLowerCase();

  // The usual suspects 🕵️‍♂️
  if (lowerName.endsWith(".sub") || lowerName.endsWith(".idx")) {
    //  "Is it MicroDVD or VobSub?"
    // MicroDVD be like: {x}{y}Text

    // check first few bytes
    try {
      const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 100)));
      const sample = String.fromCharCode.apply(null, Array.from(bytes));

      // looking for those curly bracket  {x}{y}
      if (sample.match(/^\{[0-9]+\}\{[0-9]+\}/)) {
        return false;
      }

      // binary soup? bad luck for wyzie
      return true;
    } catch (e) {
      console.warn(`[SubDL Unzip] Error checking.sub format: ${e} `);
      // when not sure, assume it's binary (better safe than sorry 🤷‍♂️)
      return true;
    }
  }

  return false;
}

function convertMicroDVDToSRT(content: string, fps: number = 25): string {
  try {
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    let srtContent = "";
    let counter = 1;

    for (const line of lines) {
      // play pattern matching
      const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
      if (!match) continue;

      const startFrame = parseInt(match[1]);
      const endFrame = parseInt(match[2]);
      const text = match[3];

      // converting frames to time like a wyzie wizard
      const startTime = frameToSRTTime(startFrame, fps);
      const endTime = frameToSRTTime(endFrame, fps);

      srtContent += `${counter}\n${startTime} --> ${endTime}\n${text}\n\n`;
      counter++;
    }

    return srtContent;
  } catch (e) {
    console.error(`[SubDL Unzip] conversion failed: ${e} `);
    return content; // return original
  }
}

function frameToSRTTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
}

function hasGarbledText(text: string): boolean {
  if (!text || text.length === 0) return true;

  // looking for the dreaded replacement character
  const replacementChar = "\uFFFD";
  const replacementCount = (text.match(new RegExp(replacementChar, "g")) || []).length;

  // these patterns are like the sad face of text encoding
  const garbledPatterns = [
    "\uFFFD\uFFFD", // double trouble
    "\uFFFD[A-Za-z]", // when characters play dress-up with me
    "[A-Za-z]\uFFFD", // identity crisis mid-word
    "\uFFFD\uFFFD\uFFFD", // the three stooges of encoding
    "\uFFFE", // The character that should not be named
    "\uFFFF", // its evil twin, quite literally
    "\u00C3[\u00A0-\u00BF]", // Mojibake: Ã followed by valid UTF-8 continuation byte chars (in CP1252)
    "\u00C2[\u00A0-\u00BF]", // Mojibake: Â followed by valid UTF-8 continuation byte chars (in CP1252)
  ];

  let totalGarbledCount = replacementCount;

  // count  the mess
  for (const pattern of garbledPatterns) {
    try {
      const matches = text.match(new RegExp(pattern, "g")) || [];
      totalGarbledCount += matches.length;
    } catch (e) {
      console.warn(`[SubDL Unzip] this pattern is not good: ${pattern} `);
    }
  }

  const ratio = totalGarbledCount / text.length;

  // if more than 1% is garbled, we've got a problem
  return ratio > 0.01;
}

function stripBOM(content: string): string {
  // bye  uft-8 bom, never missed u
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function cleanSubtitleText(text: string): string {
  if (!text) return "";
  text = stripBOM(text);
  text = text.replace(/^[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]+/, "");
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}

/**
 * The United Nations of Text Encodings! (thats where bad dev loves to live)
 * we've got more encodings than you can fathom
 * (though why you're trying to fathom sub encodings  is beyond me)
 * yes i read all the purpose of these encodings
 */
const ENCODING_ATTEMPTS = [
  "utf-8", // the cool kid
  "windows-1252", // west europe's party animal
  "windows-1256", // arabi sheikhs' BFF
  "iso-8859-6", // arabi sheikhs' other BFF
  "iso-8859-1", // its latin; thought about latina? grow up
  "windows-1251", // in soviet russia, text encodes YOU, COMRADE
  "iso-8859-5", // cyrillic's cousin
  "iso-8859-2", // central europe's favorite
  "windows-1250", // the windows that central europe actually likes
  "iso-8859-7", // its all greek to me
  "windows-1253", // windows goes greek
  "iso-8859-9", // turkish kebab
  "windows-1254", // windows consumed turkish kebab
  "big5", // traditional chinese; size matters! (wink wink)
  "gbk", // simplified chinese
  "shift-jis", // japanese shifting into high gear for that epic drift
  "euc-jp", // another japanese contender
  "euc-kr", // korean encoding (no it is NOT kpop)
  "utf-16le", // unicode's "little" sibling
  "utf-16be", // unicode's "big" sibling
  "iso-8859-8", // jewish hangout
  "windows-1255", // windows speaks jewish; it's like american talking jewish to jews, funny
  "iso-8859-8-i", // logical Hebrew
  "iso-2022-jp", // japanese email encoding
  "koi8-r", // russian cyrillic encoding
  "koi8-u", // ukrainian cyrillic encoding
  "macintosh", // mac roman encoding
  "gb18030", // modern chinese encoding
  "tis-620", // thai encoding
  "windows-874", // windows thai encoding
  "x-mac-cyrillic", // mac cyrillic
  "iso-8859-3", // south european, esperanto, maltese
  "iso-8859-4", // baltic languages, greenlandic, sami
  "iso-8859-10", // nordic languages (sami, inuit)
  "iso-8859-13", // baltic languages redux
  "iso-8859-14", // celtic languages, because druids need subtitles too
  "iso-8859-15", // western european with euro sign, fancy!
  "windows-1257", // windows baltic, for when windows goes sailing
  "windows-1258", // windows vietnamese, phở your viewing pleasure
  "x-mac-ukrainian", // mac goes to kyiv
  "cp866", // DOS cyrillic, for soviet DOS enthusiasts
];

function isLikelyArabic(text: string): boolean {
  // look at that hot regex
  // Require at least 3 consecutive Arabic characters to avoid false positives from random byte mappings
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]{3,}/;

  // arabia?
  return arabicRegex.test(text);
}

function isReadableText(text: string): number {
  if (!text || text.length < 10) return 0;

  const hasNumbers = /\d+/.test(text);
  const hasLetters = /[A-Za-z]/.test(text);
  const hasArabic = isLikelyArabic(text);
  const hasPunctuation = /[.,!?;:]/.test(text);
  const hasReasonableLineLength = text
    .split("\n")
    .some((line) => line.length > 5 && line.length < 100);

  const hasTimestamps = /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(text);
  const hasSequentialNumbering = /^\s*\d+\s*\n/.test(text);

  let score = 0;
  if (hasNumbers) score += 1; // num is  nice
  if (hasLetters || hasArabic) score += 3; // letters are nicer
  if (hasPunctuation) score += 1; // silly punc
  if (hasReasonableLineLength) score += 2; // reasonable?

  if (hasTimestamps) score += 3;
  if (hasSequentialNumbering) score += 2;

  if (hasGarbledText(text)) score -= 3;

  if (hasArabic && text.includes("-->")) score += 3;

  return score;
}

/**
 * Main unzip and extract function
 * (just learnt what dazecore is, i think thats my aesthetic)
 */
export async function unzipAndExtractSubtitle(
  url: string,
  useDirectFetch = false,
  extraHeaders: Record<string, string> = {},
  preferredEncoding?: string,
): Promise<SubtitleExtractResult> {
  try {
    const sourceLabel = useDirectFetch ? "Subf2m" : "SubDL";

    // Use direct fetch for subf2m, proxyFetch for subdl
    const response =
      useDirectFetch ?
        await fetch(url, {
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://subf2m.co/",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            ...extraHeaders,
          },
        })
      : await proxyFetch(url, { headers: extraHeaders });

    if (!response || !response.ok) {
      const status = response?.status || "unknown";
      const statusText = response?.statusText || "unknown";
      console.error(`[${sourceLabel} Unzip] zip file played hard to get: ${status} ${statusText}`);

      return {
        success: false,
        error: `Failed to fetch subtitle: ${status} ${statusText}`,
      };
    }

    // Getting that sweet, sweet array buffer
    const arrayBuffer = await response.arrayBuffer();

    // Time to unzip! 🤐
    const startTime = performance.now();

    const unzipped: UnzipItem[] = unzipjs.parse(arrayBuffer);

    const endTime = performance.now();
    const duration = endTime - startTime;

    if (unzipped.length === 0) {
      return {
        success: false,
        error: "ZIP file is empty",
      };
    }

    const textSubtitleExtensions = [".srt", ".ssa", ".ass", ".vtt"];
    const allSubtitleExtensions = [...textSubtitleExtensions, ".sub", ".idx", ".txt"];

    // first, try to find the text-based ones
    let subtitleItem = unzipped.find((item) =>
      textSubtitleExtensions.some((ext) => item.name.toLowerCase().endsWith(ext)),
    );

    // if no text-based found, we'll take any subtitle we can get
    if (!subtitleItem) {
      subtitleItem = unzipped.find((item) =>
        allSubtitleExtensions.some((ext) => item.name.toLowerCase().endsWith(ext)),
      );
    }

    // last resort - just grab the first file and hope for the best
    if (!subtitleItem && unzipped.length > 0) {
      subtitleItem = unzipped[0];
    }

    if (!subtitleItem) {
      return {
        success: false,
        error: "no subtitle file found",
      };
    }

    const isBinary = isBinarySubtitleFormat(subtitleItem.name, subtitleItem.buffer);

    if (isBinary) {
      return {
        success: true,
        filename: subtitleItem.name,
        binary: true,
        buffer: subtitleItem.buffer,
        content: `Binary subtitle format: ${subtitleItem.name} (it's not text, but it's honest work 👨‍🌾)`,
      };
    }

    return processSubtitle(subtitleItem.buffer, subtitleItem.name, preferredEncoding);
  } catch (error: any) {
    const sourceLabel = useDirectFetch ? "Subf2m" : "SubDL";
    console.error(`[${sourceLabel} Unzip] Everything went wrong! 😱`, error);
    return {
      success: false,
      error: "Something broke! Time to blame it on the intern... 😅",
      details: error.message || String(error),
    };
  }
}

export function processSubtitle(
  buffer: ArrayBuffer,
  filename: string,
  preferredEncoding?: string,
): SubtitleExtractResult {
  try {
    let textContent: string | undefined;
    let bestTextContent: string | undefined;
    let bestEncoding: string | undefined;

    const uint8Array = new Uint8Array(buffer);

    // Force UTF-8 check first
    // If the content is valid UTF-8, we assume it is UTF-8.
    // This prevents valid UTF-8 being misinterpreted as Windows-1252 (Mojibake).
    if (!preferredEncoding || preferredEncoding.toLowerCase() === "utf-8") {
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const decoded = decoder.decode(uint8Array);

        return {
          success: true,
          content: cleanSubtitleText(decoded),
          filename,
          binary: false,
          // @ts-ignore
          encoding: "utf-8",
        };
      } catch (e) {
        // Not valid UTF-8, proceed with guessing
      }
    }

    try {
      let highestQualityScore = -1;

      const attempts =
        preferredEncoding ? [preferredEncoding, ...ENCODING_ATTEMPTS] : ENCODING_ATTEMPTS;
      const uniqueAttempts = [...new Set(attempts)];

      for (const encoding of uniqueAttempts) {
        try {
          const decoder = new TextDecoder(encoding, { fatal: false });
          const decoded = decoder.decode(uint8Array);

          if (decoded && decoded.trim().length > 0) {
            const cleaned = cleanSubtitleText(decoded);

            const readabilityScore = isReadableText(cleaned);
            const isGarbled = hasGarbledText(cleaned);

            const qualityScore = readabilityScore + (isGarbled ? -5 : 5);

            if (
              isLikelyArabic(cleaned) &&
              (encoding === "windows-1256" || encoding === "iso-8859-6")
            ) {
              const arabicBonus = 5;
              const adjustedScore = qualityScore + arabicBonus;

              if (adjustedScore > highestQualityScore) {
                highestQualityScore = adjustedScore;
                bestTextContent = cleaned;
                bestEncoding = encoding;
              }
            } else if (qualityScore > highestQualityScore) {
              highestQualityScore = qualityScore;
              bestTextContent = cleaned;
              bestEncoding = encoding;
            } else if (qualityScore === highestQualityScore && encoding.toLowerCase() === "utf-8") {
              highestQualityScore = qualityScore;
              bestTextContent = cleaned;
              bestEncoding = encoding;
            }
          }
        } catch (e) {
          console.warn(`[SubDL Unzip] ${encoding},  Error: ${e}`);
        }
      }

      // use the best encoding we found
      if (bestTextContent && bestEncoding) {
        textContent = bestTextContent;

        const preview = textContent
          .substring(0, 200)
          .replace(/\n/g, "\\n")
          .replace(/[^\x20-\x7E]/g, ".");

        if (filename.toLowerCase().endsWith(".sub") && textContent.match(/^\{[0-9]+\}\{[0-9]+\}/)) {
          textContent = convertMicroDVDToSRT(textContent);

          const baseName = filename.slice(0, -4);
          filename = `${baseName}.srt`;
        }
      }
    } catch (decodingError) {
      console.error(`[SubDL Unzip] decoding went wrong!  ${decodingError}`);
    }

    if (!textContent || textContent.trim().length === 0 || hasGarbledText(textContent)) {
      try {
        const uint8Array = new Uint8Array(buffer);
        const rawString = Array.from(uint8Array)
          .map((b) => String.fromCharCode(b))
          .join("");

        if (filename.toLowerCase().endsWith(".sub")) {
          const lines = [];
          const regex = /\{(\d+)\}\{(\d+)\}([^\n\r]*)/g;
          let match;

          while ((match = regex.exec(rawString)) !== null) {
            lines.push(`{${match[1]}}{${match[2]}}${match[3]}`);
          }

          if (lines.length > 0) {
            textContent = lines.join("\n");
            textContent = convertMicroDVDToSRT(textContent);

            const baseName = filename.slice(0, -4);
            filename = `${baseName}.srt`;
          }
        }
        // for srt files
        else if (filename.toLowerCase().endsWith(".srt")) {
          const regex =
            /(\d+)\s*\r?\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n\d+\s*\r?\n|\s*$)/g;
          const entries = [];
          let match;

          while ((match = regex.exec(rawString)) !== null) {
            entries.push(`${match[1]}\n${match[2]} --> ${match[3]}\n${match[4]}`);
          }

          if (entries.length > 0) {
            textContent = entries.join("\n\n");
          }
        }

        if (!textContent || textContent.trim().length === 0 || hasGarbledText(textContent)) {
          // Make regex more efficient by avoiding unnecessary character classes
          const textRegex = /[\w\s.,!?;:'"()\[\]{}<>\/\\|@#$%^&*+=_-]{10,}/g;
          const textMatches = rawString.match(textRegex) || [];

          // Add additional filtering for quality
          const filteredMatches = textMatches.filter((match) => {
            // Filter out matches that don't have enough letter characters
            return /[a-zA-Z]{3,}/.test(match);
          });

          if (filteredMatches.length > 0) {
            textContent = filteredMatches.join("\n\n");
          }
        }

        if (textContent) {
          textContent = cleanSubtitleText(textContent);
        }
      } catch (regexError) {
        console.error(`[SubDL Unzip] Regex failed,  Error: ${regexError}`);
      }
    }

    if (!textContent || textContent.trim().length === 0 || hasGarbledText(textContent)) {
      try {
        const rawContent = new TextDecoder("utf-8").decode(new Uint8Array(buffer));

        if (rawContent && rawContent.length > 0) {
          textContent = cleanSubtitleText(rawContent);
        }
      } catch (toStringError) {
        console.warn(`[SubDL Unzip] toString() abandoned us ${toStringError}`);
      }
    }

    if (!textContent || textContent.trim().length === 0) {
      console.error("[SubDL Unzip] we tried everything,  time to go home");

      try {
        const uint8Array = new Uint8Array(buffer);
        let hexDump = "";
        const blockSize = 16;

        for (let i = 0; i < Math.min(uint8Array.length, 512); i += blockSize) {
          const block = uint8Array.slice(i, i + blockSize);
          const hex = Array.from(block)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
          const ascii = Array.from(block)
            .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
            .join("");
          hexDump += `${i.toString(16).padStart(8, "0")}: ${hex.padEnd(blockSize * 3, " ")} ${ascii}\n`;
        }

        return {
          success: false,
          error: "this subtitle file is empty",
          filename: filename,
          details: `File size: ${buffer.byteLength} bytes. hexdump (for the nerds):\n${hexDump}`,
        };
      } catch (hexError) {
        console.error(`[SubDL Unzip] even hexdump failed: ${hexError}`);
      }

      return {
        success: false,
        error: "We couldn't process this subtitle file.",
        filename: filename,
      };
    }

    if (hasGarbledText(textContent)) {
      console.warn("[SubDL Unzip] text is bad");
    }

    const cleanPreview = textContent
      .substring(0, 200)
      .replace(/\n/g, "\\n")
      .replace(/[^\x20-\x7E]/g, ".");

    return {
      success: true,
      content: textContent,
      filename: filename,
    };
  } catch (extractError) {
    console.error(`[SubDL Unzip] Error extracting text: ${extractError}`);
    return {
      success: false,
      error: `Failed to extract text from ${filename}`,
      details: extractError instanceof Error ? extractError.message : String(extractError),
    };
  }
}
