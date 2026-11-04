"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { setupAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="fullName">Ihr Name</Label>
        <Input id="fullName" name="fullName" required autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Passwort (mind. 10 Zeichen)</Label>
        <Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Konto anlegen
      </Button>
    </form>
  );
}
