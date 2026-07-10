import { CATEGORIES, type CategoryFilter } from '../lib/api';

interface ToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  category: CategoryFilter;
  onCategoryChange: (value: CategoryFilter) => void;
  statusFilter: 'all' | 'free' | 'occupied';
  onStatusFilterChange: (value: 'all' | 'free' | 'occupied') => void;
  customPort: string;
  onCustomPortChange: (value: string) => void;
  onAddCustomPort: () => void;
  onScan: () => void;
  loading: boolean;
  freeCount: number;
  occupiedCount: number;
  scannedAt?: string;
  platform: string;
}

export function Toolbar({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  statusFilter,
  onStatusFilterChange,
  customPort,
  onCustomPortChange,
  onAddCustomPort,
  onScan,
  loading,
  freeCount,
  occupiedCount,
  scannedAt,
  platform,
}: ToolbarProps) {
  return (
    <section className="toolbar" aria-label="Port filters">
      <div className="toolbar__primary">
        <label className="field field-grow">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Port, process, or label"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) =>
              onCategoryChange(event.target.value as CategoryFilter)
            }
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(
                event.target.value as 'all' | 'free' | 'occupied',
              )
            }
          >
            <option value="all">All</option>
            <option value="occupied">In use</option>
            <option value="free">Free</option>
          </select>
        </label>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onScan}
          disabled={loading}
        >
          {loading ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      <div className="toolbar__secondary">
        <form
          className="custom-port"
          onSubmit={(event) => {
            event.preventDefault();
            onAddCustomPort();
          }}
        >
          <label className="field">
            <span>Custom port</span>
            <input
              value={customPort}
              onChange={(event) => onCustomPortChange(event.target.value)}
              placeholder="e.g. 3333"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </label>
          <button type="submit" className="btn btn-ghost">
            Add & scan
          </button>
        </form>

        <div className="toolbar__summary" aria-live="polite">
          <span>
            <strong>{occupiedCount}</strong> in use
          </span>
          <span>
            <strong>{freeCount}</strong> free
          </span>
          {scannedAt ? (
            <span className="toolbar__time">
              {new Date(scannedAt).toLocaleTimeString()} · {platform || 'local'}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
