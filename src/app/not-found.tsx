export default function NotFound() {
  return (
    <main className="system-page">
      <section className="system-page-card">
        <h1>Page not found</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <Link href="/">Go home</Link>
      </section>
    </main>
  );
}
import Link from "next/link";
