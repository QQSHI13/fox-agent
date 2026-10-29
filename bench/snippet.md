![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **40 ms**, peak RSS **60 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.0/19.5/21.4 | 47.4 | 116.9 | bin | 6.0/6.2/6.8 | 5 |
| claude code | 2.1.312 (Claude Code) | 173.1/186.4/215.1 | 164.1 | 293.6 | bin | 9.1/11.5/12.2 | 5 |
| codex | codex-cli 0.165.0 | 32.8/35.7/38.3 | 163.6 | 446.0 | pkg | 37.0/39.7/46.3 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.4/9.5/9.9 | 37.6 | 171.3 | bin | 7.6/8.0/8.4 | 5 |
| pi | 1.4.0 | 218.3/223.5/250.7 | 128.7 | 112.2 | pkg | 169.1/176.0/203.5 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.7, linux-x64, JIT off) | 27.9/29.7/31.5 | 73.8 | 256.9 | bin | 9.6/12.6/24.0 | 5 |
| gemini cli | 0.66.0 | 1062.0/1104.1/1139.9 | 145.5 | 102.7 | pkg | 1008.8/1031.6/1035.4 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 472.1/530.5/608.5 | 372.8 | 198.6 | pkg | 77.8/89.8/117.3 | 5 |
| crush | crush version v0.98.2 | 511.5/552.1/668.8 | 147.4 | 128.9 | pkg | 114.0/120.7/123.7 | 5 |
| aider | aider 0.86.2 | 457.1/471.2/486.3 | 68.1 | 642.8 | pkg | 590.4/622.4/624.1 | 5 |
| amp | 0.0.1793232065-gec0ec2 (released 2026-10-29T00:01:05.000Z, 1 | 167.5/176.5/187.7 | 141.1 | 161.5 | bin | 148.1/153.3/166.4 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 293.1/399.2/410.7 | 233.7 | 583.2 | pkg | 299.5/314.5/316.7 | 5 |
| qwen code | 0.26.3 | 379.4/382.4/555.9 | 321.2 | 292.0 | pkg | 28.0/29.1/30.3 | 5 |
| codebuff | 1.0.688 | 628.4/647.3/664.8 | 277.9 | 140.0 | bin | 716.9/745.8/750.3 | 5 |
| kilo code | 7.8.18 | 1474.6/1579.7/1650.5 | 942.6 | 720.0 | pkg | 536.5/544.1/637.2 | 5 |
| droid | 0.251.0 | 70.4/79.7/86.1 | 281.0 | 324.0 | bin | 61.8/71.3/71.9 | 5 |
| kimi code | 2.4.0 | 538.8/548.2/604.8 | 329.7 | 192.7 | bin | 436.9/438.3/457.0 | 5 |
| devin | devin 3000.11.228 (053434014dbd) | 20.1/39.9/44.1 | 74.7 | 217.5 | bin | 4.9/5.2/5.4 | 5 |
| cline | 3.0.74 | 997.7/1055.2/1477.6 | 261.7 | 343.1 | pkg | 695.9/715.3/749.9 | 5 |
| continue | 1.5.47 | 11023.9/11035.9/11106.7 | 317.2 | 82.7 | pkg | 794.1/822.3/828.2 | 5 |
| iflow cli | 0.5.19 | 895.8/946.6/1049.4 | 358.4 | 180.3 | pkg | 823.0/840.9/841.7 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 100.9/112.1/138.7 | 98.4 | 207.4 | bin | 56.8/58.5/66.0 | 5 |

</details>

_Generated 2026-10-29T01:09:02Z on Linux x86_64 (7.0.0-1017-azure), load 0.59 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
