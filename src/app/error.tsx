"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Application error", error);

  return (
    <main className="system-page">
      <section className="system-page-card">
        <h1>This page didn&apos;t load</h1>
        <p>Something went wrong on our end. You can try refreshing or head back home.</p>
        <div className="system-page-actions">
          <button type="button" onClick={reset}>
            Try again
          </button>
          <Link href="/">Go home</Link>
        </div>
      </section>
    </main>
  );
}
