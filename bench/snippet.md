![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **55 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 14.8/19.4/20.8 | 44.2 | 116.6 | bin | 4.8/5.6/5.9 | 5 |
| claude code | 2.1.310 (Claude Code) | 189.6/197.3/229.7 | 176.7 | 291.6 | bin | 6.8/7.5/8.6 | 5 |
| codex | codex-cli 0.164.0 | 38.9/41.3/41.8 | 233.9 | 444.4 | pkg | 35.3/38.2/38.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.0/21.1/142.3 | 32.9 | 171.3 | bin | 6.3/6.7/7.2 | 5 |
| pi | 1.4.0 | 229.6/253.3/258.8 | 130.4 | 111.8 | pkg | 188.8/192.4/217.6 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.1, linux-x64, JIT off) | 27.9/31.3/38.1 | 88.8 | 263.4 | bin | 8.4/9.1/10.9 | 5 |
| gemini cli | 0.65.0 | 1176.7/1210.9/1224.6 | 145.5 | 102.6 | pkg | 1090.3/1123.2/1144.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 512.9/568.9/801.8 | 386.1 | 198.5 | pkg | 78.6/86.2/87.8 | 5 |
| crush | crush version v0.98.2 | 433.2/439.8/763.0 | 157.4 | 128.9 | pkg | 107.2/114.5/115.1 | 5 |
| aider | aider 0.86.2 | 473.2/487.0/514.5 | 67.3 | 642.8 | pkg | 562.1/583.2/587.8 | 5 |
| amp | 0.0.1792843238-g69ea1d (released 2026-10-24T12:00:38.000Z, 2 | 181.1/183.1/189.0 | 139.0 | 161.1 | bin | 162.9/177.4/188.6 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 331.1/469.6/509.8 | 237.4 | 583.2 | pkg | 362.5/372.7/378.7 | 5 |
| qwen code | 0.26.0 | 402.1/412.5/621.1 | 320.4 | 154.7 | pkg | 29.4/31.3/32.8 | 5 |
| codebuff | 1.0.688 | 730.9/767.6/782.6 | 278.0 | 140.0 | bin | 737.1/777.1/787.3 | 5 |
| kilo code | 7.8.17 | 1732.8/1800.0/1884.6 | 498.9 | 718.6 | pkg | 671.9/701.9/713.3 | 5 |
| droid | 0.249.0 | 76.4/76.5/82.0 | 273.8 | 319.7 | bin | 67.1/74.4/75.7 | 5 |
| kimi code | 2.3.1 | 550.8/592.9/623.6 | 329.7 | 192.3 | bin | 435.6/455.2/457.4 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 19.5/43.0/46.1 | 101.0 | 217.5 | bin | 4.4/5.7/6.3 | 5 |
| cline | 3.0.73 | 950.9/973.3/1001.9 | 267.9 | 330.3 | pkg | 830.4/933.7/979.2 | 5 |
| continue | 1.5.47 | 11071.2/11080.4/11093.9 | 319.2 | 82.7 | pkg | 855.2/867.4/868.3 | 5 |
| iflow cli | 0.5.19 | 960.1/979.1/1018.8 | 363.5 | 180.3 | pkg | 917.4/927.5/966.9 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 117.6/137.8/142.3 | 98.5 | 207.4 | bin | 64.6/68.9/74.6 | 5 |

</details>

_Generated 2026-10-24T12:25:29Z on Linux x86_64 (6.17.0-1022-azure), load 0.51 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
