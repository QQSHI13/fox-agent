![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **70 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.2/25.4/26.0 | 62.5 | 116.9 | bin | 8.8/12.9/13.8 | 5 |
| claude code | 2.1.316 (Claude Code) | 264.6/283.0/336.0 | 155.2 | 328.3 | bin | 10.1/11.0/11.1 | 5 |
| codex | codex-cli 0.166.0 | 45.2/48.8/49.9 | 115.9 | 456.2 | pkg | 45.4/48.2/49.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.6/12.9/13.5 | 34.0 | 171.3 | bin | 10.4/11.7/11.9 | 5 |
| pi | 1.4.0 | 343.9/356.4/377.3 | 131.0 | 112.3 | pkg | 265.6/274.3/281.3 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 33.0/34.0/38.9 | 73.6 | 257.6 | bin | 8.1/10.8/11.1 | 5 |
| gemini cli | 0.66.0 | 1753.1/1777.2/1790.2 | 165.1 | 102.7 | pkg | 1634.5/1639.6/1718.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 709.9/726.4/960.9 | 400.6 | 198.6 | pkg | 115.0/116.9/118.9 | 5 |
| crush | crush version v0.99.0 | 437.7/547.8/1143.9 | 151.1 | 129.9 | pkg | 136.1/142.4/165.2 | 5 |
| aider | aider 0.86.2 | 753.2/766.0/781.1 | 68.1 | 642.8 | pkg | 824.0/829.6/834.1 | 5 |
| amp | 0.0.1793491262-ga7b498 (released 2026-11-01T00:01:02.000Z, 2 | 238.1/242.1/248.0 | 141.8 | 162.0 | bin | 220.0/231.0/238.6 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 473.1/662.3/679.0 | 232.7 | 583.2 | pkg | 497.8/504.5/533.6 | 5 |
| qwen code | 0.26.4 | 631.2/675.7/964.0 | 323.2 | 292.0 | pkg | 41.5/41.9/44.9 | 5 |
| codebuff | 1.0.688 | 985.3/1045.8/1103.5 | 277.0 | 140.0 | bin | 1041.8/1076.4/1111.2 | 5 |
| kilo code | 7.8.18 | 2327.8/2595.2/2668.9 | 893.5 | 720.0 | pkg | 925.1/943.9/950.3 | 5 |
| droid | 1.1.0 | 112.8/114.5/147.8 | 283.2 | 325.4 | bin | 101.1/104.0/105.5 | 5 |
| kimi code | 2.4.1 | 827.4/861.9/877.2 | 329.2 | 192.6 | bin | 658.7/682.9/691.6 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 31.3/59.0/63.8 | 74.1 | 217.6 | bin | 5.8/7.1/7.3 | 5 |
| cline | 3.0.74 | 1193.7/1416.7/1755.1 | 261.0 | 343.5 | pkg | 946.6/1051.7/1266.9 | 5 |
| continue | 1.5.47 | 11310.8/11325.7/11385.2 | 316.8 | 82.7 | pkg | 1224.6/1233.8/1267.1 | 5 |
| iflow cli | 0.5.19 | 1355.7/1400.0/1417.1 | 358.0 | 180.3 | pkg | 1260.9/1301.5/1327.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 154.7/181.5/187.0 | 98.4 | 207.4 | bin | 87.3/94.9/96.9 | 5 |

</details>

_Generated 2026-11-01T02:23:17Z on Linux x86_64 (7.0.0-1017-azure), load 1.35 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
