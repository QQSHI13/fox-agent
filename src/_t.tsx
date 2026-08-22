import { render } from "@opentui/solid";
let ta: any = null;
function App() {
  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <textarea
        ref={(el: any) => { ta = el; require("node:fs").appendFileSync("/tmp/ref.log", "ref called\n"); }}
        placeholder="type"
        focused
        keyBindings={[{ name: "return", action: "submit" }] as any}
        onSubmit={(() => {
          require("node:fs").appendFileSync("/tmp/onsub.log", "FIRED v=" + String(ta?.plainText) + "\n");
          ta?.setText("");
        }) as any}
        style={{ height: 3 }}
      />
    </box>
  );
}
await render(App);
