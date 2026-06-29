import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SupportAPI } from "../lib/tenders";
import { Button, Card, SectionTitle, Empty, StatusPill } from "./ui";
import type { Me } from "../lib/use-me";

/** KAM / Admin help-desk inbox: pick a conversation, read transcript, reply live. */
export function HelpDeskInbox({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["support", "queue"],
    queryFn: () => SupportAPI.queue(),
    refetchInterval: 10000,
  });
  const tickets = data?.tickets ?? [];

  return (
    <div className="p-6">
      <SectionTitle sub="Live chats from your clients and suppliers. Open ones surface here in real time; idle chats auto-close after 30 minutes.">
        Help Desk
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card>
          {tickets.length === 0 ? (
            <Empty>No conversations yet.</Empty>
          ) : (
            <div className="space-y-1.5">
              {tickets.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`block w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    active === t.id ? "border-amber-600/60 bg-navy-700/60" : "border-navy-600 bg-navy-800 hover:border-navy-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-slate-100">{t.opener?.name || "User"}</span>
                    <StatusPill status={t.status} />
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate">{t.topic || "General"}</span>
                    {t.urgency === "High" && <span className="text-amber-500">High</span>}
                  </div>
                  {t.opener?.code && <div className="font-mono text-[10px] text-slate-600">{t.opener.code}</div>}
                </button>
              ))}
            </div>
          )}
        </Card>
        {active ? <Thread ticketId={active} me={me} onChanged={() => qc.invalidateQueries({ queryKey: ["support", "queue"] })} /> : (
          <Card><Empty>Select a conversation to read and reply.</Empty></Card>
        )}
      </div>
    </div>
  );
}

function Thread({ ticketId, me, onChanged }: { ticketId: string; me: Me; onChanged: () => void }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const msgQ = useQuery({
    queryKey: ["support", "msgs", ticketId],
    queryFn: () => SupportAPI.thread(ticketId),
    refetchInterval: 8000,
  });
  const messages = msgQ.data?.messages ?? [];
  const ticket = msgQ.data?.ticket;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await SupportAPI.send(ticketId, reply.trim());
      setReply("");
      await qc.invalidateQueries({ queryKey: ["support", "msgs", ticketId] });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div ref={scrollRef} className="mb-3 h-80 space-y-3 overflow-y-auto pr-1">
        {messages.map((m: any) => {
          const mine = m.fromProfileId === me.profile.id;
          const system = m.kind === "system" || m.kind === "bot";
          if (system)
            return <div key={m.id} className="mx-auto max-w-[90%] rounded-lg bg-navy-900/50 px-3 py-2 text-center text-[11px] text-slate-500">{m.body}</div>;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-tr-sm bg-amber-500/90 text-navy-900" : "rounded-tl-sm bg-navy-700 text-slate-200"}`}>
                {!mine && m.sender && <div className="mb-0.5 text-[10px] font-medium text-amber-500/80">{m.sender.name}</div>}
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
      {ticket?.status === "Closed" ? (
        <div className="rounded-lg border border-navy-600 bg-navy-900/50 px-3 py-2 text-center text-[11px] text-slate-500">This conversation is closed (read-only).</div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Reply to this conversation…"
            className="flex-1 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-600"
          />
          <Button variant="amber" disabled={busy || !reply.trim()} onClick={send}>Send</Button>
        </div>
      )}
    </Card>
  );
}
