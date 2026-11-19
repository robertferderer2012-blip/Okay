# $10K in 1 Month (3D money explainer)

Portrait 1080x1920, 30 fps, about 58 s. English voiceover by ElevenLabs ("Liam", eleven_v4). Real-looking $100 bills, stacks and a $10,000 strap rendered in 3D with three.js.

## Script
> How to make ten thousand dollars in one month. No luck. Just math.
> Ten thousand dollars divided by thirty days... is about three hundred and thirty-four dollars a day. Sounds hard? Let's break it down.
> Step one. Pick one skill people already pay for. Video editing, web design, or AI automation.
> Step two. Turn it into one clear offer. For example: I edit thirty short videos a month, for one thousand dollars.
> Step three. Find clients. Send fifty personal messages every single day. That's fifteen hundred messages a month. If just one percent say yes... that's fifteen clients.
> Step four. You only need ten. Ten clients, times one thousand dollars... equals ten thousand dollars.
> Step five. Deliver insanely well, and ask every client for a referral.
> One skill. One offer. A lot of outreach. Save this video, and start today.

## Build
```bash
cd money3d && npm install
node render.js --preview 9.5 26.9   # single frames -> previews/
node render.js                      # full render -> build/silent.mp4 (WORKERS=3 by default)
python3 mix.py audio/take2.mp3      # voice + beat + SFX -> money_10k_1month.mp4
```
`audio/take1.mp3` is the second ElevenLabs take; pass it to `mix.py` to use it instead (timings were cut to take2).

Files: `billtex.js` (procedural bill / strap textures), `scene.js` (3D scenes, camera, captions, timeline), `render.js` (headless Chromium + ffmpeg), `mix.py` (audio).

---

# Video 2: $10K in 1 month reselling AirPods (`airpods.html`)

About 57 s, same voice (Liam, eleven_v4, `audio/airpods_take1.mp3`; a second take is `airpods_take2.mp3`). It features a 3D earbuds case with an opening lid, a stylized photographer in an orange hoodie who shoots the product with a phone next to a ring light, and a live "product photo" rendered from a second camera into the polaroid and listing card.

Script: buy used/open-box locally (~$120), check serial, sound, battery and pairing (never buy or sell fakes), clean and photograph, list for ~$170 (= $50 profit), $10,000 ÷ $50 = 200 pairs ≈ 7 a day, reinvest and buy in bulk.

```bash
PAGE=airpods.html BUILD=build_airpods node render.js
python3 mix.py audio/airpods_take1.mp3 cues_airpods.json
```
