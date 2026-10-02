import Link from "next/link";

/** The nav shown on the sign-in / sign-up pages. */
export default function AuthNav({
  prompt,
  label,
  href,
}: {
  prompt: string;
  label: string;
  href: string;
}) {
  return (
    <nav className="nav">
      <b>
        <Link href="/">stacked.</Link>
      </b>
      <span className="nav-links">
        <span className="who">{prompt}</span>
        <Link className="pill" href={href}>
          {label}
        </Link>
      </span>
    </nav>
  );
}
