![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **58 ms**, peak RSS **71 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 25.3/26.6/27.4 | 59.2 | 117.2 | bin | 8.4/8.9/12.3 | 5 |
| claude code | 2.1.330 (Claude Code) | 258.0/260.8/269.1 | 174.2 | 381.1 | bin | 12.3/13.7/14.1 | 5 |
| codex | codex-cli 0.171.0 | 45.5/47.2/47.9 | 94.3 | 444.0 | pkg | 40.5/45.3/45.5 | 5 |
| jcode | jcode v1.0.1 (10114429c) | 18.0/18.5/19.4 | 37.9 | 191.4 | bin | 16.8/18.1/18.4 | 5 |
| pi | 1.6.0 | 310.2/321.6/342.5 | 122.4 | 122.7 | pkg | 237.6/241.2/244.9 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 30.4/31.6/36.8 | 72.4 | 265.3 | bin | 9.5/12.1/12.4 | 5 |
| gemini cli | 0.70.0 | 1677.7/1688.2/1705.1 | 166.0 | 102.3 | pkg | 1596.3/1605.1/1617.1 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.114. | 698.6/760.7/949.8 | 353.0 | 218.6 | pkg | 112.2/114.2/116.7 | 5 |
| crush | crush version v0.102.0 | 482.3/487.9/807.4 | 157.5 | 138.6 | pkg | 150.6/154.4/154.4 | 5 |
| aider | aider 0.86.2 | 722.0/732.6/754.5 | 68.5 | 643.7 | pkg | 837.6/869.1/874.3 | 5 |
| amp | 0.0.1795262446-g9f3ad9 (released 2026-11-21T12:00:46.000Z, 1 | 248.9/252.9/266.8 | 147.9 | 156.2 | bin | 237.1/247.0/249.6 | 5 |
| cursor-agent | 2026.11.19-f005e9d | 518.0/696.5/732.9 | 3.2 | 562.8 | pkg | 556.4/558.6/558.9 | 5 |
| qwen code | 0.28.3 | 491.8/501.8/751.6 | 254.1 | 300.1 | pkg | 43.8/44.0/45.6 | 5 |
| codebuff | 1.0.688 | 979.5/1019.8/1049.0 | 279.3 | 140.0 | bin | 999.4/1017.5/1040.9 | 5 |
| kilo code | 7.8.32 | 2385.3/2394.6/2428.6 | 899.6 | 732.0 | pkg | 863.7/890.3/960.1 | 5 |
| droid | 1.17.0 | 125.6/128.1/134.1 | 314.2 | 349.5 | bin | 116.0/127.6/134.5 | 5 |
| kimi code | 2.7.2 | 1274.6/1295.0/1532.7 | 389.1 | 193.6 | bin | 633.9/643.9/649.0 | 5 |
| devin | devin 3000.14.30821 (a09cd7f323ee) | 46.6/59.9/64.5 | 77.2 | 257.1 | bin | 6.4/7.9/8.0 | 5 |
| cline | 3.0.75 | 1271.0/1362.0/1514.1 | 277.1 | 355.3 | pkg | 1006.0/1042.0/1212.8 | 5 |
| continue | 1.5.47 | 21814.3/21843.3/21859.8 | 307.1 | 82.7 | pkg | 1182.8/1200.8/1212.9 | 5 |
| iflow cli | 0.5.19 | 1389.9/1403.3/1418.1 | 340.8 | 180.4 | pkg | 1290.8/1316.3/1325.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 144.1/171.9/182.2 | 97.4 | 207.4 | bin | 89.0/94.2/98.1 | 5 |

</details>

_Generated 2026-11-21T13:48:34Z on Linux x86_64 (7.0.0-1020-azure), load 0.66 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
