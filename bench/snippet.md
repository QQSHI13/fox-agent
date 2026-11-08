![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **39 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 20.4/20.7/23.3 | 48.1 | 116.9 | bin | 5.4/7.2/7.3 | 5 |
| claude code | 2.1.319 (Claude Code) | 171.0/181.9/206.4 | 157.2 | 340.2 | bin | 9.6/9.9/10.8 | 5 |
| codex | codex-cli 0.167.0 | 33.0/33.9/34.3 | 116.6 | 458.6 | pkg | 32.5/33.2/33.9 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.1/10.4/10.9 | 37.7 | 171.3 | bin | 8.1/8.6/8.8 | 5 |
| pi | 1.5.0 | 206.3/217.4/228.6 | 126.3 | 114.2 | pkg | 151.3/158.4/160.0 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.4, linux-x64, JIT off) | 26.8/27.9/30.5 | 73.1 | 260.5 | bin | 7.4/9.0/9.4 | 5 |
| gemini cli | 0.67.0 | 1055.0/1059.1/1114.9 | 164.9 | 102.9 | pkg | 997.3/1024.3/1050.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 419.8/432.9/587.9 | 331.9 | 205.5 | pkg | 75.8/77.7/78.5 | 5 |
| crush | crush version v0.100.0 | 407.3/448.8/549.3 | 145.5 | 131.5 | pkg | 90.0/93.1/94.1 | 5 |
| aider | aider 0.86.2 | 434.7/440.0/455.6 | 68.1 | 643.7 | pkg | 500.1/533.9/574.4 | 5 |
| amp | 0.0.1794096074-g996537 (released 2026-11-08T00:01:14.000Z, 3 | 164.8/168.8/173.9 | 143.1 | 155.5 | bin | 155.8/180.9/182.0 | 5 |
| cursor-agent | 2026.11.05-86047df | 316.7/438.9/443.5 | 240.6 | 560.2 | pkg | 324.2/338.4/342.0 | 5 |
| qwen code | 0.27.0 | 357.0/360.7/584.8 | 272.5 | 293.5 | pkg | 27.0/30.0/30.4 | 5 |
| codebuff | 1.0.688 | 617.8/659.3/738.5 | 278.4 | 140.0 | bin | 716.7/740.6/766.5 | 5 |
| kilo code | 7.8.27 | 1503.4/1591.9/1723.9 | 919.7 | 720.0 | pkg | 560.3/591.8/604.9 | 5 |
| droid | 1.6.0 | 76.8/77.8/80.4 | 298.3 | 339.9 | bin | 67.4/71.5/80.1 | 5 |
| kimi code | 2.5.2 | 503.1/518.2/684.4 | 322.7 | 185.3 | bin | 390.1/404.5/406.0 | 5 |
| devin | devin 3000.12.28 (91c3aec41579) | 21.0/40.3/42.5 | 74.4 | 209.6 | bin | 4.5/4.9/5.5 | 5 |
| cline | 3.0.74 | 800.7/828.5/998.2 | 262.5 | 345.7 | pkg | 642.1/992.0/1029.9 | 5 |
| continue | 1.5.47 | 21494.7/21515.3/21548.2 | 311.2 | 82.7 | pkg | 732.9/752.8/764.3 | 5 |
| iflow cli | 0.5.19 | 886.3/891.8/922.8 | 338.8 | 180.4 | pkg | 809.0/842.2/860.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 97.6/114.4/122.4 | 98.8 | 207.4 | bin | 57.3/60.0/61.5 | 5 |

</details>

_Generated 2026-11-08T03:23:46Z on Linux x86_64 (7.0.0-1017-azure), load 0.36 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
