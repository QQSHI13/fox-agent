![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.2/25.5/28.7 | 48.1 | 116.9 | bin | 6.7/7.4/7.8 | 5 |
| claude code | 2.1.319 (Claude Code) | 223.2/230.1/277.5 | 157.8 | 340.2 | bin | 10.4/12.2/12.8 | 5 |
| codex | codex-cli 0.167.0 | 40.8/41.5/42.4 | 115.3 | 458.6 | pkg | 37.5/40.2/41.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.2/11.6/11.9 | 34.0 | 171.3 | bin | 9.6/10.0/10.4 | 5 |
| pi | 1.5.0 | 304.7/309.0/323.6 | 125.4 | 114.2 | pkg | 228.1/232.5/234.1 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.4, linux-x64, JIT off) | 30.2/32.8/39.5 | 73.5 | 260.5 | bin | 10.3/11.4/11.4 | 5 |
| gemini cli | 0.67.0 | 1619.6/1626.7/1633.1 | 146.0 | 102.9 | pkg | 1534.8/1552.6/1554.9 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 623.4/688.2/843.4 | 330.2 | 205.5 | pkg | 106.1/109.1/110.7 | 5 |
| crush | crush version v0.100.0 | 290.8/290.9/712.5 | 145.3 | 131.5 | pkg | 126.9/131.0/131.6 | 5 |
| aider | aider 0.86.2 | 724.4/728.6/735.8 | 68.0 | 643.7 | pkg | 786.9/797.2/811.3 | 5 |
| amp | 0.0.1794110442-ga8fc4f (released 2026-11-08T04:00:42.000Z, 2 | 233.5/242.0/244.0 | 144.9 | 155.5 | bin | 227.4/244.8/249.7 | 5 |
| cursor-agent | 2026.11.05-86047df | 480.3/660.8/676.4 | 239.8 | 560.2 | pkg | 512.6/514.2/530.4 | 5 |
| qwen code | 0.27.0 | 583.1/589.7/863.9 | 273.8 | 293.5 | pkg | 37.6/38.2/39.5 | 5 |
| codebuff | 1.0.688 | 889.9/908.9/956.4 | 277.5 | 140.0 | bin | 887.1/915.5/929.8 | 5 |
| kilo code | 7.8.27 | 2184.0/2213.7/2318.6 | 875.8 | 720.0 | pkg | 791.4/795.6/800.1 | 5 |
| droid | 1.6.0 | 109.3/111.0/119.2 | 296.7 | 339.9 | bin | 98.7/100.7/104.3 | 5 |
| kimi code | 2.5.2 | 776.4/785.9/824.1 | 325.7 | 185.3 | bin | 614.6/625.3/633.3 | 5 |
| devin | devin 3000.12.28 (91c3aec41579) | 33.7/55.5/59.7 | 74.0 | 209.6 | bin | 4.5/5.2/6.2 | 5 |
| cline | 3.0.74 | 1130.1/1144.1/1259.7 | 264.7 | 345.7 | pkg | 863.6/901.4/1210.9 | 5 |
| continue | 1.5.47 | 21752.2/21772.5/21784.4 | 311.7 | 82.7 | pkg | 1117.0/1151.2/1165.1 | 5 |
| iflow cli | 0.5.19 | 1328.0/1332.2/1340.0 | 339.8 | 180.4 | pkg | 1241.2/1248.1/1251.8 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 139.1/147.3/154.8 | 98.6 | 207.4 | bin | 80.8/83.7/85.1 | 5 |

</details>

_Generated 2026-11-08T06:59:51Z on Linux x86_64 (7.0.0-1017-azure), load 0.59 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
