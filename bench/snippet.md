![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **53 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 17.9/19.5/21.4 | 44.8 | 116.8 | bin | 7.1/7.9/9.2 | 5 |
| claude code | 2.1.310 (Claude Code) | 241.6/243.5/299.7 | 167.5 | 291.6 | bin | 9.9/11.1/11.4 | 5 |
| codex | codex-cli 0.164.0 | 42.8/43.8/44.1 | 238.1 | 444.4 | pkg | 43.8/45.1/45.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.0/11.5/12.2 | 33.7 | 171.3 | bin | 9.3/9.7/10.0 | 5 |
| pi | 1.4.0 | 323.4/328.0/334.1 | 128.3 | 111.8 | pkg | 253.6/257.6/258.0 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 39.1/40.3/45.2 | 87.7 | 263.7 | bin | 13.8/15.2/17.5 | 5 |
| gemini cli | 0.65.0 | 1622.4/1629.9/1634.7 | 146.2 | 102.6 | pkg | 1526.8/1538.3/1577.5 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 689.8/714.2/1178.4 | 381.9 | 198.5 | pkg | 104.1/106.5/108.1 | 5 |
| crush | crush version v0.98.2 | 373.9/402.9/743.6 | 157.1 | 128.9 | pkg | 147.4/153.5/154.5 | 5 |
| aider | aider 0.86.2 | 728.8/734.6/742.9 | 67.3 | 642.8 | pkg | 788.2/795.2/801.9 | 5 |
| amp | 0.0.1792915237-gd2be70 (released 2026-10-25T08:00:37.000Z, 1 | 215.9/220.1/224.0 | 138.4 | 160.9 | bin | 199.7/212.1/221.1 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 451.4/628.0/649.7 | 242.2 | 583.2 | pkg | 463.3/473.3/496.4 | 5 |
| qwen code | 0.26.1 | 594.5/602.3/863.1 | 322.2 | 275.4 | pkg | 35.8/36.5/38.5 | 5 |
| codebuff | 1.0.688 | 878.3/903.9/931.7 | 278.7 | 140.0 | bin | 903.6/932.3/940.9 | 5 |
| kilo code | 7.8.17 | 2164.0/2204.5/2294.4 | 909.0 | 718.6 | pkg | 797.3/816.9/825.9 | 5 |
| droid | 0.249.0 | 99.3/103.1/114.2 | 269.1 | 319.7 | bin | 87.3/90.9/92.4 | 5 |
| kimi code | 2.3.1 | 751.5/766.0/792.7 | 328.9 | 192.3 | bin | 600.8/606.7/645.8 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 25.4/49.8/54.8 | 97.9 | 217.5 | bin | 6.0/6.7/7.1 | 5 |
| cline | 3.0.73 | 1141.5/1192.7/1323.9 | 267.6 | 330.3 | pkg | 939.4/944.6/977.7 | 5 |
| continue | 1.5.47 | 11222.0/11225.3/11239.9 | 319.4 | 82.7 | pkg | 1089.6/1096.1/1100.9 | 5 |
| iflow cli | 0.5.19 | 1273.9/1292.2/1300.6 | 360.7 | 180.3 | pkg | 1200.7/1211.4/1212.2 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 147.2/154.0/162.3 | 98.7 | 207.4 | bin | 80.0/83.5/85.8 | 5 |

</details>

_Generated 2026-10-25T09:22:53Z on Linux x86_64 (6.17.0-1022-azure), load 0.85 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
