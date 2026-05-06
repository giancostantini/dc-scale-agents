// Server Component: lee el markdown del FAQ desde el filesystem en
// build/request time. Pasa el contenido como prop a un Client Component
// que se encarga del auth check y del render.

import fs from "node:fs/promises";
import path from "node:path";
import FaqClient from "./FaqClient";

async function loadFaqContent(): Promise<string> {
  const file = path.join(process.cwd(), "content", "portal-faq.md");
  return fs.readFile(file, "utf-8");
}

export default async function PortalFaqPage() {
  const content = await loadFaqContent();
  return <FaqClient content={content} />;
}
