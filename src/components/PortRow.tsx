import type { PortInfo } from '../lib/api';

interface PortRowProps {
  port: PortInfo;
  killing: boolean;
  index: number;
  onKill: (port: number) => void;
}

export function PortRow({ port, killing, index, onKill }: PortRowProps) {
  const occupied = port.status === 'occupied';
  const processLabel =
    port.processes.length === 0
      ? '—'
      : port.processes
          .map((proc) => `${proc.name} · PID ${proc.pid}`)
          .join(', ');

  return (
    <article
      className={`port-row ${occupied ? 'is-occupied' : 'is-free'}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="port-row__port">
        <span className="port-row__number">{port.port}</span>
        <span className={`port-row__badge ${occupied ? 'bad' : 'ok'}`}>
          {occupied ? 'In use' : 'Free'}
        </span>
      </div>

      <div className="port-row__meta">
        <h3>{port.label}</h3>
        <p>
          <span className="port-row__category">{port.category}</span>
          <span className="port-row__sep" aria-hidden="true">
            /
          </span>
          <span className="port-row__process" title={processLabel}>
            {processLabel}
          </span>
        </p>
      </div>

      <div className="port-row__action">
        {occupied ? (
          <button
            type="button"
            className="btn btn-danger"
            disabled={killing}
            onClick={() => onKill(port.port)}
          >
            {killing ? 'Killing…' : 'Kill & free'}
          </button>
        ) : (
          <span className="port-row__ready">Ready</span>
        )}
      </div>
    </article>
  );
}
