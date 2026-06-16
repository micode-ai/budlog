export function Footer({ text }: { text: string }) {
  return (
    <footer className="mt-14 border-t border-hairline pt-6 pb-12 text-center">
      <a
        href="https://t.me/BudlogBot"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted transition-colors duration-200 hover:text-cta cursor-pointer"
      >
        {text}
      </a>
    </footer>
  );
}
