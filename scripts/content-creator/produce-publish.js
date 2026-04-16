/**
 * Content Creator Agent — Blotato Publisher (Fase 4)
 *
 * Called by index.js when brief.autoPublish === true
 * API docs: https://help.blotato.com/api/start
 * Base URL: https://backend.blotato.com/v2
 *
 * Flow:
 *   1. Extracts captions from Claude's content output (per platform)
 *   2. Uploads media to Blotato (video or static image)
 *   3. Publishes to each platform specified in the brief
 *   4. Returns published post URLs and confirmations
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BLOTATO_API_KEY = process.env.BLOTATO_API_KEY;
const BLOTATO_BASE_URL = "https://backend.blotato.com/v2";

// Platform name mapping — brief uses these slugs
const PLATFORM_MAP = {
  "instagram-reels":   { platform: "instagram", targetType: "reels" },
  "instagram-feed":    { platform: "instagram", targetType: "feed" },
  "instagram-stories": { platform: "instagram", targetType: "stories" },
  "tiktok":            { platform: "tiktok",    targetType: "video" },
  "linkedin":          { platform: "linkedin",  targetType: "post" },
  "facebook":          { platform: "facebook",  targetType: "post" },
  "twitter":           { platform: "twitter",   targetType: "post" },
};

// --- Extract captions from Claude output ---

export function extractCaptions(contentOutput) {
  const captions = {};

  const platformSections = [
    { key: "instagram", markers: ["### Instagram", "## Instagram"] },
    { key: "tiktok",    markers: ["### TikTok", "## TikTok"] },
    { key: "linkedin",  markers: ["### LinkedIn", "## LinkedIn"] },
    { key: "facebook",  markers: ["### Facebook", "### Facebook Ads", "## Facebook"] },
    { key: "twitter",   markers: ["### Twitter", "### X (Twitter)", "## Twitter"] },
  ];

  for (const { key, markers } of platformSections) {
    for (const marker of markers) {
      const idx = contentOutput.indexOf(marker);
      if (idx === -1) continue;

      const afterMarker = contentOutput.substring(idx + marker.length).trim();
      // Take content until next ## or ### section
      const nextSection = afterMarker.match(/^#{2,3} /m);
      const caption = nextSection
        ? afterMarker.substring(0, nextSection.index).trim()
        : afterMarker.substring(0, 800).trim();

      if (caption) {
        captions[key] = caption;
        break;
      }
    }
  }

  return captions;
}

// --- Get connected account IDs from Blotato ---

async function getAccounts() {
  const res = await fetch(`${BLOTATO_BASE_URL}/users/me/accounts`, {
    headers: { "blotato-api-key": BLOTATO_API_KEY },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blotato get accounts error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data; // array of { id, platform, name, ... }
}

// --- Upload media to Blotato (for local files) ---

async function uploadMedia(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Media file not found: ${filePath}`);
  }

  // Step 1: Request presigned upload URL
  const ext = filePath.split(".").pop().toLowerCase();
  const mimeTypes = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  const mimeType = mimeTypes[ext] || "application/octet-stream";

  const presignRes = await fetch(`${BLOTATO_BASE_URL}/media/presigned-upload`, {
    method: "POST",
    headers: {
      "blotato-api-key": BLOTATO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mimeType }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.text();
    throw new Error(`Blotato presigned upload error ${presignRes.status}: ${err}`);
  }

  const { uploadUrl, mediaUrl } = await presignRes.json();

  // Step 2: Upload file to presigned URL
  const fileBuffer = readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Media upload to presigned URL failed: ${uploadRes.status}`);
  }

  return mediaUrl; // publicly accessible URL ready for Blotato posts
}

// --- Publish a single post ---

async function publishPost({ accountId, platform, targetType, caption, mediaUrl, scheduleTime }) {
  const body = {
    accountId,
    content: {
      text: caption,
      mediaUrls: mediaUrl ? [mediaUrl] : [],
      platform,
    },
    target: {
      targetType,
    },
  };

  if (scheduleTime) {
    body.scheduledTime = scheduleTime;
  } else {
    body.useNextFreeSlot = false; // publish immediately
  }

  const res = await fetch(`${BLOTATO_BASE_URL}/posts`, {
    method: "POST",
    headers: {
      "blotato-api-key": BLOTATO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blotato publish error ${res.status}: ${err}`);
  }

  return await res.json();
}

// --- Main publish function ---

export async function publishContent(brief, contentOutput, mediaPath) {
  console.log("Fase 4 — Blotato publishing starting...");

  if (!BLOTATO_API_KEY) {
    throw new Error("BLOTATO_API_KEY not set");
  }

  // 1. Extract captions from content output
  const captions = extractCaptions(contentOutput);
  console.log(`Captions extracted for: ${Object.keys(captions).join(", ") || "none"}`);

  // 2. Get connected accounts from Blotato
  const accounts = await getAccounts();
  console.log(`Connected accounts: ${accounts.map((a) => a.platform).join(", ")}`);

  // Build account lookup by platform
  const accountByPlatform = {};
  for (const account of accounts) {
    accountByPlatform[account.platform] = account.id;
  }

  // 3. Upload media if local file provided
  let mediaUrl = null;
  if (mediaPath) {
    console.log(`Uploading media: ${mediaPath}`);
    mediaUrl = await uploadMedia(mediaPath);
    console.log(`Media uploaded: ${mediaUrl}`);
  }

  // 4. Determine which platforms to publish to
  // Uses _strategy.platform from brief (set by Strategy Agent) or defaults
  const targetPlatformSlug = brief._strategy?.platform || "instagram-reels";
  const platformConfig = PLATFORM_MAP[targetPlatformSlug] || PLATFORM_MAP["instagram-reels"];

  const results = [];

  // 5. Publish to primary platform
  const primaryAccountId = accountByPlatform[platformConfig.platform];
  if (!primaryAccountId) {
    console.warn(`No Blotato account connected for ${platformConfig.platform}. Skipping.`);
  } else {
    const caption =
      captions[platformConfig.platform] ||
      captions.instagram ||
      captions.tiktok ||
      Object.values(captions)[0] ||
      "";

    console.log(`Publishing to ${platformConfig.platform} (${platformConfig.targetType})...`);

    const result = await publishPost({
      accountId: primaryAccountId,
      platform: platformConfig.platform,
      targetType: platformConfig.targetType,
      caption,
      mediaUrl,
      scheduleTime: brief.scheduleTime || null,
    });

    results.push({
      platform: platformConfig.platform,
      targetType: platformConfig.targetType,
      postId: result.id,
      status: "published",
    });

    console.log(`Published to ${platformConfig.platform}: post ID ${result.id}`);
  }

  // 6. Cross-post to additional platforms if specified in brief
  if (brief.crossPost && Array.isArray(brief.crossPost)) {
    for (const slug of brief.crossPost) {
      const config = PLATFORM_MAP[slug];
      if (!config) continue;

      const accountId = accountByPlatform[config.platform];
      if (!accountId) {
        console.warn(`No account for ${config.platform}, skipping cross-post`);
        continue;
      }

      const caption = captions[config.platform] || captions.instagram || "";

      try {
        console.log(`Cross-posting to ${config.platform}...`);
        const result = await publishPost({
          accountId,
          platform: config.platform,
          targetType: config.targetType,
          caption,
          mediaUrl,
          scheduleTime: brief.scheduleTime || null,
        });

        results.push({
          platform: config.platform,
          targetType: config.targetType,
          postId: result.id,
          status: "published",
        });
      } catch (err) {
        console.error(`Cross-post to ${config.platform} failed: ${err.message}`);
        results.push({
          platform: config.platform,
          status: "failed",
          error: err.message,
        });
      }
    }
  }

  return results;
}
