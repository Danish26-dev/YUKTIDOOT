export function Logo({ dark = true }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-9" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#1546D9" />
        <path d="M18 18l14 16 14-16" fill="none" stroke="#EDECE6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 34v13" stroke="#EDECE6" strokeWidth="6" strokeLinecap="round" />
        <circle cx="46" cy="46" r="5" fill="#F9B318" />
      </svg>
      <span className="leading-none">
        <span className={`block font-display text-[19px] font-semibold tracking-[0.06em] ${dark ? 'text-white' : 'text-ink'}`}>YUKTIDOOT</span>
        <span className={`mt-1 block font-mono text-[8px] tracking-[0.08em] whitespace-nowrap ${dark ? 'text-white/45' : 'text-ink-400'}`}>INTELLIGENCE THAT GETS WORK DONE</span>
      </span>
    </span>
  );
}
