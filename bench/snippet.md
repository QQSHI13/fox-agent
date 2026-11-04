![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.2/24.3/27.7 | 47.7 | 116.8 | bin | 6.7/7.2/8.3 | 5 |
| claude code | 2.1.318 (Claude Code) | 233.3/237.5/281.8 | 155.1 | 337.8 | bin | 7.9/8.9/11.0 | 5 |
| codex | codex-cli 0.166.0 | 38.0/39.9/42.4 | 117.6 | 456.2 | pkg | 36.5/38.2/41.3 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.5/9.7/10.2 | 37.8 | 171.3 | bin | 8.4/8.4/8.9 | 5 |
| pi | 1.5.0 | 292.6/295.1/303.5 | 124.7 | 114.1 | pkg | 210.8/214.8/215.6 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 28.8/32.9/41.0 | 73.5 | 257.6 | bin | 8.0/9.8/9.9 | 5 |
| gemini cli | 0.66.0 | 1504.1/1523.8/1562.8 | 165.9 | 102.7 | pkg | 1416.2/1432.6/1445.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 636.2/670.0/901.9 | 398.5 | 198.6 | pkg | 98.3/99.1/101.0 | 5 |
| crush | crush version v0.99.0 | 249.9/258.7/390.7 | 147.2 | 129.9 | pkg | 111.4/131.6/144.4 | 5 |
| aider | aider 0.86.2 | 662.2/669.4/673.0 | 68.0 | 643.7 | pkg | 744.5/762.7/766.8 | 5 |
| amp | 0.0.1793793640-g2084a9 (released 2026-11-04T12:00:40.000Z, 1 | 235.7/245.2/300.1 | 141.4 | 154.8 | bin | 220.9/230.3/235.7 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 442.5/627.3/630.4 | 234.3 | 583.2 | pkg | 469.4/484.1/487.4 | 5 |
| qwen code | 0.26.7 | 545.7/557.6/831.0 | 275.8 | 292.8 | pkg | 35.0/37.2/37.4 | 5 |
| codebuff | 1.0.688 | 951.7/982.9/1007.2 | 278.3 | 140.0 | bin | 981.0/999.8/1010.3 | 5 |
| kilo code | 7.8.18 | 2433.3/2499.8/2540.8 | 930.6 | 720.0 | pkg | 864.7/876.0/881.9 | 5 |
| droid | 1.3.0 | 111.5/115.1/119.4 | 297.7 | 339.5 | bin | 102.9/107.5/114.4 | 5 |
| kimi code | 2.4.1 | 763.4/805.8/809.2 | 330.2 | 192.6 | bin | 613.6/623.7/640.2 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 21.3/50.4/55.8 | 74.8 | 217.6 | bin | 3.8/4.1/6.0 | 5 |
| cline | 3.0.74 | 1135.1/1186.2/1247.2 | 261.5 | 343.8 | pkg | 843.1/929.1/1104.4 | 5 |
| continue | 1.5.47 | 21720.7/21734.7/21752.1 | 312.8 | 82.7 | pkg | 1067.3/1107.2/1130.9 | 5 |
| iflow cli | 0.5.19 | 1227.9/1246.8/1282.5 | 339.8 | 180.4 | pkg | 1129.0/1151.6/1159.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 136.6/147.9/159.1 | 98.7 | 207.4 | bin | 76.3/79.4/80.9 | 5 |

</details>

_Generated 2026-11-04T13:24:43Z on Linux x86_64 (7.0.0-1017-azure), load 0.48 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
