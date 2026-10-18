#!/usr/bin/env python3
"""
Vintage Vibes ERP — Official Python Google GenAI (Ustad) + Ollama (Shagird) Continuous Trainer
==============================================================================================
Uses:
  - `google-genai` (Official Google Gemini Python SDK)
  - `ollama` (Official Ollama Python SDK for Local RTX 3070 Ti GPU)

Responsibilities:
  1. Reads Ustad lessons from `data/ai_ustad_shagird_memory.json` and Owner rules from `data/ai_learned_memory.json`.
  2. Uses the official `google-genai` Python SDK (`genai.Client`) to synthesize new edge-case rules when requested.
  3. Compiles and updates the custom Local GPU Ollama model `vintage-shagird:latest` (built on top of `gemma3:4b`)
     so the local RTX 3070 Ti GPU permanently internalizes all Ustad garment sorting rules, Wash Tag OCR rules
     (MODEL NO., RN#, Fabric %, True Made-In vs P.O. Box HQ address), and Mr. Muhammad Akram's WhatsApp sales style.
"""

import os
import sys
import json
import subprocess
import argparse
from pathlib import Path
from datetime import datetime, timezone

# Loadofficial SDKs
try:
    from google import genai
    from google.genai import types as genai_types
    HAS_GOOGLE_GENAI_SDK = True
except ImportError:
    HAS_GOOGLE_GENAI_SDK = False

try:
    import ollama
    HAS_OLLAMA_SDK = True
except ImportError:
    HAS_OLLAMA_SDK = False


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
USTAD_MEMORY_FILE = DATA_DIR / "ai_ustad_shagird_memory.json"
OWNER_MEMORY_FILE = DATA_DIR / "ai_learned_memory.json"
MODELFILE_PATH = DATA_DIR / "Modelfile.vintage-shagird"
TRAINING_STATUS_FILE = DATA_DIR / "shagird_training_status.json"
CUSTOM_SHAGIRD_MODEL = "vintage-shagird:latest"
BASE_VISION_MODEL = "gemma3:4b"


def get_gemini_api_key() -> str:
    env_File = ROOT_DIR / ".env"
    if env_File.exists():
        try:
            for line in env_File.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line.startswith("GEMINI_API_KEY=") or line.startswith("VITE_GEMINI_API_KEY="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if val and len(val) > 15:
                        return val
        except Exception:
            pass
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("VITE_GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or "AIzaSyCzWxl7nnc0L1rdUnqwWdIGT27hjQNmOPg"
    ).strip()


def load_json_safe(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return default


def build_shagird_system_prompt(ustad_mem: dict, owner_mem) -> str:
    appraisals = ustad_mem.get("garmentAppraisals", []) if isinstance(ustad_mem, dict) else []
    wa_replies = ustad_mem.get("whatsappReplies", []) if isinstance(ustad_mem, dict) else []

    owner_items = []
    if isinstance(owner_mem, list):
        owner_items = owner_mem
    elif isinstance(owner_mem, dict) and isinstance(owner_mem.get("items"), list):
        owner_items = owner_mem["items"]

    lines = [
        "You are VINTAGE-SHAGIRD, the official Local RTX 3070 Ti Vision & Sales AI for Vintage Vibes (Dubai, UAE), continuously trained by Google Gemini Ustad and Company Owner Mr. Muhammad Akram.",
        "",
        "=== CORE GARMENT SORTING & 6-SLOT STUDIO RULES (LEARNED FROM GEMINI USTAD) ===",
        "1. 6 STUDIO SLOTS: 1.Front Look (full front garment, collar curves down), 2.Back Look (full back garment, high collar), 3.Main Neck Tag (collar brand/size label), 4.Wash/Care Label (inner white/black satin care strip with fabric %, RN#, MODEL NO., Made in), 5.Length Tape (vertical tailor tape top-to-bottom), 6.Width Tape (horizontal tailor tape armpit-to-armpit).",
        "2. CRITICAL WASH TAG vs TAPE RULE: Never confuse a white vertical wash tag close-up with a measuring tape. Wash tags have printed text paragraphs ('MODEL NO.', 'RN#', '100% Cotton', 'Made in...'). Measuring tapes have ruler inch/cm tick marks stretched across a full shirt.",
        "3. CRITICAL ORIGIN ('MADE IN') RULE: Always distinguish between Corporate Headquarters Address (e.g. 'Carhartt Inc., P.O. Box 600, Dearborn, MI 48121 USA') and the actual manufacturing country ('Made in Honduras', 'Made in Mexico', 'Made in Pakistan', 'Made in Nicaragua'). NEVER output 'USA' if 'USA' only appears in a P.O. Box or city/state zip code!",
        "4. WASH TAG DESCRIPTION DETAILS: Extract MODEL NO. (e.g., TK6532-M), RN# (e.g., RN#14806), and Fabric Composition (e.g., 100% Cotton) and include them in the garment description.",
    ]

    if appraisals:
        lines.append("")
        lines.append("=== RECENT GARMENT APPRAISAL LESSONS TAUGHT BY GEMINI USTAD ===")
        for idx, a in enumerate(appraisals[:15], start=1):
            brand = a.get("brand", "")
            size = a.get("size", "")
            origin = a.get("countryOfOrigin", "")
            model_no = a.get("modelNumber", "")
            rn_no = a.get("rnNumber", "")
            fabric = a.get("fabricComposition", "")
            title = a.get("garmentTitle", "")
            extra = ", ".join(filter(None, [
                f"Model={model_no}" if model_no else "",
                f"RN={rn_no}" if rn_no else "",
                f"Fabric={fabric}" if fabric else "",
            ]))
            lines.append(
                f"- Lesson #{idx}: Brand='{brand}', Size='{size}', MadeIn='{origin}'"
                + (f" ({extra})" if extra else "")
                + f" -> Title='{title}'"
            )

    if owner_items:
        lines.append("")
        lines.append("=== MANDATORY OWNER & CREATOR RULES (MR. MUHAMMAD AKRAM) ===")
        for idx, item in enumerate(owner_items[:20], start=1):
            content = item.get("content", "") if isinstance(item, dict) else str(item)
            if content:
                lines.append(f"{idx}. {content}")

    if wa_replies:
        lines.append("")
        lines.append("=== WHATSAPP SALESMAN REPLIES TAUGHT BY GEMINI USTAD ===")
        for idx, w in enumerate(wa_replies[:12], start=1):
            lang = w.get("customerLang", "ENGLISH")
            q = w.get("customerMessage", "")
            ans = w.get("ustadReplyText", "")
            act = w.get("action", "NONE")
            lines.append(f"- Example #{idx} [{lang}]: Customer='{q}' -> Reply='{ans}' (Action={act})")

    return "\n".join(lines)


def verify_gemini_python_sdk(prompt_text: str = "Reply in one short line: Gemini Python SDK Ustad is active.") -> dict:
    """Uses the official `google-genai` Python SDK to run a fast check or distillation."""
    if not HAS_GOOGLE_GENAI_SDK:
        return {"ok": False, "error": "google-genai Python package not installed"}

    api_key = get_gemini_api_key()
    client = genai.Client(api_key=api_key)
    models = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.8-flash",
    ]
    for model_name in models:
        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=prompt_text,
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=512,
                ),
            )
            text = (resp.text or "").strip()
            if text:
                return {"ok": True, "model": model_name, "text": text}
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "404" in err_str:
                continue
            continue
    return {"ok": False, "error": "All candidate models busy or rate-limited"}


