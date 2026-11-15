![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **67 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.6/26.1/30.7 | 47.9 | 116.9 | bin | 6.0/7.3/7.9 | 5 |
| claude code | 2.1.325 (Claude Code) | 222.8/225.3/235.7 | 162.8 | 365.8 | bin | 8.7/9.7/9.9 | 5 |
| codex | codex-cli 0.169.0 | 37.7/39.8/42.3 | 90.8 | 422.7 | pkg | 35.2/37.6/38.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.2/10.8/11.3 | 37.8 | 171.3 | bin | 8.2/8.4/8.5 | 5 |
| pi | 1.5.2 | 285.0/289.8/298.9 | 122.2 | 115.3 | pkg | 210.9/216.2/216.9 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 24.2/26.0/28.4 | 72.2 | 265.3 | bin | 7.1/8.1/9.4 | 5 |
| gemini cli | 0.68.0 | 1429.6/1451.3/1453.0 | 142.8 | 103.0 | pkg | 1341.1/1355.2/1386.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 615.8/679.8/825.9 | 357.9 | 218.4 | pkg | 102.3/103.0/105.5 | 5 |
| crush | crush version v0.101.0 | 600.7/679.1/901.7 | 157.6 | 137.8 | pkg | 126.7/129.8/130.2 | 5 |
| aider | aider 0.86.2 | 636.1/637.3/644.2 | 68.2 | 643.7 | pkg | 708.4/712.3/723.0 | 5 |
| amp | 0.0.1794744038-ga74b43 (released 2026-11-15T12:00:38.000Z, 1 | 230.1/255.1/261.9 | 146.2 | 156.0 | bin | 223.4/231.7/232.7 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 465.8/640.1/648.8 | 247.2 | 561.7 | pkg | 504.3/518.5/520.2 | 5 |
| qwen code | 0.27.4 | 426.9/430.7/663.9 | 254.8 | 295.3 | pkg | 34.6/37.6/43.2 | 5 |
| codebuff | 1.0.688 | 921.7/931.0/1010.6 | 277.3 | 140.0 | bin | 922.6/928.5/932.7 | 5 |
| kilo code | 7.8.27 | 2260.2/2286.9/2433.0 | 910.2 | 720.0 | pkg | 838.6/853.5/864.6 | 5 |
| droid | 1.12.1 | 114.7/124.8/128.2 | 302.7 | 346.5 | bin | 116.1/117.4/121.0 | 5 |
| kimi code | 2.5.3 | 772.5/775.9/807.6 | 324.8 | 185.3 | bin | 558.4/559.8/571.3 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 24.6/56.1/61.3 | 74.8 | 213.7 | bin | 3.8/6.2/7.2 | 5 |
| cline | 3.0.74 | 1220.0/1230.6/1250.4 | 263.2 | 345.1 | pkg | 927.6/1092.2/1106.5 | 5 |
| continue | 1.5.47 | 21691.8/21696.8/21718.3 | 311.1 | 82.7 | pkg | 1018.4/1037.6/1047.3 | 5 |
| iflow cli | 0.5.19 | 1176.2/1187.4/1190.5 | 338.1 | 180.4 | pkg | 1092.5/1102.4/1107.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 138.7/153.0/160.5 | 98.1 | 207.4 | bin | 78.0/80.0/80.6 | 5 |

</details>

_Generated 2026-11-15T13:26:27Z on Linux x86_64 (7.0.0-1017-azure), load 1.48 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
