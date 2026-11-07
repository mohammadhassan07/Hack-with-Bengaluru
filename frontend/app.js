/**
 * MemOps SRE Dashboard Application Logic.
 * Manages Server-Sent Events (SSE), API interactions, and UI updates.
 */

let currentIncident = null;

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
  fetchTopology();
  fetchMemoryStats();
  fetchMemoryRecords();
  initEventStream();
});

// --- Server-Sent Events (SSE) Stream ---
function initEventStream() {
  const eventSource = new EventSource('/api/v1/stream');

  eventSource.addEventListener('ping', (e) => {
    logTerminal('info', '[SSE] Real-time stream connected to FastAPI backend.');
  });

  eventSource.addEventListener('cluster_update', (e) => {
    const data = JSON.parse(e.data);
    if (data.topology) {
      renderServicesList(data.topology.nodes);
    }
  });

  eventSource.addEventListener('incident_detected', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('error', `[ALERT] Incident detected on ${data.service_name}: ${data.error_class} - ${data.root_exception}`);
    
    // Update system status badge
    const badge = document.getElementById('system-status-badge');
    badge.className = 'status-indicator-badge critical';
    badge.innerHTML = '<span class="pulse-dot"></span> OUTAGE DETECTED';

    if (visualizer) {
      visualizer.updateNodeStatus(data.service_name, 'critical');
    }
  });

  eventSource.addEventListener('remediation_proposed', (e) => {
    const incident = JSON.parse(e.data);
    currentIncident = incident;

    if (incident.is_known_pattern) {
      logTerminal('memory', `[HINDSIGHT RECALL] Memory Match (${Math.round(incident.similarity_score * 100)}%): ${incident.historical_reference}`);
      if (visualizer) {
        visualizer.updateNodeStatus(incident.service_name, 'critical', true);
      }
    } else {
      logTerminal('warn', `[CLAUDE REASONING] Novel incident detected. Deep RCA synthesized patch.`);
    }

    renderIncidentCard(incident);
  });

  eventSource.addEventListener('remediation_applying', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('info', `[ACTION] Applying remediation to ${data.incident_id}...`);
    if (visualizer && currentIncident) {
      visualizer.updateNodeStatus(currentIncident.service_name, 'recovering');
    }
  });

  eventSource.addEventListener('health_verified', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('success', `[VERIFIED] ${data.service_name} restored to healthy state (MTTR: ${data.mttr_seconds}s).`);
    logTerminal('memory', `[HINDSIGHT RETAIN] ${data.retention_message}`);

    // Update status badge
    const badge = document.getElementById('system-status-badge');
    badge.className = 'status-indicator-badge healthy';
    badge.innerHTML = '<span class="pulse-dot"></span> OPERATIONAL';

    if (visualizer) {
      visualizer.updateNodeStatus(data.service_name, 'healthy');
    }

    clearIncidentCard();
    fetchMemoryStats();
    fetchMemoryRecords();
  });

  eventSource.onerror = (err) => {
    console.warn('SSE stream error, retrying...', err);
  };
}

// --- API Calls ---

async function fetchTopology() {
  try {
    const res = await fetch('/api/v1/topology');
    const data = await res.json();
    renderServicesList(data.nodes);
  } catch (err) {
    console.error('Failed to load topology:', err);
  }
}

