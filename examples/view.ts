// pnpm exec tsx examples/view.ts <hyperliquid address>
import { renderView, trackerView } from "@mutexa/tracker-view";

const view = await trackerView({
  address: process.argv[2]!,
  threshold: 250_000, // your alert threshold in USD: there is no default
  replan: true,
});

console.log(renderView(view.data));
console.log(view.source, view.fetchedAt);
