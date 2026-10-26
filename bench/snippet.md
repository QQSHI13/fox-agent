![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **36 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 12.3/12.7/14.4 | 45.0 | 116.8 | bin | 4.9/6.3/6.9 | 5 |
| claude code | 2.1.310 (Claude Code) | 150.1/155.0/176.9 | 185.2 | 291.6 | bin | 6.9/9.8/10.1 | 5 |
| codex | codex-cli 0.164.0 | 30.8/31.6/31.9 | 239.1 | 444.4 | pkg | 32.2/32.7/32.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 8.8/9.0/114.6 | 33.8 | 171.3 | bin | 7.2/7.6/7.8 | 5 |
| pi | 1.4.0 | 190.5/197.6/252.9 | 129.3 | 111.8 | pkg | 151.7/160.8/161.1 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.3, linux-x64, JIT off) | 24.5/24.8/25.4 | 77.5 | 256.9 | bin | 6.1/7.4/7.6 | 5 |
| gemini cli | 0.65.0 | 999.6/1004.3/1063.9 | 145.9 | 102.6 | pkg | 908.2/927.1/938.6 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 448.8/489.5/625.2 | 387.2 | 198.5 | pkg | 73.8/74.2/74.4 | 5 |
| crush | crush version v0.98.2 | 339.9/349.3/711.9 | 156.2 | 128.9 | pkg | 93.7/97.8/99.5 | 5 |
| aider | aider 0.86.2 | 431.9/434.5/478.3 | 67.3 | 642.8 | pkg | 506.9/513.2/521.6 | 5 |
| amp | 0.0.1793014499-g82ab20 (released 2026-10-26T11:34:59.000Z, 1 | 146.6/151.4/188.8 | 138.7 | 161.0 | bin | 127.9/144.4/147.3 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 289.9/393.2/420.5 | 236.8 | 583.2 | pkg | 288.4/301.0/310.2 | 5 |
| qwen code | 0.26.1 | 352.5/359.8/538.8 | 321.9 | 275.4 | pkg | 27.1/27.8/28.6 | 5 |
| codebuff | 1.0.688 | 620.6/631.9/638.5 | 277.7 | 140.0 | bin | 602.7/618.1/641.1 | 5 |
| kilo code | 7.8.18 | 1474.6/1498.6/1529.0 | 937.3 | 720.0 | pkg | 557.8/560.8/572.4 | 5 |
| droid | 0.249.0 | 61.4/66.9/74.0 | 271.3 | 319.7 | bin | 55.7/57.2/65.3 | 5 |
| kimi code | 2.3.2 | 457.6/481.8/525.7 | 332.3 | 192.4 | bin | 370.4/372.3/376.7 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 18.1/38.3/42.4 | 103.0 | 217.5 | bin | 4.6/5.0/5.5 | 5 |
| cline | 3.0.74 | 805.9/839.3/938.2 | 262.4 | 345.5 | pkg | 618.7/662.3/990.1 | 5 |
| continue | 1.5.47 | 10974.2/10975.7/10978.9 | 319.9 | 82.7 | pkg | 723.7/731.0/736.4 | 5 |
| iflow cli | 0.5.19 | 789.2/795.0/843.9 | 363.3 | 180.3 | pkg | 739.2/741.6/747.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 85.0/100.9/102.0 | 100.5 | 207.4 | bin | 51.9/52.4/54.6 | 5 |

</details>

_Generated 2026-10-26T12:48:43Z on Linux x86_64 (6.17.0-1022-azure), load 0.33 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
