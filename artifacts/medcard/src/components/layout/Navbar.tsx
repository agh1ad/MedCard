import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Stethoscope, Library, PlusSquare } from "lucide-react";

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground group-hover:scale-105 transition-transform">
            <Stethoscope className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-primary">
            MedCard
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <NavItem
            href="/"
            icon={<Library className="w-4 h-4" />}
            label="Library"
            active={location === "/"}
          />
          <NavItem
            href="/manual"
            icon={<PlusSquare className="w-4 h-4" />}
            label="New MedCard"
            active={location === "/manual"}
          />
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
