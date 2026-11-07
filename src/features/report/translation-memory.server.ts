import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type TranslationMemoryLocale = "es" | "ar";

type TranslationMemoryEntry = {
  source: string;
  translated: string;
  updatedAt: string;
};

type TranslationMemoryFile = {
  version: 1;
  locale: TranslationMemoryLocale;
  entries: Record<string, TranslationMemoryEntry>;
};

function emptyMemory(locale: TranslationMemoryLocale): TranslationMemoryFile {
  return { version: 1, locale, entries: {} };
}

function isMemoryFile(value: unknown, locale: TranslationMemoryLocale): value is TranslationMemoryFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TranslationMemoryFile>;
  return candidate.version === 1 && candidate.locale === locale && !!candidate.entries;
}

export function translationMemoryKey(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

/**
 * A small, auditable translation memory. Each target locale has a separate JSON
 * file so a cache hit never needs a provider request. Writes are atomic and
 * serialized per language to avoid corrupting the file during concurrent edits.
 */
export class FileTranslationMemory {
  private readonly memories = new Map<TranslationMemoryLocale, Promise<TranslationMemoryFile>>();
  private readonly writes = new Map<TranslationMemoryLocale, Promise<void>>();

  constructor(private readonly directory: string) {}

  private filePath(locale: TranslationMemoryLocale) {
    return resolve(this.directory, `${locale}.json`);
  }

  private async load(locale: TranslationMemoryLocale): Promise<TranslationMemoryFile> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath(locale), "utf8"));
      return isMemoryFile(parsed, locale) ? parsed : emptyMemory(locale);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyMemory(locale);
      // A read-only filesystem or an invalid cache must never prevent the editor
      // from translating. The in-memory copy remains available for this instance.
      return emptyMemory(locale);
    }
  }

  private memory(locale: TranslationMemoryLocale) {
    const existing = this.memories.get(locale);
    if (existing) return existing;
    const loaded = this.load(locale);
    this.memories.set(locale, loaded);
    return loaded;
  }

  async get(locale: TranslationMemoryLocale, source: string): Promise<string | undefined> {
    const entry = (await this.memory(locale)).entries[translationMemoryKey(source)];
    return entry?.source === source ? entry.translated : undefined;
  }

  async set(locale: TranslationMemoryLocale, source: string, translated: string): Promise<boolean> {
    const memory = await this.memory(locale);
    memory.entries[translationMemoryKey(source)] = {
      source,
      translated,
      updatedAt: new Date().toISOString(),
    };

    const previous = this.writes.get(locale) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      const path = this.filePath(locale);
      const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(memory, null, 2) + "\n", "utf8");
      await rename(temporaryPath, path);
    });
    this.writes.set(locale, write);

    try {
      await write;
      return true;
    } catch {
      return false;
    }
  }
}

let configuredMemory: FileTranslationMemory | undefined;

export function getTranslationMemory() {
  const configuredDirectory = process.env["TRANSLATION_MEMORY_DIR"];
  const directory = configuredDirectory
    ? resolve(configuredDirectory)
    : resolve(process.cwd(), ".translation-cache");
  configuredMemory ??= new FileTranslationMemory(directory);
  return configuredMemory;
}

export function resetTranslationMemoryForTests() {
  configuredMemory = undefined;
}
