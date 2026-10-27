![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **66 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 20.7/22.6/24.3 | 44.4 | 116.8 | bin | 6.1/7.4/7.8 | 5 |
| claude code | 2.1.311 (Claude Code) | 192.7/197.2/449.7 | 164.2 | 293.8 | bin | 9.5/10.3/11.9 | 5 |
| codex | codex-cli 0.164.0 | 36.1/38.5/39.4 | 238.4 | 444.4 | pkg | 36.4/37.2/39.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.7/10.0/10.7 | 33.7 | 171.3 | bin | 8.6/8.9/9.0 | 5 |
| pi | 1.4.0 | 248.2/256.4/269.8 | 128.1 | 112.2 | pkg | 199.3/202.0/203.4 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.5, linux-x64, JIT off) | 29.6/32.8/35.0 | 75.5 | 258.4 | bin | 8.8/9.6/9.9 | 5 |
| gemini cli | 0.65.0 | 1264.6/1272.4/1289.5 | 152.2 | 102.6 | pkg | 1189.7/1232.7/1254.5 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.104. | 562.4/597.1/863.9 | 353.9 | 198.6 | pkg | 86.6/88.8/89.8 | 5 |
| crush | crush version v0.98.2 | 405.1/417.2/914.0 | 158.6 | 128.9 | pkg | 114.9/118.1/119.8 | 5 |
| aider | aider 0.86.2 | 569.6/574.2/587.4 | 67.3 | 642.8 | pkg | 659.8/671.1/677.4 | 5 |
| amp | 0.0.1793088058-g3db9cf (released 2026-10-27T08:00:58.000Z, 3 | 176.8/183.5/193.6 | 138.9 | 161.0 | bin | 160.4/165.6/253.5 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 358.6/498.4/508.0 | 240.7 | 583.2 | pkg | 373.9/379.9/404.0 | 5 |
| qwen code | 0.26.1 | 456.3/465.1/683.8 | 322.6 | 275.4 | pkg | 31.0/33.3/35.9 | 5 |
| codebuff | 1.0.688 | 760.6/802.5/862.9 | 277.6 | 140.0 | bin | 779.1/809.0/812.6 | 5 |
| kilo code | 7.8.18 | 1772.6/1848.5/1880.1 | 906.6 | 720.0 | pkg | 666.1/670.8/675.4 | 5 |
| droid | 0.250.0 | 80.9/85.9/87.2 | 272.8 | 323.4 | bin | 71.6/78.7/83.6 | 5 |
| kimi code | 2.3.3 | 598.5/609.3/623.6 | 329.8 | 192.4 | bin | 481.4/492.0/494.0 | 5 |
| devin | devin 3000.11.228 (053434014dbd) | 20.3/44.8/49.0 | 104.5 | 217.5 | bin | 4.4/5.8/6.4 | 5 |
| cline | 3.0.74 | 930.7/988.9/1060.6 | 266.1 | 346.1 | pkg | 753.3/784.2/785.7 | 5 |
| continue | 1.5.47 | 11101.6/11122.1/11144.3 | 319.4 | 82.7 | pkg | 940.5/954.1/963.8 | 5 |
| iflow cli | 0.5.19 | 1053.1/1072.2/1082.8 | 361.8 | 180.3 | pkg | 995.6/1003.3/1017.3 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 116.9/129.1/132.8 | 100.4 | 207.4 | bin | 69.7/72.1/74.7 | 5 |

</details>

_Generated 2026-10-27T11:23:21Z on Linux x86_64 (6.17.0-1022-azure), load 0.81 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
