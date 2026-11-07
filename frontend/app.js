/**
 * MemOps SRE Dashboard Application Logic.
 * Integrates Stitch Clean UI, Three.js 3D Mesh, Server-Sent Events (SSE), and Hindsight AI Memory.
 */

let currentIncident = null;

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchTopology();
  fetchMemoryStats();
  fetchMemoryRecords();
  initEventStream();
  setupVisualizerControls();
});

// --- Theme Management ---
function initTheme() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    applyTheme(true);
  } else {
    applyTheme(false);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark');
      applyTheme(!isDark);
    });
  }
}

function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }
  if (window.lucide) {
    lucide.createIcons();
  }
}

// --- 3D Visualizer Camera & Orbit Controls ---
function setupVisualizerControls() {
  const btnRotate = document.getElementById('btn-toggle-rotate');
  const btnReset = document.getElementById('btn-reset-cam');

  if (btnRotate) {
    btnRotate.addEventListener('click', () => {
      if (window.visualizer) {
        const isRotating = window.visualizer.toggleAutoRotate();
        btnRotate.classList.toggle('bg-blue-600', isRotating);
        btnRotate.classList.toggle('text-white', isRotating);
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (window.visualizer) {
        window.visualizer.resetCamera();
      }
    });
  }
}

// --- Server-Sent Events (SSE) Stream ---
function initEventStream() {
  const eventSource = new EventSource('/api/v1/stream');

  eventSource.addEventListener('ping', (e) => {
    updateSSEStatus(true);
  });

  eventSource.addEventListener('cluster_update', (e) => {
    const data = JSON.parse(e.data);
    if (data.topology) {
      renderServicesList(data.topology.nodes);
    }
  });

  eventSource.addEventListener('incident_detected', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('error', `[OUTAGE DETECTED] ${data.service_name}: ${data.error_class} - ${data.root_exception}`);
    
    // Update header & KPI states
    setHeaderStatus('critical', '1 Active Outage');
    setKPIsToDegraded(data.service_name);

    if (window.visualizer) {
      window.visualizer.updateNodeStatus(data.service_name, 'critical');
    }
  });

  eventSource.addEventListener('remediation_proposed', (e) => {
    const incident = JSON.parse(e.data);
    currentIncident = incident;

    if (incident.is_known_pattern) {
      logTerminal('memory', `[HINDSIGHT HIT] Found historical resolution (${Math.round(incident.similarity_score * 100)}% match): ${incident.historical_reference}`);
      if (window.visualizer) {
        window.visualizer.updateNodeStatus(incident.service_name, 'critical', true);
      }
    } else {
      logTerminal('warn', `[AI RCA] Novel incident detected. Deep root-cause synthesized hotfix.`);
    }

    renderIncidentCard(incident);
  });

  eventSource.addEventListener('remediation_applying', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('info', `[ACTION] Applying remediation to ${data.incident_id}...`);
    if (window.visualizer && currentIncident) {
      window.visualizer.updateNodeStatus(currentIncident.service_name, 'recovering');
    }
  });

  eventSource.addEventListener('health_verified', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('success', `[VERIFIED] ${data.service_name} restored to healthy state (MTTR: ${data.mttr_seconds}s).`);
    logTerminal('memory', `[HINDSIGHT RETAINED] ${data.retention_message}`);

    // Update Header & KPIs to healthy
    setHeaderStatus('healthy', 'All Systems Healthy');
    setKPIsToHealthy();

    // Show Success Banner
    showSuccessBanner(
      `Fix verified & deployed!`,
      `${data.service_name} restored within ${data.mttr_seconds}s. Solution cataloged into persistent Hindsight memory.`
    );

    if (window.visualizer) {
      window.visualizer.updateNodeStatus(data.service_name, 'healthy');
    }

    clearIncidentCard();
    fetchMemoryStats();
    fetchMemoryRecords();
    fetchTopology();
  });

  eventSource.onerror = (err) => {
    updateSSEStatus(false);
  };
}

