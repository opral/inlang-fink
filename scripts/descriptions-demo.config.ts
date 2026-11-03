import { defineConfig, mergeConfig, type Plugin, type ViteDevServer, type PreviewServer } from "vite";
import baseConfig from "../vite.config.ts";
import { readFileSync } from "node:fs";

// Local-only demo backend. All /api calls terminate here, including pushes.
const settings = {
  baseLocale: "en", locales: ["en", "de", "fr"], modules: [],
  "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
};
const files: Record<string, string> = {
  "project.inlang/settings.json": JSON.stringify(settings, null, 2),
  "messages/en.json": JSON.stringify({
    checkout_submit: [{ description: "Final checkout button. Confirms payment immediately. Use an action verb and keep it short.", match: { "*": "Place order" } }],
    save_offer: [{ description: "Promotional label about saving money. This does not save a file or store data.", match: { "*": "Save" } }],
    network_port: [{ description: "Network settings field. Port is a computing term, not a harbor. Keep the technical meaning.", match: { "*": "Port" } }],
    cart_items: [{ description: "Cart header: count refers to products, not shipments. Preserve the {count} placeholder.", declarations: ["input count", "local countPlural = count: plural"], selectors: ["countPlural"], match: { "countPlural=one": "One item", "countPlural=*": "{count} items" } }],
  }, null, 2),
  "messages/de.json": JSON.stringify({ checkout_submit: "Jetzt kaufen", save_offer: "Sparen", network_port: "Port" }, null, 2),
  "messages/fr.json": JSON.stringify({ checkout_submit: "Commander", save_offer: "Économisez", network_port: "Port" }, null, 2),
};
let revision = 1;
const sha = (value: number) => value.toString(16).padStart(40, "0");

function localDemo(): Plugin {
  function configureDemo(server: ViteDevServer | PreviewServer) {
      server.middlewares.use(async (request, response, next) => {
        const asset = request.url?.split("?")[0];
        // Vite preview marks .gz as Content-Encoding:gzip, while Fink's loader
        // decompresses explicitly. Serve the compressed bytes without double decoding.
        if (asset && /^\/assets\/lix-engine\.wasm-[\w-]+\.gz$/.test(asset)) {
          const content = readFileSync(new URL(`../dist${asset}`, import.meta.url));
          response.setHeader("Content-Type", "application/octet-stream");
          response.setHeader("Content-Encoding", "identity");
          response.setHeader("Cache-Control", "no-store");
          response.end(content);
          return;
        }
        if (!request.url?.startsWith("/api/")) {
          if (request.url?.split("?")[0] === "/") {
            const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
            response.setHeader("Content-Type", "text/html");
            response.end(html.replace(/<body[^>]*>/, (tag) => tag + '<div style="padding:8px 20px;background:#fff8e6;border-bottom:1px solid #e9dbb4;font:13px system-ui;color:#604b18">Local descriptions demo · Sample store · Changes stay on this machine</div>'));
            return;
          }
          return next();
        }
        const url = new URL(request.url, "http://localhost");
        let data: unknown;
        if (url.pathname === "/api/user") data = { login: "local-demo" };
        else if (url.pathname === "/api/github/access") data = { push: true, signedIn: true };
        else if (url.pathname === "/api/github/tree") data = { head: sha(revision), tree: sha(revision + 1000), branch: "main", paths: Object.keys(files), projects: ["project.inlang"] };
        else if (url.pathname === "/api/github/branches") data = ["main"];
        else if (url.pathname === "/api/github/file") data = { content: files[url.searchParams.get("path")!] };
        else if (url.pathname === "/api/github/source") data = { files: {
          "src/Checkout.tsx": 'import * as m from "./paraglide/messages.js";\nexport const Checkout = () => <button>{m.checkout_submit()}</button>;',
          "src/Offer.tsx": 'import * as m from "./paraglide/messages.js";\nexport const Offer = () => <strong>{m.save_offer()}</strong>;',
          "src/Network.tsx": 'import * as m from "./paraglide/messages.js";\nexport const Network = () => <label>{m.network_port()}</label>;',
          "src/Cart.tsx": 'import * as m from "./paraglide/messages.js";\nexport const Cart = ({count}) => <h2>{m.cart_items({count})}</h2>;',
        } };
        else if (url.pathname === "/api/github/commits") data = [];
        else if (url.pathname === "/api/github/push") {
          let body = "";
          for await (const chunk of request) body += chunk;
          const payload = JSON.parse(body);
          Object.assign(files, payload.files ?? {});
          revision++;
          data = { head: sha(revision), tree: sha(revision + 1000), url: "/?repo=https%3A%2F%2Fgithub.com%2Fdemo%2Fbundle-descriptions&project=project.inlang&open=1" };
        } else {
          response.statusCode = 404;
          data = { error: `This operation is unavailable in the local demo: ${url.pathname}` };
        }
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(data));
      });
  }
  return {
    name: "fink-local-descriptions-demo",
    transformIndexHtml(html) {
      return html.replace("<body>", '<body><div style="padding:8px 20px;background:#fff8e6;border-bottom:1px solid #e9dbb4;font:13px system-ui;color:#604b18">Local descriptions demo · Sample store · Changes stay on this machine</div>');
    },
    configureServer: configureDemo,
    configurePreviewServer: configureDemo,
  };
}

export default defineConfig(mergeConfig(baseConfig, {
  plugins: [localDemo()],
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  preview: { host: "127.0.0.1", port: 5174, strictPort: true },
}));
