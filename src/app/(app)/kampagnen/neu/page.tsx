import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { brevoConfigured } from "@/lib/mail/brevo";
import { listMailboxes } from "@/lib/mail/mailbox";
import { PageHeader } from "@/components/ui/primitives";
import { CampaignEditor, DEFAULT_STEPS } from "../campaign-editor";

export const metadata = { title: "Neue Kampagne" };

export default async function NewCampaignPage() {
  await requireUser();
  const mailboxes = await listMailboxes();
  return (
    <>
      <PageHeader title="Neue Kampagne" description="E-Mail-Sequenz für Kontakte mit nachgewiesener Werbeerlaubnis." />
      <CampaignEditor
        mailboxes={mailboxes.map((m) => ({ id: m.id, email: m.email }))}
        aiConnected={aiStatus().connected}
        brevoConnected={brevoConfigured()}
        initial={{
          name: "",
          description: "",
          channel: "smtp",
          mailboxId: "",
          targetIndustries: [],
          dailyLimit: 40,
          sendWindowStart: 8,
          sendWindowEnd: 17,
          sendWeekdaysOnly: true,
          minDelaySeconds: 90,
          aiPersonalize: false,
          stopOnReply: true,
          steps: DEFAULT_STEPS,
        }}
      />
    </>
  );
}
