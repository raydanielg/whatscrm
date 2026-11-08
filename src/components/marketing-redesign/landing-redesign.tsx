import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Check,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Play,
  Search,
  Send,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SiInstagram, SiMessenger, SiTelegram, SiWhatsapp } from "react-icons/si";
import { Brand, PlatformLogo } from "@/components/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import "./landing-redesign.css";

const channels = [
  ["WhatsApp", SiWhatsapp, "#31e178"],
  ["Messenger", SiMessenger, "#64a9ff"],
  ["Instagram", SiInstagram, "#ff77bd"],
  ["Telegram", SiTelegram, "#65c9ff"],
  ["Email", Mail, "#c6c2ff"],
] as const;
const chats = [
  ["AT", "Alex Tan", "Delivery address update", "Now", SiWhatsapp],
  ["SM", "Sophie Martinez", "Thanks—that worked perfectly", "8m", SiInstagram],
  ["AC", "Acme & Co.", "Question about team plans", "21m", Mail],
  ["PS", "Priya Shah", "Is the navy version in stock?", "1h", SiMessenger],
] as const;

export function LandingRedesign() {
  const [open, setOpen] = useState(false);
  const brandName = useBrandName();
  useEffect(() => {
    document.documentElement.classList.add("lr-preview-active");
    return () => document.documentElement.classList.remove("lr-preview-active");
  }, []);
  return (
    <div className="signal-page">
      <header className="signal-nav">
        <div className="signal-wrap signal-nav-inner">
          <a href="#top" className="signal-brand">
            <span>
              <PlatformLogo alt="" />
            </span>
            <Brand />
          </a>
          <nav className="signal-nav-links">
            <a href="#product">Product</a>
            <a href="#system">How it works</a>
            <a href="#channels">Channels</a>
            <Link to="/pricing">Pricing</Link>
          </nav>
          <div className="signal-nav-actions">
            <Link to="/auth" search={{ mode: "sign-in" }}>
              Log in
            </Link>
            <Link className="signal-btn light" to="/auth" search={{ mode: "sign-up" }}>
              Start free <ArrowRight />
            </Link>
          </div>
          <button
            className="signal-menu"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav className="signal-mobile">
            <a href="#product">Product</a>
            <a href="#system">How it works</a>
            <a href="#channels">Channels</a>
            <Link to="/pricing">Pricing</Link>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="signal-hero" id="product">
          <div className="signal-orbit" aria-hidden />
          <div className="signal-wrap">
            <div className="signal-kicker">
              <span>One inbox. Every customer channel.</span>
              <b>Built for modern teams</b>
            </div>
            <h1>
              Turn every message
              <br />
              into <em>momentum.</em>
            </h1>
            <div className="signal-hero-copy">
              <p>
                {brandName} brings customer conversations, context and your team into one
                beautifully focused workspace—so nothing gets lost between channels.
              </p>
              <div>
                <Link className="signal-btn acid" to="/auth" search={{ mode: "sign-up" }}>
                  Start your workspace <ArrowRight />
                </Link>
                <a
                  className="signal-watch"
                  href="https://demo.wacrm.wrapcoders.bid/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Play /> Watch it in action
                </a>
              </div>
            </div>
            <CommandCenter />
          </div>
        </section>

        <section className="signal-channels" id="channels">
          <div className="signal-wrap signal-channels-inner">
            <p>
              Five channels.
              <br />
              <strong>One continuous conversation.</strong>
            </p>
            <div className="signal-channel-list">
              {channels.map(([label, Icon, tone]) => (
                <div
                  className="signal-channel"
                  key={label}
                  style={{ "--tone": tone } as React.CSSProperties}
                >
                  <span>
                    <Icon />
                  </span>
                  <b>{label}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="signal-system" id="system">
          <div className="signal-wrap">
            <header className="signal-section-head">
              <span>THE SYSTEM</span>
              <h2>
                Less switching.
                <br />
                <em>More knowing.</em>
              </h2>
              <p>
                Every customer signal arrives with the context your team needs—and a clear next
                move.
              </p>
            </header>
            <div className="signal-card-grid">
              <article className="signal-card signal-card-main">
                <CardLabel n="01">Unified inbox</CardLabel>
                <h3>
                  See the whole customer,
                  <br />
                  not another notification.
                </h3>
                <p>Messages, channel history and ownership live together in one calm queue.</p>
                <div className="signal-queue">
                  <Queue
                    initials="AT"
                    name="Alex Tan"
                    meta="WhatsApp · Order #8421"
                    state="Assigned to you"
                  />
                  <Queue
                    initials="SM"
                    name="Sophie Martinez"
                    meta="Instagram · Product question"
                    state="Sales queue"
                  />
                  <Queue
                    initials="AC"
                    name="Acme & Co."
                    meta="Email · Team plan"
                    state="New lead"
                  />
                </div>
              </article>
              <article className="signal-card signal-card-ai">
                <CardLabel n="02">AI assistance</CardLabel>
                <h3>
                  Useful help,
                  <br />
                  right on cue.
                </h3>
                <div className="signal-ai-note">
                  <Sparkles />
                  <p>
                    <b>Suggested next step</b>
                    <span>Confirm the updated address and send the revised delivery window.</span>
                  </p>
                </div>
                <footer>
                  <span>Context matched</span>
                  <b>High confidence</b>
                </footer>
              </article>
              <article className="signal-card signal-card-flow">
                <CardLabel n="03">Clear ownership</CardLabel>
                <h3>
                  Everyone knows
                  <br />
                  what moves next.
                </h3>
                <div className="signal-flow">
                  <span>
                    <MessageCircle />
                  </span>
                  <i />
                  <span>
                    <Bot />
                  </span>
                  <i />
                  <span>
                    <Users />
                  </span>
                </div>
                <div className="signal-status">
                  <Check /> Routed to Customer Care <small>just now</small>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="signal-clarity">
          <div className="signal-wrap signal-clarity-grid">
            <div>
              <span className="signal-eyebrow">DESIGNED FOR CLARITY</span>
              <h2>
                Your team sees
                <br />
                the same story.
              </h2>
              <p>
                Shared context replaces scattered tabs, forwarded screenshots and “who’s handling
                this?” messages.
              </p>
              <ul>
                <li>
                  <Check /> One customer timeline across every channel
                </li>
                <li>
                  <Check /> Assignments and status everyone can trust
                </li>
                <li>
                  <Check /> Automation without losing the human touch
                </li>
              </ul>
            </div>
            <Timeline />
          </div>
        </section>

        <section className="signal-final">
          <div className="signal-wrap">
            <span>READY WHEN YOU ARE</span>
            <h2>
              Every conversation
              <br />
              deserves a clear <em>next.</em>
            </h2>
            <p>Give your team one place to listen, understand and act.</p>
            <div>
              <Link className="signal-btn acid" to="/auth" search={{ mode: "sign-up" }}>
                Start your workspace <ArrowRight />
              </Link>
              <Link className="signal-btn ghost" to="/pricing">
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="signal-footer">
        <div className="signal-wrap">
          <a href="#top" className="signal-brand">
            <span>
              <PlatformLogo alt="" />
            </span>
            <Brand />
          </a>
          <p>
            Customer conversations,
            <br />
            finally moving together.
          </p>
          <nav>
            <a href="#product">Product</a>
            <a href="#system">How it works</a>
            <Link to="/pricing">Pricing</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <small>
            © {new Date().getFullYear()} <Brand />
          </small>
        </div>
      </footer>
    </div>
  );
}

function CardLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="signal-card-label">
      <span>{n}</span>
      {children}
    </div>
  );
}
function Queue({
  initials,
  name,
  meta,
  state,
}: {
  initials: string;
  name: string;
  meta: string;
  state: string;
}) {
  return (
    <div>
      <span className="signal-avatar">{initials}</span>
      <p>
        <b>{name}</b>
        <small>{meta}</small>
      </p>
      <strong>{state}</strong>
    </div>
  );
}
function Timeline() {
  return (
    <div className="signal-timeline-card">
      <header>
        Customer timeline <b>LIVE</b>
      </header>
      <div className="signal-timeline">
        <Event
          icon={<SiWhatsapp />}
          title="New conversation"
          detail="Asked about delivery options"
          time="09:42"
        />
        <Event icon={<Users />} title="Assigned to Maya" detail="Customer Care" time="09:43" />
        <Event
          icon={<Sparkles />}
          title="Context prepared"
          detail="Order and shipping details found"
          time="09:43"
        />
        <Event
          icon={<Send />}
          title="Reply sent"
          detail="Delivery window confirmed"
          time="Now"
          active
        />
      </div>
      <footer>
        <Check /> Resolved in one continuous thread
      </footer>
    </div>
  );
}
function Event({
  icon,
  title,
  detail,
  time,
  active = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  time: string;
  active?: boolean;
}) {
  return (
    <div className={active ? "active" : ""}>
      <i>{icon}</i>
      <p>
        <b>{title}</b>
        <span>{detail}</span>
      </p>
      <time>{time}</time>
    </div>
  );
}

function CommandCenter() {
  return (
    <div className="signal-stage" aria-label={`${useBrandName()} unified inbox preview`}>
      <div className="signal-app">
        <div className="signal-app-top">
          <span>
            <Brand /> / Unified inbox
          </span>
          <Search />
        </div>
        <div className="signal-app-body">
          <aside className="signal-rail">
            <img src={logo} alt="" />
            <button className="active">
              <MessageCircle />
            </button>
            <button>
              <Sparkles />
            </button>
            <button>
              <Users />
            </button>
            <button>
              <Workflow />
            </button>
          </aside>
          <section className="signal-inbox">
            <header>
              <div>
                <span>INBOX</span>
                <h3>Conversations</h3>
              </div>
              <button>
                <Search /> Search
              </button>
            </header>
            <div className="signal-tabs">
              <b>Mine · 4</b>
              <span>Unassigned · 8</span>
              <span>All</span>
            </div>
            {chats.map(([initials, name, message, time, Icon], i) => (
              <div className={`signal-chat-row ${i === 0 ? "active" : ""}`} key={name}>
                <span className="signal-avatar">{initials}</span>
                <p>
                  <b>{name}</b>
                  <small>{message}</small>
                </p>
                <span>
                  <Icon />
                  <time>{time}</time>
                </span>
              </div>
            ))}
          </section>
          <section className="signal-thread">
            <header>
              <span className="signal-avatar">AT</span>
              <p>
                <b>Alex Tan</b>
                <small>Online · WhatsApp</small>
              </p>
              <MoreHorizontal />
            </header>
            <div className="signal-messages">
              <small>Today, 09:42</small>
              <div>
                Hi! Can I change the delivery address for my recent order?<time>09:42</time>
              </div>
              <span>
                <Zap /> Order #8421 found · Processing
              </span>
              <div className="out">
                Absolutely—send the new address and I’ll update it before dispatch.
                <time>09:44 · ✓✓</time>
              </div>
              <label>
                Write a reply…{" "}
                <button>
                  <Send />
                </button>
              </label>
            </div>
          </section>
          <aside className="signal-customer">
            <header>
              Customer context <X />
            </header>
            <div className="profile">
              <span className="signal-avatar">AT</span>
              <b>Alex Tan</b>
              <small>Customer since Apr 2025</small>
            </div>
            <dl>
              <dt>
                Email<dd>alex@north.co</dd>
              </dt>
              <dt>
                Last order<dd>#8421 · $128.00</dd>
              </dt>
              <dt>
                Owner<dd>Maya Chen</dd>
              </dt>
            </dl>
            <div className="signal-summary">
              <b>
                <Sparkles /> AI SUMMARY
              </b>
              <p>Returning customer. Asked to update shipping before today’s dispatch.</p>
            </div>
          </aside>
        </div>
      </div>
      <div className="signal-float left">
        <SiInstagram />
        <p>
          <b>New Instagram message</b>
          <small>Product question · just now</small>
        </p>
      </div>
      <div className="signal-float right">
        <Check />
        <p>
          <b>Conversation routed</b>
          <small>Customer Care · Maya</small>
        </p>
      </div>
    </div>
  );
}
