import { PortRow } from './components/PortRow';
import { Toolbar } from './components/Toolbar';
import { usePortScanner } from './hooks/usePortScanner';

export function App() {
  const {
    result,
    ports,
    loading,
    killing,
    error,
    toast,
    category,
    setCategory,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    customPort,
    setCustomPort,
    platform,
    occupiedCount,
    freeCount,
    scan,
    kill,
    addCustomPort,
  } = usePortScanner();

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />

      <header className="hero">
        <div className="hero__brand">
          <p className="hero__mark">PortKiller</p>
          <h1>Find busy ports. Free them in one click.</h1>
          <p className="hero__lede">
            Scan common local development ports, see which processes hold them,
            and kill blockers without leaving the UI.
          </p>
        </div>
        <div className="hero__cta">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => void scan()}
            disabled={loading}
          >
            {loading ? 'Scanning ports…' : 'Scan common ports'}
          </button>
          <p className="hero__hint">
            Works on macOS, Windows, and Linux · open source
          </p>
        </div>
      </header>

      <main className="workspace">
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          category={category}
          onCategoryChange={setCategory}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          customPort={customPort}
          onCustomPortChange={setCustomPort}
          onAddCustomPort={() => void addCustomPort()}
          onScan={() => void scan()}
          loading={loading}
          freeCount={freeCount}
          occupiedCount={occupiedCount}
          scannedAt={result?.scannedAt}
          platform={platform}
        />

        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="port-list" aria-label="Port results">
          {loading && !result ? (
            <div className="empty-state">
              <div className="pulse" />
              <p>Listening across common ports…</p>
            </div>
          ) : ports.length === 0 ? (
            <div className="empty-state">
              <p>No ports match the current filters.</p>
            </div>
          ) : (
            ports.map((port, index) => (
              <PortRow
                key={port.port}
                port={port}
                index={index}
                killing={killing === port.port}
                onKill={(value) => void kill(value)}
              />
            ))
          )}
        </section>
      </main>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
