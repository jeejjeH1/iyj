# Seismic — "What are TEEs?" motion graphic

90-second, 16:9 (1920×1080, 30 fps) explainer video for an X/Twitter post about
Trusted Execution Environments and Seismic. Palette: light brown, cream, black, white.

**Output:** `seismic-tee-explainer.mp4` (H.264 + AAC, Twitter-ready)

## What's in it
| Time | Scene |
|---|---|
| 0:00 | 3D faceted logo assembles · title |
| 0:06 | The problem — public chain of glass blocks leaking financial data |
| 0:13 | The rock golem assembles in 3D and powers up · "Trusted Execution Environments" |
| 0:21 | What is a TEE — nested OS / hypervisor / operator layers, shielded core deflecting probes |
| 0:31 | 01 · Tx encrypted client-side → travels the network → decrypted & executed in Intel TDX |
| 0:39 | 02 · Shielded storage tiles flip, `suint256` / `saddress` code |
| 0:48 | 03 · Remote attestation ring verifies nodes, rogue node rejected |
| 0:56 | 04 · Confidential finance use cases |
| 1:03 | Limitations — cracked shield, glitch, risk list |
| 1:11 | Bigger picture — logo splits into 3 pillars and re-forms |
| 1:18 | Outro with the golem · end card |

## Rebuild
Everything is procedural (Three.js scene + DOM typography), rendered deterministically
frame-by-frame in headless Chromium, with an original synthesized soundtrack.

```bash
npm install                      # three.js
node render.js stills 5,20,60 work/prev           # preview stills
node render.js frames 0 2700 work/frames 30       # all frames (can split across workers)
python3 audio.py work/soundtrack.wav              # numpy + scipy
ffmpeg -framerate 30 -i work/frames/f%05d.jpg -i work/soundtrack.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest seismic-tee-explainer.mp4
```

- `src/golem.js` — the character rebuilt as low-poly 3D rocks + chest emblem
- `src/logo.js` — logo facets traced from the artwork and extruded
- `src/main.js` — timeline / all scenes
- `assets/` — the original reference images
