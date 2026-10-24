| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **18.3** | **#2** of 22 |
| TUI 1st paint | **25.7** | **#2** of 20 |
| TUI 1st input | **197** | **#1** of 9 |
| input latency | **3.5** | **#3** of 8 |
| bundle | **117** | **#4** of 22 |
| idle PSS | **45** | **#2** of 20 |
| `--version` | **8.0** | **#2** of 22 |

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **57 MB**.

<details><summary>dashboard · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | bundle (MB) | kind | `--version` min/p50/p95 | 1st byte min/p50/p95 | 1st paint min/p50/p95 | 1st input min/p50/p95 | latency min/p50/p95 | signal | idle PSS (MB) | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 116.6 | bin | 6.7/8.0/8.7 | 16.7/18.3/21.2 | 24.6/25.7/29.0 | 195.5/196.6/199.8 | 3.3/3.5/3.7 | render | 44.8 | 5 |
| claude code | 2.1.310 (Claude Code) | 291.6 | bin | 9.1/10.2/10.5 | 232.4/248.8/282.2 | 247.2/263.4/297.1 | — | — | render | 173.0 | 5 |
| codex | codex-cli 0.164.0 | 444.4 | pkg | 41.4/42.5/43.9 | 40.8/42.6/50.2 | 343.7/345.0/463.6 | — | — | render | 233.2 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 171.3 | bin | 9.4/9.6/10.0 | 11.0/11.2/12.8 | 11.0/11.4/12.9 | 241.8/242.7/407.4 | 2.9/3.0/3.0 | render | 34.4 | 5 |
| pi | 1.4.0 | 111.8 | pkg | 250.9/257.9/258.2 | 316.6/326.1/343.2 | 332.1/337.0/370.9 | 556.0/582.0/593.3 | 3.5/3.8/3.9 | render | 118.5 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.1, linux-x64, JIT off) | 263.4 | bin | 13.0/14.5/16.5 | 35.7/41.6/46.7 | 38.8/45.6/48.8 | 229.1/236.0/239.2 | 3.1/3.1/3.1 | render | 88.9 | 5 |
| gemini cli | 0.65.0 | 102.6 | pkg | 1524.4/1540.5/1550.3 | 1594.6/1598.0/1630.9 | 1594.6/1598.0/1630.9 | — | — | — | — | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 198.5 | pkg | 102.8/104.9/105.1 | 716.7/749.3/978.8 | 991.1/1012.4/1237.5 | — | — | render | 371.5 | 5 |
| crush | crush version v0.98.2 | 128.9 | pkg | 152.6/153.9/154.2 | 535.0/678.9/838.3 | 536.9/680.2/839.9 | — | — | render | 161.7 | 5 |
| aider | aider 0.86.2 | 642.8 | pkg | 821.5/839.3/850.8 | 750.7/752.0/759.8 | 751.3/752.7/760.4 | 944.8/946.6/993.0 | 5.9/6.1/6.1 | render | 67.4 | 5 |
| amp | 0.0.1792828848-gc7cca4 (released 2026-10-24T08:00:48.000Z, 3 | 161.1 | bin | 215.2/218.3/218.5 | 223.2/229.2/242.7 | 223.2/229.2/242.7 | 393.1/399.2/412.8 | — | — | — | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 583.2 | pkg | 469.9/493.5/499.2 | 449.9/631.1/633.6 | 449.9/449.9/449.9 | — | — | render | 234.3 | 5 |
| qwen code | 0.26.0 | 154.7 | pkg | 38.3/39.8/41.2 | 595.8/608.8/835.0 | 990.2/1005.5/1321.8 | — | — | render | 205.9 | 5 |
| codebuff | 1.0.688 | 140.0 | bin | 944.8/952.4/987.5 | 870.5/886.1/922.9 | 1904.6/1919.6/1956.6 | — | — | render | 301.3 | 5 |
| kilo code | 7.8.17 | 718.6 | pkg | 795.3/820.1/823.3 | 2206.6/2243.3/2317.2 | 2206.6/2243.3/2317.2 | 6608.8/6834.3/7449.3 | 10.6/11.3/33.3 | render | 925.4 | 5 |
| droid | 0.249.0 | 319.7 | bin | 85.1/93.6/93.9 | 97.1/102.6/116.0 | — | — | — | render | 272.1 | 5 |
| kimi code | 2.3.1 | 192.3 | bin | 576.2/590.3/613.2 | 723.8/748.5/774.6 | 756.4/780.1/817.4 | — | — | render | 327.1 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 217.5 | bin | 5.7/7.3/8.3 | 26.7/51.2/53.3 | 29.4/54.0/55.7 | — | — | render | 100.4 | 5 |
| cline | 3.0.73 | 330.3 | pkg | 847.0/891.0/930.0 | 1142.1/1184.0/1279.7 | 1142.1/1184.0/1279.7 | — | — | render | 268.2 | 5 |
| continue | 1.5.47 | 82.7 | pkg | 1110.6/1119.1/1123.2 | 11210.3/11246.5/11255.9 | 11231.0/11267.3/11278.2 | — | — | render | 320.4 | 5 |
| iflow cli | 0.5.19 | 180.2 | pkg | 1226.4/1234.4/1251.2 | 1295.8/1297.5/1318.3 | 1346.3/1379.4/1401.7 | 1755.5/1759.3/5549.7 | 48.3/48.6/48.8 | render | 357.8 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 | bin | 83.4/86.4/86.8 | 135.2/161.3/166.4 | 135.2/161.3/166.4 | 1676.1/1690.1/2426.6 | 17.2/19.8/20.0 | render | 124.1 | 5 |

</details>

<details><summary>what could not be measured</summary>

- **amp**: latency: never stopped repainting (no quiet window)
- **claude code**: latency: no input field accepted the keystroke
- **claude code**: ttfi: no input field accepted the keystroke
- **cline**: latency: waiting for login
- **cline**: ttfi: waiting for login
- **codebuff**: latency: no input field accepted the keystroke
- **codebuff**: ttfi: no input field accepted the keystroke
- **codex**: latency: waiting for login
- **codex**: ttfi: waiting for login
- **continue**: latency: no input field accepted the keystroke
- **continue**: ttfi: no input field accepted the keystroke
- **copilot cli**: latency: trust prompt
- **copilot cli**: ttfi: trust prompt
- **crush**: latency: no input field accepted the keystroke
- **crush**: ttfi: no input field accepted the keystroke
- **cursor-agent**: latency: blank screen
- **cursor-agent**: latency: no input field accepted the keystroke
- **cursor-agent**: ttfi: never became interactive (blank screen)
- **cursor-agent**: ttfi: no input field accepted the keystroke
- **devin**: latency: waiting for login
- **devin**: ttfi: waiting for login
- **droid**: latency: blank screen
- **droid**: ttfi: never became interactive (blank screen)
- **gemini cli**: latency: never stopped repainting (no quiet window)
- **gemini cli**: ttfi: never became interactive (blank screen)
- **kimi code**: latency: trust prompt
- **kimi code**: ttfi: trust prompt
- **qwen code**: latency: waiting for login
- **qwen code**: ttfi: waiting for login

</details>

_Generated 2026-10-24T12:10:32Z on Linux x86_64 (6.17.0-1022-azure), load 0.92 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
