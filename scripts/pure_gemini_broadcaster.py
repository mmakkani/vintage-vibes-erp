import os
import sys
import json
import time
import glob
import socket
import shutil
import hashlib
import base64
import argparse
import threading
import subprocess
from io import BytesIO
from types import SimpleNamespace

os.environ["PATH"] = r"C:\vintage-vibe\node_modules\ffmpeg-static;" + os.environ.get("PATH", "")

import cv2
import numpy as np
import soundfile as sf
import resampy
from PIL import Image, ImageDraw, ImageFont

FFMPEG = r"C:\vintage-vibe\node_modules\ffmpeg-static\ffmpeg.exe"
EDGE_TTS_CANDIDATES = [
    r"C:\vintage-vibe\livetalking\venv\Scripts\edge-tts.exe",
    r"C:\vintage-vibe\.venv\Scripts\edge-tts.exe",
    r"C:\vintage-vibe\seedvc\venv\Scripts\edge-tts.exe",
]
EDGE_TTS_EXE = next((p for p in EDGE_TTS_CANDIDATES if os.path.exists(p)), "")
REPO_DIR = r"C:\vintage-vibe\seedvc\repo"
TARGET_WAV = r"C:\vintage-vibe\voiceclone\host_master_clean.wav"
CLIPS_DIR = r"C:\vintage-vibe\public\assets\models\pure_gemini_clips"
CACHE_DIR = r"C:\vintage-vibe\seedvc\piece_cache_9x16_v6_zerogil"
CUSTOM_HOST_IMG = r"C:\vintage-vibe\public\assets\models\custom_ai_host.png"
DEFAULT_HOST_IMG = r"C:\vintage-vibe\public\assets\models\vintage_vibes_master_host.png"
SEAL_IMG_PATH = r"C:\vintage-vibe\public\app-icon.png"
BG_PORTRAIT = r"C:\vintage-vibe\livetalking\host_8k_1080p.jpg"
GOOGLE_VOICE_B = "voice_b2xkxmftw8ss"

# TRUE 9:16 VERTICAL HD PORTRAIT (720 x 1280 @ 24fps)
W, H, FPS, SR = 720, 1280, 24, 44100
BANNER_H = 50
ABOVE_NORMAL_PRIORITY_CLASS = 0x00008000
BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
os.makedirs(CACHE_DIR, exist_ok=True)


def set_own_priority(prio_flag: int):
    try:
        import ctypes
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), prio_flag)
    except Exception:
        pass


