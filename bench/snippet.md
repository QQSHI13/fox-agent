![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **64 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 16.2/17.5/20.9 | 44.6 | 116.7 | bin | 6.7/8.0/8.7 | 5 |
| claude code | 2.1.310 (Claude Code) | 232.2/236.0/279.0 | 167.4 | 291.6 | bin | 9.8/13.2/13.3 | 5 |
| codex | codex-cli 0.164.0 | 42.0/42.2/42.4 | 240.6 | 444.4 | pkg | 40.9/42.6/46.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.7/11.2/12.0 | 33.6 | 171.3 | bin | 9.0/9.2/10.5 | 5 |
| pi | 1.4.0 | 311.9/320.0/340.5 | 126.7 | 111.8 | pkg | 242.9/248.5/250.6 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 35.0/35.5/36.3 | 87.6 | 263.7 | bin | 11.7/13.6/14.7 | 5 |
| gemini cli | 0.65.0 | 1588.2/1597.4/1605.4 | 170.2 | 102.6 | pkg | 1485.7/1497.3/1526.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 690.6/704.3/930.6 | 354.7 | 198.5 | pkg | 102.7/103.4/105.4 | 5 |
| crush | crush version v0.98.2 | 470.7/598.4/1053.5 | 158.5 | 128.9 | pkg | 148.9/154.0/158.8 | 5 |
| aider | aider 0.86.2 | 729.7/736.5/747.1 | 67.3 | 642.8 | pkg | 789.3/801.6/813.5 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 4 | 217.1/224.3/231.6 | 138.5 | 160.9 | bin | 215.3/220.9/228.2 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 435.9/641.4/650.5 | 235.2 | 583.2 | pkg | 467.7/474.5/484.6 | 5 |
| qwen code | 0.26.1 | 587.6/602.8/867.3 | 320.3 | 275.4 | pkg | 36.9/38.2/38.2 | 5 |
| codebuff | 1.0.688 | 886.3/890.6/959.4 | 278.3 | 140.0 | bin | 877.5/905.3/907.1 | 5 |
| kilo code | 7.8.17 | 2142.4/2219.1/2263.9 | 499.2 | 718.6 | pkg | 785.0/786.9/791.3 | 5 |
| droid | 0.249.0 | 97.1/102.6/114.0 | 272.1 | 319.7 | bin | 84.2/88.8/91.8 | 5 |
| kimi code | 2.3.1 | 724.1/737.2/755.3 | 328.0 | 192.3 | bin | 577.8/584.3/586.6 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 25.9/51.3/57.6 | 98.0 | 217.5 | bin | 4.9/5.7/5.9 | 5 |
| cline | 3.0.73 | 1194.4/1258.6/1424.6 | 267.8 | 330.3 | pkg | 864.6/921.2/921.2 | 5 |
| continue | 1.5.47 | 11209.8/11222.5/11238.1 | 319.5 | 82.7 | pkg | 1067.6/1102.6/1104.4 | 5 |
| iflow cli | 0.5.19 | 1266.3/1272.5/1277.6 | 361.9 | 180.3 | pkg | 1189.5/1200.4/1203.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 132.9/165.0/176.0 | 100.6 | 207.4 | bin | 82.7/84.3/85.2 | 5 |

</details>

_Generated 2026-10-25T08:05:02Z on Linux x86_64 (6.17.0-1022-azure), load 0.61 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