async function fetchMemoryStats() {
  try {
    const res = await fetch('/api/v1/memory/stats');
    const data = await res.json();
    document.getElementById('stat-memories-count').innerText = `${data.verified_solutions} Verified`;
    document.getElementById('stat-avg-confidence').innerText = `${Math.round(data.average_confidence * 100)}%`;
    document.getElementById('stat-mttr-saved').innerText = `${data.estimated_mttr_saved_minutes} mins`;
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function fetchMemoryRecords() {
  try {
    const res = await fetch('/api/v1/memory/records');
    const records = await res.json();
    renderMemoryFeed(records);
  } catch (err) {
    console.error('Failed to fetch records:', err);
  }
}

async function triggerChaos(scenario) {
  logTerminal('warn', `[CHAOS] Injecting outage scenario: ${scenario}...`);
  try {
    const res = await fetch('/api/v1/chaos/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    });
    const data = await res.json();
    logTerminal('info', `[CHAOS] Injected: ${data.scenario}`);
  } catch (err) {
    logTerminal('error', `[CHAOS ERROR] ${err.message}`);
  }
}

async function resetCluster() {
  logTerminal('info', `[RESET] Restoring all services...`);
  try {
    await fetch('/api/v1/chaos/reset', { method: 'POST' });
    if (visualizer) {
      visualizer.resetAllNodes();
    }
    clearIncidentCard();
    fetchTopology();
    const badge = document.getElementById('system-status-badge');
    badge.className = 'status-indicator-badge healthy';
    badge.innerHTML = '<span class="pulse-dot"></span> OPERATIONAL';
    logTerminal('success', `[RESET] All microservices restored to healthy.`);
  } catch (err) {
    logTerminal('error', `[RESET ERROR] ${err.message}`);
  }
}

async function approveIncident() {
  if (!currentIncident) return;
  const btn = document.getElementById('btn-approve');
  btn.disabled = true;
  btn.innerText = 'Deploying Patch & Running Probes...';

  try {
    const res = await fetch(`/api/v1/incidents/${currentIncident.incident_id}/remediate`, {
      method: 'POST',
    });
    const data = await res.json();
    logTerminal('success', `[APPROVED] Hotfix deployed. Verification completed.`);
  } catch (err) {
    logTerminal('error', `[REMEDIATION FAILED] ${err.message}`);
    btn.disabled = false;
    btn.innerText = 'Approve & Deploy Hotfix';
  }
}

async function rejectIncident() {
  if (!currentIncident) return;
  try {
    await fetch(`/api/v1/incidents/${currentIncident.incident_id}/reject`, {
      method: 'POST',
    });
    logTerminal('warn', `[REJECTED] Patch dismissed by operator.`);
    clearIncidentCard();
  } catch (err) {
    console.error(err);
  }
}

// --- UI Renderers ---

function renderServicesList(nodes) {
  const container = document.getElementById('services-list');
  if (!container) return;
  container.innerHTML = '';

  nodes.forEach((n) => {
    const item = document.createElement('div');
    item.className = 'service-item';
    item.innerHTML = `
      <div class="service-item-info">
        <span class="status-dot ${n.status}"></span>
        <span>${n.name}</span>
      </div>
      <div class="service-metrics">
        <span>${n.latency_ms.toFixed(0)}ms</span> | 
        <span style="color: ${n.error_rate > 0 ? '#f43f5e' : '#64748b'}">${(n.error_rate * 100).toFixed(0)}% err</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderIncidentCard(inc) {
  document.getElementById('no-incident-msg').classList.add('hidden');
  document.getElementById('active-incident-details').classList.remove('hidden');

  const tag = document.getElementById('incident-status-tag');
  tag.innerText = inc.is_known_pattern ? 'KNOWN RECURRENCE' : 'NOVEL ERROR';
  tag.className = inc.is_known_pattern ? 'badge badge-purple' : 'badge badge-green';

  const recallBox = document.getElementById('memory-recall-banner');
  if (inc.is_known_pattern) {
    recallBox.classList.remove('hidden');
    document.getElementById('recall-confidence').innerText = `${Math.round(inc.similarity_score * 100)}% Match`;
    document.getElementById('recall-summary').innerText = inc.explanation;
  } else {
    recallBox.classList.add('hidden');
  }

  document.getElementById('inc-service').innerText = inc.service_name;
  document.getElementById('inc-fault').innerText = inc.fingerprint.error_class;
  document.getElementById('inc-rca').innerText = inc.root_cause;
  document.getElementById('diff-file').innerText = inc.proposed_remediation.target_file || 'config/service.yaml';
  document.getElementById('diff-content').innerText = inc.proposed_remediation.diff_patch || inc.proposed_remediation.runbook_summary;

  const btn = document.getElementById('btn-approve');
  btn.disabled = false;
  btn.innerText = 'Approve & Deploy Hotfix';
}

function clearIncidentCard() {
  currentIncident = null;
  document.getElementById('no-incident-msg').classList.remove('hidden');
  document.getElementById('active-incident-details').classList.add('hidden');
  const tag = document.getElementById('incident-status-tag');
  tag.innerText = 'IDLE';
  tag.className = 'badge';
}

function renderMemoryFeed(records) {
  const container = document.getElementById('memory-feed');
  if (!container) return;
  container.innerHTML = '';

  records.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'memory-item';
    item.innerHTML = `
      <div class="memory-item-top">
        <span class="memory-item-title">${r.title}</span>
        <span class="memory-item-conf">${Math.round(r.confidence_score * 100)}% conf</span>
      </div>
      <div class="memory-item-summary">${r.natural_language_summary}</div>
    `;
    container.appendChild(item);
  });
}

function logTerminal(type, message) {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerText = message;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
  const terminal = document.getElementById('terminal-logs');
  if (terminal) terminal.innerHTML = '';
}
