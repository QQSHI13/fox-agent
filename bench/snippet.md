![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **131 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 14.9/17.2/17.4 | 45.1 | 116.7 | bin | 5.8/6.8/7.1 | 5 |
| claude code | 2.1.310 (Claude Code) | 183.0/183.6/225.9 | 167.7 | 291.6 | bin | 8.6/10.3/10.8 | 5 |
| codex | codex-cli 0.164.0 | 35.6/36.2/36.9 | 238.6 | 444.4 | pkg | 35.7/38.4/39.9 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.5/9.7/120.3 | 33.5 | 171.3 | bin | 7.8/8.0/8.5 | 5 |
| pi | 1.4.0 | 238.9/249.9/256.0 | 122.9 | 111.8 | pkg | 188.3/194.8/195.0 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 29.2/32.2/34.0 | 88.2 | 263.7 | bin | 11.0/12.1/13.5 | 5 |
| gemini cli | 0.65.0 | 1207.7/1215.2/1241.2 | 146.1 | 102.6 | pkg | 1129.1/1134.1/1144.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 520.5/573.7/839.3 | 285.8 | 198.5 | pkg | 83.3/84.6/85.5 | 5 |
| crush | crush version v0.98.2 | 549.5/643.6/739.0 | 156.2 | 128.9 | pkg | 115.3/118.0/119.0 | 5 |
| aider | aider 0.86.2 | 547.9/550.5/568.6 | 67.3 | 642.8 | pkg | 609.4/631.8/632.0 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 1 | 169.9/173.6/180.3 | 137.8 | 160.9 | bin | 155.4/162.6/179.2 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 343.6/477.0/505.3 | 240.8 | 583.2 | pkg | 359.2/367.0/368.1 | 5 |
| qwen code | 0.26.1 | 444.5/451.2/678.7 | 323.1 | 275.4 | pkg | 29.4/31.0/33.1 | 5 |
| codebuff | 1.0.688 | 702.7/715.5/752.9 | 277.9 | 140.0 | bin | 710.9/718.7/727.6 | 5 |
| kilo code | 7.8.17 | 1661.4/1697.3/1699.5 | 496.4 | 718.6 | pkg | 629.0/635.6/643.4 | 5 |
| droid | 0.249.0 | 77.3/80.0/82.5 | 273.1 | 319.7 | bin | 67.9/72.9/76.2 | 5 |
| kimi code | 2.3.1 | 559.5/564.6/620.3 | 331.6 | 192.3 | bin | 449.7/455.8/473.9 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 19.4/40.9/44.3 | 103.0 | 217.5 | bin | 4.5/5.4/5.9 | 5 |
| cline | 3.0.73 | 905.7/933.9/1240.9 | 268.9 | 330.3 | pkg | 677.9/719.2/734.6 | 5 |
| continue | 1.5.47 | 11066.8/11070.8/11080.9 | 318.9 | 82.7 | pkg | 865.6/870.3/873.6 | 5 |
| iflow cli | 0.5.19 | 994.1/998.9/1003.8 | 361.4 | 180.3 | pkg | 924.1/941.7/947.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 105.3/120.9/122.8 | 100.7 | 207.4 | bin | 65.0/67.0/69.6 | 5 |

</details>

<details><summary>what could not be measured</summary>

- **gemini cli**: no output within 40s

</details>

_Generated 2026-10-25T05:56:24Z on Linux x86_64 (6.17.0-1022-azure), load 0.71 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
