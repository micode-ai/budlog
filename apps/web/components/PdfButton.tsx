export function PdfButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cta px-5 text-base font-bold text-white transition-colors duration-200 hover:bg-ctaDark focus:outline-none focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-2 sm:w-auto cursor-pointer"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="m7 12 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      {label}
    </a>
  );
}
