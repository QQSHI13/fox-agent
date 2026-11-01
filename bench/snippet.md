![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **41 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 16.4/17.8/23.3 | 60.1 | 116.9 | bin | 7.5/8.4/9.3 | 5 |
| claude code | 2.1.316 (Claude Code) | 184.8/192.2/252.3 | 154.7 | 328.3 | bin | 8.8/10.0/10.2 | 5 |
| codex | codex-cli 0.166.0 | 35.9/36.1/37.2 | 117.5 | 456.2 | pkg | 34.9/36.7/37.0 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.8/12.8/113.2 | 36.9 | 171.3 | bin | 9.2/10.0/10.2 | 5 |
| pi | 1.4.0 | 213.0/219.1/233.1 | 129.4 | 112.3 | pkg | 171.6/174.0/180.3 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 26.1/28.5/31.5 | 73.5 | 257.6 | bin | 7.8/8.6/10.9 | 5 |
| gemini cli | 0.66.0 | 1082.3/1087.4/1166.0 | 145.4 | 102.7 | pkg | 1047.7/1060.4/1062.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 423.3/485.5/610.0 | 374.1 | 198.6 | pkg | 78.6/79.7/82.5 | 5 |
| crush | crush version v0.99.0 | 415.7/435.0/519.7 | 150.5 | 129.9 | pkg | 92.8/102.9/122.7 | 5 |
| aider | aider 0.86.2 | 424.4/445.0/455.4 | 68.1 | 642.8 | pkg | 485.5/508.5/519.8 | 5 |
| amp | 0.0.1793491262-ga7b498 (released 2026-11-01T00:01:02.000Z, 2 | 154.4/155.8/158.4 | 141.7 | 162.0 | bin | 144.2/150.2/153.9 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 286.6/402.2/403.0 | 234.1 | 583.2 | pkg | 300.9/308.1/319.8 | 5 |
| qwen code | 0.26.4 | 365.6/376.4/562.4 | 323.7 | 292.0 | pkg | 28.8/30.2/33.2 | 5 |
| codebuff | 1.0.688 | 604.6/615.1/650.9 | 277.7 | 140.0 | bin | 634.5/656.3/659.1 | 5 |
| kilo code | 7.8.18 | 1463.4/1534.8/1601.3 | 894.2 | 720.0 | pkg | 545.9/564.8/566.1 | 5 |
| droid | 1.1.0 | 67.9/72.0/87.2 | 284.5 | 325.4 | bin | 61.1/68.1/72.0 | 5 |
| kimi code | 2.4.1 | 510.3/523.8/575.1 | 328.4 | 192.6 | bin | 420.8/440.4/441.9 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 20.2/36.6/40.7 | 75.0 | 217.6 | bin | 4.9/6.0/6.0 | 5 |
| cline | 3.0.74 | 790.1/818.7/856.9 | 265.3 | 343.5 | pkg | 657.1/664.3/841.5 | 5 |
| continue | 1.5.47 | 10995.4/11016.4/11069.4 | 317.5 | 82.7 | pkg | 751.3/771.0/802.1 | 5 |
| iflow cli | 0.5.19 | 847.8/869.5/912.0 | 358.6 | 180.3 | pkg | 806.5/810.4/830.7 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 96.4/108.4/109.8 | 98.5 | 207.4 | bin | 59.9/66.4/93.4 | 5 |

</details>

_Generated 2026-11-01T02:42:03Z on Linux x86_64 (7.0.0-1017-azure), load 0.63 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
