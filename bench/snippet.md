![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **41 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 20.1/20.8/26.9 | 48.2 | 116.9 | bin | 6.0/7.3/8.5 | 5 |
| claude code | 2.1.319 (Claude Code) | 178.8/181.1/212.9 | 157.4 | 340.2 | bin | 8.4/9.0/9.5 | 5 |
| codex | codex-cli 0.167.0 | 34.6/35.6/38.0 | 77.4 | 458.6 | pkg | 32.3/33.4/35.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.7/10.1/10.3 | 37.7 | 171.3 | bin | 8.2/8.4/8.6 | 5 |
| pi | 1.5.0 | 233.7/236.2/247.8 | 125.2 | 114.2 | pkg | 175.8/177.7/178.0 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.2, linux-x64, JIT off) | 25.4/26.1/30.4 | 73.0 | 259.5 | bin | 7.6/8.2/9.7 | 5 |
| gemini cli | 0.67.0 | 1241.5/1250.4/1260.1 | 164.7 | 102.9 | pkg | 1160.3/1163.0/1169.6 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 483.2/491.9/664.3 | 334.3 | 205.5 | pkg | 85.1/88.7/89.1 | 5 |
| crush | crush version v0.100.0 | 524.5/618.3/767.6 | 144.3 | 131.5 | pkg | 100.9/103.1/105.2 | 5 |
| aider | aider 0.86.2 | 547.8/553.0/577.2 | 68.2 | 643.7 | pkg | 610.9/613.5/613.5 | 5 |
| amp | 0.0.1794009661-g88d32b (released 2026-11-07T00:01:01.000Z, 4 | 173.9/196.3/201.8 | 142.7 | 155.4 | bin | 174.3/178.2/178.8 | 5 |
| cursor-agent | 2026.11.05-86047df | 365.7/504.3/527.6 | 239.8 | 560.2 | pkg | 371.8/385.7/392.5 | 5 |
| qwen code | 0.26.9 | 432.2/444.7/653.8 | 274.1 | 293.4 | pkg | 30.7/32.6/33.3 | 5 |
| codebuff | 1.0.688 | 705.2/706.9/717.3 | 278.4 | 140.0 | bin | 721.4/728.5/731.5 | 5 |
| kilo code | 7.8.27 | 1672.8/1683.7/1807.5 | 897.0 | 720.0 | pkg | 625.3/627.5/627.8 | 5 |
| droid | 1.6.0 | 84.1/90.5/92.2 | 296.1 | 339.9 | bin | 76.7/81.0/82.6 | 5 |
| kimi code | 2.5.2 | 589.5/617.0/624.7 | 330.6 | 185.3 | bin | 473.6/490.6/490.8 | 5 |
| devin | devin 3000.12.17 (d23bb600ed8f) | 21.1/45.0/50.1 | 74.8 | 213.1 | bin | 3.9/5.2/6.1 | 5 |
| cline | 3.0.74 | 902.5/923.6/950.4 | 262.8 | 345.6 | pkg | 665.2/721.9/1055.0 | 5 |
| continue | 1.5.47 | 21594.1/21595.0/21597.6 | 311.6 | 82.7 | pkg | 871.0/905.8/921.6 | 5 |
| iflow cli | 0.5.19 | 1020.1/1025.5/1038.8 | 339.7 | 180.4 | pkg | 956.3/958.3/969.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 104.9/130.6/138.2 | 98.5 | 207.4 | bin | 65.9/68.3/68.4 | 5 |

</details>

_Generated 2026-11-07T04:53:12Z on Linux x86_64 (7.0.0-1017-azure), load 0.88 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
