![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **39 ms**, peak RSS **58 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 14.0/15.0/17.0 | 44.9 | 117.1 | bin | 6.4/7.2/7.3 | 5 |
| claude code | 2.1.310 (Claude Code) | 167.1/174.0/196.3 | 167.8 | 291.6 | bin | 9.7/10.3/12.2 | 5 |
| codex | codex-cli 0.164.0 | 33.8/34.3/35.1 | 237.6 | 444.4 | pkg | 34.6/37.0/45.7 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 8.9/9.1/9.8 | 33.8 | 171.3 | bin | 6.9/7.2/7.4 | 5 |
| pi | 1.4.0 | 202.8/206.1/283.4 | 129.5 | 111.8 | pkg | 154.9/158.0/159.3 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 29.6/30.8/32.6 | 87.9 | 263.7 | bin | 9.3/11.1/12.2 | 5 |
| gemini cli | 0.65.0 | 1008.2/1031.8/1087.2 | 170.1 | 102.6 | pkg | 949.7/1000.9/1026.9 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 468.0/513.1/631.3 | 358.2 | 198.5 | pkg | 77.7/99.6/100.0 | 5 |
| crush | crush version v0.98.2 | 385.5/415.6/618.2 | 156.3 | 128.9 | pkg | 100.7/111.2/112.2 | 5 |
| aider | aider 0.86.2 | 432.9/435.6/441.0 | 67.3 | 642.8 | pkg | 503.5/524.1/524.6 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 4 | 152.1/154.3/159.3 | 137.9 | 160.9 | bin | 134.0/142.9/145.7 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 272.5/388.0/396.7 | 240.3 | 583.2 | pkg | 291.0/302.9/305.5 | 5 |
| qwen code | 0.26.1 | 356.3/368.6/541.1 | 322.4 | 275.4 | pkg | 27.7/28.1/29.9 | 5 |
| codebuff | 1.0.688 | 632.8/642.9/687.4 | 278.5 | 140.0 | bin | 619.0/628.6/634.7 | 5 |
| kilo code | 7.8.17 | 1445.1/1487.8/1538.6 | 941.3 | 718.6 | pkg | 574.4/594.8/619.6 | 5 |
| droid | 0.249.0 | 62.4/68.2/71.2 | 274.0 | 319.7 | bin | 56.1/57.0/68.4 | 5 |
| kimi code | 2.3.1 | 464.9/477.7/499.6 | 329.4 | 192.3 | bin | 374.1/379.1/387.5 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 18.4/33.3/38.2 | 103.0 | 217.5 | bin | 3.9/4.8/5.3 | 5 |
| cline | 3.0.73 | 771.6/798.3/838.3 | 272.0 | 330.3 | pkg | 682.0/692.5/718.4 | 5 |
| continue | 1.5.47 | 10986.6/10987.5/10996.5 | 319.9 | 82.7 | pkg | 743.5/756.8/759.4 | 5 |
| iflow cli | 0.5.19 | 825.8/841.3/863.4 | 361.9 | 180.3 | pkg | 783.0/791.1/816.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 87.1/108.9/117.1 | 100.4 | 207.4 | bin | 54.6/56.5/57.1 | 5 |

</details>

_Generated 2026-10-25T08:18:21Z on Linux x86_64 (6.17.0-1022-azure), load 0.74 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