// --- Header & Status Helpers ---
function updateSSEStatus(connected) {
  const dot = document.getElementById('sse-status-dot');
  const text = document.getElementById('sse-status-text');
  if (connected) {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    if (text) text.textContent = 'Live Connected';
  } else {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    if (text) text.textContent = 'Reconnecting...';
  }
}

function setHeaderStatus(state, label) {
  const pill = document.getElementById('header-status-pill');
  const dot = document.getElementById('header-status-dot');
  const text = document.getElementById('header-status-text');

  if (state === 'healthy') {
    if (pill) pill.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium transition-all';
    if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
    if (text) text.textContent = label || 'All Systems Healthy';
  } else {
    if (pill) pill.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium transition-all';
    if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse';
    if (text) text.textContent = label || '1 Active Incident';
  }
}

function setKPIsToDegraded(serviceName) {
  const kpiHealth = document.getElementById('kpi-health-value');
  const kpiHealthSub = document.getElementById('kpi-health-sub');
  const kpiAlerts = document.getElementById('kpi-alerts-value');
  const kpiAlertsSub = document.getElementById('kpi-alerts-sub');

  if (kpiHealth) {
    kpiHealth.className = 'text-2xl font-bold text-rose-600 dark:text-rose-400 tracking-tight';
    kpiHealth.textContent = 'Degraded';
  }
  if (kpiHealthSub) {
    kpiHealthSub.innerHTML = `<span class="text-rose-500 font-semibold">${serviceName || '1 service'}</span> impacted`;
  }
  if (kpiAlerts) kpiAlerts.textContent = '1 Active';
  if (kpiAlertsSub) kpiAlertsSub.textContent = `Critical priority: ${serviceName || 'Target'}`;
}

function setKPIsToHealthy() {
  const kpiHealth = document.getElementById('kpi-health-value');
  const kpiHealthSub = document.getElementById('kpi-health-sub');
  const kpiAlerts = document.getElementById('kpi-alerts-value');
  const kpiAlertsSub = document.getElementById('kpi-alerts-sub');

  if (kpiHealth) {
    kpiHealth.className = 'text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight';
    kpiHealth.textContent = '100% Healthy';
  }
  if (kpiHealthSub) {
    kpiHealthSub.innerHTML = `All 6 microservices nominal`;
  }
  if (kpiAlerts) kpiAlerts.textContent = '0 Active';
  if (kpiAlertsSub) kpiAlertsSub.textContent = 'Cluster fully operational';
}

function showSuccessBanner(title, description) {
  const banner = document.getElementById('success-banner');
  const titleEl = document.getElementById('success-banner-title');
  const descEl = document.getElementById('success-banner-desc');
  if (banner) {
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    banner.classList.remove('hidden');
  }
}