def sync_ollama_shagird_model() -> dict:
    """Compiles Modelfile.vintage-shagird and updates `vintage-shagird:latest` in Local Ollama."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ustad_mem = load_json_safe(USTAD_MEMORY_FILE, {})
    owner_mem = load_json_safe(OWNER_MEMORY_FILE, [])

    system_prompt = build_shagird_system_prompt(ustad_mem, owner_mem)
    escaped_system = system_prompt.replace('"""', "'''")

    modelfile_content = (
        f"FROM {BASE_VISION_MODEL}\n"
        f"PARAMETER temperature 0.1\n"
        f"PARAMETER num_ctx 4096\n"
        f'SYSTEM """\n{escaped_system}\n"""\n'
    )
    MODELFILE_PATH.write_text(modelfile_content, encoding="utf-8")

    created_ok = False
    method_used = "none"
    error_msg = ""

    # Method 1: Official Ollama Python SDK
    if HAS_OLLAMA_SDK:
        try:
            client = ollama.Client(host="http://127.0.0.1:11434")
            client.create(
                model=CUSTOM_SHAGIRD_MODEL,
                from_=BASE_VISION_MODEL,
                system=system_prompt,
                parameters={"temperature": 0.1, "num_ctx": 4096},
            )
            created_ok = True
            method_used = "ollama-python-sdk"
        except Exception as e:
            error_msg = str(e)

    # Method 2: Ollama CLI fallback using Modelfile.vintage-shagird
    if not created_ok:
        try:
            proc = subprocess.run(
                ["ollama", "create", CUSTOM_SHAGIRD_MODEL, "-f", str(MODELFILE_PATH)],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if proc.returncode == 0:
                created_ok = True
                method_used = "ollama-cli-modelfile"
            else:
                error_msg = (proc.stderr or proc.stdout or "").strip()
        except Exception as e:
            error_msg = str(e)

    status = {
        "ok": created_ok,
        "customModel": CUSTOM_SHAGIRD_MODEL,
        "baseModel": BASE_VISION_MODEL,
        "methodUsed": method_used,
        "googleGenAiPythonSdkInstalled": HAS_GOOGLE_GENAI_SDK,
        "ollamaPythonSdkInstalled": HAS_OLLAMA_SDK,
        "totalGarmentLessons": len(ustad_mem.get("garmentAppraisals", [])) if isinstance(ustad_mem, dict) else 0,
        "totalWhatsappLessons": len(ustad_mem.get("whatsappReplies", [])) if isinstance(ustad_mem, dict) else 0,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "error": error_msg if not created_ok else None,
    }
    TRAINING_STATUS_FILE.write_text(json.dumps(status, indent=2), encoding="utf-8")
    return status


def main():
    parser = argparse.ArgumentParser(description="Ustad (Google GenAI SDK) + Shagird (Ollama SDK) Trainer")
    parser.add_argument("--sync-modelfile", action="store_true", help="Rebuild vintage-shagird:latest in Ollama")
    parser.add_argument("--test-gemini", action="store_true", help="Test official google-genai Python SDK")
    args = parser.parse_args()

    result = {}
    if args.test_gemini:
        result["geminiPythonSdk"] = verify_gemini_python_sdk()

    if args.sync_modelfile or not args.test_gemini:
        result["shagirdModelSync"] = sync_ollama_shagird_model()

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
