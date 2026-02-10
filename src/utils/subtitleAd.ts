/** @format */

/**
 * Inject an advertisement into the beginning of a subtitle file
 * @param content The subtitle content as a string
 * @param format The format of the subtitle (srt, ass, ssa, sub)
 * @returns The subtitle content with ad injected
 */
export function injectAd(content: string, format: string): string {
  const adTextOptions = [
    "Watch unlimited movies & TV shows free at SpenFlix.ru!",
    "Fast streams. Massive library. Only on SpenFlix.ru!",
    "Your next binge is waiting at SpenFlix.ru – free & fast!",
    "Stream movies & shows instantly. SpenFlix.ru!",
    "No limits. No fees. Just pure streaming at SpenFlix.ru!",
  ];
  const adText = adTextOptions[Math.floor(Math.random() * adTextOptions.length)];

  // Default to auto-detection if unknown
  const normalizedFormat = format?.toLowerCase() || "auto";

  switch (normalizedFormat) {
    case "srt":
      return injectSrtAd(content, adText);
    case "ass":
    case "ssa":
      return injectAssAd(content, adText);
    case "sub":
      return injectMicroDVDAd(content, adText);
    case "txt":
      return injectTextAd(content, adText);
    case "vtt":
      return injectVttAd(content, adText);
    case "ttml":
    case "dfxp":
      return injectXmlAd(content, adText);
    case "other":
    case "blueray":
    case "auto":
    default:
      // For unknown formats, auto-detect the format
      return autoDetectAndInjectAd(content, adText);
  }
}

/**
 * Auto-detect subtitle format and inject ad accordingly
 */
function autoDetectAndInjectAd(content: string, adText: string): string {
  if (/^\s*\d+\s*\r?\n\d\d:\d\d:\d\d,\d\d\d\s*-->\s*\d\d:\d\d:\d\d,\d\d\d/m.test(content)) {
    return injectSrtAd(content, adText);
  }

  if (content.includes("[Script Info]") && content.includes("[Events]")) {
    return injectAssAd(content, adText);
  }

  if (content.includes("WEBVTT")) {
    return injectVttAd(content, adText);
  }

  if (/^\{[0-9]+\}\{[0-9]+\}/.test(content)) {
    return injectMicroDVDAd(content, adText);
  }

  if (content.includes("<?xml") || content.includes("<tt ")) {
    return injectXmlAd(content, adText);
  }

  // If we can't determine the format, try SRT as most common
  // Fallback to plain text if it doesn't look like SRT
  if (!/\d\d:\d\d:\d\d/.test(content)) {
    return injectTextAd(content, adText);
  }

  return injectSrtAd(content, adText);
}

/**
 * Inject ad into SRT subtitle format
 */
function injectSrtAd(content: string, adText: string): string {
  if (!/^\s*\d+\s*\r?\n/.test(content)) {
    return content; // Not valid SRT format, return unchanged
  }

  const adSubtitle = `1
00:00:01,000 --> 00:00:10,000
${adText}

`;

  const lines = content.split(/\r?\n/);
  let inFirstEntry = true;
  let result = adSubtitle;
  let currentEntryLines: string[] = [];
  let entryNumber = 2; // Start from 2 since we inserted the ad as #1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*\d+\s*$/.test(line)) {
      if (!inFirstEntry && currentEntryLines.length > 0) {
        result += currentEntryLines.join("\n") + "\n";
      }

      currentEntryLines = [entryNumber.toString()];
      entryNumber++;
      inFirstEntry = false;
    } else {
      currentEntryLines.push(line);
    }
  }

  if (currentEntryLines.length > 0) {
    result += currentEntryLines.join("\n");
  }

  return result;
}

/**
 * Inject ad into ASS/SSA subtitle format
 */
function injectAssAd(content: string, adText: string): string {
  if (!content.includes("[Script Info]")) {
    return content;
  }

  const eventsSectionIndex = content.indexOf("[Events]");
  if (eventsSectionIndex === -1) {
    return content;
  }

  const formatLineIndex = content.indexOf("Format:", eventsSectionIndex);
  if (formatLineIndex === -1) {
    return content;
  }

  let dialogueStartIndex = content.indexOf("Dialogue:", formatLineIndex);
  if (dialogueStartIndex === -1) {
    return content;
  }

  const formatLine = content.substring(formatLineIndex, content.indexOf("\n", formatLineIndex));

  const adDialogue = `Dialogue: 0,0:00:01.00,0:00:10.00,Default,,0,0,0,,${adText}\n`;

  return (
    content.substring(0, dialogueStartIndex) + adDialogue + content.substring(dialogueStartIndex)
  );
}

/**
 * Inject ad into MicroDVD .sub format
 */
function injectMicroDVDAd(content: string, adText: string): string {
  if (!/^\{[0-9]+\}\{[0-9]+\}/.test(content)) {
    return content;
  }

  // Assuming 25 fps, 10 seconds = frame 250
  const adLine = `{25}{250}${adText}\n`;

  return adLine + content;
}

/**
 * Inject ad into plain text subtitle format
 */
function injectTextAd(content: string, adText: string): string {
  return `${adText}\n\n${content}`;
}

/**
 * Inject ad into WebVTT subtitle format
 */
function injectVttAd(content: string, adText: string): string {
  if (!content.includes("WEBVTT")) {
    return content;
  }

  const lines = content.split(/\r?\n/);
  let headerEndIndex = 0;

  if (lines.length > 0 && lines[0].trim().startsWith("WEBVTT")) {
    headerEndIndex = 1;
  }

  while (
    headerEndIndex < lines.length &&
    (lines[headerEndIndex].trim() === "" ||
      lines[headerEndIndex].trim().startsWith("NOTE") ||
      lines[headerEndIndex].includes("::") ||
      lines[headerEndIndex].includes("-->"))
  ) {
    headerEndIndex++;
  }

  const adCue = `\n1
00:00:01.000 --> 00:00:10.000
${adText}\n`;

  const result = [...lines.slice(0, headerEndIndex), adCue, ...lines.slice(headerEndIndex)].join(
    "\n",
  );

  return result;
}

/**
 * Inject ad into XML-based subtitle formats (TTML, DFXP)
 */
function injectXmlAd(content: string, adText: string): string {
  if (!content.includes("<?xml") && !content.includes("<tt ")) {
    return content;
  }

  const bodyStartTagMatch = content.match(/<body[^>]*>/i);
  const divStartTagMatch = content.match(/<div[^>]*>/i);

  if (!bodyStartTagMatch && !divStartTagMatch) {
    return content;
  }

  let insertPoint = 0;
  let adXml = "";

  if (bodyStartTagMatch) {
    insertPoint = bodyStartTagMatch.index! + bodyStartTagMatch[0].length;

    adXml = `
  <p begin="00:00:01.000" end="00:00:10.000" xml:id="ad">
    ${adText}
  </p>`;
  } else if (divStartTagMatch) {
    insertPoint = divStartTagMatch.index! + divStartTagMatch[0].length;

    adXml = `
  <p begin="00:00:01.000" end="00:00:10.000">
    ${adText}
  </p>`;
  }

  return content.substring(0, insertPoint) + adXml + content.substring(insertPoint);
}
