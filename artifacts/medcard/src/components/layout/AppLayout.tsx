import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  FilePlus2,
  Files,
  Menu,
  PencilRuler,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  X,
} from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const isLibrary =
    location === "/" ||
    location.startsWith("/folders/") ||
    location.startsWith("/notebooks/");
  const isManual = location === "/manual";
  const isCard = location.startsWith("/cards/");
  const pageTitle = isLibrary
    ? "Documents"
    : isManual
      ? "Manual builder"
      : isCard
        ? "Study card"
        : "MedCard";

  return (
    <div
      className={`medcard-app-shell selection:bg-primary/20 selection:text-primary ${
        sidebarCollapsed ? "medcard-sidebar-collapsed" : ""
      }`}
    >
      {mobileOpen && (
        <button
          type="button"
          className="medcard-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`medcard-sidebar ${mobileOpen ? "medcard-sidebar-open" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="medcard-sidebar-header">
          <Link
            href="/"
            className="medcard-brand"
            aria-label="MedCard documents"
          >
            <span className="medcard-brand-mark">
              <Stethoscope aria-hidden="true" />
            </span>
            <span className="medcard-brand-copy">
              <strong>MedCard</strong>
              <small>Visual study library</small>
            </span>
          </Link>
          <button
            type="button"
            className="medcard-mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </button>
        </div>

        <Link href="/manual" className="medcard-new-button">
          <FilePlus2 aria-hidden="true" />
          <span>New MedCard</span>
        </Link>

        <nav className="medcard-sidebar-nav" aria-label="Library">
          <p className="medcard-nav-label">Library</p>
          <Link
            href="/"
            className={`medcard-nav-item ${isLibrary ? "is-active" : ""}`}
            aria-current={isLibrary ? "page" : undefined}
            title="Documents"
          >
            <Files aria-hidden="true" />
            <span>Documents</span>
          </Link>
          <Link
            href="/manual"
            className={`medcard-nav-item ${isManual ? "is-active" : ""}`}
            aria-current={isManual ? "page" : undefined}
            title="Build manually"
          >
            <PencilRuler aria-hidden="true" />
            <span>Manual builder</span>
          </Link>
        </nav>

        <div className="medcard-sidebar-note">
          <span className="medcard-status-dot" />
          <div>
            <strong>Personal workspace</strong>
            <span>Designed for focused recall</span>
          </div>
        </div>

        <button
          type="button"
          className="medcard-sidebar-toggle"
          aria-label={
            sidebarCollapsed ? "Expand navigation" : "Collapse navigation"
          }
          onClick={() => setSidebarCollapsed((value) => !value)}
          title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span>{sidebarCollapsed ? "Expand" : "Collapse sidebar"}</span>
        </button>
      </aside>

      <div className="medcard-workspace">
        <header className="medcard-topbar print:hidden">
          <div className="medcard-topbar-leading">
            <button
              type="button"
              className="medcard-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </button>
            {isCard && (
              <Link
                href="/"
                className="medcard-breadcrumb-back"
                aria-label="Back to documents"
              >
                <ChevronLeft />
                <span>Documents</span>
              </Link>
            )}
            {isCard && <span className="medcard-breadcrumb-separator">/</span>}
            <h1>{pageTitle}</h1>
          </div>
          {!isManual && (
            <Link href="/manual" className="medcard-topbar-new">
              <FilePlus2 aria-hidden="true" />
              <span>New</span>
            </Link>
          )}
        </header>

        <main className="medcard-page">{children}</main>
      </div>
    </div>
  );
}
