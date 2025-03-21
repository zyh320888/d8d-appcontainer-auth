import { build, emptyDir } from "https://deno.land/x/dnt@0.40.0/mod.ts";

await emptyDir("./npm");

await build({
  entryPoints: ["./src/mod.ts"],
  outDir: "./npm",
  shims: {
    deno: true
  },
  test: false,
  compilerOptions: {
    lib: ["DOM", "DOM.Iterable","ESNext"],
    target: "ES2020",
  },
  package: {
    name: "@d8d-appcontainer/auth",
    version: "0.0.14",
    description: "D8D AppContainer Auth Client",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/d8d-appcontainer/d8d-appcontainer.git",
    },
    bugs: {
      url: "https://github.com/d8d-appcontainer/d8d-appcontainer/issues",
    },
    dependencies: {
      "@d8d-appcontainer/api": "^3.0.43",
      "@d8d-appcontainer/types": "^3.0.43",
      "jsonwebtoken": "^9.0.2",
      "nanoid": "^5.1.2"
    },
    devDependencies: {
      "@types/jsonwebtoken": "^9.0.7"
    }
  },
  postBuild() {
    // 可以在这里添加构建后的操作
    Deno.copyFileSync("./LICENSE", "npm/LICENSE");
    Deno.copyFileSync("./README.md", "npm/README.md");
  },
}); 