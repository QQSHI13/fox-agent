![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.8/19.0/31.8 | 47.8 | 116.9 | bin | 6.8/8.6/13.8 | 5 |
| claude code | 2.1.312 (Claude Code) | 162.4/184.9/541.0 | 164.6 | 293.6 | bin | 8.6/9.9/10.9 | 5 |
| codex | codex-cli 0.165.0 | 32.4/33.5/34.4 | 164.2 | 446.0 | pkg | 35.4/35.6/36.5 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.0/9.4/31.3 | 34.1 | 171.3 | bin | 7.4/7.6/8.0 | 5 |
| pi | 1.4.0 | 202.6/208.7/211.5 | 130.1 | 112.2 | pkg | 157.7/162.1/162.4 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.7, linux-x64, JIT off) | 23.9/25.3/28.0 | 73.8 | 256.9 | bin | 8.0/9.2/9.6 | 5 |
| gemini cli | 0.66.0 | 1027.3/1052.4/1079.1 | 145.8 | 102.7 | pkg | 940.4/979.2/1022.5 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 499.2/537.8/705.5 | 372.2 | 198.6 | pkg | 70.8/77.4/79.8 | 5 |
| crush | crush version v0.98.2 | 379.0/420.4/496.1 | 149.9 | 128.9 | pkg | 92.6/100.5/118.5 | 5 |
| aider | aider 0.86.2 | 479.8/490.2/562.7 | 68.1 | 642.8 | pkg | 528.8/580.5/633.0 | 5 |
| amp | 0.0.1793260836-gdb4c2d (released 2026-10-29T08:00:36.000Z, 2 | 173.1/176.1/186.7 | 140.6 | 161.6 | bin | 154.9/162.1/164.7 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 310.4/434.2/449.6 | 234.3 | 583.2 | pkg | 336.4/339.5/376.4 | 5 |
| qwen code | 0.26.3 | 395.6/406.2/616.4 | 321.5 | 292.0 | pkg | 33.0/33.8/34.3 | 5 |
| codebuff | 1.0.688 | 740.4/755.5/852.8 | 277.4 | 140.0 | bin | 770.1/774.6/808.9 | 5 |
| kilo code | 7.8.18 | 1652.0/1683.1/1816.3 | 931.6 | 720.0 | pkg | 622.0/629.9/641.1 | 5 |
| droid | 0.251.0 | 67.8/74.3/78.1 | 281.0 | 324.0 | bin | 67.4/71.9/84.8 | 5 |
| kimi code | 2.4.0 | 542.4/547.5/590.4 | 328.9 | 192.7 | bin | 422.5/424.2/430.7 | 5 |
| devin | devin 3000.11.228 (053434014dbd) | 19.5/40.3/40.8 | 75.4 | 217.5 | bin | 5.0/5.4/5.6 | 5 |
| cline | 3.0.74 | 861.2/871.1/997.0 | 262.7 | 343.1 | pkg | 688.6/772.7/807.4 | 5 |
| continue | 1.5.47 | 11017.8/11081.0/11101.9 | 317.3 | 82.7 | pkg | 755.9/841.9/845.0 | 5 |
| iflow cli | 0.5.19 | 936.6/950.1/973.2 | 358.7 | 180.3 | pkg | 879.9/906.2/934.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 106.3/121.8/125.5 | 98.4 | 207.4 | bin | 63.2/68.5/68.5 | 5 |

</details>

_Generated 2026-10-29T10:57:51Z on Linux x86_64 (7.0.0-1017-azure), load 0.63 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
