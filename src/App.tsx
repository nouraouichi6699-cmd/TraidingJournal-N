import Brand, { ByLine } from "./components/Brand";

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Brand lang="ar" />
          <ByLine />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8" />
    </div>
  );
}
