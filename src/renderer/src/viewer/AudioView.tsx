import Pause from '@mui/icons-material/Pause';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Repeat from '@mui/icons-material/Repeat';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { md, mdAlpha, SHAPE } from '../theme';

const time = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${s < 10 ? `.${Math.floor((s % 1) * 10)}` : ''}` : '–');

export interface AudioInfo {
  duration: number;
  channels: number;
  sampleRate: number;
}

/**
 * A sound with its full waveform: click to jump, space-free controls (Space belongs to the viewer).
 * It starts playing when opened, so stepping through sounds with the arrow keys auditions them.
 */
export function AudioView({ url, onInfo }: { url: string; onInfo?: (i: AudioInfo | null) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(0);

  // Decode once for the waveform (the <audio> element streams for playback).
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    onInfo?.(null);
    void (async () => {
      try {
        const bytes = await (await fetch(url)).arrayBuffer();
        const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
        if (cancelled) return;
        onInfo?.({ duration: buf.duration, channels: buf.numberOfChannels, sampleRate: buf.sampleRate });
        const data = buf.getChannelData(0);
        const n = 400;
        const step = Math.max(1, Math.floor(data.length / n));
        const out: number[] = [];
        for (let b = 0; b < n; b++) {
          let max = 0;
          for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i += 4) max = Math.max(max, Math.abs(data[i]!));
          out.push(max);
        }
        const top = Math.max(...out, 1e-4);
        setPeaks(out.map((p) => p / top));
      } catch {
        if (!cancelled) setPeaks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Draw the waveform, played part in the accent colour.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks) return;
    const dpr = window.devicePixelRatio;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const styles = getComputedStyle(document.documentElement);
    const played = styles.getPropertyValue('--md-primary');
    const rest = styles.getPropertyValue('--md-outline');
    const bar = w / Math.max(1, peaks.length);
    const cut = duration ? (pos / duration) * w : 0;
    peaks.forEach((p, i) => {
      const x = i * bar;
      const bh = Math.max(2, p * h * 0.9);
      g.fillStyle = x < cut ? played : rest;
      g.fillRect(x + bar * 0.15, (h - bh) / 2, Math.max(1, bar * 0.7), bh);
    });
  }, [peaks, pos, duration]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = 0;
    setPos(0);
    void a.play().catch(() => undefined);
  }, [url]);

  const toggle = () => {
    const a = audio.current!;
    if (a.paused) void a.play();
    else a.pause();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, padding: '0 48px' }}>
      <audio
        ref={audio}
        src={url}
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <canvas
        ref={canvas}
        onClick={(e) => {
          const a = audio.current;
          if (!a || !duration) return;
          const r = e.currentTarget.getBoundingClientRect();
          a.currentTime = ((e.clientX - r.left) / r.width) * duration;
          void a.play();
        }}
        style={{ width: '100%', height: '40%', maxHeight: 280, cursor: 'pointer', borderRadius: SHAPE.md, background: mdAlpha('surfaceContainerHigh', 0.5) }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <IconButton onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} sx={{ width: 56, height: 56, backgroundColor: md('primaryContainer'), color: md('onPrimaryContainer'), '&:hover': { backgroundColor: md('primaryContainer') } }}>
          {playing ? <Pause /> : <PlayArrow />}
        </IconButton>
        <Tooltip title={loop ? 'Stop looping' : 'Loop'}>
          <IconButton aria-label="Loop" onClick={() => setLoop(!loop)} aria-pressed={loop} sx={loop ? { color: md('primary') } : {}}>
            <Repeat />
          </IconButton>
        </Tooltip>
        <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant'), fontVariantNumeric: 'tabular-nums', minWidth: 110 }}>
          {time(pos)} / {time(duration)}
        </Typography>
      </div>
    </div>
  );
}