function dismissSuccessBanner() {
  const banner = document.getElementById('success-banner');
  if (banner) banner.classList.add('hidden');
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
    const memCount = document.getElementById('kpi-memory-value');
    const memSub = document.getElementById('kpi-memory-sub');
    const mttrVal = document.getElementById('kpi-mttr-value');
    const headerSaved = document.getElementById('header-mttr-saved');

    if (memCount) memCount.textContent = `${data.verified_solutions} Verified`;
    if (memSub) memSub.textContent = `${Math.round(data.average_confidence * 100)}% avg confidence`;
    if (mttrVal) mttrVal.textContent = `${data.estimated_mttr_saved_minutes} mins`;
    if (headerSaved) headerSaved.textContent = `${data.estimated_mttr_saved_minutes}m`;
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
  dismissSuccessBanner();
  logTerminal('warn', `[CHAOS] Injecting outage scenario: ${scenario}...`);
  try {
    const res = await fetch('/api/v1/chaos/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    });
    const data = await res.json();
    logTerminal('info', `[CHAOS TRIGGERED] Target: ${data.service} (${data.scenario})`);
  } catch (err) {
    logTerminal('error', `[CHAOS ERROR] ${err.message}`);
  }
}

async function resetCluster() {
  logTerminal('info', `[RESET] Restoring all services...`);
  try {
    await fetch('/api/v1/chaos/reset', { method: 'POST' });
    if (window.visualizer) {
      window.visualizer.resetAllNodes();
    }
    clearIncidentCard();
    fetchTopology();
    fetchMemoryStats();
    setHeaderStatus('healthy', 'All Systems Healthy');
    setKPIsToHealthy();
    logTerminal('success', `[RESET] All microservices restored to operational baseline.`);
  } catch (err) {
    logTerminal('error', `[RESET ERROR] ${err.message}`);
  }
}

async function approveIncident() {
  if (!currentIncident) return;
  const btn = document.getElementById('btn-approve');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="w-4 h-4 animate-spin" data-lucide="loader-2"></i> Deploying Patch &amp; Verifying...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch(`/api/v1/incidents/${currentIncident.incident_id}/remediate`, {
      method: 'POST',
    });
    const data = await res.json();
    logTerminal('success', `[APPROVED] Hotfix applied. Health probes verified.`);
  } catch (err) {
    logTerminal('error', `[REMEDIATION FAILED] ${err.message}`);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="w-4 h-4" data-lucide="git-merge"></i> Approve &amp; Deploy Hotfix`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function rejectIncident() {
  if (!currentIncident) return;
  try {
    await fetch(`/api/v1/incidents/${currentIncident.incident_id}/reject`, {
      method: 'POST',
    });
    logTerminal('warn', `[REJECTED] Hotfix dismissed by operator.`);
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
    const isCritical = n.status === 'critical' || n.error_rate > 0.1;
    const isRecovering = n.status === 'recovering';

    let dotColor = 'bg-emerald-500';
    let statusText = 'Healthy';
    let statusBadgeClass = 'text-emerald-600 dark:text-emerald-400';

    if (isCritical) {
      dotColor = 'bg-rose-500 animate-ping';
      statusText = 'Outage';
      statusBadgeClass = 'px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold';
    } else if (isRecovering) {
      dotColor = 'bg-amber-500 animate-pulse';
      statusText = 'Recovering';
      statusBadgeClass = 'px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold';
    }

    const item = document.createElement('div');
    item.className = `py-3 flex items-center justify-between text-sm transition-all ${
      isCritical ? 'bg-rose-50/60 dark:bg-rose-950/20 -mx-2 px-2 rounded-lg' : ''
    }`;
    item.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-2.5 h-2.5 rounded-full ${dotColor} flex-shrink-0"></span>
        <span class="font-medium text-slate-800 dark:text-slate-200 truncate">${n.name}</span>
      </div>
      <div class="flex items-center gap-3 text-xs font-mono flex-shrink-0">
        <span class="${isCritical ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}">
          ${isCritical ? 'Timeout' : `${n.latency_ms.toFixed(0)}ms`}
        </span>
        <span class="${statusBadgeClass}">${statusText}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderIncidentCard(inc) {
  const healthyBox = document.getElementById('healthy-state-box');
  const detailsBox = document.getElementById('active-incident-details');
  if (healthyBox) healthyBox.classList.add('hidden');
  if (detailsBox) detailsBox.classList.remove('hidden');

  // Severity & Service pill
  const pill = document.getElementById('incident-pill');
  if (pill) {
    pill.textContent = `${inc.service_name} Outage`;
    pill.className = inc.is_known_pattern
      ? 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
      : 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900';
  }

  // Recurrence / Memory Match Banner
  const recallBox = document.getElementById('memory-recall-box');
  if (inc.is_known_pattern) {
    if (recallBox) recallBox.classList.remove('hidden');
    const confEl = document.getElementById('recall-confidence');
    const sumEl = document.getElementById('recall-summary');
    if (confEl) confEl.textContent = `${Math.round(inc.similarity_score * 100)}% Memory Match`;
    if (sumEl) sumEl.textContent = `Hindsight recalled prior incident: ${inc.historical_reference}. ${inc.explanation}`;
  } else {
    if (recallBox) recallBox.classList.add('hidden');
  }

  // Title, RCA & description
  const titleEl = document.getElementById('incident-title');
  const descEl = document.getElementById('incident-desc');
  const rcaEl = document.getElementById('incident-rca');

  if (titleEl) {
    titleEl.textContent = `${inc.service_name} failure: ${inc.fingerprint?.error_class || 'Runtime Outage'}`;
  }
  if (descEl) {
    descEl.textContent = inc.fingerprint?.raw_log?.split('\n')[0] || 'Active exception threshold breached.';
  }
  if (rcaEl) {
    rcaEl.textContent = inc.root_cause || 'Root-cause analysis determined anomalous connection or memory state.';
  }

  // Diff
  const diffFile = document.getElementById('diff-file');
  const diffBox = document.getElementById('diff-content');
  if (diffFile) {
    diffFile.textContent = inc.proposed_remediation?.target_file || 'config/service.yaml';
  }
  if (diffBox) {
    const rawDiff = inc.proposed_remediation?.diff_patch || inc.proposed_remediation?.runbook_summary || '';
    diffBox.innerHTML = formatDiffToHtml(rawDiff);
  }

  // Reset Approve Button
  const btnApprove = document.getElementById('btn-approve');
  if (btnApprove) {
    btnApprove.disabled = false;
    btnApprove.innerHTML = `<i class="w-4 h-4" data-lucide="git-merge"></i> Approve &amp; Deploy Hotfix`;
  }

  if (window.lucide) lucide.createIcons();
}

function formatDiffToHtml(diffText) {
  if (!diffText) return '<div class="text-slate-400">No diff payload</div>';
  
  const lines = diffText.split('\n');
  return lines.map(line => {
    if (line.startsWith('-')) {
      return `<div class="flex items-center bg-rose-950/60 text-rose-300 px-3 py-0.5 rounded border-l-4 border-rose-500 -mx-1"><span class="select-none text-rose-400 font-bold mr-3">-</span><span>${escapeHtml(line.slice(1))}</span></div>`;
    } else if (line.startsWith('+')) {
      return `<div class="flex items-center bg-emerald-950/60 text-emerald-300 px-3 py-0.5 rounded border-l-4 border-emerald-500 -mx-1"><span class="select-none text-emerald-400 font-bold mr-3">+</span><span>${escapeHtml(line.slice(1))}</span></div>`;
    } else {
      return `<div class="text-slate-400 pl-4 py-0.5 font-mono">${escapeHtml(line)}</div>`;
    }
  }).join('');
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function clearIncidentCard() {
  currentIncident = null;
  const healthyBox = document.getElementById('healthy-state-box');
  const detailsBox = document.getElementById('active-incident-details');
  if (healthyBox) healthyBox.classList.remove('hidden');
  if (detailsBox) detailsBox.classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function renderMemoryFeed(records) {
  const container = document.getElementById('memory-feed');
  if (!container) return;
  container.innerHTML = '';

  if (!records || records.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-500 py-2">No historical memories yet.</div>';
    return;
  }

  records.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition flex items-start gap-3';
    item.innerHTML = `
      <div class="p-1 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0">
        <i class="w-3.5 h-3.5" data-lucide="check"></i>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-900 dark:text-white truncate">${escapeHtml(r.title)}</span>
          <span class="text-[11px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex-shrink-0">
            ${Math.round(r.confidence_score * 100)}% conf
          </span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
          ${escapeHtml(r.natural_language_summary)}
        </p>
      </div>
    `;
    container.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

function logTerminal(type, message) {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;

  const line = document.createElement('div');
  const now = new Date().toLocaleTimeString();
  
  let colorClass = 'text-slate-300';
  if (type === 'error') colorClass = 'text-rose-400 font-semibold';
  if (type === 'warn') colorClass = 'text-amber-400';
  if (type === 'success') colorClass = 'text-emerald-400';
  if (type === 'memory') colorClass = 'text-amber-300 font-semibold';
  if (type === 'info') colorClass = 'text-blue-400';

  line.className = `font-mono text-xs py-0.5 leading-relaxed ${colorClass}`;
  line.innerHTML = `<span class="text-slate-500 mr-2">[${now}]</span>${escapeHtml(message)}`;

  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
  const terminal = document.getElementById('terminal-logs');
  if (terminal) terminal.innerHTML = '';
}
