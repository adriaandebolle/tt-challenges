import { useQuery } from "@tanstack/react-query";
import { fetchDashboard, type OrgScope } from "./api";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Dashboard({ scope, orgName }: { scope: OrgScope; orgName: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", scope],
    queryFn: () => fetchDashboard(scope),
  });

  if (isLoading) return <p className="empty-state">Loading…</p>;
  if (error || !data) return <p className="error-banner">Couldn't load the dashboard.</p>;

  const { statusCounts, failedDocuments, recentGenerated, totalChunks, totalExecutives } = data;
  const inFlight = (statusCounts.queued ?? 0) + (statusCounts.processing ?? 0);

  return (
    <div className="dashboard">
      <div className="ingest-placeholder">
        <button type="button" disabled title="Not wired yet — see WBS.md Phase 2">
          + Add a document
        </button>
        <span className="ingest-placeholder-note">
          Not yet wired to the pipeline (Should-tier, tracked in WBS.md Phase 2). Today's corpus is seeded via
          <code> make ingest</code>.
        </span>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-value">{statusCounts.ready ?? 0}</span>
          <span className="tile-label">Ready in the KB</span>
        </div>
        <div className={`tile${inFlight > 0 ? " tile-active" : ""}`}>
          <span className="tile-value">{inFlight}</span>
          <span className="tile-label">Ingesting now</span>
        </div>
        <div className={`tile${(statusCounts.failed ?? 0) > 0 ? " tile-warn" : ""}`}>
          <span className="tile-value">{statusCounts.failed ?? 0}</span>
          <span className="tile-label">Failed — needs a look</span>
        </div>
        <div className="tile">
          <span className="tile-value">{totalExecutives}</span>
          <span className="tile-label">Executives tracked</span>
        </div>
      </div>

      <section className="dash-section">
        <h2>Needs attention</h2>
        {failedDocuments.length === 0 ? (
          <p className="dash-empty">Nothing failed — every ingested file is either ready or still processing.</p>
        ) : (
          <div className="dash-list">
            {failedDocuments.map((d) => (
              <div className="dash-row failed" key={d.id}>
                <span className="dash-row-title">{d.sourcePath}</span>
                <span className="dash-row-reason">{d.statusReason}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dash-section">
        <h2>Recently generated</h2>
        {recentGenerated.length === 0 ? (
          <p className="dash-empty">Nothing generated yet for {orgName} — try the Converse tab.</p>
        ) : (
          <div className="dash-list">
            {recentGenerated.map((g) => (
              <div className="dash-row" key={g.id}>
                <span className="dash-row-title">{g.title}</span>
                <span className="dash-row-meta">{timeAgo(g.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="dash-footnote">
        {totalChunks} chunks indexed for {orgName}. Reframing this around "what's new since I last looked" is a
        Should-tier item — tracked in WBS.md Phase 2, not silently skipped.
      </p>
    </div>
  );
}
