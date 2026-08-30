import { HealthStatus } from "./components/HealthStatus";

function App() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">DevPulse</h1>
      <HealthStatus />
    </main>
  );
}

export default App;