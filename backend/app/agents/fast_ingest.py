"""
Sub-second Log Ingestion and Fingerprinting Engine.
Uses Groq LPU inference when configured; falls back to fast deterministic token parser.
"""

import json
import logging
import re
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional

from app.config import settings
from app.models.schemas import IncidentFingerprint

logger = logging.getLogger("memops.ingest")


class FastIngestionEngine:
    def __init__(self):
        self.groq_key = settings.GROQ_API_KEY
        self.has_groq = bool(self.groq_key)

    async def extract_fingerprint(
        self,
        raw_log: str,
        service_name: Optional[str] = None,
        config_snapshot: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None,
    ) -> IncidentFingerprint:
        """
        Parses raw multi-line stack trace into a normalized IncidentFingerprint.
        """
        # 1. Try Groq fast extraction if available
        if self.has_groq:
            try:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=self.groq_key)
                prompt = f"""You are a high-speed SRE log ingestion parser. Extract the structured error signature from this log.
Respond ONLY with a valid JSON object matching:
{{
  "service_name": "{service_name or 'unknown'}",
  "error_class": "Name of top-level exception or error class",
  "root_exception": "Exact root cause exception line",
  "call_stack_hash": "Concise key trace frames separated by colons",
  "normalized_signature": "UPPERCASE_NORMALIZED_SIGNATURE"
}}

Raw log:
{raw_log[:2500]}
"""
                resp = await client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.0,
                    response_format={"type": "json_object"},
                    max_tokens=300,
                )
                data = json.loads(resp.choices[0].message.content)
                return IncidentFingerprint(
                    service_name=service_name or data.get("service_name", "unknown"),
                    error_class=data.get("error_class", "GenericError"),
                    root_exception=data.get("root_exception", "Unknown exception"),
                    call_stack_hash=data.get("call_stack_hash", "frame:trace"),
                    normalized_signature=data.get("normalized_signature", "UNCLASSIFIED_ERROR"),
                    config_snapshot=config_snapshot or {},
                    env_metrics=metrics or {},
                )
            except Exception as e:
                logger.warning(f"Groq extraction failed ({e}), falling back to deterministic parser.")

        # 2. Fast deterministic parser
        return self._deterministic_parse(raw_log, service_name, config_snapshot, metrics)

    def _deterministic_parse(
        self,
        raw_log: str,
        service_name: Optional[str],
        config_snapshot: Optional[Dict[str, Any]],
        metrics: Optional[Dict[str, Any]],
    ) -> IncidentFingerprint:
        # Detect service
        svc = service_name or "unknown-service"
        if "postgres" in raw_log.lower() or "connection slots" in raw_log.lower():
            svc = service_name or "postgres-db"
        elif "oom" in raw_log.lower() or "order-service" in raw_log.lower():
            svc = service_name or "order-service"
        elif "payment" in raw_log.lower() or "gateway timeout" in raw_log.lower():
            svc = service_name or "payment-service"

        # Detect error class
        error_class = "SystemFault"
        if "OperationalError" in raw_log:
            error_class = "OperationalError"
        elif "TimeoutError" in raw_log:
            error_class = "TimeoutError"
        elif "oom-kill" in raw_log.lower() or "status 137" in raw_log:
            error_class = "ContainerOOMKilled"
        elif "deadlock" in raw_log.lower():
            error_class = "LockContention"

        # Detect root exception line
        lines = [line.strip() for line in raw_log.splitlines() if line.strip()]
        root_exception = lines[-1] if lines else "Unknown system termination"
        for line in reversed(lines):
            if any(k in line for k in ["FATAL:", "Error:", "Exception:", "killed as a result", "TimeoutError:"]):
                root_exception = line
                break

        # Compute stack signature
        frames = re.findall(r'File "([^"]+)", line \d+, in (\w+)', raw_log)
        if frames:
            frame_keys = [f"{Path(f[0]).name}:{f[1]}" for f in frames[-3:]]
            call_stack_hash = ":".join(frame_keys)
        else:
            call_stack_hash = hashlib.md5(raw_log.encode()).hexdigest()[:12]

        # Normalized signature
        clean_sig = re.sub(r"[^a-zA-Z0-9]+", "_", root_exception.upper())[:40]
        normalized_signature = f"{svc.upper()}_{clean_sig}"

        return IncidentFingerprint(
            service_name=svc,
            error_class=error_class,
            root_exception=root_exception,
            call_stack_hash=call_stack_hash,
            normalized_signature=normalized_signature,
            config_snapshot=config_snapshot or {},
            env_metrics=metrics or {},
        )


fast_ingest = FastIngestionEngine()
