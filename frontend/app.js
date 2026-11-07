/**
 * MemOps SRE Dashboard Application Logic.
 * Integrates Real GitHub Inspection, Accurate Tool Connection Status,
 * Live Stacktrace & Log Analyzer, Three.js 3D Mesh, and Hindsight Memory.
 */

let currentIncident = null;

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchTopology();
  fetchMemoryStats();
  fetchMemoryRecords();
  fetchIntegrationsStatus();
  fetchGitHubStatus();
  fetchGitHubIssues();
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
      logTerminal('memory', `[HINDSIGHT HIT] Verified resolution recalled (${Math.round(incident.similarity_score * 100)}% match): ${incident.historical_reference}`);
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

    setHeaderStatus('healthy', 'All Systems Healthy');
    setKPIsToHealthy();

    showSuccessBanner(
      `Fix verified & deployed!`,
      `${data.service_name} restored within ${data.mttr_seconds}s. Solution permanently cataloged into persistent Hindsight memory.`
    );

    if (window.visualizer) {
      window.visualizer.updateNodeStatus(data.service_name, 'healthy');
    }

    clearIncidentCard();
    fetchMemoryStats();
    fetchMemoryRecords();
    fetchTopology();
  });

  eventSource.addEventListener('github_connected', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('info', `[GITHUB LIVE] Connected to ${data.repo}. Found ${data.issues_count} open issues & ${data.workflows_count || 0} workflows.`);
  });

  eventSource.addEventListener('github_issue_triaged', (e) => {
    const data = JSON.parse(e.data);
    logTerminal('info', `[GITHUB ISSUE] Ingested Issue #${data.issue_number}: "${data.title}" from ${data.repo}`);
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
    if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
    if (text) text.textContent = 'Live Connected';
  } else {
    if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500';
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

// --- Tool Integrations & Honest Status ---

async function fetchIntegrationsStatus() {
  try {
    const res = await fetch('/api/v1/integrations/status');
    const data = await res.json();
    renderIntegrationsStrip(data.tools);
  } catch (err) {
    console.error('Failed to fetch integrations status:', err);
  }
}

function renderIntegrationsStrip(tools) {
  const container = document.getElementById('integrations-strip');
  if (!container) return;
  container.innerHTML = '';

  tools.forEach(tool => {
    const badge = document.createElement('div');
    const isConn = tool.connected;

    badge.className = `flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
      isConn 
        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200' 
        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400'
    }`;

    badge.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="w-2 h-2 rounded-full ${isConn ? 'bg-emerald-500' : 'bg-slate-400'} flex-shrink-0"></span>
        <div class="min-w-0 truncate">
          <div class="font-semibold text-slate-800 dark:text-slate-200 truncate">${escapeHtml(tool.name)}</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(tool.reason || tool.status_text)}</div>
        </div>
      </div>
      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase flex-shrink-0 ${
        isConn 
          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300' 
          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
      }">
        ${tool.badge}
      </span>
    `;

    container.appendChild(badge);
  });
}

// --- GitHub Real Data Handling ---

async function fetchGitHubStatus() {
  try {
    const res = await fetch('/api/v1/github/status');
    const data = await res.json();
    const headerRepo = document.getElementById('header-repo-label');
    const heroInput = document.getElementById('hero-repo-input');
    const modalInput = document.getElementById('github-repo-input');
    const radarRepo = document.getElementById('radar-repo-name');
    const radarBranch = document.getElementById('radar-repo-branch');

    if (headerRepo && data.repo) headerRepo.textContent = data.repo;
    if (heroInput && data.repo) heroInput.value = data.repo;
    if (modalInput && data.repo) modalInput.value = data.repo;
    if (radarRepo && data.repo) radarRepo.textContent = data.repo;
    if (radarBranch && data.metadata?.default_branch) radarBranch.textContent = data.metadata.default_branch;

    renderRecentCommits(data.commits || []);
  } catch (err) {
    console.error('Failed to fetch GitHub status:', err);
  }
}

async function fetchGitHubIssues() {
  try {
    const res = await fetch('/api/v1/github/issues');
    const issues = await res.json();
    renderGitHubIssues(issues);
  } catch (err) {
    console.error('Failed to fetch GitHub issues:', err);
  }
}

function renderGitHubIssues(issues) {
  const container = document.getElementById('github-issues-list');
  const countEl = document.getElementById('github-issue-count');
  if (countEl) countEl.textContent = `${issues ? issues.length : 0} Found`;
  if (!container) return;

  container.innerHTML = '';

  // If 0 issues: HONESTLY show clean state! Zero fake data.
  if (!issues || issues.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 space-y-2">
        <div class="inline-flex p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
          <i class="w-5 h-5" data-lucide="check-circle-2"></i>
        </div>
        <h4 class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">Zero Open Issues on this Repository</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          The connected repository currently has no open bug reports or unresolved issues. You can use the <strong>Log &amp; Stacktrace Analyzer</strong> below to diagnose any real project log directly!
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  issues.forEach((issue) => {
    const card = document.createElement('div');
    const isTriaged = issue.status === 'remediation_ready';

    card.className = `p-4 rounded-xl border transition-all ${
      isTriaged
        ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20'
        : 'border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-900/40 hover:border-blue-300 dark:hover:border-blue-800'
    }`;

    const labelsHtml = (issue.labels || []).map(l => {
      let bg = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      if (l.includes('critical') || l.includes('fatal') || l.includes('bug')) bg = 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold';
      else if (l.includes('outage') || l.includes('timeout')) bg = 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';
      return `<span class="px-2 py-0.5 rounded text-[10px] uppercase font-mono ${bg}">${escapeHtml(l)}</span>`;
    }).join(' ');

    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">#${issue.number}</span>
          <span class="text-xs font-semibold text-slate-900 dark:text-white">${escapeHtml(issue.title)}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${labelsHtml}
        </div>
      </div>

      <div class="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 font-mono bg-white/70 dark:bg-slate-950/70 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
        ${escapeHtml(issue.body?.split('\n')[0] || 'No description body')}
      </div>

      <div class="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div class="flex items-center gap-3 text-[11px] text-slate-400">
          <span>Target: <strong class="text-slate-700 dark:text-slate-300">${issue.target_service || 'core'}</strong></span>
          <span>&bull;</span>
          <span>By: <strong>${escapeHtml(issue.author)}</strong></span>
        </div>

        <button class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/20" onclick="triageGitHubIssue(${issue.number})">
          <i class="w-3.5 h-3.5" data-lucide="bot"></i>
          <span>Triage Real Issue</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function renderRecentCommits(commits) {
  const container = document.getElementById('recent-commits-list');
  if (!container) return;
  container.innerHTML = '';

  if (!commits || commits.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-1">No recent commits loaded.</div>';
    return;
  }

  commits.slice(0, 3).forEach(c => {
    const item = document.createElement('div');
    item.className = 'py-2 flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800/60 last:border-0';
    item.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-mono text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">${escapeHtml(c.sha)}</span>
        <span class="text-slate-700 dark:text-slate-300 truncate">${escapeHtml(c.message)}</span>
      </div>
      <span class="text-[11px] text-slate-400 flex-shrink-0">${escapeHtml(c.date)}</span>
    `;
    container.appendChild(item);
  });
}

function openGitHubModal() {
  const modal = document.getElementById('github-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeGitHubModal() {
  const modal = document.getElementById('github-modal');
  if (modal) modal.classList.add('hidden');
}

function quickSelectRepo(repoName) {
  const input = document.getElementById('hero-repo-input');
  if (input) input.value = repoName;
  analyzeHeroRepo();
}

async function analyzeHeroRepo() {
  const input = document.getElementById('hero-repo-input');
  const btn = document.getElementById('btn-hero-analyze');
  const repo = input ? input.value.trim() : '';
  if (!repo) {
    alert('Please enter a GitHub repository URL or name');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="w-4 h-4 animate-spin" data-lucide="loader-2"></i> Inspecting Repo...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/v1/github/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    });
    const data = await res.json();
    logTerminal('info', `[REPO CONNECTED] GitHub API verified: ${data.repo}. Found ${data.issues?.length || 0} real issues.`);
    fetchIntegrationsStatus();
    fetchGitHubStatus();
    fetchGitHubIssues();

    const radar = document.getElementById('github-radar-section');
    if (radar) {
      radar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    logTerminal('error', `[ANALYZE ERROR] ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="w-4 h-4" data-lucide="search-check"></i> <span>Analyze &amp; Inspect Outages</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function connectGitHubRepo() {
  const repoInput = document.getElementById('github-repo-input');
  const tokenInput = document.getElementById('github-token-input');
  const btn = document.getElementById('btn-connect-repo');

  const repo = repoInput ? repoInput.value.trim() : '';
  const token = tokenInput ? tokenInput.value.trim() : '';

  if (!repo) {
    alert('Please enter a valid GitHub repository');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="w-4 h-4 animate-spin" data-lucide="loader-2"></i> Connecting...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/v1/github/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, token }),
    });
    const data = await res.json();
    closeGitHubModal();
    fetchIntegrationsStatus();
    fetchGitHubStatus();
    fetchGitHubIssues();
    logTerminal('info', `[GITHUB CONNECTED] Successfully authenticated to ${data.repo}`);
  } catch (err) {
    logTerminal('error', `[GITHUB ERROR] Failed to connect: ${err.message}`);
    alert(`Could not connect: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="w-4 h-4" data-lucide="git-merge"></i> Connect &amp; Sync Live Data`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function triageGitHubIssue(issueNumber) {
  dismissSuccessBanner();
  logTerminal('info', `[GITHUB SRE] Triaging Issue #${issueNumber} from connected repository...`);
  try {
    const res = await fetch(`/api/v1/github/triage/${issueNumber}`, { method: 'POST' });
    const data = await res.json();
    logTerminal('success', `[TRIAGE COMPLETE] Issue #${issueNumber} parsed. Root cause and unified diff ready.`);

    const card = document.getElementById('incident-card-container');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (err) {
    logTerminal('error', `[GITHUB TRIAGE ERROR] ${err.message}`);
  }
}

// --- Live Real Log Analyzer (Zero Fake Data) ---

async function submitRawLogAnalysis() {
  const textarea = document.getElementById('custom-log-input');
  const rawLog = textarea ? textarea.value.trim() : '';
  const btn = document.getElementById('btn-analyze-log');

  if (!rawLog) {
    alert('Please paste a real error log or traceback to analyze.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="w-4 h-4 animate-spin" data-lucide="loader-2"></i> Ingesting Real Log...`;
    if (window.lucide) lucide.createIcons();
  }

  logTerminal('warn', `[REAL LOG INGEST] Ingesting raw stacktrace (${rawLog.length} chars)...`);

  try {
    const res = await fetch('/api/v1/incidents/analyze-raw-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_log: rawLog }),
    });
    const data = await res.json();
    logTerminal('success', `[RCA READY] Extracted error: ${data.triage_result?.fingerprint?.error_class} on ${data.triage_result?.service_name}`);

    const card = document.getElementById('incident-card-container');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (err) {
    logTerminal('error', `[LOG INGEST ERROR] ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="w-4 h-4" data-lucide="search-code"></i> <span>Diagnose Real Log</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function loadSampleRealTrace(type) {
  const textarea = document.getElementById('custom-log-input');
  if (!textarea) return;

  if (type === 'assertion') {
    textarea.value = `Traceback (most recent call last):
  File "test_memops.py", line 88, in run_verification_suite
    assert novel_match is None, "Novel error should not match past database pool incident!"
AssertionError: Novel error should not match past database pool incident!`;
  } else if (type === 'db_pool') {
    textarea.value = `[2026-11-07 14:32:01] ERROR [order-service] [sqlalchemy.pool.impl.QueuePool] Exception during reset or checkout
Traceback (most recent call last):
  File "/app/services/order_service.py", line 84, in create_order
    with db_session() as session:
sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 0 reached, connection timed out, timeout 10.00
psycopg2.OperationalError: FATAL: remaining connection slots are reserved for non-replication superuser connections`;
  } else if (type === 'docker_oom') {
    textarea.value = `[2026-11-07 14:35:12] CRITICAL [dockerd] container 8a2f9b1c73e0 oom-kill event detected
Kernel: Task in /docker/8a2f9b1c73e0 killed as a result of limit of /docker/8a2f9b1c73e0
Memory threshold: 512MB exceeded. Total RSS: 536870912 bytes. Exit code: 137`;
  }
}

// --- Topology & Metrics APIs ---

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

    if (memCount) memCount.textContent = `${data.verified_solutions} Verified`;
    if (memSub) memSub.textContent = `${Math.round(data.average_confidence * 100)}% avg confidence`;
    if (mttrVal) mttrVal.textContent = `${data.estimated_mttr_saved_minutes} mins`;
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
    btn.innerHTML = `<i class="w-4 h-4 animate-spin" data-lucide="loader-2"></i> Deploying Patch &amp; Submitting to GitHub...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch(`/api/v1/incidents/${currentIncident.incident_id}/remediate`, {
      method: 'POST',
    });
    const data = await res.json();
    logTerminal('success', `[APPROVED] Hotfix applied. Health probes verified.`);
    logTerminal('info', `[GIT PUSH] Hotfix committed to branch memops/hotfix-${currentIncident.incident_id}. Pull Request ready for review.`);
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

  const pill = document.getElementById('incident-pill');
  if (pill) {
    pill.textContent = `${inc.service_name} Outage`;
    pill.className = inc.is_known_pattern
      ? 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
      : 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900';
  }

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

  const diffFile = document.getElementById('diff-file');
  const diffBox = document.getElementById('diff-content');
  if (diffFile) {
    diffFile.textContent = inc.proposed_remediation?.target_file || 'config/service.yaml';
  }
  if (diffBox) {
    const rawDiff = inc.proposed_remediation?.diff_patch || inc.proposed_remediation?.runbook_summary || '';
    diffBox.innerHTML = formatDiffToHtml(rawDiff);
  }

  const btnApprove = document.getElementById('btn-approve');
  if (btnApprove) {
    btnApprove.disabled = false;
    btnApprove.innerHTML = `<i class="w-4 h-4" data-lucide="git-merge"></i> Approve &amp; Deploy Hotfix (PR to GitHub)`;
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
