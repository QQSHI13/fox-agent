![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **38 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.4/19.0/29.6 | 48.2 | 116.9 | bin | 6.2/6.7/7.7 | 5 |
| claude code | 2.1.322 (Claude Code) | 150.9/159.3/166.7 | 157.9 | 341.9 | bin | 9.5/10.2/11.3 | 5 |
| codex | codex-cli 0.167.2 | 32.0/32.3/33.4 | 117.2 | 458.3 | pkg | 28.9/30.2/30.2 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.0/9.5/9.9 | 37.6 | 171.3 | bin | 7.6/7.9/8.0 | 5 |
| pi | 1.5.2 | 191.9/197.0/203.0 | 122.3 | 115.3 | pkg | 144.0/147.3/149.4 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 21.0/21.3/24.4 | 72.0 | 265.3 | bin | 6.9/8.9/10.0 | 5 |
| gemini cli | 0.68.0 | 1016.6/1031.3/1038.3 | 142.9 | 103.0 | pkg | 940.4/950.1/955.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.109. | 434.5/448.4/597.8 | 344.7 | 213.3 | pkg | 74.2/76.4/77.0 | 5 |
| crush | crush version v0.100.0 | 609.0/611.4/864.3 | 145.8 | 131.5 | pkg | 84.0/85.2/88.4 | 5 |
| aider | aider 0.86.2 | 442.3/448.3/460.3 | 68.3 | 643.7 | pkg | 495.9/518.0/530.4 | 5 |
| amp | 0.0.1794470450-g3a6702 (released 2026-11-12T08:00:50.000Z, 5 | 162.1/173.5/177.9 | 145.4 | 155.8 | bin | 161.0/164.9/171.8 | 5 |
| cursor-agent | 2026.11.11-b912975 | 289.9/431.4/438.9 | 243.3 | 562.2 | pkg | 308.5/322.8/343.2 | 5 |
| qwen code | 0.27.2 | 311.6/323.0/519.2 | 257.8 | 296.4 | pkg | 27.0/30.8/32.0 | 5 |
| codebuff | 1.0.688 | 600.5/610.9/658.2 | 278.4 | 140.0 | bin | 610.1/631.0/636.0 | 5 |
| kilo code | 7.8.27 | 1455.2/1465.5/1569.0 | 880.0 | 720.0 | pkg | 548.7/548.9/557.8 | 5 |
| droid | 1.9.0 | 77.4/86.4/87.9 | 304.8 | 343.8 | bin | 80.8/83.7/88.2 | 5 |
| kimi code | 2.6.0 | 890.6/981.9/1021.9 | 353.1 | 190.8 | bin | 398.7/403.1/418.2 | 5 |
| devin | devin 3000.12.43 (517d03d73926) | 20.7/36.9/41.4 | 75.9 | 209.7 | bin | 4.2/5.6/6.3 | 5 |
| cline | 3.0.74 | 836.7/857.0/875.7 | 265.7 | 346.2 | pkg | 623.7/625.7/641.7 | 5 |
| continue | 1.5.47 | 21490.2/21499.1/21520.8 | 310.7 | 82.7 | pkg | 767.0/798.2/799.0 | 5 |
| iflow cli | 0.5.19 | 835.9/841.7/851.8 | 339.0 | 180.4 | pkg | 791.9/798.4/807.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 91.7/105.6/111.3 | 98.3 | 207.4 | bin | 54.9/57.3/57.4 | 5 |

</details>

_Generated 2026-11-12T13:10:47Z on Linux x86_64 (7.0.0-1017-azure), load 0.71 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
