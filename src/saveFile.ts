/**
 * Hand the viewer a file. On the real site this is an ordinary download; on
 * the claude.ai preview page, where pages may not download directly, it goes
 * through the page's `downloads` permission (the viewer confirms the save).
 */
type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

let host: Promise<Downloads | null> | null = null;
function downloadsHost(): Promise<Downloads | null> {
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!c?.use) return Promise.resolve(null);
  host ??= c.use('downloads').then((d) => (d as Downloads | null) ?? null).catch(() => null);
  return host;
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** Returns false when the viewer declined (nothing else to do then). */
export async function saveFile(filename: string, data: Blob | string): Promise<boolean> {
  const blob = typeof data === 'string' ? await dataUrlToBlob(data) : data;
  const d = await downloadsHost();
  if (d) {
    try { await d.save({ filename, data: blob }); return true; } catch { return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
}
