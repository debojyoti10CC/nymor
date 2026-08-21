import { Marketplace } from "./Marketplace.js";
import { LiveActivity } from "./LiveActivity.js";
import { TryItYourself } from "./TryItYourself.js";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Nymor</h1>
        <p>Paid API resources for AI agents — discoverable, payable, and enforced, on Stellar.</p>
      </header>
      <main className="app-grid">
        <Marketplace />
        <LiveActivity />
        <TryItYourself />
      </main>
    </div>
  );
}
