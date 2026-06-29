import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SupportAPI } from "../lib/tenders";
import { Button } from "./ui";
import type { Me } from "../lib/use-me";

const TOPICS = ["A job or tender", "A payment or escrow", "Verification / documents", "A breakdown or incident", "Something else"];
const URGENCY = ["Low", "Normal", "High"] as const;

/** Floating help-desk: scripted bot intake → live 1:1 chat with assigned KAM. */
export function HelpDesk({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // current open ticket (if any)
  const { data } = useQuery({
    queryKey: ["support", "mine"],
    queryFn: () => SupportAPI.myTicket(),
    refetchInterval: open ? 8000 : 60000,
  });
  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  // bot intake state
  const [step, setStep] = useState<"topic" | "urgency" | "detail">("topic");
  const [topic, setTopic] = useState("");
  const [urgency, setUrgency] = useState<(typeof URGENCY)[number]>("Normal");
  const [detail, setDetail] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, step, open]);

  async function submitIntake() {
    setBusy(true);
    try {
      await SupportAPI.open({ topic, urgency, detail });
      await qc.invalidateQueries({ queryKey: ["support", "mine"] });
      setStep("topic");
      setTopic("");
      setDetail("");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!reply.trim() || !ticket) return;
    setBusy(true);
    try {
      await SupportAPI.send(ticket.id, reply.trim());
      setReply("");
      await qc.invalidateQueries({ queryKey: ["support", "mine"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 grid h-13 w-13 place-items-center rounded-full bg-amber-500 text-navy-900 shadow-lg shadow-amber-900/30 transition hover:bg-amber-400"
        style={{ height: 52, width: 52 }}
        aria-label="Help desk"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[30rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-navy-600 bg-navy-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-navy-600 bg-navy-900/60 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Nguzo Help Desk</div>
              <div className="text-[11px] text-slate-500">
                {ticket ? "Connected to your account manager" : "We usually reply within minutes"}
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {!ticket ? (
              <>
                <Bubble bot>Hi {me.profile.fullName || me.profile.companyName || "there"} 👋 I'll connect you to your manager. What's this about?</Bubble>
                {step === "topic" && (
                  <div className="space-y-1.5">
                    {TOPICS.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTopic(t); setStep("urgency"); }}
                        className="block w-full rounded-lg border border-navy-600 bg-navy-700/50 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-amber-600/50"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {step !== "topic" && <Bubble>{topic}</Bubble>}
                {step === "urgency" && (
                  <>
                    <Bubble bot>How urgent is it?</Bubble>
                    <div className="flex gap-2">
                      {URGENCY.map((u) => (
                        <button
                          key={u}
                          onClick={() => { setUrgency(u); setStep("detail"); }}
                          className="flex-1 rounded-lg border border-navy-600 bg-navy-700/50 px-2 py-2 text-sm text-slate-200 transition hover:border-amber-600/50"
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {step === "detail" && (
                  <>
                    <Bubble>{urgency} urgency</Bubble>
                    <Bubble bot>Tell me a little more so your manager has context:</Bubble>
                    <textarea
                      value={detail}
                      onChange={(e) => setDetail(e.target.value)}
                      rows={3}
                      placeholder="Describe your question…"
                      className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-600"
                    />
                    <Button variant="amber" disabled={busy || !detail.trim()} onClick={submitIntake}>
                      {busy ? "Connecting…" : "Start chat"}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                {messages.map((m) => (
                  <Bubble key={m.id} bot={m.kind !== "user"} system={m.kind === "system"} mine={m.fromProfileId === me.profile.id}>
                    {m.fromProfileId && m.fromProfileId !== me.profile.id && m.sender && (
                      <div className="mb-0.5 text-[10px] font-medium text-amber-500/80">{m.sender.name}</div>
                    )}
                    {m.body}
                  </Bubble>
                ))}
                {ticket.status === "Closed" && (
                  <div className="rounded-lg border border-navy-600 bg-navy-900/50 px-3 py-2 text-center text-[11px] text-slate-500">
                    This chat is closed. Tap the X and reopen to start a new one.
                  </div>
                )}
              </>
            )}
          </div>

          {ticket && ticket.status !== "Closed" && (
            <div className="flex items-center gap-2 border-t border-navy-600 p-3">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendReply()}
                placeholder="Type a message…"
                className="flex-1 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-600"
              />
              <Button variant="amber" disabled={busy || !reply.trim()} onClick={sendReply}>Send</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Bubble({ children, bot, mine, system }: { children: React.ReactNode; bot?: boolean; mine?: boolean; system?: boolean }) {
  if (system)
    return <div className="mx-auto max-w-[90%] rounded-lg bg-navy-900/50 px-3 py-2 text-center text-[11px] text-slate-500">{children}</div>;
  return (
    <div className={`flex ${bot && !mine ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          bot && !mine ? "rounded-tl-sm bg-navy-700 text-slate-200" : "rounded-tr-sm bg-amber-500/90 text-navy-900"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
