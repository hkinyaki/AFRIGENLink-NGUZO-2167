// Brand logo — uses the raster mark (amber/navy) extracted to a transparent icon.

export function LogoIcon({ size = 30 }: { size?: number }) {
  return <img src="/logo-icon.png" alt="" style={{ height: size, width: "auto" }} aria-hidden />;
}

/** Logo lockup. `tone` controls the wordmark text color for light vs dark surfaces. */
export function Logo({ size = 22, tone = "dark" }: { size?: number; tone?: "light" | "dark" }) {
  const word = tone === "light" ? "text-[#141B2E]" : "text-slate-100";
  return (
    <div className="flex items-center gap-2.5">
      <LogoIcon size={size + 10} />
      <span className={`font-display text-[15px] font-extrabold tracking-tight ${word}`}>
        NGUZO <span className="text-amber-600">AFRICA</span>
      </span>
    </div>
  );
}
