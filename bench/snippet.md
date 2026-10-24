![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **41 ms**, peak RSS **56 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 14.1/15.2/17.9 | 44.1 | 116.6 | bin | 6.1/7.0/7.8 | 5 |
| claude code | 2.1.310 (Claude Code) | 181.2/185.7/221.1 | 167.5 | 291.6 | bin | 9.1/10.2/10.5 | 5 |
| codex | codex-cli 0.164.0 | 35.1/36.1/38.5 | 258.4 | 444.4 | pkg | 35.9/37.0/37.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.5/9.6/9.8 | 34.0 | 171.3 | bin | 7.5/7.8/8.2 | 5 |
| pi | 1.4.0 | 239.1/244.0/249.6 | 128.2 | 111.8 | pkg | 190.8/194.4/195.9 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.1, linux-x64, JIT off) | 29.4/30.0/31.7 | 88.7 | 263.4 | bin | 10.7/12.9/12.9 | 5 |
| gemini cli | 0.65.0 | 1209.1/1214.7/1226.0 | 161.5 | 102.6 | pkg | 1128.8/1135.1/1147.1 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 522.8/545.9/745.5 | 354.7 | 198.5 | pkg | 84.3/86.0/89.5 | 5 |
| crush | crush version v0.98.2 | 584.9/607.3/790.0 | 157.9 | 128.9 | pkg | 115.2/124.8/128.8 | 5 |
| aider | aider 0.86.2 | 546.9/568.3/570.7 | 67.2 | 642.8 | pkg | 612.8/624.6/636.1 | 5 |
| amp | 0.0.1792828848-gc7cca4 (released 2026-10-24T08:00:48.000Z, 3 | 166.0/180.7/185.7 | 138.8 | 161.1 | bin | 154.7/165.5/172.1 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 340.7/481.5/492.7 | 241.1 | 583.2 | pkg | 346.1/365.4/369.0 | 5 |
| qwen code | 0.26.0 | 432.7/434.7/643.9 | 319.4 | 154.7 | pkg | 31.3/32.0/32.6 | 5 |
| codebuff | 1.0.688 | 688.9/700.7/706.7 | 277.2 | 140.0 | bin | 713.4/718.4/723.8 | 5 |
| kilo code | 7.8.17 | 1649.5/1672.8/1755.5 | 895.1 | 718.6 | pkg | 625.6/628.4/636.4 | 5 |
| droid | 0.249.0 | 76.2/79.6/83.9 | 271.8 | 319.7 | bin | 65.0/71.8/78.4 | 5 |
| kimi code | 2.3.1 | 562.5/567.2/613.2 | 329.8 | 192.3 | bin | 452.6/461.9/491.3 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 18.7/41.4/45.4 | 103.0 | 217.5 | bin | 5.0/5.1/6.1 | 5 |
| cline | 3.0.73 | 889.6/905.1/966.8 | 269.3 | 330.3 | pkg | 677.9/728.8/741.7 | 5 |
| continue | 1.5.47 | 11067.0/11068.7/11073.5 | 319.8 | 82.7 | pkg | 862.4/863.4/871.0 | 5 |
| iflow cli | 0.5.19 | 977.8/986.0/988.9 | 362.9 | 180.2 | pkg | 933.4/933.8/936.9 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 100.5/116.2/120.1 | 98.8 | 207.4 | bin | 61.1/63.3/65.9 | 5 |

</details>

_Generated 2026-10-24T11:26:47Z on Linux x86_64 (6.17.0-1022-azure), load 0.57 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
