![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **66 ms**, peak RSS **56 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 17.9/20.5/21.7 | 44.9 | 116.8 | bin | 7.1/8.6/9.7 | 5 |
| claude code | 2.1.310 (Claude Code) | 231.0/235.9/277.1 | 167.5 | 291.6 | bin | 9.9/11.5/11.6 | 5 |
| codex | codex-cli 0.164.0 | 42.7/43.4/44.8 | 237.7 | 444.4 | pkg | 42.9/44.7/45.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.9/11.3/11.9 | 34.0 | 171.3 | bin | 9.4/9.7/9.7 | 5 |
| pi | 1.4.0 | 331.4/334.5/344.3 | 129.4 | 111.8 | pkg | 253.9/258.3/259.5 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 37.3/38.3/45.5 | 87.7 | 263.7 | bin | 14.2/16.5/17.6 | 5 |
| gemini cli | 0.65.0 | 1637.7/1677.3/1683.2 | 165.1 | 102.6 | pkg | 1574.0/1586.4/1589.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 738.6/789.1/1113.1 | 357.0 | 198.5 | pkg | 109.5/110.9/113.3 | 5 |
| crush | crush version v0.98.2 | 518.3/700.8/1029.8 | 157.8 | 128.9 | pkg | 150.8/154.6/157.4 | 5 |
| aider | aider 0.86.2 | 737.4/742.4/762.8 | 67.2 | 642.8 | pkg | 801.6/827.6/856.2 | 5 |
| amp | 0.0.1792915237-gd2be70 (released 2026-10-25T08:00:37.000Z, 1 | 223.4/231.5/238.0 | 138.2 | 160.9 | bin | 204.4/230.7/234.3 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 444.8/634.6/650.6 | 241.6 | 583.2 | pkg | 471.0/478.9/481.9 | 5 |
| qwen code | 0.26.1 | 602.8/614.6/885.5 | 322.3 | 275.4 | pkg | 39.4/39.9/40.8 | 5 |
| codebuff | 1.0.688 | 935.7/971.5/1008.4 | 278.6 | 140.0 | bin | 940.9/973.7/980.0 | 5 |
| kilo code | 7.8.17 | 2280.1/2285.4/2440.6 | 496.2 | 718.6 | pkg | 841.0/845.9/847.8 | 5 |
| droid | 0.249.0 | 97.9/101.8/118.3 | 274.3 | 319.7 | bin | 88.8/97.6/102.5 | 5 |
| kimi code | 2.3.1 | 727.1/759.4/769.8 | 329.8 | 192.3 | bin | 618.7/622.4/630.0 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 25.9/54.5/57.9 | 98.5 | 217.5 | bin | 4.3/6.0/7.2 | 5 |
| cline | 3.0.73 | 1192.8/1282.3/1517.1 | 265.7 | 330.3 | pkg | 911.3/1270.6/1276.6 | 5 |
| continue | 1.5.47 | 11246.3/11246.5/11262.4 | 319.7 | 82.7 | pkg | 1121.8/1135.5/1153.5 | 5 |
| iflow cli | 0.5.19 | 1307.3/1314.5/1341.5 | 362.1 | 180.3 | pkg | 1213.6/1237.1/1247.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 153.6/165.9/175.7 | 98.7 | 207.4 | bin | 84.9/88.8/94.3 | 5 |

</details>

_Generated 2026-10-25T09:50:50Z on Linux x86_64 (6.17.0-1022-azure), load 0.96 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
