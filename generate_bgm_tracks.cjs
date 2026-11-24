/**
 * Vintage Vibes UAE — Royalty-Free Studio Upbeat Background Music Generator (100% Copyright-Safe)
 * Generates 3 crisp 25-second 44.1kHz Stereo MP3 background music tracks:
 *   1) bgm_1_streetwear_house.mp3 (122 BPM Deep Fashion House Groove)
 *   2) bgm_2_chill_lofi_groove.mp3 (96 BPM Warm Thrift Store Rhodes Groove)
 *   3) bgm_3_hype_drop_bounce.mp3 (126 BPM Energetic Streetwear Drop Beat)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = 'C:\\vintage-vibe';
const BGM_DIR = path.join(ROOT, 'public', 'audio', 'bgm_tracks');
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

function writeWavStereo(filePath, sampleRate, leftFloat, rightFloat) {
  const numSamples = leftFloat.length;
  const dataSize = numSamples * 4;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // Stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-0.96, Math.min(0.96, leftFloat[i]));
    const r = Math.max(-0.96, Math.min(0.96, rightFloat[i]));
    buf.writeInt16LE(Math.round(l * 32767), off);
    buf.writeInt16LE(Math.round(r * 32767), off + 2);
    off += 4;
  }
  fs.writeFileSync(filePath, buf);
}

function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function renderTrack({ outMp3, bpm, chordsMidi, bassMidi, melodyMidi, style }) {
  const sr = 44100;
  const durSec = 26;
  const total = sr * durSec;
  const L = new Float32Array(total);
  const R = new Float32Array(total);

  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;

  // Deterministic pseudo-random noise for crisp hi-hats & claps
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 1073741823.5) - 1.0;
  };

  for (let i = 0; i < total; i++) {
    const t = i / sr;
    const beatPos = t / secPerBeat;
    const beatInBar = beatPos % 4;
    const barIdx = Math.floor(t / secPerBar);
    const beatFrac = beatPos - Math.floor(beatPos);
    const sixteenthPos = beatPos * 4;
    const sixteenthIdx = Math.floor(sixteenthPos) % 16;
    const sixteenthFrac = (sixteenthPos - Math.floor(sixteenthPos)) * (secPerBeat / 4);

    // 1. Punchy Studio Kick Drum (four-on-the-floor for house, boom-bap for lofi)
    let kick = 0;
    const isKickBeat = style === 'lofi'
      ? (sixteenthIdx === 0 || sixteenthIdx === 7 || sixteenthIdx === 10)
      : (sixteenthIdx % 4 === 0);
    if (isKickBeat && sixteenthFrac < 0.22) {
      const kEnv = Math.exp(-sixteenthFrac * 18);
      const pitchSweep = 52 + 115 * Math.exp(-sixteenthFrac * 42);
      kick = Math.sin(2 * Math.PI * pitchSweep * sixteenthFrac) * kEnv * 0.52;
    }

    // 2. Crisp Clap / Snare on beats 2 & 4
    let clap = 0;
    if ((sixteenthIdx === 4 || sixteenthIdx === 12) && sixteenthFrac < 0.14) {
      const cEnv = Math.exp(-sixteenthFrac * 28);
      clap = (rand() * 0.75 + Math.sin(2 * Math.PI * 210 * sixteenthFrac) * 0.25) * cEnv * 0.24;
    }

    // 3. Stereo Off-beat Open Hi-Hat + 16th Shaker
    let hatL = 0;
    let hatR = 0;
    const isOpenHat = sixteenthIdx % 4 === 2;
    const hDecay = isOpenHat ? 22 : 55;
    if (sixteenthFrac < 0.12) {
      const hEnv = Math.exp(-sixteenthFrac * hDecay) * (isOpenHat ? 0.16 : 0.07);
      const n = rand();
      hatL = n * hEnv * 1.1;
      hatR = -n * hEnv * 0.95;
    }

    // 4. Deep Sub-Bass Groove (sidechained to kick!)
    const sidechain = style === 'lofi' ? 1.0 : (0.35 + 0.65 * Math.min(1, beatFrac * 2.4));
    const bassNote = bassMidi[barIdx % bassMidi.length];
    const bFreq = midiToHz(bassNote);
    const bassSub = (Math.sin(2 * Math.PI * bFreq * t) * 0.75 + Math.sin(2 * Math.PI * bFreq * 2 * t) * 0.25) * 0.28 * sidechain;

    // 5. Warm Stereo Minor-7th / Minor-9th Electric Piano / Synth Pad Chords
    const chord = chordsMidi[barIdx % chordsMidi.length];
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = midiToHz(chord[c]);
      const detune = 1 + (c - 1.5) * 0.0018;
      const v1 = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t);
      const v2 = Math.sin(2 * Math.PI * f * detune * t);
      padL += v1 * 0.055 * sidechain;
      padR += v2 * 0.055 * sidechain;
    }

    // 6. Catchy Pluck Melody Hook
    const melStep = melodyMidi[sixteenthIdx % melodyMidi.length];
    let pluckL = 0;
    let pluckR = 0;
    if (melStep > 0 && sixteenthFrac < 0.24) {
      const mFreq = midiToHz(melStep + (barIdx % 2 === 1 ? 0 : 0));
      const pEnv = Math.exp(-sixteenthFrac * 14);
      const sig = (Math.sin(2 * Math.PI * mFreq * t) + 0.4 * Math.sin(2 * Math.PI * mFreq * 2 * t)) * pEnv * 0.13;
      pluckL = sig * (sixteenthIdx % 2 === 0 ? 1.0 : 0.65);
      pluckR = sig * (sixteenthIdx % 2 === 0 ? 0.65 : 1.0);
    }

    // Smooth 0.4s fade-in at start
    const masterEnv = t < 0.4 ? (t / 0.4) : 1.0;
    L[i] = (kick + clap + bassSub + hatL + padL + pluckL) * masterEnv;
    R[i] = (kick + clap + bassSub + hatR + padR + pluckR) * masterEnv;
  }

  const tmpWav = outMp3.replace(/\.mp3$/i, '.wav');
  writeWavStereo(tmpWav, sr, L, R);
  spawnSync(FFMPEG, [
    '-y', '-threads', '2', '-i', tmpWav,
    '-af', 'highpass=f=32,lowpass=f=15500,alimiter=limit=0.92',
    '-c:a', 'libmp3lame', '-b:a', '192k',
    outMp3
  ], { encoding: 'utf8' });
  try { fs.unlinkSync(tmpWav); } catch (_) {}
}

function ensureAllBgmTracks() {
  fs.mkdirSync(BGM_DIR, { recursive: true });
  const tracks = [
    {
      file: path.join(BGM_DIR, 'bgm_1_streetwear_house.mp3'),
      bpm: 122,
      style: 'house',
      chordsMidi: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]], // Am7 - Fmaj7 - G6 - Em7
      bassMidi: [45, 41, 43, 40],
      melodyMidi: [69, 0, 72, 0, 76, 72, 0, 69, 67, 0, 72, 0, 74, 0, 72, 69]
    },
    {
      file: path.join(BGM_DIR, 'bgm_2_chill_lofi_groove.mp3'),
      bpm: 98,
      style: 'lofi',
      chordsMidi: [[62, 65, 69, 72], [60, 64, 67, 71], [58, 62, 65, 69], [57, 61, 64, 67]], // Dm7 - Cmaj7 - Bbmaj7 - A7
      bassMidi: [38, 36, 34, 33],
      melodyMidi: [74, 0, 0, 77, 0, 76, 72, 0, 74, 0, 69, 0, 72, 0, 69, 0]
    },
    {
      file: path.join(BGM_DIR, 'bgm_3_hype_drop_bounce.mp3'),
      bpm: 126,
      style: 'house',
      chordsMidi: [[60, 63, 67, 70], [56, 60, 63, 67], [58, 62, 65, 70], [55, 58, 62, 67]], // Cm7 - Abmaj7 - Bb6 - Gm7
      bassMidi: [36, 44, 46, 43],
      melodyMidi: [72, 75, 0, 79, 0, 75, 72, 0, 74, 0, 77, 75, 0, 72, 70, 0]
    }
  ];

  for (const tr of tracks) {
    if (!fs.existsSync(tr.file) || fs.statSync(tr.file).size < 10000) {
      renderTrack({
        outMp3: tr.file,
        bpm: tr.bpm,
        chordsMidi: tr.chordsMidi,
        bassMidi: tr.bassMidi,
        melodyMidi: tr.melodyMidi,
        style: tr.style
      });
    }
  }
  return tracks.map((t) => t.file);
}

function pickRandomBgmTrack() {
  const list = ensureAllBgmTracks();
  return list[Math.floor(Math.random() * list.length)];
}

if (require.main === module) {
  const created = ensureAllBgmTracks();
  console.log('BGM_READY:', created);
}

module.exports = { ensureAllBgmTracks, pickRandomBgmTrack };
