![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 25.1/25.7/31.1 | 48.0 | 116.8 | bin | 8.2/8.8/11.8 | 5 |
| claude code | 2.1.318 (Claude Code) | 224.0/230.2/266.1 | 155.4 | 337.8 | bin | 10.6/11.3/11.5 | 5 |
| codex | codex-cli 0.167.0 | 43.0/45.3/47.9 | 115.8 | 458.6 | pkg | 43.4/47.6/69.9 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 12.0/13.1/14.4 | 37.3 | 171.3 | bin | 10.5/10.9/11.0 | 5 |
| pi | 1.5.0 | 302.8/303.4/312.0 | 126.0 | 114.2 | pkg | 228.4/230.0/230.9 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.1, linux-x64, JIT off) | 32.0/33.0/34.2 | 72.7 | 258.2 | bin | 9.1/11.1/11.3 | 5 |
| gemini cli | 0.67.0 | 1579.5/1585.2/1598.2 | 164.9 | 102.9 | pkg | 1494.1/1506.8/1508.9 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.106. | 614.6/682.3/861.2 | 332.5 | 205.5 | pkg | 109.0/112.9/113.6 | 5 |
| crush | crush version v0.100.0 | 352.3/424.6/509.2 | 146.4 | 131.5 | pkg | 128.9/129.7/130.0 | 5 |
| aider | aider 0.86.2 | 717.0/723.5/727.1 | 68.2 | 643.7 | pkg | 785.4/789.4/793.9 | 5 |
| amp | 0.0.1793952045-g82bb22 (released 2026-11-06T08:00:45.000Z, 1 | 225.2/229.0/247.1 | 142.2 | 155.2 | bin | 223.7/226.0/226.3 | 5 |
| cursor-agent | 2026.11.05-86047df | 470.4/647.3/654.3 | 239.6 | 560.2 | pkg | 480.7/505.8/509.2 | 5 |
| qwen code | 0.26.8 | 570.9/575.5/851.6 | 271.3 | 293.2 | pkg | 38.8/40.2/40.4 | 5 |
| codebuff | 1.0.688 | 890.3/909.4/983.2 | 277.5 | 140.0 | bin | 919.4/944.9/963.1 | 5 |
| kilo code | 7.8.27 | 2152.0/2187.8/2258.7 | 876.7 | 720.0 | pkg | 801.1/817.8/819.8 | 5 |
| droid | 1.5.0 | 102.8/112.2/113.7 | 296.4 | 339.1 | bin | 98.0/100.2/102.2 | 5 |
| kimi code | 2.5.2 | 774.8/785.9/830.8 | 327.6 | 185.3 | bin | 609.2/618.3/625.0 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 27.6/52.7/60.1 | 74.1 | 217.6 | bin | 6.2/6.5/6.6 | 5 |
| cline | 3.0.74 | 1092.1/1130.8/1232.8 | 262.0 | 344.4 | pkg | 879.9/1045.2/1239.7 | 5 |
| continue | 1.5.47 | 21776.5/21782.0/21800.1 | 312.0 | 82.7 | pkg | 1134.1/1156.8/1162.8 | 5 |
| iflow cli | 0.5.19 | 1313.7/1317.4/1330.9 | 340.0 | 180.4 | pkg | 1233.9/1243.5/1246.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 136.1/149.9/154.6 | 98.7 | 207.4 | bin | 84.6/85.1/86.4 | 5 |

</details>

_Generated 2026-11-06T09:59:40Z on Linux x86_64 (7.0.0-1017-azure), load 0.67 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
