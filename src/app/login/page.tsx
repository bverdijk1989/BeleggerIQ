import { LoginForm } from "./login-form";

export const metadata = {
  title: "Inloggen — BeleggerIQ",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            BeleggerIQ 2.0
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Inloggen
          </h1>
          <p className="text-sm text-muted-foreground">
            We sturen een eenmalige inloglink naar je e-mailadres. Geen
            wachtwoord nodig.
          </p>
        </header>
        <LoginForm />
        <p className="text-center text-[11px] text-muted-foreground">
          De link is 15 minuten geldig en werkt eenmalig. BeleggerIQ slaat
          geen wachtwoorden of leesbare tokens op.
        </p>
      </div>
    </main>
  );
}
