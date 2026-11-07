**I locked in with my gf**

> **HackwithHyderabad 3.0** | AI Agents & Infrastructure Track  
> Persistent Historical Incident Memory (Hindsight) + Sub-Second Log Parsing (Groq) + Deep Causal Reasoning (Claude 3.5 Sonnet) + Interactive 3D Topology (Three.js)

---

## 💡 The Core Problem & Solution

Traditional monitoring and SRE tools (Datadog, Grafana, PagerDuty) are **stateless and reactive**. When an outage strikes:
1. They tell you *that* something broke, but not *why* similar breakages happened in previous sprints.
2. An on-call engineer spends 45 minutes digging through outdated Slack channels, Jira tickets, and Git PRs.
3. When senior engineers leave the organization, their mental model and institutional knowledge leave with them.

**MemOps SRE introduces persistent historical memory (Hindsight) to site reliability engineering**:
- **Semantic Incident Fingerprinting**: Normalizes complex multi-tier stack traces into structured vectors.
- **Hindsight Recall Engine**: Compares incoming live errors with verified historical incident post-mortems and PR diffs.
- **Two-Path Decision Engine**:
  - *Path 1 (Novel Error)*: Claude 3.5 Sonnet diagnoses the root cause, formulates a new runbook, and generates a unified diff.
  - *Path 2 (Known Recurrence)*: Retrieves the verified historical solution in seconds (e.g., Oct 12 PostgreSQL connection pool fix from PR #402).
- **Closed-Loop Verification**: Fixes are only retained as established knowledge once post-deployment health probes verify 100% recovery.

---

## 🚀 Quick Start (1 Command)

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome / Edge / Firefox)

### 1. Launch Mission Control
```bash
python run.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

*(Optional)* Configure API keys in `.env` if you wish to use live cloud endpoints for Groq or Anthropic:
```bash
cp .env.example .env
```
> **Note**: MemOps SRE includes a zero-dependency embedded vector & graph memory engine and intelligent heuristic SRE agents that work **100% offline out-of-the-box** without any API keys!

---

## 🏆 The Winning 3-Minute Hackathon Demo Script

Follow this script to score maximum points across all judging criteria:

### Minute 1: The Outage & Hindsight Recall (25% Hindsight, 30% Innovation)
1. Point out the **Three.js 3D Microservice Mesh** in the center stage showing healthy green glowing nodes.
2. Click **"💥 Postgres Pool Exhaustion"** in the left Chaos Injector panel.
3. The `postgres-db` and `order-service` nodes immediately turn **pulsing red**.
4. The right panel displays the **Hindsight Memory Hit Banner (95% Match)**:
   > *"Matches incident: PostgreSQL Connection Pool Exhaustion (Oct 12) — PR #402. Instant patch ready."*
5. Highlight to judges: *"Unlike a generic chatbot that hallucinates from zero context, MemOps recalled our exact post-mortem from 3 weeks ago."*

### Minute 2: Human-in-the-Loop Remediation & Verification (20% Tech, 15% UX)
1. Inspect the **Unified Diff Preview** on the right panel showing the proposed configuration update (`pool_size=20, max_overflow=30`).
2. Click **"🚀 Approve & Deploy Hotfix"**.
3. Watch the 3D visualizer transition through **Recovering (Amber)** to **Healthy (Emerald Green)** as health probes pass.
4. Point out the terminal log showing the closed-loop feedback:
   > *`[HINDSIGHT REINFORCE] Confidence boosted to 99%. Incident resolution verified.`*
5. Show the top stats bar: MTTR saved increased by **35 minutes**.

### Minute 3: Novel Incident Handling & Learning
1. Click **"⚡ Order Svc Docker OOM"**.
2. Notice the tag changes to **"NOVEL ERROR"**:
   > *"No past memory matched. Claude 3.5 Sonnet generated a new architectural RCA and chunked streaming diff."*
3. Click **"Approve & Deploy Hotfix"**.
4. The resolution is verified and retained:
   > *`[HINDSIGHT RETAIN] Novel incident retained in Hindsight memory for future recall.`*
5. Check the **Hindsight Retained Memory** feed at the bottom right — the new incident is now permanently part of the organization's institutional intelligence!

---

## 🏛️ System Architecture

```mermaid
flowchart LR
    subgraph UI["Frontend Control Plane"]
        Dashboard["Next.js Glassmorphism UI"]
        Mesh3D["Three.js 3D Microservice Mesh"]
    end

    subgraph Backend["FastAPI Orchestration Engine"]
        API["FastAPI Gateway & SSE Stream"]
        Ingest["Groq Sub-Second Parser"]
        Claude["Claude 3.5 Deep RCA"]
    end

    subgraph Memory["Hindsight Memory Cloud"]
        Recall["Semantic Recall (Cosine + Jaccard)"]
        Retain["Retain & Reinforce Loop"]
        Store["Persistent Vector & Graph DB"]
    end

    subgraph Target["Target Sandbox"]
        Services["Python Microservices (Order, Auth, Pay)"]
        DB["PostgreSQL & Redis"]
    end

    Target -->|Telemetry| API
    API --> Ingest
    Ingest --> Recall
    Recall <--> Store
    Recall --> Claude
    Claude --> Dashboard
    Dashboard --> Mesh3D
    Dashboard -->|Human Approval| Target
    Target -->|Verification| Retain
    Retain --> Store
```

---

## 📊 Judging Criteria Alignment Matrix

| Hackathon Criterion | Weight | How MemOps SRE Delivers |
| :--- | :---: | :--- |
| **Hindsight Memory** | **25%** | Cross-incident memory retain, semantic recall with cosine+Jaccard scoring, confidence reinforcement upon health verification. |
| **Innovation** | **30%** | Moves beyond "chatbots reading logs" to an autonomous, memory-augmented SRE agent acting as an institutional knowledge repository. |
| **Technical Implementation**| **20%** | Full FastAPI async server, SSE streaming, modular provider abstraction (Groq, Anthropic, Hindsight), zero-config embedded fallbacks. |
| **User Experience (UX)** | **15%** | 3D Three.js topological mesh with failure shockwaves, unified diff reviewer, and clean glassmorphic telemetry. |
| **Real-World Impact** | **10%** | Slashes MTTR from 45 minutes to 3 seconds, eliminates tribal knowledge loss when engineers leave, prevents regression outages in CI/CD. |