def load_font(sz, bold=False):
    paths = [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"] if bold else [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


FONT_XL = load_font(38, True)
FONT_LG = load_font(24, True)
FONT_MD = load_font(19, False)
FONT_SM = load_font(15, True)
FONT_BANNER = load_font(15, True)
FONT_BANNER_SM = load_font(12, True)


def load_seal_thumb():
    if os.path.exists(SEAL_IMG_PATH):
        try:
            return Image.open(SEAL_IMG_PATH).convert("RGB").resize((32, 32), Image.Resampling.LANCZOS)
        except Exception:
            pass
    return None


SEAL_THUMB = load_seal_thumb()


def draw_thrift_store_top_banner(pil_im: Image.Image):
    dr = ImageDraw.Draw(pil_im)
    dr.rectangle([0, 0, W, BANNER_H], fill=(6, 78, 59))
    dr.rectangle([0, BANNER_H - 2, W, BANNER_H], fill=(251, 191, 36))
    x_cur = 10
    if SEAL_THUMB is not None:
        pil_im.paste(SEAL_THUMB, (x_cur, 9))
        x_cur += 38
    dr.rounded_rectangle([x_cur, 11, x_cur + 80, 38], radius=7, fill=(220, 38, 38))
    dr.text((x_cur + 9, 16), "● AI LIVE", fill=(255, 255, 255), font=FONT_BANNER_SM)
    x_cur += 88
    dr.rounded_rectangle([x_cur, 8, W - 10, 41], radius=8, fill=(251, 191, 36), outline=(255, 255, 255), width=1)
    dr.text((x_cur + 16, 14), "100% USED & PRE-LOVED THRIFT STORE • NOT NEW", fill=(9, 10, 15), font=FONT_BANNER)


_banner_pil = Image.new("RGB", (W, BANNER_H), (6, 78, 59))
draw_thrift_store_top_banner(_banner_pil)
BANNER_STRIP_BGR = cv2.cvtColor(np.array(_banner_pil), cv2.COLOR_RGB2BGR)
BANNER_STRIP_RGB = np.array(_banner_pil)


def exact_samples_for_frames(n_frames):
    return (n_frames // 2) * 3675 + (n_frames % 2) * 1837


def load_host_pil():
    for p in (CUSTOM_HOST_IMG, DEFAULT_HOST_IMG, BG_PORTRAIT):
        if os.path.exists(p):
            try:
                return Image.open(p).convert("RGB")
            except Exception:
                pass
    return Image.new("RGB", (720, 1280), (24, 22, 28))


def fit_frame_into_9x16_bgr(bgr_img, add_banner=True):
    ih, iw = bgr_img.shape[:2]
    if iw == W and ih == H:
        out = bgr_img.copy() if add_banner else bgr_img
        if add_banner:
            out[0:BANNER_H, 0:W] = BANNER_STRIP_BGR
        return out
    top_off = BANNER_H if add_banner else 0
    usable_h = H - top_off
    sc = max(W / float(iw), usable_h / float(ih))
    nw, nh = max(W, int(round(iw * sc))), max(usable_h, int(round(ih * sc)))
    rz = cv2.resize(bgr_img, (nw, nh), interpolation=cv2.INTER_AREA if sc < 1.0 else cv2.INTER_LINEAR)
    sx = (nw - W) // 2
    sy = max(0, (nh - usable_h) // 3)
    cropped = rz[sy : sy + usable_h, sx : sx + W]
    if add_banner:
        out = np.empty((H, W, 3), dtype=np.uint8)
        out[0:BANNER_H, :] = BANNER_STRIP_BGR
        out[BANNER_H:H, :] = cropped
        return out
    return cropped


def extract_pcm_int16(mp4_path: str) -> np.ndarray:
    tmp_wav = mp4_path + f".{os.getpid()}.tmp44k.wav"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", mp4_path, "-vn", "-ar", str(SR), "-ac", "1", tmp_wav], check=True)
    aud, sr = sf.read(tmp_wav, dtype="float32")
    try:
        os.remove(tmp_wav)
    except OSError:
        pass
    if aud.ndim > 1:
        aud = aud.mean(axis=1)
    if sr != SR:
        aud = resampy.resample(aud, sr, SR)
    return np.clip(aud * 32767.0, -32768, 32767).astype(np.int16)


def decode_short_host_clip(mp4_path: str):
    """Only used once for the short 10s host clip (~650 MB max) + raw RGB for builder."""
    pcm = extract_pcm_int16(mp4_path)
    cap = cv2.VideoCapture(mp4_path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    raw_bgr, raw_rgb = [], []
    while True:
        ok, img = cap.read()
        if not ok or img is None:
            break
        clean = fit_frame_into_9x16_bgr(img, add_banner=False)
        raw_rgb.append(cv2.cvtColor(clean, cv2.COLOR_BGR2RGB))
        with_b = clean.copy()
        with_b[0:BANNER_H, :] = BANNER_STRIP_BGR
        raw_bgr.append(with_b)
    cap.release()
    n_target = max(1, int(round((len(pcm) / float(SR)) * FPS)))
    frames = [raw_bgr[min(len(raw_bgr) - 1, int(round((i / float(FPS)) * src_fps)))] for i in range(n_target)]
    req_s = exact_samples_for_frames(n_target)
    pcm = np.pad(pcm, (0, req_s - len(pcm))) if len(pcm) < req_s else pcm[:req_s]
    return (frames, pcm), raw_rgb


def stream_mp4_from_disk_gen(mp4_path: str, pcm_path: str):
    """Zero-RAM on-the-fly frame generator (~3 MB memory instead of 1,200 MB per piece!)."""
    pcm = np.fromfile(pcm_path, dtype=np.int16)
    n_frames = max(1, int(round((len(pcm) / float(SR)) * FPS)))
    cap = cv2.VideoCapture(mp4_path)
    last_good = None
    aud_pos = 0
    try:
        for i in range(n_frames):
            ok, fr = cap.read()
            if ok and fr is not None:
                if fr.shape[1] != W or fr.shape[0] != H:
                    fr = cv2.resize(fr, (W, H), interpolation=cv2.INTER_LINEAR)
                last_good = fr
            elif last_good is not None:
                fr = last_good
            else:
                break
            ns = 1838 if (i % 2 == 1) else 1837
            ch = pcm[aud_pos : aud_pos + ns]
            if len(ch) < ns:
                ch = np.pad(ch, (0, ns - len(ch)))
            aud_pos += ns
            yield fr, ch
    finally:
        cap.release()


# ==============================================================================
# ISOLATED LOW-PRIORITY BUILDER PROCESS (--build-worker) — ZERO GIL IMPACT ON STREAM!
# ==============================================================================
def run_isolated_build_worker(booth: str):
    set_own_priority(BELOW_NORMAL_PRIORITY_CLASS)
    sys.path.insert(0, REPO_DIR)
    os.chdir(REPO_DIR)
    import requests
    import torchaudio

    torchaudio.save = lambda fp, t, sr, **kw: sf.write(
        fp, np.squeeze(t.detach().cpu().float().numpy()), int(sr)
    )
    import inference as inf_v1

    def fetch_img(url_or_path):
        if not url_or_path:
            return None
        u = str(url_or_path).strip()
        try:
            if u.startswith("/"):
                lp = os.path.join(r"C:\vintage-vibe\public", u.lstrip("/").replace("/", os.sep))
                if os.path.exists(lp):
                    return Image.open(lp).convert("RGB")
                u = f"http://127.0.0.1:3000{u}"
            if u.startswith("http"):
                r = requests.get(u, timeout=8)
                if r.status_code == 200 and len(r.content) > 500:
                    return Image.open(BytesIO(r.content)).convert("RGB")
        except Exception:
            pass
        return None

    def gen_tts(script_text, out_wav):
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if api_key:
            try:
                r = requests.post(
                    "https://generativelanguage.googleapis.com/v1beta/interactions",
                    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                    json={
                        "model": "gemini-3.8-flash-tts",
                        "input": [{"type": "user_input", "content": [{"type": "text", "text": script_text, "annotations": [{"type": "speech_metadata", "style": "energetic friendly Filipina live boutique seller"}]}]}],
                        "response_format": {"type": "audio"},
                        "generation_config": {"speech_config": [{"voice": GOOGLE_VOICE_B}]},
                    },
                    timeout=25,
                )
                if r.status_code == 200:
                    for st in r.json().get("steps", []):
                        if st.get("type") == "model_output":
                            for c in st.get("content", []):
                                if c.get("type") == "audio" and c.get("data"):
                                    open(out_wav, "wb").write(base64.b64decode(c["data"]))
                                    if os.path.getsize(out_wav) > 2000:
                                        return out_wav
            except Exception:
                pass
        tmp_mp3 = out_wav + ".mp3"
        tts_cmd = [EDGE_TTS_EXE, "--voice", "fil-PH-BlessicaNeural", "--rate=+6%", "--text", script_text, "--write-media", tmp_mp3] if EDGE_TTS_EXE else [sys.executable, "-m", "edge_tts", "--voice", "fil-PH-BlessicaNeural", "--rate=+6%", "--text", script_text, "--write-media", tmp_mp3]
        subprocess.run(tts_cmd, check=True)
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", tmp_mp3, "-ar", "24000", "-ac", "1", out_wav], check=True)
        try:
            os.remove(tmp_mp3)
        except OSError:
            pass
        return out_wav

    cfiles = sorted(glob.glob(os.path.join(CLIPS_DIR, "*.mp4")))
    anim_rgb = []
    if cfiles:
        _, anim_rgb = decode_short_host_clip(cfiles[0])
    if anim_rgb:
        anim_rgb = anim_rgb + anim_rgb[-2:0:-1]
    else:
        anim_rgb = [np.array(load_host_pil().resize((W, H), Image.Resampling.LANCZOS))]

    pip_w, pip_h = 154, 256
    anim_pip_pil = []
    for fr in anim_rgb:
        ih, iw = fr.shape[:2]
        sc = max(pip_w / float(iw), pip_h / float(ih))
        nw, nh = max(pip_w, int(round(iw * sc))), max(pip_h, int(round(ih * sc)))
        rz = cv2.resize(fr, (nw, nh), interpolation=cv2.INTER_AREA)
        sx, sy = (nw - pip_w) // 2, max(0, (nh - pip_h) // 5)
        anim_pip_pil.append(Image.fromarray(rz[sy : sy + pip_h, sx : sx + pip_w]))

    host_pil = load_host_pil()
    bgr_bg = cv2.GaussianBlur(cv2.resize(cv2.cvtColor(np.array(host_pil), cv2.COLOR_RGB2BGR), (W, H)), (45, 45), 0)
    bg_blur = Image.fromarray(cv2.cvtColor((bgr_bg.astype(np.float32) * 0.30).astype(np.uint8), cv2.COLOR_BGR2RGB))

    init_args = SimpleNamespace(f0_condition=True, auto_f0_adjust=True, semi_tone_shift=0, checkpoint=None, config=None, fp16=True)
    models_tuple = inf_v1.load_models(init_args)
    inf_v1.load_models = lambda _a: models_tuple

    state_file = rf"C:\vintage-vibe\seedvc\active_piece_{booth}.json"
    ready_file = rf"C:\vintage-vibe\seedvc\ready_piece_{booth}.json"
    last_sig = ""

    while True:
        try:
            if os.path.exists(state_file):
                pc = json.load(open(state_file, "r", encoding="utf-8"))
                sku = str(pc.get("sku") or "ITEM").strip()
                price = int(pc.get("priceAed") or 35)
                title = str(pc.get("title") or "Vintage Piece").strip()
                size = str(pc.get("size") or "").strip()
                p2p = str(pc.get("pitToPitInches") or pc.get("pitToPit") or "").strip()
                ln = str(pc.get("lengthInches") or pc.get("length") or "").strip()

                sig = hashlib.md5(f"v6_zerogil|{sku}|{price}|{title}|{size}".encode("utf-8")).hexdigest()[:12]
                if sig != last_sig:
                    cached_mp4 = os.path.join(CACHE_DIR, f"piece_{sig}.mp4")
                    cached_pcm = os.path.join(CACHE_DIR, f"piece_{sig}.pcm")
                    if not (os.path.exists(cached_mp4) and os.path.exists(cached_pcm)):
                        mp = [x for x in [f"size {size}" if size else "", f"chest {p2p} inches" if p2p else "", f"length {ln} inches" if ln else ""] if x]
                        meas = ", ".join(mp) if mp else "super clean vintage fit"
                        script = f"Check out this gorgeous pre-loved thrift piece guys, {title}, {meas}! Look at the front, back, and authentic collar tag on screen! Steal price only {price} Dirhams! Comment MINE {price} or tap Claim right now mga sis!"
                        work = os.path.join(CACHE_DIR, f"_tmp_{sig}")
                        os.makedirs(work, exist_ok=True)
                        tts_wav = os.path.join(work, "tts.wav")
                        gen_tts(script, tts_wav)

                        inf_v1.main(SimpleNamespace(source=tts_wav, target=TARGET_WAV, output=work, diffusion_steps=28, length_adjust=1.0, inference_cfg_rate=0.75, f0_condition=True, auto_f0_adjust=True, semi_tone_shift=0, checkpoint=None, config=None, fp16=True))
                        vc_wav = [os.path.join(work, f) for f in os.listdir(work) if f.startswith("vc_") and f.endswith(".wav")][0]
                        norm_wav = os.path.join(work, "norm.wav")
                        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", vc_wav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "-ac", "1", norm_wav], check=True)
                        aud, _ = sf.read(norm_wav, dtype="float32")
                        n_frames = max(48, int(round((len(aud) / float(SR)) * FPS)))
                        req_s = exact_samples_for_frames(n_frames)
                        aud_pad = np.pad(aud, (0, req_s - len(aud))) if len(aud) < req_s else aud[:req_s]
                        pcm_i16 = np.clip(aud_pad * 32767.0, -32768, 32767).astype(np.int16)

                        f_im = fetch_img(pc.get("frontImageUrl"))
                        b_im = fetch_img(pc.get("backImageUrl")) or f_im
                        t_im = fetch_img(pc.get("tagImageUrl")) or f_im
                        views = [(f_im, "FRONT VIEW"), (b_im, "BACK VIEW"), (t_im, "BRAND TAG & DETAILS")]

                        intro_frames = min(int(3.8 * FPS), n_frames // 3)
                        showcase_frames = max(1, n_frames - intro_frames)
                        sp_txt = "  |  ".join([x for x in [f"SIZE: {size}" if size else "", f"CHEST: {p2p}\"" if p2p else "", f"LEN: {ln}\"" if ln else ""] if x]) or "1-OF-1 AUTHENTIC THRIFT"
                        n_anim = len(anim_rgb)

                        tmp_mp4 = cached_mp4 + ".tmp.mp4"
                        p = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", tmp_mp4], stdin=subprocess.PIPE)
                        for idx in range(n_frames):
                            if idx < intro_frames:
                                fr_rgb = anim_rgb[idx % n_anim].copy()
                                fr_rgb[0:BANNER_H, :] = BANNER_STRIP_RGB
                                cv_im = Image.fromarray(fr_rgb)
                                dr = ImageDraw.Draw(cv_im)
                                dr.rounded_rectangle([24, 976, W - 24, 1184], radius=20, fill=(14, 13, 18), outline=(212, 175, 55), width=2)
                                dr.text((44, 994), f"ON AIR NOW  •  SKU: {sku}", fill=(243, 213, 118), font=FONT_SM)
                                dr.text((44, 1020), title[:34], fill=(255, 255, 255), font=FONT_LG)
                                dr.text((44, 1058), sp_txt, fill=(214, 211, 209), font=FONT_MD)
                                dr.text((44, 1096), f"ONLY AED {price}", fill=(74, 222, 128), font=FONT_XL)
                                dr.text((332, 1108), "Tap CLAIM or type MINE!", fill=(243, 213, 118), font=FONT_MD)
                            else:
                                s_idx = idx - intro_frames
                                st = min(2, int((s_idx / float(showcase_frames)) * 3))
                                gim, lbl = views[st]
                                zoom = 1.0 + 0.06 * min(1.0, max(0.0, ((s_idx / float(showcase_frames)) * 3.0) - st))
                                cv_im = bg_blur.copy()
                                cv_im.paste(Image.fromarray(BANNER_STRIP_RGB), (0, 0))
                                dr = ImageDraw.Draw(cv_im)
                                dr.rounded_rectangle([24, 64, W - 24, 152], radius=18, fill=(18, 17, 22), outline=(212, 175, 55), width=2)
                                dr.text((44, 76), f"PRE-LOVED 1-OF-1  •  SKU: {sku}  •  {lbl}", fill=(243, 213, 118), font=FONT_SM)
                                dr.text((44, 104), title[:34], fill=(255, 255, 255), font=FONT_LG)
                                cbox = [24, 164, W - 24, 962]
                                dr.rounded_rectangle(cbox, radius=22, fill=(24, 23, 29), outline=(212, 175, 55), width=2)
                                if gim is not None:
                                    cw, ch = cbox[2] - cbox[0] - 16, cbox[3] - cbox[1] - 16
                                    sc = min(cw / float(gim.size[0]), ch / float(gim.size[1])) * zoom
                                    nw_i, nh_i = max(1, int(gim.size[0] * sc)), max(1, int(gim.size[1] * sc))
                                    rz = gim.resize((nw_i, nh_i), Image.Resampling.LANCZOS)
                                    pad_im = Image.new("RGB", (cw, ch), (20, 19, 25))
                                    pad_im.paste(rz, ((cw - nw_i) // 2, (ch - nh_i) // 2))
                                    cv_im.paste(pad_im, (cbox[0] + 8, cbox[1] + 8))
                                px, py = W - 24 - pip_w - 14, 962 - pip_h - 14
                                dr.rounded_rectangle([px - 3, py - 3, px + pip_w + 3, py + pip_h + 3], radius=14, fill=(14, 13, 18), outline=(212, 175, 55), width=2)
                                cv_im.paste(anim_pip_pil[idx % n_anim], (px, py))
                                dr.rounded_rectangle([24, 976, W - 24, 1184], radius=20, fill=(18, 17, 22), outline=(74, 222, 128), width=3)
                                dr.text((44, 992), sp_txt, fill=(214, 211, 209), font=FONT_MD)
                                dr.text((44, 1028), f"ONLY AED {price}", fill=(74, 222, 128), font=FONT_XL)
                                dr.text((44, 1084), f"Comment 'MINE {price}' or Tap CLAIM Now!", fill=(243, 213, 118), font=FONT_LG)
                                dr.text((44, 1126), "UAE CN-5888545  •  Vintage Vibes Al Ain", fill=(168, 162, 158), font=FONT_SM)
                            p.stdin.write(cv2.cvtColor(np.array(cv_im), cv2.COLOR_RGB2BGR).tobytes())
                            if idx % 12 == 0:
                                time.sleep(0.002)
                        p.stdin.close()
                        p.wait()
                        pcm_i16.tofile(cached_pcm + ".tmp")
                        os.replace(tmp_mp4, cached_mp4)
                        os.replace(cached_pcm + ".tmp", cached_pcm)
                        shutil.rmtree(work, ignore_errors=True)

                    tmp_ready = ready_file + ".tmp"
                    with open(tmp_ready, "w", encoding="utf-8") as rf:
                        json.dump({"sig": sig, "sku": sku, "mp4": cached_mp4, "pcm": cached_pcm}, rf)
                    os.replace(tmp_ready, ready_file)
                    last_sig = sig
        except Exception as e:
            print(f"BUILDER_WARN: {e}", flush=True)
        time.sleep(1.2)


# ==============================================================================
# REAL-TIME 24.000 FPS STREAMER PROCESS (ABOVE-NORMAL PRIORITY, <80 MB RAM, ZERO GIL!)
# ==============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--booth", default="booth-1")
    ap.add_argument("--build-worker", action="store_true")
    ap.add_argument("--dry-run-mp4", default="")
    args = ap.parse_args()

    booth = args.booth.strip().lower()
    if args.build_worker:
        run_isolated_build_worker(booth)
        return

    set_own_priority(ABOVE_NORMAL_PRIORITY_CLASS)
    hls_dir = rf"C:\vintage-vibe\public\live_hls\{booth}"
    ready_file = rf"C:\vintage-vibe\seedvc\ready_piece_{booth}.json"
    os.makedirs(hls_dir, exist_ok=True)
    try:
        if os.path.exists(ready_file):
            os.remove(ready_file)
    except OSError:
        pass

    # Decode ONLY the 10s host clip once (~650 MB max, never grows!)
    cfiles = sorted(glob.glob(os.path.join(CLIPS_DIR, "*.mp4")))
    if cfiles:
        host_seg, _ = decode_short_host_clip(cfiles[0])
    else:
        hp = np.array(load_host_pil().resize((W, H), Image.Resampling.LANCZOS))
        bgr = fit_frame_into_9x16_bgr(cv2.cvtColor(hp, cv2.COLOR_RGB2BGR), add_banner=True)
        host_seg = ([bgr] * (4 * FPS), np.zeros(exact_samples_for_frames(4 * FPS), dtype=np.int16))

    # Spawn isolated low-priority builder subprocess (its own GIL & lower OS priority!)
    builder_proc = subprocess.Popen(
        [sys.executable, os.path.abspath(__file__), "--booth", booth, "--build-worker"],
        creationflags=BELOW_NORMAL_PRIORITY_CLASS,
    )

    v_srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    v_srv.bind(("127.0.0.1", 0))
    v_srv.listen(1)
    a_srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    a_srv.bind(("127.0.0.1", 0))
    a_srv.listen(1)

    # Single clean 1.25 Mbps 720x1280 H.264 encoder (~300 KB per 2s segment = 3x faster over internet, zero double-encode!)
    ff_cmd = [
        FFMPEG, "-y", "-loglevel", "warning", "-nostats",
        "-probesize", "32", "-analyzeduration", "0", "-thread_queue_size", "512",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", f"tcp://127.0.0.1:{v_srv.getsockname()[1]}",
        "-probesize", "32", "-analyzeduration", "0", "-thread_queue_size", "512",
        "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", f"tcp://127.0.0.1:{a_srv.getsockname()[1]}",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-profile:v", "baseline",
        "-bf", "0", "-g", "48", "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*2)",
        "-b:v", "1200k", "-maxrate", "1450k", "-bufsize", "2900k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-f", "hls", "-hls_segment_type", "mpegts", "-hls_time", "2", "-hls_list_size", "12",
        "-hls_flags", "delete_segments+independent_segments+temp_file",
        "-hls_segment_filename", os.path.join(hls_dir, "seg_%05d.m2ts"),
        os.path.join(hls_dir, "index.m3u8"),
    ]
    ff_proc = subprocess.Popen(ff_cmd)

    sock_box = {"v": None, "a": None}

    def accept_v():
        c, _ = v_srv.accept()
        c.sendall(host_seg[0][0].tobytes())
        sock_box["v"] = c

    def accept_a():
        c, _ = a_srv.accept()
        c.sendall(host_seg[1][:1837].tobytes())
        sock_box["a"] = c

    tv = threading.Thread(target=accept_v, daemon=True)
    ta = threading.Thread(target=accept_a, daemon=True)
    tv.start()
    ta.start()
    tv.join(timeout=15)
    ta.join(timeout=15)
    v_conn, a_conn = sock_box["v"], sock_box["a"]
    if v_conn is None or a_conn is None:
        builder_proc.kill()
        raise RuntimeError("Timed out accepting ffmpeg local TCP sockets")

    t_start = time.perf_counter()
    total_frames = 0
    turn = 0

    try:
        while ff_proc.poll() is None:
            piece_info = None
            if os.path.exists(ready_file):
                try:
                    piece_info = json.load(open(ready_file, "r", encoding="utf-8"))
                except Exception:
                    piece_info = None

            use_piece = (
                piece_info is not None
                and turn % 3 != 0
                and os.path.exists(piece_info.get("mp4", ""))
                and os.path.exists(piece_info.get("pcm", ""))
            )
            turn += 1

            if use_piece:
                for fr, ch_pcm in stream_mp4_from_disk_gen(piece_info["mp4"], piece_info["pcm"]):
                    v_conn.sendall(fr.tobytes())
                    a_conn.sendall(ch_pcm.tobytes())
                    total_frames += 1
                    sl = (t_start + (total_frames / float(FPS))) - time.perf_counter()
                    if sl > 0.0015:
                        time.sleep(sl)
                    elif sl < -1.0:
                        t_start = time.perf_counter() - (total_frames / float(FPS))
            else:
                frames, pcm = host_seg
                aud_pos = 0
                for i, fr in enumerate(frames):
                    ns = 1838 if (i % 2 == 1) else 1837
                    ch_pcm = pcm[aud_pos : aud_pos + ns]
                    if len(ch_pcm) < ns:
                        ch_pcm = np.pad(ch_pcm, (0, ns - len(ch_pcm)))
                    aud_pos += ns
                    v_conn.sendall(fr.tobytes())
                    a_conn.sendall(ch_pcm.tobytes())
                    total_frames += 1
                    sl = (t_start + (total_frames / float(FPS))) - time.perf_counter()
                    if sl > 0.0015:
                        time.sleep(sl)
                    elif sl < -1.0:
                        t_start = time.perf_counter() - (total_frames / float(FPS))
    finally:
        try:
            builder_proc.kill()
        except Exception:
            pass
        try:
            ff_proc.kill()
        except Exception:
            pass


if __name__ == "__main__":
    main()
