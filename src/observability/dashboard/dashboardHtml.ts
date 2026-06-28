export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>dev-assistant-mcp — Observability Dashboard</title>
<style>
  :root { --bg: #0f1115; --panel: #171a21; --border: #2a2e38; --text: #e4e6eb; --dim: #8a8f9b;
          --green: #3ecf7e; --red: #f25c54; --yellow: #e8b339; --blue: #5b9fd6; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, system-ui, sans-serif; }
  header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header .sub { color: var(--dim); font-size: 12px; }
  main { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .card .label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .card .value { font-size: 24px; font-weight: 600; }
  section { margin-bottom: 28px; }
  section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--dim); font-weight: 500; font-size: 11px; text-transform: uppercase; }
  tr:hover { background: rgba(255,255,255,0.02); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge.done, .badge.passed { background: rgba(62,207,126,0.15); color: var(--green); }
  .badge.failed { background: rgba(242,92,84,0.15); color: var(--red); }
  .badge.running, .badge.validating, .badge.planning { background: rgba(91,159,214,0.15); color: var(--blue); }
  .badge.aborted { background: rgba(232,179,57,0.15); color: var(--yellow); }
  .mono { font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; color: var(--dim); }
  .empty { color: var(--dim); padding: 20px; text-align: center; }
  #refreshNote { color: var(--dim); font-size: 11px; }
  a.wflink { color: var(--blue); text-decoration: none; cursor: pointer; }
  a.wflink:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>dev-assistant-mcp · Observability</h1>
  <div class="sub" id="sandboxLine">checking sandbox…</div>
</header>
<main>
  <section>
    <h2>Live (since process start)</h2>
    <div class="grid" id="liveCards"></div>
  </section>
  <section>
    <h2>Persisted (all-time, survives restarts)</h2>
    <div class="grid" id="persistedCards"></div>
  </section>
  <section>
    <h2>Tool Usage</h2>
    <table id="toolTable"><thead><tr><th>Tool</th><th>Calls</th><th>Failures</th><th>Failure Rate</th><th>Avg Duration</th></tr></thead><tbody></tbody></table>
  </section>
  <section>
    <h2>Workflows</h2>
    <table id="workflowTable"><thead><tr><th>Goal</th><th>Status</th><th>Steps</th><th>Created</th><th>ID</th></tr></thead><tbody></tbody></table>
  </section>
  <div id="refreshNote">Auto-refreshing every 5s.</div>
</main>
<script>
function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}
function fmtPct(x) {
  if (x == null) return '—';
  return (x * 100).toFixed(0) + '%';
}
function card(label, value) {
  return '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
}
async function refresh() {
  try {
    const [metricsRes, sandboxRes, workflowsRes] = await Promise.all([
      fetch('/api/metrics').then(r => r.json()),
      fetch('/api/sandbox').then(r => r.json()),
      fetch('/api/workflows').then(r => r.json()),
    ]);

    document.getElementById('sandboxLine').textContent =
      sandboxRes.isolated ? ('🔒 sandboxed (' + sandboxRes.kind + ')') : ('🔓 unsandboxed — ' + sandboxRes.kind);

    const live = metricsRes.live;
    document.getElementById('liveCards').innerHTML =
      card('Uptime', fmtMs(live.uptimeMs)) +
      card('Workflows Started', live.workflowsStarted) +
      card('Workflows Completed', live.workflowsCompleted) +
      card('Workflows Failed', live.workflowsFailed) +
      card('Retries', live.retries) +
      card('Repair Success Rate', fmtPct(live.repairSuccessRate));

    const persisted = metricsRes.persisted;
    document.getElementById('persistedCards').innerHTML =
      card('Total Started', persisted.workflowsStarted) +
      card('Total Completed', persisted.workflowsCompleted) +
      card('Total Failed', persisted.workflowsFailed) +
      card('Currently Active', persisted.workflowsActive) +
      card('Avg Duration', fmtMs(persisted.avgDurationMs)) +
      card('Total Retries', persisted.totalRetries);

    const toolBody = document.querySelector('#toolTable tbody');
    if (live.tools.length === 0) {
      toolBody.innerHTML = '<tr><td colspan="5" class="empty">No tool calls recorded yet this session.</td></tr>';
    } else {
      toolBody.innerHTML = live.tools.map(t =>
        '<tr><td class="mono">' + t.name + '</td><td>' + t.calls + '</td><td>' + t.failures +
        '</td><td>' + fmtPct(t.failureRate) + '</td><td>' + fmtMs(t.avgDurationMs) + '</td></tr>'
      ).join('');
    }

    const wfBody = document.querySelector('#workflowTable tbody');
    const workflows = workflowsRes.workflows;
    if (workflows.length === 0) {
      wfBody.innerHTML = '<tr><td colspan="5" class="empty">No workflows have been run yet.</td></tr>';
    } else {
      wfBody.innerHTML = workflows.map(w => {
        const done = w.steps.filter(s => s.status === 'done').length;
        const age = Math.round((Date.now() - w.createdAt) / 1000);
        return '<tr><td>' + escapeHtml(w.goal) + '</td><td><span class="badge ' + w.status + '">' + w.status + '</span></td>' +
          '<td>' + done + '/' + w.steps.length + '</td><td>' + age + 's ago</td>' +
          '<td class="mono">' + w.id.slice(0, 8) + '…</td></tr>';
      }).join('');
    }
  } catch (err) {
    console.error('Dashboard refresh failed:', err);
  }
}
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
