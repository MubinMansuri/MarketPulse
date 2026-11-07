import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileTranslationMemory, translationMemoryKey } from "./translation-memory.server";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("file translation memory", () => {
  it("keeps Spanish and Arabic translations in separate language files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "marketpulse-translation-memory-"));
    directories.push(directory);
    const memory = new FileTranslationMemory(directory);

    await expect(memory.get("es", "Market outlook")).resolves.toBeUndefined();
    await expect(memory.set("es", "Market outlook", "Perspectiva del mercado")).resolves.toBe(true);
    await expect(memory.set("ar", "Market outlook", "نظرة السوق")).resolves.toBe(true);

    await expect(memory.get("es", "Market outlook")).resolves.toBe("Perspectiva del mercado");
    await expect(memory.get("ar", "Market outlook")).resolves.toBe("نظرة السوق");
    const spanish = JSON.parse(await readFile(join(directory, "es.json"), "utf8"));
    expect(spanish.entries[translationMemoryKey("Market outlook")].translated).toBe(
      "Perspectiva del mercado",
    );
  });
});
